import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock pty module before importing string-relay
const writtenSessions: Array<{ sessionId: string; data: string }> = [];
mock.module("./pty", () => ({
  writeToSession: (sessionId: string, data: string) => {
    writtenSessions.push({ sessionId, data });
  },
}));

// Mock fs/promises to avoid actual file writes in tests
mock.module("node:fs/promises", () => ({
  appendFile: async () => {},
  mkdir: async () => {},
}));

import {
  relayStringMessage,
  getStringLog,
  registerTileSession,
  unregisterTileSession,
  onPtyData,
} from "./string-relay";

beforeEach(() => {
  writtenSessions.length = 0;
});

describe("relayStringMessage", () => {
  test("formats and writes message to target session", () => {
    relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "Claude Worker",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "hello from A",
    });

    expect(writtenSessions).toHaveLength(1);
    expect(writtenSessions[0]!.sessionId).toBe("session-b");
    expect(writtenSessions[0]!.data).toBe("[Claude Worker]: hello from A\n");
  });

  test("trims whitespace from message text", () => {
    relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "A",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "  trimmed message  ",
    });
    expect(writtenSessions[0]!.data).toBe("[A]: trimmed message\n");
  });

  test("rejects empty messages", () => {
    expect(() =>
      relayStringMessage({
        connectionId: "conn-1",
        fromTileId: "tile-a",
        fromLabel: "A",
        targetTileId: "tile-b",
        targetSessionId: "session-b",
        text: "   ",
      }),
    ).toThrow("must not be empty");
  });

  test("rejects null targetSessionId", () => {
    expect(() =>
      relayStringMessage({
        connectionId: "conn-1",
        fromTileId: "tile-a",
        fromLabel: "A",
        targetTileId: "tile-b",
        targetSessionId: null,
        text: "hello",
      }),
    ).toThrow("no active PTY session");
  });

  test("returns formatted text in result", () => {
    const result = relayStringMessage({
      connectionId: "conn-1",
      fromTileId: "tile-a",
      fromLabel: "Worker",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "do the thing",
    });
    expect(result.ok).toBe(true);
    expect(result.formatted).toBe("[Worker]: do the thing");
  });
});

describe("getStringLog", () => {
  test("returns entries for a connection", () => {
    relayStringMessage({
      connectionId: "conn-log",
      fromTileId: "tile-a",
      fromLabel: "A",
      targetTileId: "tile-b",
      targetSessionId: "session-b",
      text: "msg1",
    });
    relayStringMessage({
      connectionId: "conn-log",
      fromTileId: "tile-b",
      fromLabel: "B",
      targetTileId: "tile-a",
      targetSessionId: "session-a",
      text: "msg2",
    });

    const log = getStringLog("conn-log");
    expect(log).toHaveLength(2);
    expect(log[0]!.text).toBe("msg1");
    expect(log[1]!.text).toBe("msg2");
  });

  test("returns empty array for unknown connection", () => {
    expect(getStringLog("no-such-conn")).toEqual([]);
  });

  test("respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      relayStringMessage({
        connectionId: "conn-limit",
        fromTileId: "tile-a",
        fromLabel: "A",
        targetTileId: "tile-b",
        targetSessionId: "session-b",
        text: `msg ${i}`,
      });
    }
    const log = getStringLog("conn-limit", 3);
    expect(log).toHaveLength(3);
    expect(log[2]!.text).toBe("msg 9");
  });

  test("caps ring buffer at 100 entries", () => {
    for (let i = 0; i < 110; i++) {
      relayStringMessage({
        connectionId: "conn-cap",
        fromTileId: "tile-a",
        fromLabel: "A",
        targetTileId: "tile-b",
        targetSessionId: "session-b",
        text: `msg ${i}`,
      });
    }
    const log = getStringLog("conn-cap", 200);
    expect(log).toHaveLength(100);
    expect(log[0]!.text).toBe("msg 10");
    expect(log[99]!.text).toBe("msg 109");
  });
});

describe("agent-initiated relay (onPtyData)", () => {
  beforeEach(() => {
    unregisterTileSession("tile-a");
    unregisterTileSession("tile-b");
    unregisterTileSession("tile-c");
    writtenSessions.length = 0;
  });

  test("routes >>@Label: message to registered target", () => {
    registerTileSession("tile-a", "session-a", "Claude Worker");
    registerTileSession("tile-b", "session-b", "Codex Reviewer");

    onPtyData("session-a", ">>@Codex Reviewer: please review auth changes\n");

    expect(writtenSessions).toHaveLength(1);
    expect(writtenSessions[0]!.sessionId).toBe("session-b");
    expect(writtenSessions[0]!.data).toContain("please review auth changes");
  });

  test("ignores lines without the >>@ prefix", () => {
    registerTileSession("tile-a", "session-a", "A");
    registerTileSession("tile-b", "session-b", "B");

    onPtyData("session-a", "normal terminal output\n");

    expect(writtenSessions).toHaveLength(0);
  });

  test("logs warning and skips on missing target", () => {
    registerTileSession("tile-a", "session-a", "A");

    // No tile-b registered — should not throw
    expect(() => {
      onPtyData("session-a", ">>@NonExistent: hello\n");
    }).not.toThrow();

    expect(writtenSessions).toHaveLength(0);
  });

  test("logs warning and skips on ambiguous target label", () => {
    registerTileSession("tile-a", "session-a", "Worker");
    registerTileSession("tile-b", "session-b", "Reviewer");
    registerTileSession("tile-c", "session-c", "Reviewer"); // duplicate label

    expect(() => {
      onPtyData("session-a", ">>@Reviewer: ambiguous\n");
    }).not.toThrow();

    expect(writtenSessions).toHaveLength(0);
  });

  test("does not route to self", () => {
    registerTileSession("tile-a", "session-a", "Worker");

    onPtyData("session-a", ">>@Worker: self message\n");

    expect(writtenSessions).toHaveLength(0);
  });
});
