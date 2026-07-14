import { getDb } from "./database";
import type { TileRuntimeFilter, TileRuntimeRow } from "./types";

export function upsertTileRuntime(params: {
  tileId: string;
  paneId?: string | null;
  status?: string | null;
  presence?: string;
  metadata?: Record<string, unknown>;
  lastSeenAt?: number | null;
}): TileRuntimeRow {
  const now = Date.now();
  const existing = getTileRuntime(params.tileId);
  const row: TileRuntimeRow = {
    tile_id: params.tileId,
    pane_id: params.paneId !== undefined ? params.paneId : existing?.pane_id ?? null,
    status: params.status !== undefined ? params.status : existing?.status ?? null,
    presence: params.presence ?? existing?.presence ?? "unknown",
    metadata: params.metadata ?? existing?.metadata ?? {},
    last_seen_at:
      params.lastSeenAt !== undefined ? params.lastSeenAt : existing?.last_seen_at ?? now,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO tiles_runtime
         (tile_id, pane_id, status, presence, metadata, last_seen_at, created_at, updated_at)
       VALUES
         (@tile_id, @pane_id, @status, @presence, @metadata, @last_seen_at, @created_at, @updated_at)
       ON CONFLICT(tile_id) DO UPDATE SET
         pane_id = excluded.pane_id,
         status = excluded.status,
         presence = excluded.presence,
         metadata = excluded.metadata,
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`,
    )
    .run({ ...row, metadata: JSON.stringify(row.metadata) });

  return row;
}

export function getTileRuntime(tileId: string): TileRuntimeRow | null {
  const row = getDb().prepare("SELECT * FROM tiles_runtime WHERE tile_id = ?").get(tileId) as
    | (Omit<TileRuntimeRow, "metadata"> & { metadata: string })
    | undefined;

  return row ? { ...row, metadata: JSON.parse(row.metadata) as Record<string, unknown> } : null;
}

export function listTilesRuntime(filter: TileRuntimeFilter = {}): TileRuntimeRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.paneId !== undefined) {
    conditions.push("pane_id = @paneId");
    params["paneId"] = filter.paneId;
  }
  if (filter.status !== undefined) {
    conditions.push("status = @status");
    params["status"] = filter.status;
  }
  if (filter.presence !== undefined) {
    conditions.push("presence = @presence");
    params["presence"] = filter.presence;
  }
  if (filter.since !== undefined) {
    conditions.push("created_at >= @since");
    params["since"] = filter.since;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;
  const rows = getDb()
    .prepare(`SELECT * FROM tiles_runtime ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as (Omit<TileRuntimeRow, "metadata"> & {
    metadata: string;
  })[];

  return rows.map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }));
}

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM tiles_runtime").run();
}
