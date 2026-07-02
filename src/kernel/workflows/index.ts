/**
 * Kernel workflow regions and semantic string resolution — v3 Goal 7.
 *
 * A workflow region is a Kernel-owned PROJECTION, not new authority: it is one
 * aggregate read over the tiles, tasks, receipts, and connections that already
 * belong to a workflow. The canvas renders this projection as a soft boundary
 * so the operator can see which tiles belong to a mission, the workflow's
 * status/counts/blockers, and what each string between tiles means.
 *
 * Nothing here owns truth or mutates state. Geometry (bounds) is derived from
 * the same tile rows the canvas already renders; counts come from tasks/receipts;
 * semantic types come from the `connections.semantic_type` column (Goal 1).
 */

import type { KernelDB } from '../database';

/**
 * Canonical semantic connection types (Goal 1 schema, Goal 7 resolution).
 * `manual_connection` is the default for an operator-drawn string with no
 * declared meaning.
 */
export const SEMANTIC_CONNECTION_TYPES = [
  'delegation',
  'context_flow',
  'artifact_dependency',
  'verification',
  'blocker',
  'receipt_handoff',
  'manual_connection',
] as const;

export type SemanticConnectionType = (typeof SEMANTIC_CONNECTION_TYPES)[number];

const SEMANTIC_SET = new Set<string>(SEMANTIC_CONNECTION_TYPES);

export function isSemanticConnectionType(value: unknown): value is SemanticConnectionType {
  return typeof value === 'string' && SEMANTIC_SET.has(value);
}

/**
 * Coerce an arbitrary value into a known semantic type, falling back to
 * `manual_connection`. Used at the command boundary so a bad/unknown type never
 * lands in the canonical row.
 */
export function normalizeSemanticType(value: unknown): SemanticConnectionType {
  return isSemanticConnectionType(value) ? value : 'manual_connection';
}

/** Padding (world units) applied around member tiles to form the soft region box. */
export const REGION_PADDING = 48;

export interface RegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkflowRegion {
  id: string;
  name: string;
  objective: string;
  status: string;
  /** Member tile ids, creation order. */
  tileIds: string[];
  tileCount: number;
  /** Padded bounding box around member tiles in world space; null when empty. */
  bounds: RegionBounds | null;
  taskCount: number;
  receiptCount: number;
  openTaskCount: number;
  /** Tasks currently in `blocked` state (the blockers count the region shows). */
  blockedTaskCount: number;
  blockedTaskIds: string[];
  /** Count of active connections by semantic type, for the region/legend. */
  connectionTypeCounts: Record<SemanticConnectionType, number>;
}

function emptyTypeCounts(): Record<SemanticConnectionType, number> {
  const counts = {} as Record<SemanticConnectionType, number>;
  for (const t of SEMANTIC_CONNECTION_TYPES) counts[t] = 0;
  return counts;
}

/**
 * Compute a padded bounding box around a set of tile geometry rows. Returns
 * null when there are no tiles (an empty workflow has no region on canvas).
 */
