/**
 * Conductor loop — v3 Goal 5D.
 *
 * An approval-gated, operator-advanced loop (NOT a runaway timer). Each `step`:
 *   read Kernel context → propose one next action → approval gate (high-risk)
 *   → execute one action through the approved 5C/6 seams → post a decision
 *   receipt → return a pause/continue decision.
 *
 * It is STATELESS: every step reads the world from the Kernel, so there is no
 * hidden memory outside Kernel receipts/state. The operator advances it one step
 * at a time and can approve/deny/stop; every decision is provable via the
 * planning receipts the loop posts.
 */

import type { CommandResult } from '../../kernel/commands/index';
import type { ConductorContext } from '../../kernel/conductor/index';
import type { ConductorAction } from './conductor-actions';
import { proposeNextAction, type ActionProposal } from './conductor-planner';

export type LoopPhase =
  | 'paused'
  | 'awaiting-approval'
  | 'denied'
  | 'executed'
  | 'failed';

export interface LoopStepInput {
  workflowId?: string;
  /** Operator decision for a high-risk proposal: true approve, false deny. */
  approve?: boolean;
  /** Operator-directed override proposal (e.g. create_task with a title). */
  override?: ActionProposal;
}

export interface LoopStepResult {
  status: LoopPhase;
  proposal: ActionProposal;
  result?: CommandResult;
  /** Whether the operator/UI may proceed to another step automatically. */
  canContinue: boolean;
}

export interface ConductorLoopDeps {
  readContext(workflowId?: string): Promise<ConductorContext> | ConductorContext;
  propose(context: ConductorContext): ActionProposal;
  runAction(action: ConductorAction, args: Record<string, unknown>): Promise<CommandResult>;
  /** Post a Conductor planning/decision receipt (kernel.conductor.plan). */
  postDecision(input: {
    workflowId?: string;
    summary: string;
    phase: LoopPhase;
    proposal: ActionProposal;
    requestApproval?: boolean;
  }): Promise<CommandResult>;
}

export interface ConductorLoop {
  step(input?: LoopStepInput): Promise<LoopStepResult>;
}

export function createConductorLoop(deps: ConductorLoopDeps): ConductorLoop {
  async function record(
    input: LoopStepInput,
    phase: LoopPhase,
    proposal: ActionProposal,
    requestApproval = false,
  ): Promise<void> {
    const what = proposal.kind === 'action' ? proposal.action : 'pause';
    await deps.postDecision({
      workflowId: input.workflowId,
      summary: `[loop:${phase}] ${what}: ${proposal.rationale}`,
      phase,
      proposal,
      requestApproval,
    });
  }

  return {
    async step(input: LoopStepInput = {}): Promise<LoopStepResult> {
      const context = await deps.readContext(input.workflowId);
      const proposal = input.override ?? deps.propose(context);

      // Pause: blocker or ambiguity — ask, don't guess.
      if (proposal.kind === 'pause' || !proposal.action) {
        await record(input, 'paused', proposal);
        return { status: 'paused', proposal, canContinue: false };
      }

      // Approval gate for high-risk actions.
      if (proposal.risk === 'high' && input.approve !== true) {
        if (input.approve === false) {
          await record(input, 'denied', proposal);
          return { status: 'denied', proposal, canContinue: false };
        }
        await record(input, 'awaiting-approval', proposal, true);
        return { status: 'awaiting-approval', proposal, canContinue: false };
      }

      // Execute one action through the approved seam (5C native actions /
      // Goal 6 harness-gated spawn). The action posts its own canonical receipts.
      const result = await deps.runAction(proposal.action, proposal.args ?? {});
      const phase: LoopPhase = result.ok ? 'executed' : 'failed';
      await record(input, phase, proposal);
      // Only continue automatically after a low-risk success; high-risk and
      // failures hand control back to the operator.
      const canContinue = result.ok && proposal.risk === 'low';
      return { status: phase, proposal, result, canContinue };
    },
  };
}

export { proposeNextAction };
