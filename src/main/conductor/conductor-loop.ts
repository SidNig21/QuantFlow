/**
 * Conductor loop — v3 Goal 5D.
 *
 * An approval-gated, operator-advanced loop (NOT a runaway timer). Each `step`:
 *   read Kernel context → propose one next action → approval gate (high-risk)
 *   → execute one action through the approved 5C/6 seams → post a decision
 *   receipt → return a pause/continue decision.
 *
 * It is STATELESS: every step reads the world from the Kernel, so there is no
 * hidden memory outside Kernel receipts/state.
 *
 * Approval binding (the safety property): a high-risk proposal returns a stable
 * `proposalToken` derived from {action, args}. The operator's approve/deny must
 * carry that token. On the decision step the loop re-reads the world, recomputes
 * the current proposal's token, and refuses to act if it no longer matches —
 * so the operator can never approve proposal A and have the loop run a
 * drifted-to proposal B. The token is recorded on the planning receipt, so the
 * pending approval is auditable in Kernel state, not hidden in memory.
 */

import { createHash } from 'node:crypto';
import type { CommandResult } from '../../kernel/commands/index';
import type { ConductorContext } from '../../kernel/conductor/index';
import type { WorkflowRun } from '../../kernel/workflows/index';
import type { ConductorAction } from './conductor-actions';
import { proposeNextAction, type ActionProposal } from './conductor-planner';

export type LoopPhase =
  | 'paused'
  | 'budget-paused'
  | 'awaiting-approval'
  | 'denied'
  | 'stale'
  | 'executed'
  | 'failed';

export interface LoopStepInput {
  workflowId?: string;
  /** Operator decision for a high-risk proposal: true approve, false deny. */
  approve?: boolean;
  /** The proposalToken the operator is acting on (must match the current one). */
  proposalToken?: string;
  /** Operator-directed override proposal (e.g. create_task with a title). */
  override?: ActionProposal;
}

export interface LoopStepResult {
  status: LoopPhase;
  proposal: ActionProposal;
  /** Stable token for a high-risk proposal awaiting approval. */
  proposalToken?: string;
  result?: CommandResult;
  /** Whether the operator/UI may proceed to another step automatically. */
  canContinue: boolean;
}

export interface ConductorLoopDeps {
  readContext(workflowId?: string): Promise<ConductorContext> | ConductorContext;
  propose(context: ConductorContext): ActionProposal;
  runAction(action: ConductorAction, args: Record<string, unknown>): Promise<CommandResult>;
  /** Optional R4 budget source: Workflow IS the run; budget lives on workflows.budget_json. */
  readRun?(workflowId: string): Promise<WorkflowRun | null> | WorkflowRun | null;
  /** Optional R4 pause hook, normally kernel.workflow.update({ status:'paused' }). */
  pauseRun?(workflowId: string, reason: string): Promise<CommandResult> | CommandResult;
  /** True only when the token is the latest unconsumed awaiting-approval receipt. */
  hasPendingApproval(input: { workflowId?: string; proposalToken: string }): Promise<boolean> | boolean;
  /** Post a Conductor planning/decision receipt (kernel.conductor.plan). */
  postDecision(input: {
    workflowId?: string;
    summary: string;
    phase: LoopPhase;
    proposal: ActionProposal;
    proposalToken?: string;
    requestApproval?: boolean;
  }): Promise<CommandResult>;
}

export interface ConductorLoop {
  step(input?: LoopStepInput): Promise<LoopStepResult>;
}

