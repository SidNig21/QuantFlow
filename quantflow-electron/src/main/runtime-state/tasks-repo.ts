import { randomUUID } from "node:crypto";
import type { TaskRow, TaskStatus, TaskFilter } from "./types";

// In-memory stub — Phase 7 swaps this implementation for better-sqlite3.
// All callers are unchanged when that happens.

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ROWS = 10_000;

let rows: TaskRow[] = [];

export function createTask(params: {
  cableId: string | null;
  fromTileId: string;
  toTileId: string;
  payload: string;
}): TaskRow {
  const now = Date.now();
  const row: TaskRow = {
    id: randomUUID(),
    cable_id: params.cableId,
    from_tile_id: params.fromTileId,
    to_tile_id: params.toTileId,
    status: "pending",
    payload: params.payload,
    result: null,
    created_at: now,
    updated_at: now,
  };
  rows.push(row);
  pruneIfNeeded();
  return row;
}

export function updateTask(
  id: string,
  changes: { status?: TaskStatus; result?: string },
): TaskRow | null {
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  if (changes.status !== undefined) row.status = changes.status;
  if (changes.result !== undefined) row.result = changes.result;
  row.updated_at = Date.now();
  return row;
}

export function getTask(id: string): TaskRow | null {
  return rows.find((r) => r.id === id) ?? null;
}

export function listTasks(filter: TaskFilter = {}): TaskRow[] {
  let result = rows;
  if (filter.cableId !== undefined)
    result = result.filter((r) => r.cable_id === filter.cableId);
  if (filter.fromTileId !== undefined)
    result = result.filter((r) => r.from_tile_id === filter.fromTileId);
  if (filter.toTileId !== undefined)
    result = result.filter((r) => r.to_tile_id === filter.toTileId);
  if (filter.status !== undefined)
    result = result.filter((r) => r.status === filter.status);
  if (filter.since !== undefined)
    result = result.filter((r) => r.created_at >= filter.since!);
  const limit = filter.limit ?? 500;
  return result.slice(-limit);
}

/** Reset all rows — used in tests only. */
export function _resetForTesting(): void {
  rows = [];
}

function pruneIfNeeded(): void {
  if (rows.length <= MAX_ROWS) return;
  const cutoff = Date.now() - TTL_MS;
  rows = rows.filter((r) => r.created_at >= cutoff);
  // If still over cap after TTL prune, hard-trim the oldest.
  if (rows.length > MAX_ROWS) rows = rows.slice(-MAX_ROWS);
}
