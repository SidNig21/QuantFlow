import { beforeEach, describe, expect, test } from "bun:test";
import {
  cancelRun,
  createCorrelatedTask,
  createRun,
  getRun,
  getTileRuntime,
  heartbeat,
  listCapabilities,
  listRunTasks,
  registerTileCapability,
  resolveCapability,
  updateTileRuntime,
} from "./orchestration-service";
import {
  _resetHerdrRoutesForTests,
  awaitCorrelatedReply,
  resolveCorrelatedReply,
} from "./herdr-routes";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { _resetForTesting as resetTasks } from "./runtime-state/tasks-repo";
import { _resetForTesting as resetRuns } from "./runtime-state/runs-repo";
import { _resetForTesting as resetTileCapabilities } from "./runtime-state/tile-capabilities-repo";
import { _resetForTesting as resetTilesRuntime } from "./runtime-state/tiles-runtime-repo";

beforeEach(() => {
  installTestRuntimeDb();
  resetTasks();
  resetTileCapabilities();
  resetTilesRuntime();
  resetRuns();
  _resetHerdrRoutesForTests();
});

describe("orchestration run lifecycle", () => {
  test("creates, lists through get, and cancels a run", () => {
    const run = createRun({ title: "analysis", metadata: { goal: "phase-7.5" } });
    const cancelled = cancelRun(run.id, 2_000);

    expect(getRun(run.id)?.title).toBe("analysis");
    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.completed_at).toBe(2_000);
  });
});

describe("orchestration capability registry", () => {
  test("registers capabilities and resolves to the first matching tile", () => {
    heartbeat({ tileId: "tile-1", presence: "online", status: "ready", now: 1_000 });
    registerTileCapability({
      tileId: "tile-1",
      capability: "shell.exec",
      schemaVersion: "v1",
      metadata: { shell: "bash" },
    });

    const resolved = resolveCapability({ capability: "shell.exec", requireOnline: true });

    expect(listCapabilities({ capability: "shell.exec" })).toHaveLength(1);
    expect(resolved?.tileId).toBe("tile-1");
    expect(resolved?.capability.metadata).toEqual({ shell: "bash", schemaVersion: "v1" });
    expect(resolved?.runtime?.status).toBe("ready");
  });

  test("online resolution skips offline tiles", () => {
    registerTileCapability({ tileId: "tile-offline", capability: "shell.exec" });

    expect(resolveCapability({ capability: "shell.exec", requireOnline: true })).toBeNull();
  });
});

describe("orchestration tile runtime", () => {
  test("records heartbeats and updates tile runtime", () => {
    heartbeat({
      tileId: "tile-1",
      paneId: "pane-1",
      status: "working",
      presence: "online",
      metadata: { cwd: "/tmp" },
      now: 1_000,
    });
    const updated = updateTileRuntime({ tileId: "tile-1", status: "done", now: 2_000 });

    expect(updated.pane_id).toBe("pane-1");
    expect(updated.last_seen_at).toBe(2_000);
    expect(getTileRuntime("tile-1")?.metadata).toEqual({ cwd: "/tmp" });
  });
});

describe("orchestration correlated tasks", () => {
  test("creates a run when absent and default correlation identifiers", () => {
    const task = createCorrelatedTask({
      fromTileId: "tile-a",
      toTileId: "tile-b",
      payload: "do work",
    });

    expect(task.run_id).toBeString();
    expect(task.correlation_id).toBeString();
    expect(task.thread_id).toBe(task.correlation_id);
    expect(task.trace_id).toBeString();
    expect(task.origin).toBe("orchestration");
    expect(task.sent_at).toBeNumber();
    expect(listRunTasks(task.run_id!)).toHaveLength(1);
  });

  test("preserves provided correlation identifiers under an existing run", () => {
    const run = createRun({ title: "existing" });
    const task = createCorrelatedTask({
      runId: run.id,
      fromTileId: "tile-a",
      toTileId: "tile-b",
      correlationId: "corr-1",
      threadId: "thread-1",
      traceId: "trace-1",
      origin: "test",
      payload: "do work",
    });

    expect(task.run_id).toBe(run.id);
    expect(task.correlation_id).toBe("corr-1");
    expect(task.thread_id).toBe("thread-1");
    expect(task.trace_id).toBe("trace-1");
    expect(task.origin).toBe("test");
    expect(task.schema_id).toBeNull();
    expect(task.schema_version).toBeNull();
  });

  test("propagates optional message schema identifiers", () => {
    const task = createCorrelatedTask({
      fromTileId: "tile-a",
      toTileId: "tile-b",
      payload: "{}",
      schemaId: "ObsV1",
      schemaVersion: "2",
    });

    expect(task.schema_id).toBe("ObsV1");
    expect(task.schema_version).toBe("2");
  });
});

describe("correlated reply registry", () => {
  test("resolveCorrelatedReply resolves an awaiting promise with the reply payload", async () => {
    const correlationId = "corr-abc-123";
    const replyPromise = awaitCorrelatedReply(correlationId, 5_000);

    const resolved = resolveCorrelatedReply(correlationId, "inference complete");
    expect(resolved).toBe(true);

    const result = await replyPromise;
    expect(result).toBe("inference complete");
  });

  test("resolveCorrelatedReply returns false when no waiter is registered", () => {
    expect(resolveCorrelatedReply("unknown-corr-id", "data")).toBe(false);
  });

  test("awaitCorrelatedReply rejects after timeout", async () => {
    const replyPromise = awaitCorrelatedReply("timeout-corr-id", 50);
    await expect(replyPromise).rejects.toThrow("Correlated reply timeout");
  });

  test("createCorrelatedTask produces a task with correlation_id that can be used as reply key", () => {
    const task = createCorrelatedTask({
      fromTileId: "hermes",
      toTileId: "pi-scout",
      payload: "get candle",
      cableId: "conn-hs",
    });

    expect(task.correlation_id).toBeTruthy();

    // Simulate a tile replying with the same correlation_id
    const replyPromise = awaitCorrelatedReply(task.correlation_id!, 5_000);
    resolveCorrelatedReply(task.correlation_id!, "candle: {price: 67000}");

    return expect(replyPromise).resolves.toBe("candle: {price: 67000}");
  });
});
