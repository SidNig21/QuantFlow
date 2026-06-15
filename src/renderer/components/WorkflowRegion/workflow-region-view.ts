/**
 * Workflow region view — renderer projector contract (Goal 7).
 *
 * Pure, framework-agnostic formatting of a Kernel workflow region (the aggregate
 * read from `src/kernel/workflows`) into a soft region model the canvas can draw
 * as a boundary + header. The renderer is a projector: it receives the region
 * from the Kernel query boundary and presents it; it owns no workflow state and
 * stores no canonical counts.
 *
 * "Soft" is a hard requirement of Goal 7 — this is a labelled boundary on the
 * infinite canvas, not a dashboard panel, modal, or Kanban column.
 *
 * No DOM, no imports from src/main or src/kernel internals — input is the
 * structural shape the Kernel `kernel.workflow.region` query returns.
 */

export interface RegionBoundsLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkflowRegionLike {
  id: string;
  name: string;
  objective: string;
  status: string;
  tileIds: string[];
  tileCount: number;
  bounds: RegionBoundsLike | null;
  taskCount: number;
  receiptCount: number;
  openTaskCount: number;
  blockedTaskCount: number;
  blockedTaskIds: string[];
  connectionTypeCounts: Record<string, number>;
}

export interface RegionSection {
  label: string;
  value: string;
}

export interface WorkflowRegionModel {
  id: string;
  title: string;
  objective: string;
  status: string;
  /** True when the workflow has at least one blocked task (region reads as alert). */
  hasBlockers: boolean;
  /** One-line summary, e.g. "3 tiles · 5 tasks · 12 receipts · 1 blocked". */
  summary: string;
  bounds: RegionBoundsLike | null;
  tileIds: string[];
  sections: RegionSection[];
}

const EMPTY = '—';

function summaryLine(region: WorkflowRegionLike): string {
  const parts = [
    `${region.tileCount} ${region.tileCount === 1 ? 'tile' : 'tiles'}`,
    `${region.taskCount} ${region.taskCount === 1 ? 'task' : 'tasks'}`,
    `${region.receiptCount} ${region.receiptCount === 1 ? 'receipt' : 'receipts'}`,
  ];
  if (region.blockedTaskCount > 0) parts.push(`${region.blockedTaskCount} blocked`);
  return parts.join(' · ');
}

function connectionSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return EMPTY;
  return entries.map(([type, n]) => `${type.replace(/_/g, ' ')}: ${n}`).join(', ');
}

/**
 * Project a Kernel workflow region into a soft region model with ordered display
 * sections (Workflow, Objective, Status, Tiles, Tasks, Receipts, Blockers,
 * Strings). A null region yields a stable empty model so the caller never has to
 * branch on absence.
 */
export function formatWorkflowRegion(region: WorkflowRegionLike | null): WorkflowRegionModel {
  if (!region) {
    return {
      id: '',
      title: EMPTY,
      objective: EMPTY,
      status: EMPTY,
      hasBlockers: false,
      summary: EMPTY,
      bounds: null,
      tileIds: [],
      sections: [
        { label: 'Workflow', value: EMPTY },
        { label: 'Objective', value: EMPTY },
        { label: 'Status', value: EMPTY },
        { label: 'Tiles', value: EMPTY },
        { label: 'Tasks', value: EMPTY },
        { label: 'Receipts', value: EMPTY },
        { label: 'Blockers', value: EMPTY },
        { label: 'Strings', value: EMPTY },
      ],
    };
  }

  const hasBlockers = region.blockedTaskCount > 0;
  return {
    id: region.id,
    title: region.name || EMPTY,
    objective: region.objective || EMPTY,
    status: region.status || EMPTY,
    hasBlockers,
    summary: summaryLine(region),
    bounds: region.bounds,
    tileIds: region.tileIds,
    sections: [
      { label: 'Workflow', value: region.name || EMPTY },
      { label: 'Objective', value: region.objective || EMPTY },
      { label: 'Status', value: region.status || EMPTY },
      {
        label: 'Tiles',
        value: region.tileCount
          ? `${region.tileCount} (${region.tileIds.join(', ')})`
          : '0',
      },
      {
        label: 'Tasks',
        value: `${region.taskCount} total · ${region.openTaskCount} open`,
      },
      { label: 'Receipts', value: String(region.receiptCount) },
      {
        label: 'Blockers',
        value: hasBlockers
          ? `${region.blockedTaskCount} blocked (${region.blockedTaskIds.join(', ')})`
          : 'None',
      },
      { label: 'Strings', value: connectionSummary(region.connectionTypeCounts) },
    ],
  };
}

export const REGION_SECTION_LABELS = [
  'Workflow',
  'Objective',
  'Status',
  'Tiles',
  'Tasks',
  'Receipts',
  'Blockers',
  'Strings',
] as const;
