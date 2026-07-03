/**
 * AgentOS run driver — Electron main (P6 chunk B).
 *
 * Fire-and-forget harness loop: spawn → send → readState → collectReceipts →
 * post drafts via kernel.receipt.post. Surfaces progress through Kernel events.
 */
import { dispatchKernelCommand } from "../../../src/kernel/commands/index";
import type { CommandResult } from "../../../src/kernel/commands/types";
import { getKernelDb } from "../../../src/kernel/database";
import { queryWorkerForTile, queryWorkerGet } from "../../../src/kernel/worker-instances/index";
import type { ReceiptDraft, WorkerHandle, WorkerHarness } from "@qf-harness/types";
import { QUANTFLOW_DIR } from "./paths";
import { AGENTOS_DEFAULT_INSTRUCTION } from "../shared/agentos-instruction.js";
import { getAgentOsWorkerHarness } from "./agentos-service";

export { AGENTOS_DEFAULT_INSTRUCTION };

export interface AgentOsRunInput {
  tileId: string;
  instruction: string;
  workflowId?: string | null;
}

export interface AgentOsRunResult {
  ok: boolean;
  receiptsPosted?: number;
  error?: string;
  started?: boolean;
}

export type AgentOsKernelDispatch = (
  type: string,
  payload: Record<string, unknown>,
  requestedBy?: string,
) => Promise<CommandResult> | CommandResult;

export interface AgentOsRunDeps {
  getHarness?: () => WorkerHarness;
  dispatchKernel?: AgentOsKernelDispatch;
  getWorkerForTile?: (tileId: string) => string | null;
  getWorker?: (workerId: string) => { workflowId: string | null } | null;
  workspaceDir?: string;
}

interface AgentOsRunModule {
  deps: Required<AgentOsRunDeps>;
  running: Set<string>;
}

function defaultDeps(): Required<AgentOsRunDeps> {
  return {
    getHarness: () => getAgentOsWorkerHarness(),
    dispatchKernel: (type, payload, requestedBy) =>
      dispatchKernelCommand(type, payload, requestedBy ?? "agentos"),
    getWorkerForTile: (tileId) => queryWorkerForTile(getKernelDb(), tileId),
    getWorker: (workerId) => queryWorkerGet(getKernelDb(), workerId),
    workspaceDir: QUANTFLOW_DIR,
  };
}

let moduleState: AgentOsRunModule = {
  deps: null as unknown as Required<AgentOsRunDeps>,
  running: new Set(),
};

function resolveDeps(): Required<AgentOsRunDeps> {
  if (!moduleState.deps) {
    moduleState.deps = defaultDeps();
  }
  return moduleState.deps;
}

/** Test seam — inject harness + kernel dispatch. */
export function configureAgentOsRun(deps: Required<AgentOsRunDeps>): void {
  moduleState.deps = deps;
  moduleState.running.clear();
}

/** Test seam — restore production deps and clear running guard. */
export function resetAgentOsRunModule(): void {
  moduleState.deps = null as unknown as Required<AgentOsRunDeps>;
  moduleState.running.clear();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function postReceiptDraft(
  dispatchKernel: AgentOsKernelDispatch,
  draft: ReceiptDraft,
  ctx: { tileId: string; workerId: string; workflowId: string | null },
): Promise<boolean> {
  const result = await dispatchKernel(
    "kernel.receipt.post",
    {
      type: draft.type,
      taskId: draft.taskId ?? null,
      workflowId: ctx.workflowId,
      workerId: ctx.workerId,
      tileId: ctx.tileId,
      summary: draft.summary,
      artifactRefs: draft.artifactRefs ?? [],
      metadata: draft.metadata ?? {},
    },
    "agentos",
  );
  return result.ok === true;
}

async function postRunErrorReceipt(
  dispatchKernel: AgentOsKernelDispatch,
  ctx: { tileId: string; workerId: string | null; workflowId: string | null },
  message: string,
): Promise<void> {
  await dispatchKernel(
    "kernel.receipt.post",
    {
      type: "progress",
      summary: `AgentOS run failed: ${message}`,
      taskId: null,
      workflowId: ctx.workflowId,
      workerId: ctx.workerId,
      tileId: ctx.tileId,
      metadata: { error: message, harnessKind: "agentos", milestone: "run.error" },
    },
    "agentos",
  );
}

async function statusUpdate(
  dispatchKernel: AgentOsKernelDispatch,
  tileId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await dispatchKernel(
    "kernel.worker.status_update",
    { tileId, status, ...extra },
    "agentos",
  );
}

export async function runAgentOsTask(input: AgentOsRunInput): Promise<AgentOsRunResult> {
  const deps = resolveDeps();
  const { running } = moduleState;
  const tileId = input.tileId?.trim();
  const instruction = input.instruction?.trim();
  if (!tileId) return { ok: false, error: "tileId required" };
  if (!instruction) return { ok: false, error: "instruction required" };
  if (running.has(tileId)) return { ok: false, error: "agentos run already in progress for tile" };

  running.add(tileId);
  let handle: WorkerHandle | null = null;
  let workerId: string | null = null;
  let workflowId: string | null = input.workflowId ?? null;

  try {
    workerId = deps.getWorkerForTile(tileId);
    if (!workerId) {
      return { ok: false, error: `no worker row for tile: ${tileId}` };
    }

    const worker = deps.getWorker(workerId);
    if (!workflowId && worker?.workflowId) {
      workflowId = worker.workflowId;
    }

    const harness = deps.getHarness();
    handle = await harness.spawn({
      tileId,
      roleId: workerId,
      roleName: "AgentOS",
      harnessKind: "agentos",
      runtimeTarget: "agentos",
      workflowId,
      cwd: deps.workspaceDir,
    });

    await statusUpdate(deps.dispatchKernel, tileId, "active");

    await harness.send(handle, {
      text: instruction,
      workflowId,
      artifactRoot: deps.workspaceDir,
    });

    await harness.readState(handle);
    const drafts = await harness.collectReceipts(handle);

    let receiptsPosted = 0;
    for (const draft of drafts) {
      const posted = await postReceiptDraft(deps.dispatchKernel, draft, {
        tileId,
        workerId,
        workflowId,
      });
      if (posted) receiptsPosted += 1;
    }

    await statusUpdate(deps.dispatchKernel, tileId, "idle");
    await harness.stop(handle);
    handle = null;

    return { ok: true, receiptsPosted };
  } catch (error) {
    const message = errorMessage(error);
    try {
      await postRunErrorReceipt(deps.dispatchKernel, { tileId, workerId, workflowId }, message);
      await statusUpdate(deps.dispatchKernel, tileId, "error");
      if (handle) await deps.getHarness().stop(handle);
    } catch {
      // Never crash main on cleanup failure.
    }
    return { ok: false, error: message, receiptsPosted: 0 };
  } finally {
    running.delete(tileId);
  }
}

/** Returns immediately; the run continues asynchronously. */
export function startAgentOsTask(input: AgentOsRunInput): AgentOsRunResult {
  const tileId = input.tileId?.trim();
  if (!tileId) return { ok: false, error: "tileId required" };
  if (moduleState.running.has(tileId)) {
    return { ok: false, error: "agentos run already in progress for tile" };
  }

  void runAgentOsTask(input);
  return { ok: true, started: true };
}
