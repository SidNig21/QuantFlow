import { getKernelDb } from '../database';
import type { TaskStatus } from '../schema/types';
import {
  queryTaskDependencies as taskDependencies,
  queryTaskList as taskList,
  queryTaskGet as taskGet,
  type TaskSnapshot,
} from '../tasks/index';
import {
  queryReceiptList as receiptList,
  queryArtifactList as artifactList,
  type ReceiptSnapshot,
  type ArtifactSnapshot,
} from '../receipts/index';
import {
  queryStateCardList as stateCardList,
  queryStateCardGet as stateCardGet,
  type StateCardSnapshot,
} from '../state-cards/index';
import {
  queryConductorContext as conductorContext,
  queryWorkflowSnapshot as workflowSnapshot,
  type ConductorContext,
  type WorkflowSnapshot,
} from '../conductor/index';
import {
  queryWorkerList as workerList,
  queryWorkerGet as workerGet,
  type WorkerSnapshot,
} from '../worker-instances/index';
import {
  queryRun as runGet,
  queryWorkflowRegion as workflowRegion,
  queryWorkflowRegionList as workflowRegionList,
  type WorkflowRun,
  type WorkflowProjection,
  type WorkflowRegion,
} from '../workflows/index';
import {
  queryEvaluationList as evalList,
  queryEvaluationGet as evalGet,
  type EvaluationRowSnapshot,
} from '../evals/index';

export interface TileSnapshot {
  id: string;
  displayName: string;
  tileKind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  status: string;
  workflowId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConnectionSnapshot {
  id: string;
  workflowId: string | null;
  tileAId: string;
  tileBId: string;
  fromTileId: string | null;
  toTileId: string | null;
  semanticType: string;
  label: string | null;
  status: string;
}

export interface CanvasSnapshot {
  tiles: TileSnapshot[];
  connections: ConnectionSnapshot[];
}

function rowToTile(r: Record<string, unknown>): TileSnapshot {
  return {
    id: r['id'] as string,
    displayName: r['display_name'] as string,
    tileKind: r['tile_kind'] as string,
    x: r['x'] as number,
    y: r['y'] as number,
    width: r['width'] as number,
    height: r['height'] as number,
    zIndex: r['z_index'] as number,
    status: r['status'] as string,
    workflowId: r['workflow_id'] as string | null,
    createdAt: r['created_at'] as number,
    updatedAt: r['updated_at'] as number,
  };
}

function rowToConnection(r: Record<string, unknown>): ConnectionSnapshot {
  return {
    id: r['id'] as string,
    workflowId: r['workflow_id'] as string | null,
    tileAId: r['tile_a_id'] as string,
    tileBId: r['tile_b_id'] as string,
    fromTileId: r['from_tile_id'] as string | null,
    toTileId: r['to_tile_id'] as string | null,
    semanticType: r['semantic_type'] as string,
    label: r['label'] as string | null,
    status: r['status'] as string,
  };
}

export function queryCanvasSnapshot(workflowId?: string): CanvasSnapshot {
  const db = getKernelDb();

  const tileRows = workflowId
    ? (db.prepare('SELECT * FROM tiles WHERE workflow_id = ? ORDER BY z_index ASC, created_at ASC').all(workflowId) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM tiles ORDER BY z_index ASC, created_at ASC').all() as Record<string, unknown>[]);

  const connectionRows = workflowId
    ? (db.prepare("SELECT * FROM connections WHERE workflow_id = ? AND status = 'active'").all(workflowId) as Record<string, unknown>[])
    : (db.prepare("SELECT * FROM connections WHERE status = 'active'").all() as Record<string, unknown>[]);

  return {
    tiles: tileRows.map(rowToTile),
    connections: connectionRows.map(rowToConnection),
  };
}

export function queryTileList(workflowId?: string): TileSnapshot[] {
  return queryCanvasSnapshot(workflowId).tiles;
}

export function queryTileGet(tileId: string): TileSnapshot | null {
  const db = getKernelDb();
  const row = db.prepare('SELECT * FROM tiles WHERE id = ?').get(tileId) as Record<string, unknown> | undefined;
  return row ? rowToTile(row) : null;
}

// ---------------------------------------------------------------------------
// Task + receipt queries (Goal 3)
// ---------------------------------------------------------------------------

export function queryTaskList(params: {
  workflowId?: string;
  status?: TaskStatus;
  limit?: number;
} = {}): TaskSnapshot[] {
  return taskList(getKernelDb(), params);
}

export function queryTaskGet(taskId: string): TaskSnapshot | null {
  return taskGet(getKernelDb(), taskId);
}

export function queryReceiptList(params: {
  taskId?: string;
  correlationId?: string;
  workflowId?: string;
  limit?: number;
} = {}): ReceiptSnapshot[] {
  return receiptList(getKernelDb(), params);
}

export function queryArtifactList(params: { workflowId?: string; taskId?: string } = {}): ArtifactSnapshot[] {
  return artifactList(getKernelDb(), params);
}

export type { ArtifactSnapshot };

export interface UpstreamArtifactSnapshot {
  artifactId: string;
  title: string;
  uri: string | null;
  kind: string;
  verificationStatus: 'verified';
  producedByTask: string;
  producedByTaskTitle: string;
  contentHash: string | null;
  mediaType: string | null;
  sizeBytes: number | null;
}

function sensitivityOf(artifact: ArtifactSnapshot): string {
  const fromColumn = typeof artifact.sensitivity === 'string' && artifact.sensitivity.trim()
    ? artifact.sensitivity.trim()
    : 'normal';
  const fromMeta = artifact.metadata['sensitivity'];
  const meta = typeof fromMeta === 'string' && fromMeta.trim() ? fromMeta.trim() : 'normal';
  // Stricter wins: any non-normal on column or metadata ⇒ sensitive.
  if (fromColumn !== 'normal') return fromColumn;
  if (meta !== 'normal') return meta;
  return 'normal';
}

function verifiedArtifactIds(receipts: ReceiptSnapshot[]): Set<string> {
  const ids = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.type !== 'verification_passed') continue;
    for (const ref of receipt.artifactRefs) {
      if (typeof ref === 'string' && ref.trim()) ids.add(ref.trim());
    }
  }
  return ids;
}

