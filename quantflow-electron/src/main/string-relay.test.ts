import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const writtenSessions: Array<{ sessionId: string; data: string }> = [];
const activeSessions = new Set<string>();
const runtimeTasks: unknown[] = [];

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

mock.module("./orchestration-service", () => ({
  createCorrelatedTask: (params: {
    cableId: string | null;
    fromTileId: string;
    toTileId: string;
    payload: string;
    sentAt?: number | null;
  }) => {
    const now = Date.now();
    const task = {
      id: `task-${runtimeTasks.length + 1}`,
      run_id: `run-${runtimeTasks.length + 1}`,
      parent_task_id: null,
      cable_id: params.cableId,
      from_tile_id: params.fromTileId,
      to_tile_id: params.toTileId,
      correlation_id: `corr-${runtimeTasks.length + 1}`,
      thread_id: `corr-${runtimeTasks.length + 1}`,
      trace_id: `trace-${runtimeTasks.length + 1}`,
      origin: "orchestration",
      status: "pending",
      payload: params.payload,
      payload_hash: null,
      schema_id: null,
      schema_version: null,
      result: null,
      sent_at: params.sentAt ?? now,
      delivered_at: null,
      completed_at: null,
      created_at: now,
      updated_at: now,
    };
    runtimeTasks.push(task);
    return task;
  },
}));

// events-repo, tasks-repo, and schemas-repo are NOT mocked — string-relay
// uses their real implementations backed by the in-memory test DB installed
// in beforeEach. This prevents mock.module bleed into other test files that
// run in the same Bun worker and also need the real implementations.

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
  type RelayEvent,
} from "./string-relay";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { listEvents } from "./runtime-state/events-repo";
import {
  createConnection,
  getQueueDepth,
  incrementQueueDepth,
  QUEUE_DEPTH_MAX,
} from "./runtime-state/connections-repo";

beforeEach(() => {
  writtenSessions.length = 0;
  runtimeTasks.length = 0;
  activeSessions.clear();
  resetStringRelayForTests();
  installTestRuntimeDb();
});

// Restore mocked modules so they don't bleed into other test files in the same worker.
afterAll(() => mock.restore());

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

describe("relay.overflow backpressure", () => {
  function setupRelay() {
    activeSessions.add("session-b");
    registerTileSession("tile-a", "session-a", "Source", "source");
    registerTileSession("tile-b", "session-b", "Target", "target");
    syncConnectionGraph([{ id: "conn-bp", tileAId: "tile-a", tileBId: "tile-b" }]);
  }

  function fillQueueToMax() {
    // Create the connection in the real DB so queue_depth updates stick.
    createConnection({ id: "conn-bp", tileAId: "tile-a", tileBId: "tile-b" });
    for (let i = 0; i < QUEUE_DEPTH_MAX; i++) {
      incrementQueueDepth("conn-bp");
    }
  }

  function sendOne() {
    return relayStringMessage({
      connectionId: "conn-bp",
      fromTileId: "tile-a",
      fromLabel: "Source",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "hello",
    });
  }

  test("send succeeds when queue_depth is below max", () => {
    setupRelay();
    // conn-bp not in DB → incrementQueueDepth is a no-op (depth stays 0, no overflow)
    const result = sendOne();
    expect(result.ok).toBe(true);
  });

  test("send fails with relay_overflow when queue exceeds QUEUE_DEPTH_MAX", () => {
    setupRelay();
    fillQueueToMax();
    const result = sendOne();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("relay_overflow");
    }
  });

  test("relay.overflow event is written to runtime.db on overflow", () => {
    setupRelay();
    fillQueueToMax();
    sendOne();
    const overflowEvents = listEvents({ kind: "relay.overflow" });
    expect(overflowEvents).toHaveLength(1);
    const ev = overflowEvents[0];
    expect(ev.data.connectionId).toBe("conn-bp");
    expect((ev.data as any).queue_depth).toBeGreaterThan(QUEUE_DEPTH_MAX);
  });

  test("no PTY write happens on overflow", () => {
    setupRelay();
    fillQueueToMax();
    sendOne();
    expect(writtenSessions).toHaveLength(0);
  });

  test("queue_depth is decremented after overflow (depth returns to QUEUE_DEPTH_MAX)", () => {
    setupRelay();
    fillQueueToMax();
    // overflow increments to MAX+1, then decrementQueueDepth brings it back to MAX
    sendOne();
    expect(getQueueDepth("conn-bp")).toBe(QUEUE_DEPTH_MAX);
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

describe("correlated relay wiring", () => {
  test("relay.sent creates a correlated task and attaches correlation_id + trace_id to the log entry", () => {
    activeSessions.add("session-b");
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);

    const result = relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "Hermes",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "run inference",
    });

    expect(result.ok).toBe(true);

    // createCorrelatedTask was called once
    expect(runtimeTasks).toHaveLength(1);
    const task = runtimeTasks[0] as { correlation_id: string; trace_id: string };
    expect(task.correlation_id).toBeTruthy();
    expect(task.trace_id).toBeTruthy();

    // The relay log entry carries the same IDs
    const [entry] = getAllRelayLogs() as RelayEvent[];
    expect(entry?.correlationId).toBe(task.correlation_id);
    expect(entry?.traceId).toBe(task.trace_id);

    // The mirrored event row also carries them — verify via the real DB
    const dbEvents = listEvents({ kind: "relay.sent" });
    expect(dbEvents).toHaveLength(1);
    const event = dbEvents[0];
    expect(event.correlation_id).toBe(task.correlation_id);
    expect(event.trace_id).toBe(task.trace_id);
    expect(event.cable_id).toBe("conn-1");
  });

  test("relay.failed does not create a task but still carries cableId on the event", () => {
    syncConnectionGraph([
      { id: "conn-1", tileAId: "tile-a", tileBId: "tile-b" },
    ]);
    // session-b not in activeSessions → missing_pty

    relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "Hermes",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "run inference",
    });

    expect(runtimeTasks).toHaveLength(0);
    const dbEvents = listEvents();
    expect(dbEvents.length).toBeGreaterThanOrEqual(1);
    const event = dbEvents.find((e) => e.cable_id === "conn-1") ?? dbEvents[0];
    expect(event.cable_id).toBe("conn-1");
    expect(event.correlation_id).toBeNull();
  });
});