/** Stable deterministic key over the keys of an object (sorted). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export interface BudgetBreach {
  key: string;
  reason: string;
}

function numericBudget(budget: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = budget[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function boolBudget(budget: Record<string, unknown>, key: string): boolean {
  return budget[key] === true;
}

function receiptNumber(receipt: { metadata: Record<string, unknown> }, ...keys: string[]): number {
  for (const key of keys) {
    const value = receipt.metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

export function evaluateRunBudget(
  context: ConductorContext,
  run: WorkflowRun | null,
  now: number,
): BudgetBreach | null {
  if (!run) return null;
  const budget = run.budget ?? {};
  const maxWorkers = numericBudget(budget, 'max_workers', 'maxWorkers');
  if (maxWorkers !== null) {
    const workerCount = context.tiles.filter((tile) => tile.tileKind === 'worker').length;
    if (workerCount > maxWorkers) {
      return { key: 'max_workers', reason: `worker budget exceeded (${workerCount}/${maxWorkers})` };
    }
  }

  const maxWallclock = numericBudget(budget, 'max_wallclock_ms', 'maxWallclockMs', 'max_wallclock', 'maxWallclock');
  if (maxWallclock !== null && now - run.startedAt > maxWallclock) {
    return { key: 'max_wallclock', reason: `wallclock budget exceeded (${now - run.startedAt}/${maxWallclock}ms)` };
  }

  const planningReceipts = context.recentReceipts.filter((receipt) => receipt.type === 'planning');
  const maxToolCalls = numericBudget(budget, 'max_tool_calls', 'maxToolCalls');
  if (maxToolCalls !== null) {
    const toolCalls = planningReceipts.filter((receipt) => receipt.metadata?.['phase'] === 'executed').length;
    if (toolCalls >= maxToolCalls) {
      return { key: 'max_tool_calls', reason: `tool-call budget exhausted (${toolCalls}/${maxToolCalls})` };
    }
  }

  const maxRetries = numericBudget(budget, 'max_retries', 'maxRetries');
  if (maxRetries !== null) {
    const retries = context.recentReceipts.filter((receipt) => receipt.type === 'verification_failed').length;
    if (retries > maxRetries) {
      return { key: 'max_retries', reason: `retry budget exceeded (${retries}/${maxRetries})` };
    }
  }

  const maxSpend = numericBudget(budget, 'max_spend', 'maxSpend', 'max_spend_usd', 'maxSpendUsd');
  if (maxSpend !== null) {
    const spend = context.recentReceipts.reduce((sum, receipt) => sum + receiptNumber(receipt, 'spendUsd', 'costUsd'), 0);
    if (spend > maxSpend) {
      return { key: 'max_spend', reason: `spend budget exceeded (${spend}/${maxSpend})` };
    }
  }

  if (boolBudget(budget, 'requires_checkpoint') || boolBudget(budget, 'requiresCheckpoint')) {
    if (run.checkpointState !== 'approved') {
      return { key: 'requires_checkpoint', reason: 'run requires checkpoint approval' };
    }
  }

  return null;
}

/** Token that binds an approval to the exact high-risk proposal shown. */
export function proposalToken(proposal: ActionProposal): string | null {
  if (proposal.kind !== 'action' || !proposal.action || proposal.risk !== 'high') return null;
  const basis = `${proposal.action}|${stableStringify(proposal.args ?? {})}`;
  return createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

export function createConductorLoop(deps: ConductorLoopDeps): ConductorLoop {
  function record(
    input: LoopStepInput,
    phase: LoopPhase,
    proposal: ActionProposal,
    token: string | null,
    requestApproval = false,
  ): Promise<CommandResult> {
    const what = proposal.kind === 'action' ? proposal.action : 'pause';
    return deps.postDecision({
      workflowId: input.workflowId,
      summary: `[loop:${phase}] ${what}: ${proposal.rationale}`,
      phase,
      proposal,
      ...(token ? { proposalToken: token } : {}),
      requestApproval,
    });
  }

  return {
    async step(input: LoopStepInput = {}): Promise<LoopStepResult> {
      const context = await deps.readContext(input.workflowId);
      if (input.workflowId && deps.readRun) {
        const run = await deps.readRun(input.workflowId);
        const breach = evaluateRunBudget(context, run, Date.now());
        if (breach) {
          const proposal: ActionProposal = { kind: 'pause', rationale: breach.reason };
          await deps.pauseRun?.(input.workflowId, breach.reason);
          await record(input, 'budget-paused', proposal, null);
          return { status: 'budget-paused', proposal, canContinue: false };
        }
      }
      const proposal = input.override ?? deps.propose(context);
      const currentToken =
        proposal.kind === 'action' && proposal.risk === 'high' ? proposalToken(proposal) : null;

      // A decision (approve/deny) was submitted: it must be token-bound to the
      // EXACT high-risk proposal that is still current, or we refuse (stale).
      if (input.approve !== undefined) {
        const pending = input.proposalToken
          ? await deps.hasPendingApproval({ workflowId: input.workflowId, proposalToken: input.proposalToken })
          : false;
        if (!input.proposalToken || currentToken === null || currentToken !== input.proposalToken || !pending) {
          await record(input, 'stale', proposal, input.proposalToken ?? null);
          return { status: 'stale', proposal, ...(currentToken ? { proposalToken: currentToken } : {}), canContinue: false };
        }
        if (input.approve === false) {
          await record(input, 'denied', proposal, currentToken);
          return { status: 'denied', proposal, proposalToken: currentToken, canContinue: false };
        }
        // approve === true and token matches → fall through to execute.
      } else {
        // No decision yet.
        if (proposal.kind === 'pause' || !proposal.action) {
          await record(input, 'paused', proposal, null);
          return { status: 'paused', proposal, canContinue: false };
        }
        if (proposal.risk === 'high') {
          await record(input, 'awaiting-approval', proposal, currentToken, true);
          return { status: 'awaiting-approval', proposal, proposalToken: currentToken ?? undefined, canContinue: false };
        }
        // low-risk: execute below.
      }

      // Execute one action through the approved seam (5C native actions /
      // Goal 6 harness-gated spawn). The action posts its own canonical receipts.
      const result = await deps.runAction(proposal.action!, proposal.args ?? {});
      const phase: LoopPhase = result.ok ? 'executed' : 'failed';
      await record(input, phase, proposal, currentToken);
      const canContinue = result.ok && proposal.risk === 'low';
      return { status: phase, proposal, result, canContinue };
    },
  };
}

export { proposeNextAction };
