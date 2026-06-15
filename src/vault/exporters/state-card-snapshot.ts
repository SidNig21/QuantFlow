/**
 * state_card_snapshot.md exporter (Goal 8).
 *
 * Snapshots the Kernel-owned State Cards for a workflow — the compressed current
 * reality per tile/worker. This reflects the Kernel State Card (status, blocker,
 * next action, last receipt, caveman summary), NOT raw terminal logs.
 */

import { frontmatter, toIso, oneLine } from '../okf/frontmatter';
import type { StateCardSnapshot, VaultExportBundle } from '../types';

function cardBlock(card: StateCardSnapshot): string {
  const lines = [
    `### Tile \`${card.tileId}\``,
    `- status: ${card.status}`,
    `- current task: ${card.currentTaskId ? `\`${card.currentTaskId}\`` : '—'}`,
    `- worker: ${card.workerId ? `\`${card.workerId}\`` : '—'}`,
    `- blocker: ${card.blocker ? oneLine(card.blocker) : '—'}`,
    `- next action: ${card.nextAction ? oneLine(card.nextAction) : '—'}`,
    `- last meaningful update: ${card.lastMeaningfulUpdate ? oneLine(card.lastMeaningfulUpdate) : '—'}`,
    `- last receipt: ${card.lastReceiptId ? `\`${card.lastReceiptId}\`` : '—'}`,
    `- summary: ${card.cavemanSummary ? oneLine(card.cavemanSummary) : '—'}`,
    `- updated_at: \`${toIso(card.updatedAt)}\``,
  ];
  return lines.join('\n');
}

export function formatStateCardSnapshot(bundle: VaultExportBundle): string {
  const { workflow } = bundle;
  // Deterministic order by tile id.
  const cards = [...bundle.stateCards].sort((a, b) => a.tileId.localeCompare(b.tileId));
  const head = frontmatter([
    ['type', 'state_card_snapshot'],
    ['workflow_id', workflow.id],
    ['state_card_count', cards.length],
    ['created_at', toIso(bundle.workflowUpdatedAt)],
  ]);

  const sections = [
    head,
    `# State Card Snapshot — ${workflow.name}`,
    `Workflow \`${workflow.id}\` · ${cards.length} state cards. Reflects Kernel State Cards (compressed current reality), not terminal logs.`,
    cards.length ? cards.map(cardBlock).join('\n\n') : 'No state cards recorded.',
  ];

  return `${sections.join('\n\n')}\n`;
}
