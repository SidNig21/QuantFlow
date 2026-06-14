/**
 * Kernel Task Validators — v3
 *
 * Centralized guards that protect the task lifecycle invariants. These are the
 * enforcement points behind the hard rule:
 *
 *   A worker must not be able to self-complete without the submitted/verifying
 *   gates and a verification receipt — unless an explicit, documented legacy
 *   compatibility path is used.
 *
 * See docs/v3/AUTHORITY_RULES.md ("Task Rules") and ENVOY.md.
 */

import type { KernelDB } from '../database';
import type { TaskRow } from '../schema/types';

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** A meaningful, non-empty string field. */
export function requireString(
  payload: Record<string, unknown>,
  key: string,
): ValidationResult {
  const v = payload[key];
  if (typeof v !== 'string' || v.trim().length === 0) {
    return { ok: false, error: `${key} is required` };
  }
  return { ok: true };
}

/** True when the task has at least one append-only verification_passed receipt. */
export function hasVerificationPassedReceipt(db: KernelDB, taskId: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM receipts WHERE task_id = ? AND type = 'verification_passed' LIMIT 1",
    )
    .get(taskId);
  return Boolean(row);
}

/**
 * Guard for `kernel.task.complete`.
 *
 * Normal (verified) path: the task must be in `verifying` and must already have
 * a `verification_passed` receipt. This is the constitutional gate.
 *
 * Legacy path: when `legacy === true` the worker may complete from
 * working/submitted/verifying WITHOUT a verification receipt. This is the
 * explicit, documented compatibility escape hatch (see ENVOY.md). It must be
 * recorded on the resulting receipt so verified and legacy completions are
 * distinguishable in the evidence chain.
 */
export function validateComplete(
  db: KernelDB,
  task: TaskRow,
  legacy: boolean,
): ValidationResult {
  if (legacy) {
    // The legacy bypass only skips the verification requirement — it does not
    // skip the lifecycle. It is valid only from the active execution states.
    const LEGACY_COMPLETABLE: readonly TaskRow['status'][] = ['working', 'submitted', 'verifying'];
    if (!LEGACY_COMPLETABLE.includes(task.status)) {
      return {
        ok: false,
        error: `legacy complete is only allowed from working/submitted/verifying (task is '${task.status}')`,
      };
    }
    return { ok: true };
  }

  if (task.status !== 'verifying') {
    return {
      ok: false,
      error: `complete requires status 'verifying' (task is '${task.status}'); submit and verify first, or pass legacy:true`,
    };
  }
  if (!hasVerificationPassedReceipt(db, task.id)) {
    return {
      ok: false,
      error: 'complete requires a verification_passed receipt; run verification first, or pass legacy:true',
    };
  }
  return { ok: true };
}

/**
 * Guard against self-verification. A worker may not verify or reject its own
 * submission unless an operator explicitly overrides. (No automatic verifier
 * agent exists yet — Goal 3 is out of scope for that — so this is a soft,
 * identity-based guard that only triggers when a verifier id is supplied.)
 */
export function validateVerifierDistinct(
  task: TaskRow,
  verifierWorkerId: string | null,
  operatorOverride: boolean,
): ValidationResult {
  if (operatorOverride) return { ok: true };
  if (
    verifierWorkerId &&
    task.owner_worker_id &&
    verifierWorkerId === task.owner_worker_id
  ) {
    return {
      ok: false,
      error: 'a worker may not verify its own task; supply a distinct verifierWorkerId or operatorOverride',
    };
  }
  return { ok: true };
}
