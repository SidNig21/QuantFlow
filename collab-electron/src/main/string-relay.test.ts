import { beforeEach, describe, expect, mock, test } from "bun:test";

const writtenSessions: Array<{ sessionId: string; data: string }> = [];
const activeSessions = new Set<string>();

mock.module("./pty", () => ({
  listSessions: () => [...activeSessions],
  writeToSession: (sessionId: string, data: string) => {
    writtenSessions.push({ sessionId, data });
  },
}));

mock.module("node:fs/promises", () => ({
  appendFile: async () => {},
  mkdir: async () => {},
}));

import {
  getAllRelayLogs,
  getStringLog,
  inferTileSnapshotStatus,
  onPtyData,
  registerTileSession,
  relayConnectionMessage,
  relayStringMessage,
  resetStringRelayForTests,
  syncConnectionGraph,
  watchtowerSnapshot,
} from "./string-relay";

beforeEach(() => {
  writtenSessions.length = 0;
  activeSessions.clear();
  resetStringRelayForTests();
});

describe("relayStringMessage", () => {
  test("returns structured success and logs relay.sent", () => {
    activeSessions.add("session-b");
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    const result = relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "Claude Worker",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "hello from A",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Relay sent");
    if (result.ok) {
      expect(result.formatted).toBe("[Claude Worker]: hello from A");
    }
    expect(writtenSessions).toEqual([
      { sessionId: "session-b", data: "[Claude Worker]: hello from A\n" },
    ]);

    const [event] = getStringLog("conn-1");
    expect(event?.type).toBe("relay.sent");
    expect(event?.ok).toBe(true);
    expect(event?.routeMethod).toBe("manual");
  });

  test("returns missing_pty when target session is gone", () => {
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    const result = relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "A",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "still there?",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("missing_pty");
      expect(result.message).toContain("not active");
    }
    expect(writtenSessions).toHaveLength(0);
    expect(getAllRelayLogs()[0]?.errorCode).toBe("missing_pty");
  });

  test("returns unconnected_target when manual request is not on that cable", () => {
    activeSessions.add("session-b");
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-c" },
    ]);

    const result = relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "A",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "wrong route",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("unconnected_target");
    }
    expect(writtenSessions).toHaveLength(0);
  });
});

describe("relayConnectionMessage", () => {
  test("sends from one cable endpoint to the other with registered labels", () => {
    activeSessions.add("session-b");
    registerTileSession("tile-a", "session-a", "Worker", "worker");
    registerTileSession("tile-b", "session-b", "Reviewer", "reviewer");
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    const result = relayConnectionMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      text: "please review",
    });

    expect(result.ok).toBe(true);
    expect(writtenSessions).toEqual([
      { sessionId: "session-b", data: "[Worker]: please review\n" },
    ]);
    expect(getStringLog("conn-1")[0]?.routeMethod).toBe("manual");
  });

  test("rejects a send when the source tile is not a cable endpoint", () => {
    registerTileSession("tile-c", "session-c", "Observer", "observer");
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    const result = relayConnectionMessage({
      connectionId: "conn-1",
      fromTileId: "tile-c",
      text: "wrong cable",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("unconnected_target");
    }
    expect(writtenSessions).toHaveLength(0);
  });
});

describe("watchtowerSnapshot", () => {
  test("marks registered tiles with missing PTY sessions as exited", () => {
    registerTileSession("tile-a", "session-a", "Worker", "worker");

    expect(watchtowerSnapshot()).toEqual([
      {
        tileId: "tile-a",
        label: "Worker",
        routeHandle: "worker",
        sessionId: "session-a",
        lastLine: "",
        lastActivityTs: 0,
        status: "exited",
      },
    ]);
  });

  test("uses registered role parser hints for tile status", () => {
    activeSessions.add("session-a");
    registerTileSession("tile-a", "session-a", "Codex", "codex", {
      waiting: ["pick a command"],
    });

    onPtyData("session-a", "Please pick a command before continuing\n");

    expect(watchtowerSnapshot()[0]?.status).toBe("waiting");
  });
});

describe("inferTileSnapshotStatus", () => {
  test("preserves exited and age-based statuses", () => {
    expect(inferTileSnapshotStatus({
      hasActiveSession: false,
      lastLine: "",
      ageMs: 0,
    })).toBe("exited");
    expect(inferTileSnapshotStatus({
      hasActiveSession: true,
      lastLine: "working",
      ageMs: 4_000,
    })).toBe("active");
    expect(inferTileSnapshotStatus({
      hasActiveSession: true,
      lastLine: "working",
      ageMs: 12_000,
    })).toBe("idle");
    expect(inferTileSnapshotStatus({
      hasActiveSession: true,
      lastLine: "working",
      ageMs: 45_000,
    })).toBe("quiet");
  });

  test("detects waiting and blocked terminal lines", () => {
    expect(inferTileSnapshotStatus({
      hasActiveSession: true,
      lastLine: "Approval required: continue?",
      ageMs: 45_000,
    })).toBe("waiting");
    expect(inferTileSnapshotStatus({
      hasActiveSession: true,
      lastLine: "ERROR: command failed",
      ageMs: 4_000,
    })).toBe("blocked");
  });

  test("uses role-specific status parser hints before generic age status", () => {
    expect(inferTileSnapshotStatus({
      hasActiveSession: true,
      lastLine: "Codex says: select a diff to continue",
      ageMs: 45_000,
      statusParser: {
        waiting: ["select a diff"],
      },
    })).toBe("waiting");

    expect(inferTileSnapshotStatus({
      hasActiveSession: true,
      lastLine: "Tool output: sandbox denied",
      ageMs: 4_000,
      statusParser: {
        blocked: ["sandbox denied"],
      },
    })).toBe("blocked");
  });
});

