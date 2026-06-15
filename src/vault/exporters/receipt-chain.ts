/**
 * receipt_chain.md exporter (Goal 8).
 *
 * The append-only evidence chain for a workflow, rendered chronologically. The
 * vault never mutates receipts; this is a faithful, oldest-first projection of
 * the Kernel receipt chain with every receipt id and reference preserved.
 */

import { frontmatter, toIso, oneLine } from '../okf/frontmatter';
import { chronological } from './shared';
import type { ReceiptSnapshot, VaultExportBundle } from '../types';

function receiptLine(r: ReceiptSnapshot): string {
  const parts = [`- \`${toIso(r.createdAt)}\``, `**${r.type}**`, `\`${r.id}\``];
  if (r.summary) parts.push(`— ${oneLine(r.summary)}`);
  const refs: string[] = [];
  if (r.taskId) refs.push(`task: \`${r.taskId}\``);
  if (r.parentReceiptId) refs.push(`parent: \`${r.parentReceiptId}\``);
  if (Array.isArray(r.artifactRefs) && r.artifactRefs.length) {
    refs.push(`artifacts: ${r.artifactRefs.map((a) => `\`${String(a)}\``).join(', ')}`);
  }
  let line = parts.join(' ');
  if (refs.length) line += `\n  - ${refs.join(' · ')}`;
  return line;
}

export function formatReceiptChain(bundle: VaultExportBundle): string {
  const { workflow } = bundle;
  const receipts = chronological(bundle.receipts);
  const head = frontmatter([
    ['type', 'receipt_chain'],
    ['workflow_id', workflow.id],
    ['receipt_count', receipts.length],
    ['created_at', toIso(bundle.workflowCreatedAt)],
  ]);

  const lines = [
    head,
    `# Receipt Chain — ${workflow.name}`,
    `Workflow \`${workflow.id}\` · ${receipts.length} receipts, oldest first. Append-only evidence; receipts are never modified or deleted.`,
  ];

  if (receipts.length === 0) {
    lines.push('No receipts recorded.');
  } else {
    lines.push(receipts.map(receiptLine).join('\n'));
  }

  return `${lines.join('\n\n')}\n`;
}
