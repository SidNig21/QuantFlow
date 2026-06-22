/**
 * R7 eval auto-trigger.
 *
 * Fire-and-forget derived analysis on task/run completion. This module only
 * writes evaluation rows and never feeds scores into task/workflow decisions.
 */

import type { KernelDB } from '../database';
import { handleEvalCommand, type CreateEvaluationInput } from './index';

function hasEvaluationsTable(db: KernelDB): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='evaluations'")
    .get();
  return Boolean(row);
}

function evalExists(db: KernelDB, evalId: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM evaluations WHERE eval_id = ? LIMIT 1')
    .get(evalId);
  return Boolean(row);
}

function receiptIds(db: KernelDB, taskId: string): string[] {
  const rows = db
    .prepare('SELECT id FROM receipts WHERE task_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(taskId) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function receiptIdOf(db: KernelDB, taskId: string, type: string): string | null {
  const row = db
    .prepare('SELECT id FROM receipts WHERE task_id = ? AND type = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
    .get(taskId, type) as { id: string } | undefined;
  return row?.id ?? null;
}

function artifactIds(db: KernelDB, taskId: string): string[] {
  const rows = db
    .prepare('SELECT id FROM artifacts WHERE task_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(taskId) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

function createEval(db: KernelDB, input: CreateEvaluationInput): void {
  if (input.evalId && evalExists(db, input.evalId)) return;
  const result = handleEvalCommand(db, 'kernel.eval.create', input as unknown as Record<string, unknown>);
  if (!result.ok) throw new Error(result.error ?? 'eval.create failed');
}

export function autoTriggerTaskEvaluations(
  db: KernelDB,
  input: { workflowId: string | null; taskId: string; workerId?: string | null },
): void {
  if (!hasEvaluationsTable(db)) return;

  const receipts = receiptIds(db, input.taskId);
  const completedReceipt = receiptIdOf(db, input.taskId, 'task_completed');
  const verificationReceipt = receiptIdOf(db, input.taskId, 'verification_passed');
  const artifacts = artifactIds(db, input.taskId);
  const baseRefs = [...new Set([input.taskId, ...receipts, ...artifacts])];
  if (baseRefs.length === 0) return;

  createEval(db, {
    evalId: `auto-task-${input.taskId}`,
    evalType: 'task_eval',
    workflowId: input.workflowId,
    taskId: input.taskId,
    workerId: input.workerId ?? null,
    receiptId: completedReceipt,
    dimensions: [
      {
        dimension: 'task_completion_correctness',
        applicable: true,
        score: verificationReceipt ? 3 : 1,
        confidence: 0.8,
        evidenceRefs: baseRefs,
        rationale: `Auto task eval for ${input.taskId} cites Kernel evidence ${baseRefs.join(', ')}.`,
        limitations: verificationReceipt ? undefined : 'No verification_passed receipt found.',
      },
      {
        dimension: 'verification_integrity',
        applicable: true,
        score: verificationReceipt ? 3 : 0,
        confidence: 0.9,
        evidenceRefs: verificationReceipt ? [input.taskId, verificationReceipt] : [input.taskId, completedReceipt ?? input.taskId],
        rationale: verificationReceipt
          ? `Task ${input.taskId} has verification receipt ${verificationReceipt}.`
          : `Task ${input.taskId} completed without a verification_passed receipt.`,
      },
      {
        dimension: 'artifact_usefulness',
        applicable: artifacts.length > 0,
        score: artifacts.length > 0 ? 2 : null,
        confidence: artifacts.length > 0 ? 0.4 : 1,
        evidenceRefs: artifacts,
        rationale: artifacts.length > 0
          ? `Task ${input.taskId} produced artifact row(s) ${artifacts.join(', ')}.`
          : `Task ${input.taskId} produced no artifacts.`,
        limitations: artifacts.length > 0
          ? 'Structural proxy only; artifact usefulness needs operator/domain review.'
          : 'No artifact rows to score.',
      },
    ],
  });

  if (verificationReceipt) {
    createEval(db, {
      evalId: `auto-verification-${input.taskId}`,
      evalType: 'verification_eval',
      workflowId: input.workflowId,
      taskId: input.taskId,
      workerId: null,
      receiptId: verificationReceipt,
      dimensions: [
        {
          dimension: 'verification_integrity',
          applicable: true,
          score: 3,
          confidence: 0.85,
          evidenceRefs: [input.taskId, verificationReceipt],
          rationale: `Semantic/structural verification path recorded verification receipt ${verificationReceipt}.`,
        },
      ],
    });
  }
}

export function autoTriggerWorkflowEvaluation(db: KernelDB, workflowId: string): void {
  if (!hasEvaluationsTable(db) || evalExists(db, `auto-workflow-${workflowId}`)) return;
  const taskRows = db
    .prepare('SELECT id, status FROM tasks WHERE workflow_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(workflowId) as Array<{ id: string; status: string }>;
  const receiptRows = db
    .prepare('SELECT id FROM receipts WHERE workflow_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(workflowId) as Array<{ id: string }>;
  const refs = [...new Set([workflowId, ...taskRows.map((row) => row.id), ...receiptRows.map((row) => row.id)])];
  const completed = taskRows.filter((row) => row.status === 'complete').length;
  const blocked = taskRows.filter((row) => row.status === 'blocked').length;
  const failed = taskRows.filter((row) => row.status === 'failed').length;
  const score = Math.max(0, Math.min(4, 4 - blocked - failed));

  createEval(db, {
    evalId: `auto-workflow-${workflowId}`,
    evalType: 'workflow_eval',
    workflowId,
    taskId: null,
    workerId: null,
    receiptId: null,
    dimensions: [
      {
        dimension: 'workflow_efficiency',
        applicable: true,
        score,
        confidence: 0.75,
        evidenceRefs: refs,
        rationale: `Auto workflow eval for ${workflowId}: ${completed}/${taskRows.length} task(s) complete, ${blocked} blocked, ${failed} failed.`,
        limitations: 'R7 schema-prep evaluation; not used as runtime authority.',
      },
    ],
  });
}
