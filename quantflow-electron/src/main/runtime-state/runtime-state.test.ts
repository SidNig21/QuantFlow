import { describe, expect, test, beforeEach } from "bun:test";
import {
  createTask,
  updateTask,
  getTask,
  listTasks,
  _resetForTesting as resetTasks,
} from "./tasks-repo";
import {
  appendEvent,
  listEvents,
  _resetForTesting as resetEvents,
} from "./events-repo";
import {
  appendStatusTransition,
  listStatusTransitions,
  latestStatus,
  _resetForTesting as resetStatus,
} from "./status-repo";
import {
  createPtySession,
  endPtySession,
  getPtySession,
  listPtySessions,
  _resetForTesting as resetPtySessions,
} from "./pty-sessions-repo";

beforeEach(() => {
  resetTasks();
  resetEvents();
  resetStatus();
  resetPtySessions();
});

// ─── Tasks ───────────────────────────────────────────────────────────────────

describe("tasks-repo", () => {
  test("createTask returns a pending row with correct fields", () => {
    const task = createTask({
      cableId: "conn-abc",
      fromTileId: "tile-1",
      toTileId: "tile-2",
      payload: "run inference",
    });

    expect(task.id).toBeString();
    expect(task.cable_id).toBe("conn-abc");
    expect(task.from_tile_id).toBe("tile-1");
    expect(task.to_tile_id).toBe("tile-2");
    expect(task.status).toBe("pending");
    expect(task.payload).toBe("run inference");
    expect(task.result).toBeNull();
    expect(task.created_at).toBeNumber();
    expect(task.updated_at).toBeNumber();
  });

  test("updateTask transitions status and sets result", () => {
    const task = createTask({
      cableId: null,
      fromTileId: "tile-1",
      toTileId: "tile-2",
      payload: "hello",
    });

    const updated = updateTask(task.id, { status: "done", result: "ok" });

    expect(updated?.status).toBe("done");
    expect(updated?.result).toBe("ok");
    expect(updated?.updated_at).toBeGreaterThanOrEqual(task.created_at);
  });

  test("getTask returns null for unknown id", () => {
    expect(getTask("no-such-id")).toBeNull();
  });

  test("listTasks filters by cableId", () => {
    createTask({ cableId: "c1", fromTileId: "a", toTileId: "b", payload: "x" });
    createTask({ cableId: "c2", fromTileId: "a", toTileId: "b", payload: "y" });

    const result = listTasks({ cableId: "c1" });

    expect(result).toHaveLength(1);
    expect(result[0]!.cable_id).toBe("c1");
  });

  test("listTasks filters by status", () => {
    const t = createTask({ cableId: null, fromTileId: "a", toTileId: "b", payload: "p" });
    updateTask(t.id, { status: "done" });

    expect(listTasks({ status: "pending" })).toHaveLength(0);
    expect(listTasks({ status: "done" })).toHaveLength(1);
  });

  test("listTasks respects limit", () => {
    for (let i = 0; i < 10; i++) {
      createTask({ cableId: null, fromTileId: "a", toTileId: "b", payload: `msg-${i}` });
    }
    expect(listTasks({ limit: 3 })).toHaveLength(3);
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe("events-repo", () => {
  test("appendEvent returns a row with the given kind", () => {
    const ev = appendEvent({ kind: "cable.send", tileId: "tile-1", data: { text: "hi" } });

    expect(ev.kind).toBe("cable.send");
    expect(ev.tile_id).toBe("tile-1");
    expect(ev.data).toEqual({ text: "hi" });
    expect(ev.task_id).toBeNull();
  });

  test("listEvents filters by kind", () => {
    appendEvent({ kind: "cable.send" });
    appendEvent({ kind: "cable.fail" });
    appendEvent({ kind: "cable.send" });

    expect(listEvents({ kind: "cable.send" })).toHaveLength(2);
    expect(listEvents({ kind: "cable.fail" })).toHaveLength(1);
  });

  test("listEvents filters by tileId", () => {
    appendEvent({ kind: "cable.send", tileId: "tile-A" });
    appendEvent({ kind: "cable.send", tileId: "tile-B" });

    expect(listEvents({ tileId: "tile-A" })).toHaveLength(1);
  });
});

// ─── Status transitions ───────────────────────────────────────────────────────

describe("status-repo", () => {
  test("appendStatusTransition creates a row", () => {
    const row = appendStatusTransition({
      paneId: "w123-1",
      tileId: "tile-x",
      fromStatus: "unknown",
      toStatus: "idle",
    });

    expect(row.pane_id).toBe("w123-1");
    expect(row.tile_id).toBe("tile-x");
    expect(row.from_status).toBe("unknown");
    expect(row.to_status).toBe("idle");
  });

  test("latestStatus returns most recent to_status for a pane", () => {
    const paneId = "w123-1";
    appendStatusTransition({ paneId, fromStatus: "unknown", toStatus: "idle" });
    appendStatusTransition({ paneId, fromStatus: "idle", toStatus: "working" });

    expect(latestStatus(paneId)).toBe("working");
  });

  test("latestStatus returns null for unknown pane", () => {
    expect(latestStatus("no-such-pane")).toBeNull();
  });

  test("listStatusTransitions filters by paneId", () => {
    appendStatusTransition({ paneId: "pane-A", fromStatus: "unknown", toStatus: "idle" });
    appendStatusTransition({ paneId: "pane-B", fromStatus: "unknown", toStatus: "idle" });

    expect(listStatusTransitions({ paneId: "pane-A" })).toHaveLength(1);
  });
});

// ─── PTY sessions ─────────────────────────────────────────────────────────────

describe("pty-sessions-repo", () => {
  test("createPtySession stores a live session", () => {
    const session = createPtySession({
      sessionId: "sess-001",
      tileId: "tile-1",
      shell: "/bin/zsh",
      target: "sidecar",
      cwd: "/home/user",
    });

    expect(session.id).toBe("sess-001");
    expect(session.ended_at).toBeNull();
    expect(session.exit_code).toBeNull();
    expect(session.target).toBe("sidecar");
  });

  test("endPtySession records end time and exit code", () => {
    createPtySession({
      sessionId: "sess-002",
      tileId: "tile-2",
      shell: "/bin/bash",
      target: "tmux",
      cwd: "/tmp",
    });

    const ended = endPtySession("sess-002", 0);

    expect(ended?.ended_at).toBeNumber();
    expect(ended?.exit_code).toBe(0);
  });

  test("listPtySessions active filter excludes ended sessions", () => {
    createPtySession({ sessionId: "s1", tileId: "t1", shell: "/bin/zsh", target: "sidecar", cwd: "/" });
    createPtySession({ sessionId: "s2", tileId: "t2", shell: "/bin/zsh", target: "sidecar", cwd: "/" });
    endPtySession("s1", 0);

    expect(listPtySessions({ active: true })).toHaveLength(1);
    expect(listPtySessions({ active: false })).toHaveLength(1);
    expect(listPtySessions()).toHaveLength(2);
  });

  test("getPtySession returns null for unknown id", () => {
    expect(getPtySession("no-such-session")).toBeNull();
  });
});
