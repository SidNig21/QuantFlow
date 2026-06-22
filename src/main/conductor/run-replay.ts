/**
 * R7 Run Replay projection.
 *
 * Read-only, receipt-primary, and never truth. The replay is reconstructed from
 * durable Kernel evidence: workflow/task timestamps, receipt chain, and artifact
 * rows. It intentionally does not read or write the `events` table.
 */

import type { KernelDB } from '../../kernel/database';
import { queryArtifactList } from '../../kernel/receipts/index';
import { queryTaskList } from '../../kernel/tasks/index';
import { queryRun } from '../../kernel/workflows/index';
import { queryReceiptList } from '../../kernel/receipts/index';

export type RunReplayEntryKind =
  | 'run.started'
  | 'task.created'
  | 'task.claimed'
  | 'task.submitted'
  | 'task.verified'
  | 'task.completed'
  | 'receipt'
  | 'artifact'
  | 'run.ended';

export interface RunReplayEntry {
  kind: RunReplayEntryKind;
  timestamp: number;
  workflowId: string;
  taskId: string | null;
  receiptId: string | null;
  artifactId: string | null;
  summary: string;
  evidenceRefs: string[];
}

export interface RunReplayProjection {
  workflowId: string;
  runId: string;
  status: string;
  source: 'receipt-primary';
  usesEventsTable: false;
  taskIds: string[];
  artifactIds: string[];
  receiptIds: string[];
  entries: RunReplayEntry[];
}

function pushTaskTimestamp(
  entries: RunReplayEntry[],
  workflowId: string,
  task: ReturnType<typeof queryTaskList>[number],
  field: 'createdAt' | 'claimedAt' | 'submittedAt' | 'verifiedAt' | 'completedAt',
  kind: RunReplayEntryKind,
  summary: string,
): void {
  const timestamp = task[field];
  if (typeof timestamp !== 'number') return;
  entries.push({
    kind,
    timestamp,
    workflowId,
    taskId: task.id,
    receiptId: null,
    artifactId: null,
    summary,
    evidenceRefs: [task.id],
  });
}

export function buildRunReplay(db: KernelDB, workflowId: string): RunReplayProjection | null {
  const run = queryRun(db, workflowId);
  if (!run) return null;

  const tasks = queryTaskList(db, { workflowId, limit: 100000 });
  const receipts = queryReceiptList(db, { workflowId, limit: 100000 });
  const artifacts = queryArtifactList(db, { workflowId });
  const entries: RunReplayEntry[] = [
    {
      kind: 'run.started',
      timestamp: run.startedAt,
      workflowId,
      taskId: null,
      receiptId: null,
      artifactId: null,
      summary: `run started: ${run.objective}`,
      evidenceRefs: [workflowId],
    },
  ];

  for (const task of tasks) {
    pushTaskTimestamp(entries, workflowId, task, 'createdAt', 'task.created', `task created: ${task.title}`);
    pushTaskTimestamp(entries, workflowId, task, 'claimedAt', 'task.claimed', `task claimed: ${task.title}`);
    pushTaskTimestamp(entries, workflowId, task, 'submittedAt', 'task.submitted', `task submitted: ${task.title}`);
    pushTaskTimestamp(entries, workflowId, task, 'verifiedAt', 'task.verified', `task verified: ${task.title}`);
    pushTaskTimestamp(entries, workflowId, task, 'completedAt', 'task.completed', `task completed: ${task.title}`);
  }

  for (const receipt of receipts) {
    entries.push({
      kind: 'receipt',
      timestamp: receipt.createdAt,
      workflowId,
      taskId: receipt.taskId,
      receiptId: receipt.id,
      artifactId: null,
      summary: `${receipt.type}: ${receipt.summary}`,
      evidenceRefs: [receipt.id, ...receipt.artifactRefs.filter((ref): ref is string => typeof ref === 'string')],
    });
  }

  for (const artifact of artifacts) {
    entries.push({
      kind: 'artifact',
      timestamp: artifact.createdAt,
      workflowId,
      taskId: artifact.taskId,
      receiptId: artifact.receiptId,
      artifactId: artifact.id,
      summary: `${artifact.kind}: ${artifact.summary ?? artifact.uri ?? artifact.id}`,
      evidenceRefs: [artifact.id, ...(artifact.receiptId ? [artifact.receiptId] : [])],
    });
  }

  if (run.endedAt !== null) {
    entries.push({
      kind: 'run.ended',
      timestamp: run.endedAt,
      workflowId,
      taskId: null,
      receiptId: null,
      artifactId: null,
      summary: `run ended: ${run.status}`,
      evidenceRefs: [workflowId],
    });
  }

  entries.sort((a, b) =>
    a.timestamp - b.timestamp
    || a.kind.localeCompare(b.kind)
    || (a.taskId ?? '').localeCompare(b.taskId ?? '')
    || (a.receiptId ?? '').localeCompare(b.receiptId ?? '')
    || (a.artifactId ?? '').localeCompare(b.artifactId ?? ''),
  );

  return {
    workflowId,
    runId: run.runId,
    status: run.status,
    source: 'receipt-primary',
    usesEventsTable: false,
    taskIds: run.taskIds,
    artifactIds: run.artifactIds,
    receiptIds: run.receiptIds,
    entries,
  };
}
