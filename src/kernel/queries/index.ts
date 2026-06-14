import { getKernelDb } from '../database';

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
