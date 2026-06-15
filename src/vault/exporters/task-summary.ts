/**
 * task_summary export (Goal 8) — one summary per task.
 *
 * Preserves the canonical task id, workflow id, and status, and renders the
 * task-scoped receipt chain so the task is traceable back to Kernel evidence.
 */

import { frontmatter, toIso, oneLine } from '../okf/frontmatter';
import { chronological } from './shared';
import type { ReceiptSnapshot, TaskSnapshot, ArtifactSnapshot } from '../types';

export function formatTaskSummary(
  task: TaskSnapshot,
  receipts: ReceiptSnapshot[],
  artifacts: ArtifactSnapshot[],
): string {
  const taskReceipts = chronological(receipts.filter((r) => r.taskId === task.id));
  const taskArtifacts = artifacts.filter((a) => a.taskId === task.id);

  const head = frontmatter([
    ['type', 'task_summary'],
    ['workflow_id', task.workflowId],
    ['task_id', task.id],
    ['status', task.status],
    ['receipt_count', taskReceipts.length],
    ['created_at', toIso(task.createdAt)],
    ['submitted_at', task.submittedAt ? toIso(task.submittedAt) : null],
    ['verified_at', task.verifiedAt ? toIso(task.verifiedAt) : null],
    ['completed_at', task.completedAt ? toIso(task.completedAt) : null],
  ]);

  const timeline: string[] = [
    `- created: \`${toIso(task.createdAt)}\``,
  ];
  if (task.claimedAt) timeline.push(`- claimed: \`${toIso(task.claimedAt)}\``);
  if (task.submittedAt) timeline.push(`- submitted: \`${toIso(task.submittedAt)}\``);
  if (task.verifiedAt) timeline.push(`- verified: \`${toIso(task.verifiedAt)}\``);
  if (task.completedAt) timeline.push(`- completed: \`${toIso(task.completedAt)}\``);

  const sections = [
    head,
    `# Task — ${task.title}`,
    `**Task** \`${task.id}\` · **Workflow** \`${task.workflowId ?? '—'}\` · **Status** ${task.status}`,
    `## Objective\n${task.objective || '—'}`,
    `## Timeline\n${timeline.join('\n')}`,
    `## Receipt chain\n${
      taskReceipts.length
        ? taskReceipts
            .map((r) => `- \`${toIso(r.createdAt)}\` **${r.type}** \`${r.id}\`${r.summary ? ` — ${oneLine(r.summary)}` : ''}`)
            .join('\n')
        : 'No receipts for this task.'
    }`,
    `## Artifacts\n${
      taskArtifacts.length
        ? taskArtifacts.map((a) => `- \`${a.id}\` (${a.kind})${a.summary ? ` — ${oneLine(a.summary)}` : ''}`).join('\n')
        : 'None.'
    }`,
  ];

  return `${sections.join('\n\n')}\n`;
}
