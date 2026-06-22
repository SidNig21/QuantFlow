/**
 * workflow_summary.md exporter (Goal 8).
 *
 * The human-readable digest of a workflow: goal, status, what happened, key
 * decisions, receipts, artifacts, blockers, verification results, lessons, and
 * open follow-ups. A fresh agent should understand the workflow from this file
 * without reading raw terminal logs, while every claim traces back to Kernel ids.
 */

import { frontmatter, toIso, oneLine } from '../okf/frontmatter';
import {
  decisionReceipts,
  openFollowUpTasks,
  receiptTypeCounts,
  verificationReceipts,
} from './shared';
import type { TaskSnapshot, VaultExportBundle } from '../types';

function statusLineForTask(t: TaskSnapshot): string {
  return `- \`${t.id}\` — ${t.title} (${t.status})`;
}

export function formatWorkflowSummary(bundle: VaultExportBundle): string {
  const { workflow, region, tasks, receipts, artifacts, stateCards } = bundle;

  const head = frontmatter([
    ['type', 'workflow_summary'],
    ['workflow_id', workflow.id],
    ['status', workflow.status],
    ['task_count', tasks.length],
    ['receipt_count', receipts.length],
    ['artifact_count', artifacts.length],
    ['created_at', toIso(bundle.workflowCreatedAt)],
    ['updated_at', toIso(bundle.workflowUpdatedAt)],
  ]);

  const typeCounts = receiptTypeCounts(receipts);
  const verifications = verificationReceipts(receipts);
  const decisions = decisionReceipts(receipts);
  const followUps = openFollowUpTasks(tasks);
  const lessonArtifacts = artifacts.filter((artifact) => artifact.kind === 'lesson');

  // Blockers: blocked tasks named by the Kernel region, enriched with the
  // blocker text from the matching State Card / task when available.
  const blockerLines = region.blockedTaskIds.map((taskId) => {
    const card = stateCards.find((c) => c.currentTaskId === taskId && c.blocker);
    const task = tasks.find((t) => t.id === taskId);
    const reason = card?.blocker ? ` — ${oneLine(card.blocker)}` : '';
    const title = task ? ` (${task.title})` : '';
    return `- \`${taskId}\`${title}${reason}`;
  });

  // Verification results, named by outcome with the receipt id as evidence.
  const verificationLines = verifications.map(
    (r) => `- \`${toIso(r.createdAt)}\` **${r.type}** \`${r.id}\`${r.summary ? ` — ${oneLine(r.summary)}` : ''}`,
  );

  // "Lessons" are derived from concrete evidence, never invented: failed
  // verifications and standing blockers. Empty is stated, not faked.
  const failedVerifications = verifications.filter((r) => r.type === 'verification_failed');
  const lessons: string[] = [];
  for (const artifact of lessonArtifacts) {
    lessons.push(`- Lesson artifact \`${artifact.id}\`: ${oneLine(artifact.summary) || artifact.uri || 'see artifact row'}`);
  }
  for (const r of failedVerifications) lessons.push(`- Verification failed (\`${r.id}\`): ${oneLine(r.summary) || 'see receipt'}`);
  for (const line of blockerLines) lessons.push(`- Blocked: ${line.replace(/^- /, '')}`);

  const sections = [
    head,
    `# Workflow Summary — ${workflow.name}`,
    `## Goal\n${workflow.objective || '—'}`,
    `## Status\n${workflow.status} · ${tasks.length} tasks (${region.openTaskCount} open, ${region.blockedTaskCount} blocked) · ${receipts.length} receipts · ${artifacts.length} artifacts`,
    `## What happened\n${
      typeCounts.length
        ? typeCounts.map(([type, n]) => `- ${type}: ${n}`).join('\n')
        : 'No receipts recorded.'
    }`,
    `## Key decisions\n${
      decisions.length
        ? decisions.map((r) => `- \`${r.id}\` **${r.type}** — ${oneLine(r.summary) || '(no summary)'}`).join('\n')
        : 'None recorded.'
    }`,
    `## Receipts\n${receipts.length} total. Full chain in \`receipt_chain.md\`.`,
    `## Artifacts\n${
      artifacts.length
        ? `${artifacts.length} total. Full index in \`artifact_index.md\`.`
        : 'None.'
    }`,
    `## Blockers\n${blockerLines.length ? blockerLines.join('\n') : 'None.'}`,
    `## Verification results\n${verificationLines.length ? verificationLines.join('\n') : 'None recorded.'}`,
    `## Lessons learned\n${lessons.length ? lessons.join('\n') : 'None recorded.'}`,
    `## Open follow-ups\n${followUps.length ? followUps.map(statusLineForTask).join('\n') : 'None — all tasks terminal.'}`,
  ];

  return `${sections.join('\n\n')}\n`;
}
