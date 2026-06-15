/**
 * Shared classification + row helpers for the vault exporters (Goal 8).
 *
 * Pure functions over Kernel receipt/task snapshots. No DB/fs. The receipt-type
 * vocabulary mirrors the Goal 3 task lifecycle plus the Conductor `planning`
 * receipt (Goal 5A).
 */

import type { ReceiptSnapshot, TaskSnapshot } from '../types';

/** Receipts that record a verification outcome. */
export const VERIFICATION_TYPES = new Set([
  'verification_started',
  'verification_passed',
  'verification_failed',
]);

/** Receipt types that represent a decision worth logging in the decision log. */
export const DECISION_TYPES = new Set([
  'planning',
  'verification_started',
  'verification_passed',
  'verification_failed',
  'task_blocked',
  'task_completed',
  'task_failed',
]);

/** Terminal task states — anything else is an open follow-up. */
export const TERMINAL_TASK_STATES = new Set(['complete', 'failed']);

/** Sort receipts chronologically (oldest first), tie-broken by id for determinism. */
export function chronological(receipts: ReceiptSnapshot[]): ReceiptSnapshot[] {
  return [...receipts].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function verificationReceipts(receipts: ReceiptSnapshot[]): ReceiptSnapshot[] {
  return chronological(receipts).filter((r) => VERIFICATION_TYPES.has(r.type));
}

export function decisionReceipts(receipts: ReceiptSnapshot[]): ReceiptSnapshot[] {
  return chronological(receipts).filter((r) => DECISION_TYPES.has(r.type));
}

export function openFollowUpTasks(tasks: TaskSnapshot[]): TaskSnapshot[] {
  return [...tasks]
    .filter((t) => !TERMINAL_TASK_STATES.has(t.status))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** Count receipts by type, returned as deterministic sorted entries. */
export function receiptTypeCounts(receipts: ReceiptSnapshot[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of receipts) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
