/**
 * Conductor reader — v3 Goal 5A (embedded, read-only).
 *
 * The embedded Conductor: it reads Kernel truth through the native read tools,
 * runs the model provider to produce a plan, and assembles the view the
 * Conductor tile renders. `run` additionally appends a single planning receipt.
 *
 * It owns no state. The only write is the planning receipt (via the tools).
 */

import { createConductorTools } from './conductor-tools-readonly';
import { manualModelProvider, type ConductorModelProvider } from './model-provider';
import { buildPlanningPrompt } from './prompts/planning';
import type { ConductorContext } from '../../kernel/conductor/index';

export interface ConductorReceiptRef {
  id: string;
  type: string;
  summary: string;
}

export interface ConductorView {
  workflow: ConductorContext['workflow'];
  plan: string;
  nextAction: string;
  blockers: string[];
  stateReads: {
    tiles: number;
    tasks: number;
    stateCards: number;
    recentReceipts: number;
  };
  toolCalls: { tool: string; at: number }[];
  delegations: string[];
  receiptsReviewed: ConductorReceiptRef[];
  generatedAt: number;
}

async function assemble(
  workflowId: string | undefined,
  provider: ConductorModelProvider,
): Promise<{ view: ConductorView; context: ConductorContext; tools: ReturnType<typeof createConductorTools> }> {
  const tools = createConductorTools();
  const context = tools.getContext(workflowId);
  const plan = await provider.plan(context, buildPlanningPrompt(JSON.stringify(context)));

  const view: ConductorView = {
    workflow: context.workflow,
    plan: plan.plan,
    nextAction: plan.nextAction,
    blockers: plan.blockers,
    stateReads: {
      tiles: context.tiles.length,
      tasks: context.tasks.length,
      stateCards: context.stateCards.length,
      recentReceipts: context.recentReceipts.length,
    },
    toolCalls: tools.calls,
    // Read-only mode delegates nothing; this stays empty until Goal 5C.
    delegations: [],
    receiptsReviewed: context.recentReceipts.map((r) => ({
      id: r.id,
      type: r.type,
      summary: r.summary,
    })),
    generatedAt: Date.now(),
  };
  return { view, context, tools };
}

/** Read and assemble the Conductor view without writing anything. */
export async function readConductorView(
  workflowId?: string,
  provider: ConductorModelProvider = manualModelProvider,
): Promise<ConductorView> {
  const { view } = await assemble(workflowId, provider);
  return view;
}

/**
 * Read, plan, and append a single planning receipt. Returns the view plus the
 * receipt id. This is the Conductor's only mutation in Goal 5A.
 */
export async function runConductorPlan(
  workflowId?: string,
  provider: ConductorModelProvider = manualModelProvider,
): Promise<{ view: ConductorView; receiptId: string | null }> {
  const { view, tools } = await assemble(workflowId, provider);
  const result = (await tools.postPlanningReceipt({
    summary: view.plan,
    workflowId: workflowId ?? null,
    plan: view.plan,
    nextAction: view.nextAction,
    blockers: view.blockers,
    reads: view.stateReads,
    toolCalls: view.toolCalls.map((c) => c.tool),
  })) as { ok: boolean; id?: string };
  return { view, receiptId: result.ok ? result.id ?? null : null };
}