describe("agent-initiated relay", () => {
  test("routes only across an existing cable", () => {
    activeSessions.add("session-b");
    registerTileSession("tile-a", "session-a", "Claude Worker");
    registerTileSession("tile-b", "session-b", "Codex Reviewer");
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    onPtyData("session-a", ">>@Codex Reviewer: please review auth changes\n");

    expect(writtenSessions).toEqual([
      {
        sessionId: "session-b",
        data: "[Claude Worker]: please review auth changes\n",
      },
    ]);
    const [event] = getStringLog("conn-1");
    expect(event?.type).toBe("relay.sent");
    expect(event?.routeMethod).toBe("agent");
  });

  test("routes by stable handle after display label changes", () => {
    activeSessions.add("session-b");
    registerTileSession("tile-a", "session-a", "Claude Worker", "worker");
    registerTileSession(
      "tile-b",
      "session-b",
      "Renamed Reviewer",
      "codex-reviewer",
    );
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    onPtyData("session-a", ">>@codex-reviewer: handle still works\n");

    expect(writtenSessions).toEqual([
      {
        sessionId: "session-b",
        data: "[Claude Worker]: handle still works\n",
      },
    ]);
    const [event] = getStringLog("conn-1");
    expect(event?.type).toBe("relay.sent");
    expect(event?.targetTileId).toBe("tile-b");
  });

  test("prefers unique connected handle over ambiguous connected labels", () => {
    activeSessions.add("session-b");
    registerTileSession("tile-a", "session-a", "Worker", "worker");
    registerTileSession("tile-b", "session-b", "Reviewer", "codex-reviewer");
    registerTileSession("tile-c", "session-c", "Reviewer", "claude-reviewer");
    syncConnectionGraph([
      { id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" },
      { id: "conn-ac", tileAId: "tile-a", tileBId: "tile-c" },
    ]);

    onPtyData("session-a", ">>@codex-reviewer: handle disambiguates\n");

    expect(writtenSessions).toEqual([
      {
        sessionId: "session-b",
        data: "[Worker]: handle disambiguates\n",
      },
    ]);
    const [event] = getStringLog("conn-ab");
    expect(event?.type).toBe("relay.sent");
  });

  test("logs no_route when no connected endpoint matches", () => {
    registerTileSession("tile-a", "session-a", "Worker");
    syncConnectionGraph([]);

    onPtyData("session-a", ">>@Reviewer: hello\n");

    expect(writtenSessions).toHaveLength(0);
    const [event] = getAllRelayLogs();
    expect(event?.type).toBe("relay.failed");
    expect(event?.errorCode).toBe("no_route");
  });

  test("logs unconnected_target when the label exists off-cable", () => {
    registerTileSession("tile-a", "session-a", "Worker");
    registerTileSession("tile-b", "session-b", "Reviewer");
    syncConnectionGraph([]);

    onPtyData("session-a", ">>@Reviewer: hello\n");

    expect(writtenSessions).toHaveLength(0);
    const [event] = getAllRelayLogs();
    expect(event?.type).toBe("relay.failed");
    expect(event?.errorCode).toBe("unconnected_target");
    expect(event?.targetTileId).toBe("tile-b");
  });

  test("logs ambiguous_route when multiple connected endpoints match", () => {
    registerTileSession("tile-a", "session-a", "Worker");
    registerTileSession("tile-b", "session-b", "Reviewer");
    registerTileSession("tile-c", "session-c", "Reviewer");
    syncConnectionGraph([
      { id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" },
      { id: "conn-ac", tileAId: "tile-a", tileBId: "tile-c" },
    ]);

    onPtyData("session-a", ">>@Reviewer: ambiguous\n");

    expect(writtenSessions).toHaveLength(0);
    const [event] = getAllRelayLogs();
    expect(event?.type).toBe("relay.failed");
    expect(event?.errorCode).toBe("ambiguous_route");
  });

  test("logs missing_pty when connected target session is gone", () => {
    registerTileSession("tile-a", "session-a", "Worker");
    registerTileSession("tile-b", "session-b", "Reviewer");
    syncConnectionGraph([
      { id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    onPtyData("session-a", ">>@Reviewer: are you alive?\n");

    expect(writtenSessions).toHaveLength(0);
    const [event] = getAllRelayLogs();
    expect(event?.type).toBe("relay.failed");
    expect(event?.connectionId).toBe("conn-ab");
    expect(event?.errorCode).toBe("missing_pty");
  });

  test("ignores ordinary terminal output", () => {
    registerTileSession("tile-a", "session-a", "Worker");
    registerTileSession("tile-b", "session-b", "Reviewer");
    syncConnectionGraph([
      { id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    onPtyData("session-a", "normal terminal output\n");

    expect(writtenSessions).toHaveLength(0);
    expect(getAllRelayLogs()).toHaveLength(0);
  });
});
