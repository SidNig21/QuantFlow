import { randomUUID } from "node:crypto";
import type { StatusTransitionRow, StatusFilter } from "./types";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ROWS = 20_000;

let rows: StatusTransitionRow[] = [];

export function appendStatusTransition(params: {
  paneId: string;
  tileId?: string | null;
  fromStatus: string;
  toStatus: string;
}): StatusTransitionRow {
  const row: StatusTransitionRow = {
    id: randomUUID(),
    pane_id: params.paneId,
    tile_id: params.tileId ?? null,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    created_at: Date.now(),
  };
  rows.push(row);
  pruneIfNeeded();
  return row;
}

export function listStatusTransitions(filter: StatusFilter = {}): StatusTransitionRow[] {
  let result = rows;
  if (filter.paneId !== undefined)
    result = result.filter((r) => r.pane_id === filter.paneId);
  if (filter.tileId !== undefined)
    result = result.filter((r) => r.tile_id === filter.tileId);
  if (filter.since !== undefined)
    result = result.filter((r) => r.created_at >= filter.since!);
  const limit = filter.limit ?? 500;
  return result.slice(-limit);
}

/** Get the most recent status for a given pane. */
export function latestStatus(paneId: string): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]!.pane_id === paneId) return rows[i]!.to_status;
  }
  return null;
}

export function _resetForTesting(): void {
  rows = [];
}

function pruneIfNeeded(): void {
  if (rows.length <= MAX_ROWS) return;
  const cutoff = Date.now() - TTL_MS;
  rows = rows.filter((r) => r.created_at >= cutoff);
  if (rows.length > MAX_ROWS) rows = rows.slice(-MAX_ROWS);
}
