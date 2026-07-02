/**
 * Conductor planner — v3 Goal 5D.
 *
 * Deterministic policy that maps the current Kernel context to ONE next action
 * proposal (or a pause). No network, no hidden memory — it reads only the
 * provided Kernel-owned context, so the same state always yields the same
 * proposal. High-risk actions are flagged for the approval gate; ambiguity or
 * blockers produce a pause so the loop asks rather than guesses.
 */

import type { ConductorContext } from '../../kernel/conductor/index';
import type { ConductorAction } from './conductor-actions';

export interface ActionProposal {
  kind: 'action' | 'await_operator';
  /** Present when kind === 'action'. */
  action?: ConductorAction;
  args?: Record<string, unknown>;
  /** Low-risk actions may auto-execute in a step; high-risk needs approval. */
  risk: 'low' | 'high';
  rationale: string;
  /** Present when kind === 'await_operator'. */
  pauseReason?: string;
}

/**
 * High-risk actions: they start a runtime, or complete/fail/block a task. They
 * require explicit operator approval before the loop executes them.
 */
const HIGH_RISK: ReadonlySet<ConductorAction> = new Set<ConductorAction>([
  'spawn_role',
  'verify_task',
  'reject_task',
  'block_task',
]);

export function isHighRisk(action: ConductorAction): boolean {
  return HIGH_RISK.has(action);
}

function pause(pauseReason: string): ActionProposal {
  return { kind: 'await_operator', risk: 'low', rationale: pauseReason, pauseReason };
}

/**
 * Propose the next step from Kernel context. Priority:
 *  1. blocked task  → pause (operator must resolve)
 *  2. submitted task → verify_task (high-risk: completes the task)
 *  3. open task + an available worker tile → assign_task (low-risk)
 *  4. open task + no worker tile → pause (operator should spawn a worker/role)
 *  5. working task → pause (awaiting worker submission)
 *  6. otherwise → pause (nothing actionable / step complete)
 */
export function proposeNextAction(context: ConductorContext): ActionProposal {
  const tasks = context.tasks;
  const byStatus = (s: string) => tasks.filter((t) => t.status === s);

  const blocked = byStatus('blocked')[0];
  if (blocked) {
    return pause(`Task "${blocked.title}" is blocked; operator must resolve before the loop proceeds.`);
  }

  const submitted = byStatus('submitted')[0];
  if (submitted) {
    return {
      kind: 'action',
      action: 'verify_task',
      args: { taskId: submitted.id, verdict: 'pass' },
      risk: 'high',
      rationale: `Submitted task "${submitted.title}" is ready for verification.`,
    };
  }

  const open = byStatus('open')[0];
  if (open) {
    const workerTile = context.tiles.find((t) => t.tileKind === 'worker');
    if (workerTile) {
      return {
        kind: 'action',
        action: 'assign_task',
        args: { taskId: open.id, tileId: workerTile.id },
        risk: 'low',
        rationale: `Assign open task "${open.title}" to worker tile ${workerTile.id}.`,
      };
    }
    return pause(`Open task "${open.title}" has no worker tile; operator should spawn a worker (role).`);
  }

  const working = byStatus('working')[0];
  if (working) {
    return pause(`Task "${working.title}" is working; awaiting worker submission.`);
  }

  return pause('No actionable task; workflow step is idle or complete.');
}
