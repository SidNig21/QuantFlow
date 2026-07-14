/**
 * D4 connections read seam — Kernel-canonical when QF_ONE_TRUTH=1, runtime.db when off.
 * Canonical connection facts must not originate in runtime.db under one-truth.
 */

import { dispatchKernelCommand } from "../../../src/kernel/commands/index";
import { getKernelDb } from "../../../src/kernel/database";
import type { ConnectionSnapshot } from "../../../src/kernel/queries/index";
import {
  getConnection as dbGetConnection,
  listConnections as dbListConnections,
} from "./runtime-state/connections-repo";
import type { ConnectionFilter, ConnectionRow } from "./runtime-state/types";

/** Canvas-facing connection shape (matches canvas-persistence ConnectionState). */
export interface CanvasConnectionState {
  id: string;
  tileAId: string;
  tileBId: string;
  label?: string;
  from?: { tileId: string; side: "N" | "E" | "S" | "W" };
  to?: { tileId: string; side: "N" | "E" | "S" | "W" };
  kind?: string;
  createdAt: number;
  updatedAt: number;
}

export function isConnectionsKernelCanonical(): boolean {
  return process.env.QF_ONE_TRUTH === "1";
}

/** Flag-gated: skip runtime.db upserts from canvas-persistence saveState. */
export function shouldSyncConnectionsToRuntimeDb(): boolean {
  return !isConnectionsKernelCanonical();
}

let runtimeWriteCount = 0;

export function noteRuntimeConnectionWriteForTesting(): void {
  runtimeWriteCount++;
}

export function _resetConnectionWriteSpyForTesting(): void {
  runtimeWriteCount = 0;
}

export function _getConnectionWriteSpyForTesting(): number {
  return runtimeWriteCount;
}

type KernelConnectionRow = ConnectionSnapshot & {
  createdAt: number;
  updatedAt: number;
};

function rowToSnapshot(r: Record<string, unknown>): KernelConnectionRow {
  return {
    id: r["id"] as string,
    workflowId: r["workflow_id"] as string | null,
    tileAId: r["tile_a_id"] as string,
    tileBId: r["tile_b_id"] as string,
    fromTileId: r["from_tile_id"] as string | null,
    toTileId: r["to_tile_id"] as string | null,
    semanticType: r["semantic_type"] as string,
    label: r["label"] as string | null,
    status: r["status"] as string,
    createdAt: r["created_at"] as number,
    updatedAt: r["updated_at"] as number,
  };
}

function listKernelConnectionRows(): KernelConnectionRow[] {
  const db = getKernelDb();
  const rows = db
    .prepare("SELECT * FROM connections WHERE status = 'active' ORDER BY created_at ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToSnapshot);
}

function snapshotToConnectionState(row: KernelConnectionRow): CanvasConnectionState {
  const conn: CanvasConnectionState = {
    id: row.id,
    tileAId: row.tileAId,
    tileBId: row.tileBId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    kind: row.semanticType,
  };
  if (row.label != null) conn.label = row.label;
  if (row.fromTileId) {
    conn.from = { tileId: row.fromTileId, side: "E" };
  }
  if (row.toTileId) {
    conn.to = { tileId: row.toTileId, side: "W" };
  }
  return conn;
}

function snapshotToConnectionRow(row: KernelConnectionRow): ConnectionRow {
  return {
    id: row.id,
    tile_a_id: row.tileAId,
    tile_b_id: row.tileBId,
    from_tile_id: row.fromTileId,
    from_side: row.fromTileId ? "E" : null,
    to_tile_id: row.toTileId,
    to_side: row.toTileId ? "W" : null,
    type: "string",
    kind: row.semanticType,
    label: row.label,
    config: "{}",
    watcher_enabled: 0,
    watcher_syntax: "heredoc-v1",
    queue_depth: 0,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function filterSnapshots(
  rows: KernelConnectionRow[],
  filter: ConnectionFilter = {},
): KernelConnectionRow[] {
  let result = rows;
  if (filter.tileId !== undefined) {
    result = result.filter(
      (r) => r.tileAId === filter.tileId || r.tileBId === filter.tileId,
    );
  } else {
    if (filter.tileAId !== undefined) {
      result = result.filter((r) => r.tileAId === filter.tileAId);
    }
    if (filter.tileBId !== undefined) {
      result = result.filter((r) => r.tileBId === filter.tileBId);
    }
  }
  if (filter.label !== undefined) {
    result = result.filter((r) => r.label === filter.label);
  }
  const limit = filter.limit ?? 500;
  return result.slice(0, limit);
}

/** Canvas boot/export: ConnectionState[] from Kernel or runtime.db. */
export function loadConnectionsForCanvas(): CanvasConnectionState[] {
  if (isConnectionsKernelCanonical()) {
    return listKernelConnectionRows().map(snapshotToConnectionState);
  }
  try {
    return dbListConnections().map(connectionRowToState);
  } catch {
    return [];
  }
}

function connectionRowToState(row: ConnectionRow): CanvasConnectionState {
  const conn: CanvasConnectionState = {
    id: row.id,
    tileAId: row.tile_a_id,
    tileBId: row.tile_b_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.label != null) conn.label = row.label;
  if (row.from_tile_id && row.from_side) {
    conn.from = { tileId: row.from_tile_id, side: row.from_side };
  }
  if (row.to_tile_id && row.to_side) {
    conn.to = { tileId: row.to_tile_id, side: row.to_side };
  }
  if (row.kind && row.kind !== "string") conn.kind = row.kind;
  return conn;
}

/** Main-process readers: ConnectionRow from Kernel or runtime.db. */
export function getConnectionRow(id: string): ConnectionRow | null {
  if (isConnectionsKernelCanonical()) {
    const snap = listKernelConnectionRows().find((r) => r.id === id);
    return snap ? snapshotToConnectionRow(snap) : null;
  }
  return dbGetConnection(id);
}

export function listConnectionRows(filter: ConnectionFilter = {}): ConnectionRow[] {
  if (isConnectionsKernelCanonical()) {
    return filterSnapshots(listKernelConnectionRows(), filter).map(snapshotToConnectionRow);
  }
  return dbListConnections(filter);
}

export async function dispatchConnectionCommand(
  type: "kernel.connection.create" | "kernel.connection.update" | "kernel.connection.delete",
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  return dispatchKernelCommand(type, payload, "connections-access");
}
