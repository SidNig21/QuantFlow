import { registerMethod } from "./json-rpc-server";
import { getKernelDb } from "@qf-kernel/database";
import { queryStateCardList } from "@qf-kernel/state-cards";
import { queryWorkflowRegion, queryWorkflowRegionList, queryRun } from "@qf-kernel/workflows";
import { queryEvaluationList } from "@qf-kernel/evals";

/**
 * R3c — read-only Kernel query RPC methods for EXTERNAL agents via MCP.
 *
 * Authority consolidation surface: the Kernel is the one task/state authority,
 * and these expose its projections so external agents can READ Kernel truth
 * (the gap noted in docs/v4/INCOMING_GOALS.md).
 *
 * F25 — MCP stays external-only: the Conductor must keep using its native
 * in-process `conductor-tools-readonly`; it must NOT route reads through MCP/RPC.
 * Every handler here is strictly read-only — no command, no mutation.
 */
function workflowIdOf(params: unknown): string | undefined {
  const value = (params as Record<string, unknown> | null)?.["workflowId"];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const WORKFLOW_PROJECTION_DESCRIPTION =
  "Read-only: Workflow projection (references only; run_id ≡ workflow_id)";

function registerWorkflowProjectionReadHandler(): void {
  const handler = (params: unknown) =>
    queryRun(getKernelDb(), String(workflowIdOf(params) ?? ""));

  registerMethod("kernel.workflowProjection", handler, {
    description: WORKFLOW_PROJECTION_DESCRIPTION,
    params: {},
  });

  // Deprecated alias — remove after external callers migrate (A3+).
  registerMethod("kernel.run", handler, {
    description: `${WORKFLOW_PROJECTION_DESCRIPTION} [deprecated: use kernel.workflowProjection]`,
    params: {},
  });
}

export function registerKernelReadHandlers(): void {
  registerMethod(
    "kernel.stateCardList",
    (params) => {
      const workflowId = workflowIdOf(params);
      return queryStateCardList(getKernelDb(), workflowId ? { workflowId } : {});
    },
    { description: "Read-only: Kernel State Cards (current per-tile reality)", params: {} },
  );

  registerMethod(
    "kernel.workflowRegion",
    (params) => queryWorkflowRegion(getKernelDb(), String(workflowIdOf(params) ?? "")),
    { description: "Read-only: one workflow's canvas region projection", params: {} },
  );

  registerMethod(
    "kernel.workflowRegionList",
    () => queryWorkflowRegionList(getKernelDb()),
    { description: "Read-only: all workflow region projections", params: {} },
  );

  registerWorkflowProjectionReadHandler();

  registerMethod(
    "kernel.evalList",
    (params) => {
      const workflowId = workflowIdOf(params);
      return queryEvaluationList(getKernelDb(), workflowId ? { workflowId } : {});
    },
    { description: "Read-only: Kernel evaluation rows (non-authoritative, cross-run)", params: {} },
  );
}
