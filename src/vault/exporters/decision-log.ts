/**
 * decision_log.md exporter (Goal 8).
 *
 * The chronological log of decisions that shaped the workflow — Conductor
 * planning receipts plus verification/block/complete/fail outcomes — each tied
 * to its receipt id. Decisions are evidence, not prose: every entry traces back
 * to a Kernel receipt.
 */

import { frontmatter, toIso, oneLine } from '../okf/frontmatter';
import { decisionReceipts } from './shared';
import type { ReceiptSnapshot, VaultExportBundle } from '../types';

function decisionLine(r: ReceiptSnapshot): string {
  const meta = r.metadata ?? {};
  const annotations: string[] = [];
  if (typeof meta['phase'] === 'string') annotations.push(`phase: ${meta['phase']}`);
  if (typeof meta['proposedAction'] === 'string') annotations.push(`action: ${meta['proposedAction']}`);
  const tail = annotations.length ? ` _(${annotations.join(', ')})_` : '';
  const scope = r.taskId ? ` · task \`${r.taskId}\`` : '';
  return `- \`${toIso(r.createdAt)}\` **${r.type}** \`${r.id}\`${scope} — ${oneLine(r.summary) || '(no summary)'}${tail}`;
}

export function formatDecisionLog(bundle: VaultExportBundle): string {
  const { workflow } = bundle;
  const decisions = decisionReceipts(bundle.receipts);
  const head = frontmatter([
    ['type', 'decision_log'],
    ['workflow_id', workflow.id],
    ['decision_count', decisions.length],
    ['created_at', toIso(bundle.workflowCreatedAt)],
  ]);

  const sections = [
    head,
    `# Decision Log — ${workflow.name}`,
    `Workflow \`${workflow.id}\` · ${decisions.length} decisions, oldest first. Each entry references the Kernel receipt that recorded it.`,
    decisions.length
      ? decisions.map(decisionLine).join('\n')
      : 'No decisions recorded.',
  ];

  return `${sections.join('\n\n')}\n`;
}
