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
  | 'awaiting-selection'
  | 'awaiting-approval'
  | 'denied'
  | 'stale'
  | 'selected'
  | 'executed'
  | 'failed';

export interface CheckpointCandidate {
  id: string;
  title: string;
  objective: string;
  /** Optional source task that the deepening task should depend on for context. */
  dependsOnTaskId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CheckpointRequest {
  checkpointId: string;
  summary?: string;
  /** Default source dependency for selected candidates. */
  dependsOnTaskId?: string | null;
  candidates: CheckpointCandidate[];
}

export interface LoopStepInput {
  workflowId?: string;
  /** Operator decision for a high-risk proposal: true approve, false deny. */
  approve?: boolean;
  /** The proposalToken the operator is acting on (must match the current one). */
  proposalToken?: string;
  /** Operator-directed override proposal (e.g. create_task with a title). */
  override?: ActionProposal;
  /** Candidate set for a run checkpoint. The loop persists it as a candidate artifact. */
  checkpoint?: CheckpointRequest;
  /** Operator selection for the current checkpoint candidate set. */
  selectedCandidateIds?: string[];
}

export interface LoopStepResult {
  status: LoopPhase;
  proposal: ActionProposal;
  /** Stable token for a high-risk proposal awaiting approval. */
  proposalToken?: string;
  result?: CommandResult;
  /** Whether the operator/UI may proceed to another step automatically. */
  canContinue: boolean;
  checkpoint?: {
    checkpointId: string;
    candidateArtifactId?: string;
    selectedCandidateIds?: string[];
  };
}

export interface ConductorLoopDeps {
  readContext(workflowId?: string): Promise<ConductorContext> | ConductorContext;
  propose(context: ConductorContext): ActionProposal;
  runAction(action: ConductorAction, args: Record<string, unknown>): Promise<CommandResult>;
  /** Optional R4 budget source: Workflow IS the run; budget lives on workflows.budget_json. */
  readRun?(workflowId: string): Promise<WorkflowRun | null> | WorkflowRun | null;
  /** Optional R4 pause hook, normally kernel.workflow.update({ status:'paused' }). */
  pauseRun?(workflowId: string, reason: string): Promise<CommandResult> | CommandResult;
  /** Optional R5 checkpoint source. Input checkpoint takes precedence. */
  readCheckpoint?(input: {
    workflowId?: string;
    context: ConductorContext;
    run: WorkflowRun | null;
  }): Promise<CheckpointRequest | null> | CheckpointRequest | null;
  /** R5 run-instance pause field: workflows.checkpoint_state. */
  setCheckpointState?(workflowId: string, state: string | null): Promise<CommandResult> | CommandResult;
  /** R5 candidate set artifact. Must create/reuse an artifact with kind='candidate'. */
  createCandidateArtifact?(input: {
    workflowId?: string;
    checkpoint: CheckpointRequest;
    proposalToken: string;
  }): Promise<CommandResult> | CommandResult;
  /** R5 deepening task dependency edge. Must call kernel.task.depend. */
  linkTaskDependency?(input: {
    taskId: string;
    dependsOnTaskId: string;
    kind: 'context_from';
  }): Promise<CommandResult> | CommandResult;
  /** R5 human decision receipt. Must post type='human_decision'. */
  postHumanDecision?(input: {
    workflowId?: string;
    checkpoint: CheckpointRequest;
    candidateArtifactId: string;
    selectedCandidateIds: string[];
    proposalToken: string;
  }): Promise<CommandResult> | CommandResult;
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
    if (run.checkpointState !== 'approved' && run.checkpointState !== 'resumed') {
      return { key: 'requires_checkpoint', reason: 'run requires checkpoint approval' };
    }
  }

  return null;
}

/** Token that binds an approval to the exact high-risk proposal shown. */
export function proposalToken(proposal: ActionProposal): string | null {
  if (proposal.kind !== 'action' || !proposal.action || proposal.risk !== 'high') return null;
  return tokenForAction(proposal.action, proposal.args ?? {});
}

