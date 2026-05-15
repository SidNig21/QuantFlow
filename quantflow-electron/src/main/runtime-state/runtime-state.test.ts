import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import {
  createTask,
  updateTask,
  getTask,
  listTasks,
  transitionTask,
  _resetForTesting as resetTasks,
} from "./tasks-repo";
import {
  appendEvent,
  listEvents,
  _resetForTesting as resetEvents,
} from "./events-repo";
import {
  createRun,
  getRun,
  listRuns,
  updateRun,
  _resetForTesting as resetRuns,
} from "./runs-repo";
import {
  createArtifact,
  listArtifacts,
  _resetForTesting as resetArtifacts,
} from "./artifacts-repo";
import {
  upsertTileCapability,
  getTileCapability,
  listTileCapabilities,
  _resetForTesting as resetTileCapabilities,
} from "./tile-capabilities-repo";
import {
  upsertTileRuntime,
  getTileRuntime,
  listTilesRuntime,
  _resetForTesting as resetTilesRuntime,
} from "./tiles-runtime-repo";
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
import { closeDb } from "./database";
import { installTestRuntimeDb } from "./test-sqlite-adapter";

beforeEach(() => {
  installTestRuntimeDb();
  resetTasks();
  resetEvents();
  resetArtifacts();
  resetTileCapabilities();
  resetTilesRuntime();
  resetRuns();
  resetStatus();
  resetPtySessions();
});

afterAll(() => {
  closeDb();
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
    expect(task.run_id).toBeNull();
    expect(task.cable_id).toBe("conn-abc");
    expect(task.from_tile_id).toBe("tile-1");
    expect(task.to_tile_id).toBe("tile-2");
    expect(task.status).toBe("queued");
    expect(task.payload).toBe("run inference");
    expect(task.result).toBeNull();
    expect(task.schema_id).toBeNull();
    expect(task.schema_version).toBeNull();
    expect(task.created_at).toBeNumber();
    expect(task.updated_at).toBeNumber();
  });

  test("createTask accepts orchestration fields without changing legacy fields", () => {
    const task = createTask({
      runId: "run-1",
      parentTaskId: "task-parent",
      cableId: "conn-abc",
      fromTileId: "tile-1",
      toTileId: "tile-2",
      correlationId: "corr-1",
      threadId: "thread-1",
      traceId: "trace-1",
      origin: "relay",
      payload: "run inference",
      payloadHash: "hash-1",
      schemaId: "FundingRateV1",
      schemaVersion: "1",
      sentAt: 10,
    });

    expect(task.run_id).toBe("run-1");
    expect(task.parent_task_id).toBe("task-parent");
    expect(task.correlation_id).toBe("corr-1");
    expect(task.thread_id).toBe("thread-1");
    expect(task.trace_id).toBe("trace-1");
    expect(task.origin).toBe("relay");
    expect(task.payload_hash).toBe("hash-1");
    expect(task.schema_id).toBe("FundingRateV1");
    expect(task.schema_version).toBe("1");
    expect(task.sent_at).toBe(10);
    expect(listTasks({ runId: "run-1", traceId: "trace-1" })).toHaveLength(1);
  });

  test("updateTask transitions status and sets result", () => {
    const task = createTask({
      cableId: null,
      fromTileId: "tile-1",
      toTileId: "tile-2",
      payload: "hello",
    });

    const updated = updateTask(task.id, { status: "sent", result: "ok" });

    expect(updated?.status).toBe("sent");
    expect(updated?.result).toBe("ok");
    expect(updated?.completed_at).toBeNull();
    expect(updated?.updated_at).toBeGreaterThanOrEqual(task.created_at);
  });

  test("updateTask can set orchestration timestamps", () => {
    const task = createTask({
      cableId: null,
      fromTileId: "tile-1",
      toTileId: "tile-2",
      payload: "hello",
    });

    const updated = updateTask(task.id, { deliveredAt: 20, completedAt: 30 });

    expect(updated?.delivered_at).toBe(20);
    expect(updated?.completed_at).toBe(30);
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
    updateTask(t.id, { status: "sent" });

    expect(listTasks({ status: "queued" })).toHaveLength(0);
    expect(listTasks({ status: "sent" })).toHaveLength(1);
  });

  test("listTasks respects limit", () => {
    for (let i = 0; i < 10; i++) {
      createTask({ cableId: null, fromTileId: "a", toTileId: "b", payload: `msg-${i}` });
    }
    expect(listTasks({ limit: 3 })).toHaveLength(3);
  });
});

// ─── transitionTask ───────────────────────────────────────────────────────────

