/**
 * ConductorTile view — renderer projector contract (Goal 5A).
 *
 * Pure, framework-agnostic formatting of the embedded Conductor's view into the
 * canonical display sections. The renderer is a projector: it receives the view
 * from the main-process Conductor (which reads Kernel truth) and renders it. It
 * owns no Conductor/Kernel state.
 *
 * No DOM, no imports from src/main or src/kernel internals — the input is the
 * structural shape the Conductor IPC returns.
 */

export interface ConductorViewLike {
  workflow: { name: string; status: string; taskCount: number; blockedTaskCount: number } | null;
  plan: string;
  nextAction: string;
  blockers: string[];
  stateReads: { tiles: number; tasks: number; stateCards: number; recentReceipts: number };
  toolCalls: { tool: string; at: number }[];
  delegations: string[];
  receiptsReviewed: { id: string; type: string; summary: string }[];
  generatedAt: number;
}

export interface ConductorSection {
  label: string;
  value: string;
}

const EMPTY = '—';

/**
 * Project a Conductor view into the canonical, ordered sections:
 * Current Plan, State Reads, Tool Calls, Delegations, Receipts Reviewed,
 * Blockers, Next Action. A null view yields stable empty sections.
 */
export function formatConductorView(view: ConductorViewLike | null): ConductorSection[] {
  if (!view) {
    return [
      { label: 'Current Plan', value: EMPTY },
      { label: 'State Reads', value: EMPTY },
      { label: 'Tool Calls', value: EMPTY },
      { label: 'Delegations', value: EMPTY },
      { label: 'Receipts Reviewed', value: EMPTY },
      { label: 'Blockers', value: EMPTY },
      { label: 'Next Action', value: EMPTY },
    ];
  }

  const reads = view.stateReads;
  return [
    { label: 'Current Plan', value: view.plan || EMPTY },
    {
      label: 'State Reads',
      value: `${reads.tiles} tiles · ${reads.tasks} tasks · ${reads.stateCards} state cards · ${reads.recentReceipts} receipts`,
    },
    {
      label: 'Tool Calls',
      value: view.toolCalls.length ? view.toolCalls.map((c) => c.tool).join(', ') : EMPTY,
    },
    { label: 'Delegations', value: view.delegations.length ? view.delegations.join('\n') : 'None (read-only)' },
    {
      label: 'Receipts Reviewed',
      value: view.receiptsReviewed.length
        ? view.receiptsReviewed.map((r) => `${r.type}: ${r.summary}`).join('\n')
        : EMPTY,
    },
    { label: 'Blockers', value: view.blockers.length ? view.blockers.join('\n') : EMPTY },
    { label: 'Next Action', value: view.nextAction || EMPTY },
  ];
}

export const CONDUCTOR_SECTION_LABELS = [
  'Current Plan',
  'State Reads',
  'Tool Calls',
  'Delegations',
  'Receipts Reviewed',
  'Blockers',
  'Next Action',
] as const;
