/**
 * Kernel Task State Machine — v3
 *
 * The canonical task lifecycle. The Kernel enforces every transition centrally;
 * no caller may bypass it. A worker submits completion — the system verifies it.
 *
 * Canonical lifecycle:
 *   open → claimed → working → submitted → verifying → complete
 *
 * Side paths:
 *   working → blocked → working
 *   working / submitted / verifying → failed
 *   submitted / verifying → working   (verification rejected)
 *   claimed (stale) → open            (released for reclaim)
 *
 * See docs/v3/AUTHORITY_RULES.md and KERNEL_CONSTITUTION.md.
 */

import type { TaskStatus } from '../schema/types';

/**
 * Allowed forward/side transitions per state. The Kernel rejects any
 * transition not listed here. `complete` and `failed` are terminal.
 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ['claimed'],
  claimed: ['working', 'open'],
  working: ['submitted', 'blocked', 'failed'],
  submitted: ['verifying', 'working', 'failed'],
  verifying: ['complete', 'working', 'failed'],
  blocked: ['working', 'failed'],
  complete: [],
  failed: [],
};

export const TERMINAL_STATES: readonly TaskStatus[] = ['complete', 'failed'];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  const allowed = TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function allowedTransitions(from: TaskStatus): readonly TaskStatus[] {
  return TRANSITIONS[from] ?? [];
}

export interface TransitionCheck {
  ok: boolean;
  error?: string;
}

/**
 * Assert a transition is legal. Returns a structured result instead of
 * throwing so command handlers can map it to a CommandResult.
 */
export function assertTransition(from: TaskStatus, to: TaskStatus): TransitionCheck {
  if (from === to) {
    return { ok: false, error: `task already in '${from}'` };
  }
  if (isTerminal(from)) {
    return { ok: false, error: `task is terminal ('${from}'); no further transitions` };
  }
  if (!canTransition(from, to)) {
    return {
      ok: false,
      error: `illegal transition '${from}' → '${to}'; allowed: ${allowedTransitions(from).join(', ') || '(none)'}`,
    };
  }
  return { ok: true };
}
