/**
 * StateCardView — renderer projector contract (Goal 4).
 *
 * Pure, framework-agnostic formatting of a Kernel State Card into the canonical
 * ordered display sections. The renderer is a projector: it receives a State
 * Card snapshot from the Kernel query boundary (kernel.state_card.get) and
 * turns it into sections. It must NOT store or own State Card state.
 *
 * No DOM, no imports from src/kernel internals — the input is the structural
 * shape returned by the Kernel query.
 */

/** Structural shape of a Kernel State Card snapshot (kernel.state_card.get). */
export interface StateCardSnapshotLike {
  tileId: string;
  currentTaskId: string | null;
  status: string;
  blocker: string | null;
  lastMeaningfulUpdate: string | null;
  nextAction: string | null;
  artifacts: unknown[];
  lastReceiptId: string | null;
  cavemanSummary: string | null;
  updatedAt: number;
}

export interface StateCardSection {
  label: string;
  value: string;
}

const EMPTY = '—';

function artifactsToText(artifacts: unknown[]): string {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return EMPTY;
  return artifacts
    .map((a) => {
      if (a && typeof a === 'object') {
        const o = a as Record<string, unknown>;
        return String(o['summary'] ?? o['uri'] ?? o['kind'] ?? JSON.stringify(a));
      }
      return String(a);
    })
    .join('\n');
}

/**
 * Project a State Card snapshot into the canonical, ordered display sections:
 * Current Task, Status, Blocker, Last Meaningful Update, Next Action,
 * Artifacts, Last Receipt, Caveman Summary.
 *
 * A null snapshot (no card yet) yields the same sections with empty values so
 * the flip UI is stable.
 */
export function formatStateCard(card: StateCardSnapshotLike | null): StateCardSection[] {
  return [
    { label: 'Current Task', value: card?.currentTaskId || EMPTY },
    { label: 'Status', value: card?.status || 'idle' },
    { label: 'Blocker', value: card?.blocker || EMPTY },
    { label: 'Last Meaningful Update', value: card?.lastMeaningfulUpdate || EMPTY },
    { label: 'Next Action', value: card?.nextAction || EMPTY },
    { label: 'Artifacts', value: card ? artifactsToText(card.artifacts) : EMPTY },
    { label: 'Last Receipt', value: card?.lastReceiptId || EMPTY },
    { label: 'Caveman Summary', value: card?.cavemanSummary || EMPTY },
  ];
}

/** Canonical section order, exported for tests and consumers. */
export const STATE_CARD_SECTION_LABELS = [
  'Current Task',
  'Status',
  'Blocker',
  'Last Meaningful Update',
  'Next Action',
  'Artifacts',
  'Last Receipt',
  'Caveman Summary',
] as const;
