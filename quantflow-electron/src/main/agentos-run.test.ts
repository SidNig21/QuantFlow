import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import type { PartialStateCard, ReceiptDraft, WorkerHandle, WorkerHarness } from "@qf-harness/types";
import {
  configureAgentOsRun,
  resetAgentOsRunModule,
  runAgentOsTask,
} from "./agentos-run";

interface DispatchCall {
  type: string;
  payload: Record<string, unknown>;
  requestedBy?: string;
}

function makeHarness(drafts: ReceiptDraft[]): WorkerHarness {
  let spawned = false;
  const handle: WorkerHandle = {
    workerId: "worker-agentos-1",
    tileId: "tile-agentos-1",
    kind: "agentos",
    agentosSessionId: "sess-1",
  };

  return {
    kind: "agentos",
    async spawn() {
      spawned = true;
      return handle;
    },
    async send(_handle, _message) {
      if (!spawned) throw new Error("spawn first");
    },
    async readState(): Promise<PartialStateCard> {
      return { status: "active" };
    },
    async collectReceipts() {
      return drafts;
    },
    async stop() {
      spawned = false;
    },
  };
}

describe("agentos run driver", () => {
  let dispatchCalls: DispatchCall[];

  beforeEach(() => {
    dispatchCalls = [];
    configureAgentOsRun({
      getHarness: () => makeHarness([
        { type: "task_started", summary: "AgentOS session started", metadata: { milestone: "session.start" } },
        { type: "progress", summary: "tool started", metadata: { milestone: "tool.started" } },
        { type: "task_completed", summary: "turn complete", metadata: { milestone: "turn.complete" } },
      ]),
      dispatchKernel: async (type, payload, requestedBy) => {
        dispatchCalls.push({ type, payload, requestedBy });
        return { ok: true, id: `cmd-${dispatchCalls.length}` };
      },
      getWorkerForTile: () => "worker-agentos-1",
      getWorker: () => ({ workflowId: "wf-1" }),
      workspaceDir: "/tmp/agentos-run",
    });
  });

  afterEach(() => {
    resetAgentOsRunModule();
  });

  test("posts receipt drafts in order and transitions worker status", async () => {
    const result = await runAgentOsTask({
      tileId: "tile-agentos-1",
      instruction: "List files",
      workflowId: "wf-1",
    });

    expect(result.ok).toBe(true);
    expect(result.receiptsPosted).toBe(3);

    const statusCalls = dispatchCalls.filter((c) => c.type === "kernel.worker.status_update");
    expect(statusCalls.map((c) => c.payload.status)).toEqual(["active", "idle"]);

    const receiptCalls = dispatchCalls.filter((c) => c.type === "kernel.receipt.post");
    expect(receiptCalls.map((c) => c.payload.summary)).toEqual([
      "AgentOS session started",
      "tool started",
      "turn complete",
    ]);
    expect(receiptCalls.every((c) => c.payload.tileId === "tile-agentos-1")).toBe(true);
  });

  test("error path posts progress receipt with metadata.error and does not throw", async () => {
    configureAgentOsRun({
      getHarness: () => ({
        kind: "agentos",
        async spawn() {
          throw new Error("agentos unavailable: host down");
        },
        async send() {},
        async readState() {
          return {};
        },
        async collectReceipts() {
          return [];
        },
        async stop() {},
      }),
      dispatchKernel: async (type, payload, requestedBy) => {
        dispatchCalls.push({ type, payload, requestedBy });
        return { ok: true, id: "cmd-err" };
      },
      getWorkerForTile: () => "worker-agentos-1",
      getWorker: () => ({ workflowId: null }),
      workspaceDir: "/tmp/agentos-run",
    });

    const result = await runAgentOsTask({
      tileId: "tile-agentos-1",
      instruction: "fail please",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("agentos unavailable");

    const errorReceipt = dispatchCalls.find(
      (c) => c.type === "kernel.receipt.post" && c.payload.metadata?.error,
    );
    expect(errorReceipt?.payload.type).toBe("progress");
    expect(errorReceipt?.payload.metadata).toMatchObject({
      error: expect.stringContaining("agentos unavailable"),
      milestone: "run.error",
    });

    const errorStatus = dispatchCalls.find(
      (c) => c.type === "kernel.worker.status_update" && c.payload.status === "error",
    );
    expect(errorStatus).toBeTruthy();
  });

  test("rejects concurrent runs for the same tile", async () => {
    let releaseSend!: () => void;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });

    configureAgentOsRun({
      getHarness: () => ({
        kind: "agentos",
        async spawn() {
          return {
            workerId: "worker-agentos-1",
            tileId: "tile-agentos-1",
            kind: "agentos",
          };
        },
        async send() {
          await sendGate;
        },
        async readState() {
          return {};
        },
        async collectReceipts() {
          return [];
        },
        async stop() {},
      }),
      dispatchKernel: async (type, payload, requestedBy) => {
        dispatchCalls.push({ type, payload, requestedBy });
        return { ok: true };
      },
      getWorkerForTile: () => "worker-agentos-1",
      getWorker: () => ({ workflowId: null }),
      workspaceDir: "/tmp/agentos-run",
    });

    const first = runAgentOsTask({ tileId: "tile-agentos-1", instruction: "slow" });
    await Promise.resolve();
    const second = await runAgentOsTask({ tileId: "tile-agentos-1", instruction: "blocked" });

    expect(second.ok).toBe(false);
    expect(second.error).toContain("already in progress");

    releaseSend();
    await first;
  });
});
