/**
 * Eval evidence collector — v3 Goal 9.
 *
 * Reads Kernel truth (db-injected, like the vault collector) into a workflow-wide
 * evidence bundle. Read-only: it never writes Kernel state. Raw terminal logs are
 * NOT evidence — only receipts, tasks, artifacts, and State Cards.
 */

import type { KernelDB } from '../kernel/database';
import { queryWorkflowSnapshot } from '../kernel/conductor/index';
import { queryWorkflowRegion } from '../kernel/workflows/index';
import { queryTaskList } from '../kernel/tasks/index';
import { queryReceiptList, queryArtifactList } from '../kernel/receipts/index';
import { queryStateCardList } from '../kernel/state-cards/index';
import type { EvalEvidence, ReceiptSnapshot } from './types';

/** Oldest-first, tie-broken by id for determinism. */
function chronological(receipts: ReceiptSnapshot[]): ReceiptSnapshot[] {
  return [...receipts].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function collectEvalEvidence(db: KernelDB, workflowId: string): EvalEvidence {
  const workflow = queryWorkflowSnapshot(db, workflowId);
  const region = queryWorkflowRegion(db, workflowId);
  const tasks = [...queryTaskList(db, { workflowId })].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const receipts = chronological(queryReceiptList(db, { workflowId, limit: 100000 }));
  const artifacts = queryArtifactList(db, { workflowId });
  const stateCards = queryStateCardList(db, { workflowId });
  return {
    workflow,
    region,
    tasks,
    receipts,
    artifacts,
    stateCards,
    artifactIds: new Set(artifacts.map((a) => a.id)),
  };
}

// ── Evidence helpers shared by the rubric scorers ──────────────────────────

export function receiptsForTask(evidence: EvalEvidence, taskId: string): ReceiptSnapshot[] {
  return evidence.receipts.filter((r) => r.taskId === taskId);
}

export function hasReceiptType(receipts: ReceiptSnapshot[], type: string): boolean {
  return receipts.some((r) => r.type === type);
}

export function firstReceiptOfType(receipts: ReceiptSnapshot[], type: string): ReceiptSnapshot | null {
  return receipts.find((r) => r.type === type) ?? null;
}

/** Artifact ids referenced by a task's receipts (claimed), regardless of existence. */
export function claimedArtifactIds(receipts: ReceiptSnapshot[]): string[] {
  const ids = new Set<string>();
  for (const r of receipts) {
    for (const ref of r.artifactRefs ?? []) {
      if (typeof ref === 'string') ids.add(ref);
    }
  }
  return [...ids].sort();
}