export function computeRegionBounds(
  tiles: { x: number; y: number; width: number; height: number }[],
  padding = REGION_PADDING,
): RegionBounds | null {
  if (tiles.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tiles) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * One aggregate read of a workflow's canvas region: identity + status, member
 * tiles and their bounding box, task/receipt counts, blocked tasks, and the
 * semantic-type breakdown of its active connections. Strictly read-only.
 * Returns null when the workflow does not exist.
 */
export function queryWorkflowRegion(db: KernelDB, workflowId: string): WorkflowRegion | null {
  const wf = db.prepare('SELECT id, name, objective, status FROM workflows WHERE id = ?').get(workflowId) as
    | { id: string; name: string; objective: string; status: string }
    | undefined;
  if (!wf) return null;

  const tileRows = db
    .prepare('SELECT id, x, y, width, height FROM tiles WHERE workflow_id = ? ORDER BY created_at ASC')
    .all(workflowId) as { id: string; x: number; y: number; width: number; height: number }[];

  const taskRows = db
    .prepare('SELECT id, status FROM tasks WHERE workflow_id = ?')
    .all(workflowId) as { id: string; status: string }[];
  const blockedTaskIds = taskRows.filter((t) => t.status === 'blocked').map((t) => t.id);
  const openTaskCount = taskRows.filter((t) => t.status === 'open').length;

  const receiptCount =
    (db.prepare('SELECT COUNT(*) AS n FROM receipts WHERE workflow_id = ?').get(workflowId) as { n: number } | undefined)
      ?.n ?? 0;

  const connTypeCounts = emptyTypeCounts();
  const connRows = db
    .prepare("SELECT semantic_type FROM connections WHERE workflow_id = ? AND status = 'active'")
    .all(workflowId) as { semantic_type: string }[];
  for (const c of connRows) {
    connTypeCounts[normalizeSemanticType(c.semantic_type)] += 1;
  }

  return {
    id: wf.id,
    name: wf.name,
    objective: wf.objective,
    status: wf.status,
    tileIds: tileRows.map((t) => t.id),
    tileCount: tileRows.length,
    bounds: computeRegionBounds(tileRows),
    taskCount: taskRows.length,
    receiptCount,
    openTaskCount,
    blockedTaskCount: blockedTaskIds.length,
    blockedTaskIds,
    connectionTypeCounts: connTypeCounts,
  };
}

/**
 * Normalize legacy DB/API workflow status values for projections.
 * See docs/v4/KERNEL_CONTRACT.md (WorkflowStatus frozen enum).
 */
export function normalizeWorkflowStatus(status: string): string {
  return status === 'paused' ? 'suspended' : status;
}

/**
 * The Run projection (R3a). §10.1 is resolved as "extend Workflow" — a Workflow
 * IS the execution instance, so run_id ≡ workflow_id. This is a strictly
 * read-only AGGREGATE OF REFERENCES: the instance fields (mode/status/budget/
 * checkpoint_state) plus the *ids* of the tasks, artifacts, and receipts that
 * already carry this workflow_id. It NEVER copies task/artifact/receipt truth —
 * doing so would make a second store (the R3 failure signal). Returns null when
 * the workflow does not exist.
 */
export interface WorkflowProjection {
  /** run_id ≡ workflow_id (Workflow is the run instance). A3 removes this alias field. */
  workflowId: string;
  objective: string;
  status: string;
  mode: string | null;
  /** DECLARED here (R3); ENFORCED in R4. Parsed from workflows.budget_json. */
  budget: Record<string, unknown>;
  checkpointState: string | null;
  startedAt: number;
  endedAt: number | null;
  /** References only — never the rows themselves. */
  taskIds: string[];
  artifactIds: string[];
  receiptIds: string[];
}

export function queryRun(db: KernelDB, workflowId: string): WorkflowProjection | null {
  const wf = db
    .prepare(
      `SELECT id, objective, status, mode, budget_json, checkpoint_state, created_at, updated_at
       FROM workflows WHERE id = ?`,
    )
    .get(workflowId) as
    | {
        id: string;
        objective: string;
        status: string;
        mode: string | null;
        budget_json: string;
        checkpoint_state: string | null;
        created_at: number;
        updated_at: number;
      }
    | undefined;
  if (!wf) return null;

  const taskIds = (db.prepare('SELECT id FROM tasks WHERE workflow_id = ? ORDER BY created_at ASC').all(workflowId) as { id: string }[]).map((r) => r.id);
  const artifactIds = (db.prepare('SELECT id FROM artifacts WHERE workflow_id = ? ORDER BY created_at ASC').all(workflowId) as { id: string }[]).map((r) => r.id);
  const receiptIds = (db.prepare('SELECT id FROM receipts WHERE workflow_id = ? ORDER BY created_at ASC').all(workflowId) as { id: string }[]).map((r) => r.id);

  let budget: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(wf.budget_json ?? '{}');
    if (parsed && typeof parsed === 'object') budget = parsed as Record<string, unknown>;
  } catch {
    budget = {};
  }

  // A run is "ended" once the workflow is complete/archived; updated_at is the
  // last transition time. We expose a reference timestamp, not a derived truth.
  const ended = wf.status === 'complete' || wf.status === 'archived';

  return {
    workflowId: wf.id,
    objective: wf.objective,
    status: normalizeWorkflowStatus(wf.status),
    mode: wf.mode,
    budget,
    checkpointState: wf.checkpoint_state,
    startedAt: wf.created_at,
    endedAt: ended ? wf.updated_at : null,
    taskIds,
    artifactIds,
    receiptIds,
  };
}

/**
 * All workflow regions (one per workflow row), newest activity last by created
 * order. Empty workflows are included with a null bounds so callers can decide
 * whether to draw them.
 */
export function queryWorkflowRegionList(db: KernelDB): WorkflowRegion[] {
  const ids = db.prepare('SELECT id FROM workflows ORDER BY created_at ASC').all() as { id: string }[];
  const regions: WorkflowRegion[] = [];
  for (const { id } of ids) {
    const region = queryWorkflowRegion(db, id);
    if (region) regions.push(region);
  }
  return regions;
}
