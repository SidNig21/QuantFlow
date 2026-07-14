/**
 * Production AgentOS ApprovalGate — Electron main only.
 *
 * Blocks the harness adapter until the operator approves/denies via IPC.
 * Surfaces pending requests through existing Kernel commands (state card +
 * progress receipt); posts human_decision on resolve.
 */
import { dispatchKernelCommand } from "../../../src/kernel/commands/index";
import type { CommandResult } from "../../../src/kernel/commands/types";
import type {
  ApprovalGate,
  ApprovalRequest,
  ApprovalResult,
} from "@qf-harness/agentos/approval-gate";

export type AgentOsKernelDispatch = (
  type: string,
  payload: Record<string, unknown>,
  requestedBy?: string,
) => Promise<CommandResult> | CommandResult;

export interface AgentOsApprovalContext {
  tileId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  workerId?: string | null;
}

export interface PendingAgentOsApproval {
  requestId: string;
  action: string;
  source: "toolkit" | "acp";
  toolCallId?: string | null;
  startedAt: number;
  tileId?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  workerId?: string | null;
}

export interface AgentOsApprovalDeps {
  dispatchKernel: AgentOsKernelDispatch;
  getActiveContext?: () => AgentOsApprovalContext | null;
}

interface PendingEntry {
  pending: PendingAgentOsApproval;
  startedAt: number;
  resolve: (result: ApprovalResult) => void;
}

interface AgentOsApprovalModule {
  deps: AgentOsApprovalDeps;
  pending: Map<string, PendingEntry>;
}

function defaultDeps(): AgentOsApprovalDeps {
  return {
    dispatchKernel: (type, payload, requestedBy) =>
      dispatchKernelCommand(type, payload, requestedBy ?? "agentos"),
  };
}

let moduleState: AgentOsApprovalModule = {
  deps: defaultDeps(),
  pending: new Map(),
};

let activeContext: AgentOsApprovalContext | null = null;

/** Test seam — inject kernel dispatch without a live DB. */
export function configureAgentOsApproval(deps: Partial<AgentOsApprovalDeps>): void {
  moduleState = {
    deps: { ...defaultDeps(), ...deps },
    pending: new Map(),
  };
}

/** Test seam — restore production deps and clear pending state. */
export function resetAgentOsApprovalModule(): void {
  moduleState = { deps: defaultDeps(), pending: new Map() };
  activeContext = null;
}

export function setActiveAgentOsContext(ctx: AgentOsApprovalContext | null): void {
  activeContext = ctx;
}

function resolveContext(): AgentOsApprovalContext {
  return activeContext ?? moduleState.deps.getActiveContext?.() ?? {};
}

async function surfacePendingApproval(
  input: ApprovalRequest,
  ctx: AgentOsApprovalContext,
): Promise<void> {
  const { dispatchKernel } = moduleState.deps;
  const summary = `Awaiting AgentOS approval: ${input.action}`;

  if (ctx.tileId) {
    await dispatchKernel(
      "kernel.state_card.update",
      {
        tileId: ctx.tileId,
        workflowId: ctx.workflowId ?? null,
        workerId: ctx.workerId ?? null,
        currentTaskId: ctx.taskId ?? null,
        status: "blocked",
        blocker: `AgentOS approval: ${input.action}`,
        lastMeaningfulUpdate: summary,
        nextAction: "Approve or deny AgentOS action",
        cavemanSummary: "STUCK. NEED HELP.",
      },
      "agentos",
    );
  }

  await dispatchKernel(
    "kernel.receipt.post",
    {
      type: "progress",
      summary,
      taskId: ctx.taskId ?? null,
      workflowId: ctx.workflowId ?? null,
      workerId: ctx.workerId ?? null,
      tileId: ctx.tileId ?? null,
      metadata: {
        milestone: "approval.requested",
        requestId: input.requestId,
        action: input.action,
        source: input.source,
        harnessKind: "agentos",
        toolCallId: input.toolCallId ?? null,
      },
    },
    "agentos",
  );
}

async function clearApprovalBlocker(pending: PendingAgentOsApproval): Promise<void> {
  if (!pending.tileId) return;
  await moduleState.deps.dispatchKernel(
    "kernel.state_card.update",
    {
      tileId: pending.tileId,
      workflowId: pending.workflowId ?? null,
      workerId: pending.workerId ?? null,
      currentTaskId: pending.taskId ?? null,
      status: "active",
      blocker: null,
      lastMeaningfulUpdate: `AgentOS approval resolved: ${pending.action}`,
      nextAction: "Work in progress",
      cavemanSummary: "DOING WORK.",
    },
    "agentos",
  );
}

async function postHumanDecisionReceipt(
  pending: PendingAgentOsApproval,
  approved: boolean,
  blockedMs: number,
): Promise<void> {
  await moduleState.deps.dispatchKernel(
    "kernel.receipt.post",
    {
      type: "human_decision",
      summary: `AgentOS ${approved ? "approved" : "denied"}: ${pending.action}`,
      taskId: pending.taskId ?? null,
      workflowId: pending.workflowId ?? null,
      workerId: pending.workerId ?? null,
      tileId: pending.tileId ?? null,
      metadata: {
        requestId: pending.requestId,
        action: pending.action,
        approved,
        blockedMs,
        source: pending.source,
        harnessKind: "agentos",
        toolCallId: pending.toolCallId ?? null,
      },
    },
    "agentos",
  );
}

export function createProductionApprovalGate(): ApprovalGate {
  return {
    async request(input: ApprovalRequest): Promise<ApprovalResult> {
      const ctx = resolveContext();
      const startedAt = Date.now();
      const pending: PendingAgentOsApproval = {
        requestId: input.requestId,
        action: input.action,
        source: input.source,
        toolCallId: input.toolCallId ?? null,
        startedAt,
        tileId: ctx.tileId ?? null,
        workflowId: ctx.workflowId ?? null,
        taskId: ctx.taskId ?? null,
        workerId: ctx.workerId ?? null,
      };

      const resultPromise = new Promise<ApprovalResult>((resolve) => {
        moduleState.pending.set(input.requestId, { pending, startedAt, resolve });
      });

      await surfacePendingApproval(input, ctx);
      return resultPromise;
    },
  };
}

export function resolveAgentOsApproval(requestId: string, approved: boolean): boolean {
  const entry = moduleState.pending.get(requestId);
  if (!entry) return false;

  moduleState.pending.delete(requestId);
  const blockedMs = Date.now() - entry.startedAt;

  // Land the Kernel updates BEFORE resuming the adapter: otherwise the
  // unblocked run's receipt storm can re-render the state card while it still
  // reads 'blocked', leaving stale approval UI until the next event.
  void (async () => {
    try {
      await clearApprovalBlocker(entry.pending);
      await postHumanDecisionReceipt(entry.pending, approved, blockedMs);
    } finally {
      entry.resolve({ approved, blockedMs });
    }
  })();

  return true;
}

export function listPendingAgentOsApprovals(): PendingAgentOsApproval[] {
  return [...moduleState.pending.values()].map((entry) => entry.pending);
}
