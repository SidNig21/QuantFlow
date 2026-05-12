import { randomUUID } from "node:crypto";
import type { PtySessionRow, PtySessionFilter } from "./types";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ROWS = 5_000;

let rows: PtySessionRow[] = [];

export function createPtySession(params: {
  sessionId: string;
  tileId: string;
  shell: string;
  pid?: number | null;
  target: string;
  cwd: string;
}): PtySessionRow {
  const row: PtySessionRow = {
    id: params.sessionId,
    tile_id: params.tileId,
    shell: params.shell,
    pid: params.pid ?? null,
    target: params.target,
    cwd: params.cwd,
    created_at: Date.now(),
    ended_at: null,
    exit_code: null,
  };
  rows.push(row);
  pruneIfNeeded();
  return row;
}

export function endPtySession(
  sessionId: string,
  exitCode?: number | null,
): PtySessionRow | null {
  const row = rows.find((r) => r.id === sessionId);
  if (!row) return null;
  row.ended_at = Date.now();
  row.exit_code = exitCode ?? null;
  return row;
}

export function getPtySession(sessionId: string): PtySessionRow | null {
  return rows.find((r) => r.id === sessionId) ?? null;
}

export function listPtySessions(filter: PtySessionFilter = {}): PtySessionRow[] {
  let result = rows;
  if (filter.tileId !== undefined)
    result = result.filter((r) => r.tile_id === filter.tileId);
  if (filter.active === true)
    result = result.filter((r) => r.ended_at === null);
  if (filter.active === false)
    result = result.filter((r) => r.ended_at !== null);
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
