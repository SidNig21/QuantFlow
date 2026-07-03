import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  configureAgentOsApproval,
  createProductionApprovalGate,
  listPendingAgentOsApprovals,
  resetAgentOsApprovalModule,
  resolveAgentOsApproval,
  setActiveAgentOsContext,
} from "./agentos-approval";

interface DispatchCall {
  type: string;
  payload: Record<string, unknown>;
  requestedBy?: string;
}

describe("agentos approval gate", () => {
  let dispatchCalls: DispatchCall[];

  beforeEach(() => {
    dispatchCalls = [];
    configureAgentOsApproval({
      dispatchKernel: async (type, payload, requestedBy) => {
        dispatchCalls.push({ type, payload, requestedBy });
        return { ok: true, id: `cmd-${dispatchCalls.length}` };
      },
    });
    setActiveAgentOsContext({
      tileId: "tile-agentos-1",
      workflowId: "wf-1",
      taskId: "task-1",
      workerId: "worker-1",
    });
  });

  afterEach(() => {
    resetAgentOsApprovalModule();
  });

  test("request surfaces pending approval through kernel commands", async () => {
    const gate = createProductionApprovalGate();
    const pendingPromise = gate.request({
      requestId: "req-1",
      action: "write tier2 result file",
      source: "acp",
      toolCallId: "tool-1",
    });
    await Promise.resolve();

    expect(listPendingAgentOsApprovals()).toHaveLength(1);
    expect(listPendingAgentOsApprovals()[0]).toMatchObject({
      requestId: "req-1",
      action: "write tier2 result file",
      tileId: "tile-agentos-1",
      workflowId: "wf-1",
      taskId: "task-1",
    });

    expect(dispatchCalls.some((c) => c.type === "kernel.state_card.update")).toBe(true);
    const stateCardCall = dispatchCalls.find((c) => c.type === "kernel.state_card.update");
    expect(stateCardCall?.payload).toMatchObject({
      tileId: "tile-agentos-1",
      status: "blocked",
      blocker: "AgentOS approval: write tier2 result file",
    });

    const progressCall = dispatchCalls.find((c) => c.type === "kernel.receipt.post");
    expect(progressCall?.payload).toMatchObject({
      type: "progress",
      summary: "Awaiting AgentOS approval: write tier2 result file",
      metadata: {
        milestone: "approval.requested",
        requestId: "req-1",
      },
    });

    resolveAgentOsApproval("req-1", true);
    const result = await pendingPromise;
    expect(result.approved).toBe(true);
    expect(result.blockedMs).toBeGreaterThanOrEqual(0);
  });

  test("resolve true posts human_decision receipt and clears blocker", async () => {
    const gate = createProductionApprovalGate();
    const pendingPromise = gate.request({
      requestId: "req-approve",
      action: "run shell command",
      source: "toolkit",
    });

    expect(resolveAgentOsApproval("req-approve", true)).toBe(true);
    await pendingPromise;
    await Promise.resolve();
    await Promise.resolve();

    const humanDecision = dispatchCalls.find(
      (c) => c.type === "kernel.receipt.post" && c.payload.type === "human_decision",
    );
    expect(humanDecision?.payload).toMatchObject({
      type: "human_decision",
      summary: "AgentOS approved: run shell command",
      metadata: {
        requestId: "req-approve",
        approved: true,
        harnessKind: "agentos",
      },
    });

    const cleared = dispatchCalls.filter((c) => c.type === "kernel.state_card.update");
    expect(cleared.some((c) => c.payload.blocker === null)).toBe(true);
    expect(listPendingAgentOsApprovals()).toHaveLength(0);
  });

  test("resolve false settles promise as denied", async () => {
    const gate = createProductionApprovalGate();
    const pendingPromise = gate.request({
      requestId: "req-deny",
      action: "delete file",
      source: "acp",
    });

    expect(resolveAgentOsApproval("req-deny", false)).toBe(true);
    const result = await pendingPromise;
    expect(result.approved).toBe(false);
    await Promise.resolve();
    await Promise.resolve();

    const humanDecision = dispatchCalls.find(
      (c) => c.type === "kernel.receipt.post" && c.payload.type === "human_decision",
    );
    expect(humanDecision?.payload.summary).toBe("AgentOS denied: delete file");
  });

  test("resolve returns false for unknown request id", () => {
    expect(resolveAgentOsApproval("missing-id", true)).toBe(false);
  });
});
