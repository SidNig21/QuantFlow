/**
 * Conductor model-provider abstraction — v3 Goal 5A.
 *
 * The planner's intelligence backend lives behind this interface so it can later
 * route through Cloudflare AI Gateway / OpenRouter / a local provider / a direct
 * API without touching the Conductor reader or tools.
 *
 * Goal 5A ships ONLY the deterministic, no-network `manualModelProvider`: it
 * derives a plan/next-action/blockers from the Kernel reads alone. This keeps
 * the read-only MVP verifiable offline with no secrets. A real model provider
 * (MiniMax/Hermes) plugs in at Goal 5C+.
 */

import type { ConductorContext } from '../../kernel/conductor/index';

export interface ConductorPlan {
  /** One-line plan summary. */
  plan: string;
  /** The single next action the Conductor recommends. */
  nextAction: string;
  /** Current blockers, promoted (not raw logs). */
  blockers: string[];
}

export interface ConductorModelProvider {
  readonly id: string;
  /** Produce a plan from the current Kernel context. May be async (real models). */
  plan(context: ConductorContext, prompt: string): ConductorPlan | Promise<ConductorPlan>;
}

/**
 * Deterministic planner. No network, no secrets. Chooses the highest-priority
 * actionable item from the task list and summarizes the reads.
 */
export const manualModelProvider: ConductorModelProvider = {
  id: 'manual',
  plan(context: ConductorContext): ConductorPlan {
    const tasks = context.tasks;
    const byStatus = (s: string) => tasks.filter((t) => t.status === s);
    const blocked = byStatus('blocked');
    const submitted = byStatus('submitted');
    const verifying = byStatus('verifying');
    const open = byStatus('open');
    const working = byStatus('working');

    let nextAction: string;
    if (blocked.length) nextAction = `Resolve blocker on "${blocked[0]!.title}"`;
    else if (submitted.length) nextAction = `Verify submitted task "${submitted[0]!.title}"`;
    else if (verifying.length) nextAction = `Await verification of "${verifying[0]!.title}"`;
    else if (open.length) nextAction = `Assign open task "${open[0]!.title}"`;
    else if (working.length) nextAction = `Monitor work on "${working[0]!.title}"`;
    else nextAction = 'No actionable tasks; monitor the canvas';

    const blockers = context.stateCards
      .filter((c) => c.status === 'blocked' && c.blocker)
      .map((c) => String(c.blocker));

    const plan =
      `Reviewed ${context.tiles.length} tile(s), ${tasks.length} task(s), ` +
      `${context.recentReceipts.length} recent receipt(s). Recommended: ${nextAction}.`;

    return { plan, nextAction, blockers };
  },
};
