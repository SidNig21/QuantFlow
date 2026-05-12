import { randomUUID } from "node:crypto";
import type { EventRow, EventFilter } from "./types";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ROWS = 50_000;

let rows: EventRow[] = [];

export function appendEvent(params: {
  kind: string;
  taskId?: string | null;
  tileId?: string | null;
  data?: Record<string, unknown>;
}): EventRow {
  const row: EventRow = {
    id: randomUUID(),
    kind: params.kind,
    task_id: params.taskId ?? null,
    tile_id: params.tileId ?? null,
    data: params.data ?? {},
    created_at: Date.now(),
  };
  rows.push(row);
  pruneIfNeeded();
  return row;
}

export function listEvents(filter: EventFilter = {}): EventRow[] {
  let result = rows;
  if (filter.kind !== undefined)
    result = result.filter((r) => r.kind === filter.kind);
  if (filter.taskId !== undefined)
    result = result.filter((r) => r.task_id === filter.taskId);
  if (filter.tileId !== undefined)
    result = result.filter((r) => r.tile_id === filter.tileId);
  if (filter.since !== undefined)
    result = result.filter((r) => r.created_at >= filter.since!);
  const limit = filter.limit ?? 500;
  return result.slice(-limit);
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