describe("transitionTask", () => {
  test("queued → sent stamps sent_at and emits task.transition event", () => {
    const task = createTask({
      cableId: "conn-1",
      fromTileId: "tile-a",
      toTileId: "tile-b",
      payload: "work",
      correlationId: "corr-test",
    });

    const updated = transitionTask(task.id, "sent");

    expect(updated?.status).toBe("sent");
    expect(updated?.sent_at).toBeNumber();

    const events = listEvents({ kind: "task.transition", taskId: task.id });
    expect(events).toHaveLength(1);
    expect(events[0]!.data).toMatchObject({
      from_state: "queued",
      to_state: "sent",
      task_id: task.id,
      correlation_id: "corr-test",
    });
  });

  test("sent → cancelled stamps completed_at", () => {
    const task = createTask({ cableId: null, fromTileId: "a", toTileId: "b", payload: "p" });
    transitionTask(task.id, "sent");

    const updated = transitionTask(task.id, "cancelled");

    expect(updated?.status).toBe("cancelled");
    expect(updated?.completed_at).toBeNumber();
  });

  test("sent → failed stamps completed_at", () => {
    const task = createTask({ cableId: null, fromTileId: "a", toTileId: "b", payload: "p" });
    transitionTask(task.id, "sent");

    const updated = transitionTask(task.id, "failed");

    expect(updated?.status).toBe("failed");
    expect(updated?.completed_at).toBeNumber();
  });

  test("returns null for unknown task id", () => {
    expect(transitionTask("no-such-id", "sent")).toBeNull();
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe("events-repo", () => {
  test("appendEvent returns a row with the given kind", () => {
    const ev = appendEvent({ kind: "cable.send", tileId: "tile-1", data: { text: "hi" } });

    expect(ev.kind).toBe("cable.send");
    expect(ev.run_id).toBeNull();
    expect(ev.tile_id).toBe("tile-1");
    expect(ev.data).toEqual({ text: "hi" });
    expect(ev.task_id).toBeNull();
  });

  test("appendEvent accepts orchestration fields", () => {
    const ev = appendEvent({
      runId: "run-1",
      kind: "task.progress",
      taskId: "task-1",
      traceId: "trace-1",
      correlationId: "corr-1",
      cableId: "conn-1",
      level: "info",
      data: { ok: true },
    });

    expect(ev.run_id).toBe("run-1");
    expect(ev.trace_id).toBe("trace-1");
    expect(ev.correlation_id).toBe("corr-1");
    expect(ev.cable_id).toBe("conn-1");
    expect(ev.level).toBe("info");
    expect(listEvents({ runId: "run-1", cableId: "conn-1" })).toHaveLength(1);
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

// ─── Orchestration spine ─────────────────────────────────────────────────────

describe("runs-repo", () => {
  test("creates, updates, gets, and lists runs", () => {
    const run = createRun({ title: "Phase run", metadata: { goal: "test" } });
    const updated = updateRun(run.id, { status: "done", completedAt: 200 });

    expect(updated?.status).toBe("done");
    expect(updated?.completed_at).toBe(200);
    expect(getRun(run.id)?.metadata).toEqual({ goal: "test" });
    expect(listRuns({ status: "done" })).toHaveLength(1);
  });
});

describe("artifacts-repo", () => {
  test("creates and lists artifacts", () => {
    createArtifact({
      runId: "run-1",
      taskId: "task-1",
      tileId: "tile-1",
      kind: "log",
      uri: "file:///tmp/log.txt",
      contentHash: "hash-1",
      metadata: { lines: 3 },
    });

    const artifacts = listArtifacts({ runId: "run-1", contentHash: "hash-1" });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.metadata).toEqual({ lines: 3 });
  });
});

describe("tile-capabilities-repo", () => {
  test("upserts and lists tile capabilities", () => {
    upsertTileCapability({
      tileId: "tile-1",
      capability: "shell",
      metadata: { target: "local" },
    });
    upsertTileCapability({
      tileId: "tile-1",
      capability: "shell",
      metadata: { target: "tmux" },
    });

    expect(getTileCapability("tile-1", "shell")?.metadata).toEqual({ target: "tmux" });
    expect(listTileCapabilities({ tileId: "tile-1" })).toHaveLength(1);
  });
});

describe("tiles-runtime-repo", () => {
  test("upserts and lists tile runtime rows", () => {
    upsertTileRuntime({
      tileId: "tile-1",
      paneId: "pane-1",
      status: "working",
      presence: "online",
      metadata: { cwd: "/tmp" },
    });

    const runtime = upsertTileRuntime({ tileId: "tile-1", status: "done" });

    expect(runtime.pane_id).toBe("pane-1");
    expect(runtime.status).toBe("done");
    expect(getTileRuntime("tile-1")?.metadata).toEqual({ cwd: "/tmp" });
    expect(listTilesRuntime({ presence: "online" })).toHaveLength(1);
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
    const originalNow = Date.now;
    let now = 1_000;

    Date.now = () => now++;
    try {
      appendStatusTransition({ paneId, fromStatus: "unknown", toStatus: "idle" });
      appendStatusTransition({ paneId, fromStatus: "idle", toStatus: "working" });
    } finally {
      Date.now = originalNow;
    }

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