function tokenForAction(action: string, args: Record<string, unknown>): string {
  const basis = `${action}|${stableStringify(args)}`;
  return createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

function checkpointToken(checkpoint: CheckpointRequest): string {
  return tokenForAction('checkpoint_select', {
    checkpointId: checkpoint.checkpointId,
    candidates: checkpoint.candidates,
  });
}

function candidateIds(checkpoint: CheckpointRequest): Set<string> {
  return new Set(checkpoint.candidates.map((candidate) => candidate.id));
}

export function taskIdForCheckpointCandidate(checkpoint: CheckpointRequest, candidate: CheckpointCandidate): string {
  const raw = `${checkpoint.checkpointId}-deepen-${candidate.id}`.toLowerCase();
  return raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `deepen-${candidate.id}`;
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

  function checkpointProposal(checkpoint: CheckpointRequest): ActionProposal {
    return {
      kind: 'pause',
      risk: 'low',
      rationale: checkpoint.summary ?? `Checkpoint "${checkpoint.checkpointId}" awaits human selection.`,
      pauseReason: 'awaiting-selection',
    };
  }

  async function surfaceCheckpoint(
    input: LoopStepInput,
    checkpoint: CheckpointRequest,
  ): Promise<LoopStepResult> {
    if (!input.workflowId) {
      return {
        status: 'failed',
        proposal: checkpointProposal(checkpoint),
        result: { ok: false, error: 'checkpoint requires workflowId' },
        canContinue: false,
      };
    }
    const token = checkpointToken(checkpoint);
    const proposal = checkpointProposal(checkpoint);
    const stateResult = await deps.setCheckpointState?.(input.workflowId, 'awaiting-selection');
    if (stateResult && !stateResult.ok) {
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result: stateResult, canContinue: false };
    }
    if (!deps.createCandidateArtifact) {
      const result = { ok: false, error: 'checkpoint unavailable: missing candidate artifact hook' };
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result, canContinue: false };
    }
    const artifact = await deps.createCandidateArtifact({
      workflowId: input.workflowId,
      checkpoint,
      proposalToken: token,
    });
    if (!artifact.ok) {
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result: artifact, canContinue: false };
    }
    await record(input, 'awaiting-selection', proposal, token, true);
    return {
      status: 'awaiting-selection',
      proposal,
      proposalToken: token,
      result: artifact,
      canContinue: false,
      checkpoint: {
        checkpointId: checkpoint.checkpointId,
        candidateArtifactId: artifact.id,
      },
    };
  }

  async function applySelection(
    input: LoopStepInput,
    checkpoint: CheckpointRequest,
  ): Promise<LoopStepResult> {
    const proposal = checkpointProposal(checkpoint);
    const token = checkpointToken(checkpoint);
    const selected = [...new Set(input.selectedCandidateIds ?? [])];
    const pending = input.proposalToken
      ? await deps.hasPendingApproval({ workflowId: input.workflowId, proposalToken: input.proposalToken })
      : false;
    if (!input.proposalToken || input.proposalToken !== token || !pending) {
      await record(input, 'stale', proposal, input.proposalToken ?? null);
      return { status: 'stale', proposal, proposalToken: token, canContinue: false };
    }

    const allowed = candidateIds(checkpoint);
    if (selected.length === 0 || selected.some((id) => !allowed.has(id))) {
      const result = { ok: false, error: 'checkpoint selection must name candidate ids from the current set' };
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result, canContinue: false };
    }
    if (!input.workflowId) {
      const result = { ok: false, error: 'checkpoint selection requires workflowId' };
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result, canContinue: false };
    }
    if (!deps.createCandidateArtifact || !deps.postHumanDecision || !deps.linkTaskDependency) {
      const result = { ok: false, error: 'checkpoint selection unavailable: missing R5 Kernel hooks' };
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result, canContinue: false };
    }

    const artifact = await deps.createCandidateArtifact({
      workflowId: input.workflowId,
      checkpoint,
      proposalToken: token,
    });
    if (!artifact.ok || !artifact.id) {
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result: artifact, canContinue: false };
    }

    const decision = await deps.postHumanDecision({
      workflowId: input.workflowId,
      checkpoint,
      candidateArtifactId: artifact.id,
      selectedCandidateIds: selected,
      proposalToken: token,
    });
    if (!decision.ok) {
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result: decision, canContinue: false };
    }

    for (const candidate of checkpoint.candidates.filter((item) => selected.includes(item.id))) {
      const taskId = taskIdForCheckpointCandidate(checkpoint, candidate);
      const created = await deps.runAction('create_task', {
        id: taskId,
        workflowId: input.workflowId,
        parentTaskId: checkpoint.dependsOnTaskId ?? null,
        title: `Deepen: ${candidate.title}`,
        objective: candidate.objective,
        metadata: {
          checkpointId: checkpoint.checkpointId,
          candidateId: candidate.id,
          candidateArtifactId: artifact.id,
          ...(candidate.metadata ?? {}),
        },
      });
      if (!created.ok) {
        await record(input, 'failed', proposal, token);
        return { status: 'failed', proposal, proposalToken: token, result: created, canContinue: false };
      }
      const dependsOnTaskId = candidate.dependsOnTaskId ?? checkpoint.dependsOnTaskId ?? null;
      if (dependsOnTaskId) {
        const linked = await deps.linkTaskDependency({
          taskId,
          dependsOnTaskId,
          kind: 'context_from',
        });
        if (!linked.ok) {
          await record(input, 'failed', proposal, token);
          return { status: 'failed', proposal, proposalToken: token, result: linked, canContinue: false };
        }
      }
    }

    const stateResult = await deps.setCheckpointState?.(input.workflowId, 'resumed');
    if (stateResult && !stateResult.ok) {
      await record(input, 'failed', proposal, token);
      return { status: 'failed', proposal, proposalToken: token, result: stateResult, canContinue: false };
    }
    await record(input, 'selected', proposal, token);
    return {
      status: 'selected',
      proposal,
      proposalToken: token,
      result: decision,
      canContinue: true,
      checkpoint: {
        checkpointId: checkpoint.checkpointId,
        candidateArtifactId: artifact.id,
        selectedCandidateIds: selected,
      },
    };
  }

  return {
    async step(input: LoopStepInput = {}): Promise<LoopStepResult> {
      const context = await deps.readContext(input.workflowId);
      const run = input.workflowId && deps.readRun ? await deps.readRun(input.workflowId) : null;
      const checkpoint = input.checkpoint
        ?? (deps.readCheckpoint ? await deps.readCheckpoint({ workflowId: input.workflowId, context, run }) : null);
      if (
        checkpoint
        && input.selectedCandidateIds !== undefined
        && (run?.checkpointState === 'resumed' || run?.checkpointState === 'approved')
      ) {
        const proposal = checkpointProposal(checkpoint);
        const token = checkpointToken(checkpoint);
        await record(input, 'stale', proposal, input.proposalToken ?? token);
        return { status: 'stale', proposal, proposalToken: token, canContinue: false };
      }
      if (checkpoint && run?.checkpointState !== 'resumed' && run?.checkpointState !== 'approved') {
        if (input.selectedCandidateIds !== undefined) {
          return applySelection(input, checkpoint);
        }
        return surfaceCheckpoint(input, checkpoint);
      }
      if (input.workflowId && deps.readRun) {
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