export function queryUpstreamArtifacts(
  taskId: string,
  options: { includeSensitive?: boolean } = {},
): UpstreamArtifactSnapshot[] {
  const db = getKernelDb();
  const deps = taskDependencies(db).filter((dep) => dep.taskId === taskId && dep.kind === 'context_from');
  const results: UpstreamArtifactSnapshot[] = [];
  const seen = new Set<string>();

  for (const dep of deps) {
    const upstream = taskGet(db, dep.dependsOnTaskId);
    if (!upstream || upstream.status !== 'complete') continue;

    const receipts = receiptList(db, { taskId: dep.dependsOnTaskId, limit: 500 });
    const verifiedIds = verifiedArtifactIds(receipts);
    if (verifiedIds.size === 0) continue;

    for (const artifact of artifactList(db, { taskId: dep.dependsOnTaskId })) {
      if (!verifiedIds.has(artifact.id)) continue;
      if (!options.includeSensitive && sensitivityOf(artifact) !== 'normal') continue;
      if (seen.has(artifact.id)) continue;
      seen.add(artifact.id);
      results.push({
        artifactId: artifact.id,
        title: artifact.summary ?? upstream.title,
        uri: artifact.uri,
        kind: artifact.kind,
        verificationStatus: 'verified',
        producedByTask: upstream.id,
        producedByTaskTitle: upstream.title,
        contentHash: artifact.contentHash,
        mediaType: artifact.mediaType,
        sizeBytes: artifact.sizeBytes,
      });
    }
  }
  return results;
}

export function queryStateCardList(params: { workflowId?: string } = {}): StateCardSnapshot[] {
  return stateCardList(getKernelDb(), params);
}

export function queryStateCardGet(tileId: string): StateCardSnapshot | null {
  return stateCardGet(getKernelDb(), tileId);
}

// ---------------------------------------------------------------------------
// Conductor read surface (Goal 5A)
// ---------------------------------------------------------------------------

export function queryConductorContext(params: {
  workflowId?: string;
  receiptLimit?: number;
} = {}): ConductorContext {
  return conductorContext(getKernelDb(), params);
}

export function queryWorkflowSnapshot(workflowId: string): WorkflowSnapshot | null {
  return workflowSnapshot(getKernelDb(), workflowId);
}

// ---------------------------------------------------------------------------
// Worker queries (Goal 6A)
// ---------------------------------------------------------------------------

export function queryWorkerList(params: { workflowId?: string } = {}): WorkerSnapshot[] {
  return workerList(getKernelDb(), params);
}

export function queryWorkerGet(workerId: string): WorkerSnapshot | null {
  return workerGet(getKernelDb(), workerId);
}

// ---------------------------------------------------------------------------
// Workflow regions (Goal 7) — read-only canvas projection
// ---------------------------------------------------------------------------

export function queryWorkflowRegion(workflowId: string): WorkflowRegion | null {
  return workflowRegion(getKernelDb(), workflowId);
}

export function queryRun(workflowId: string): WorkflowRun | null {
  return runGet(getKernelDb(), workflowId);
}

export function queryWorkflowRegionList(): WorkflowRegion[] {
  return workflowRegionList(getKernelDb());
}

export type { WorkflowRegion, WorkflowRun, WorkflowProjection };

// ---------------------------------------------------------------------------
// Evaluation queries (Goal 9) — read-only derived analysis
// ---------------------------------------------------------------------------

export function queryEvaluationList(
  params: { workflowId?: string; taskId?: string; workerId?: string; receiptId?: string; evalId?: string } = {},
): EvaluationRowSnapshot[] {
  return evalList(getKernelDb(), params);
}

export function queryEvaluationGet(evalId: string): EvaluationRowSnapshot[] {
  return evalGet(getKernelDb(), evalId);
}

export type { EvaluationRowSnapshot };
