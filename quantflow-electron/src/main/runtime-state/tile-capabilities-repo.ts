import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { TileCapabilityFilter, TileCapabilityRow } from "./types";

export function upsertTileCapability(params: {
  tileId: string;
  capability: string;
  metadata?: Record<string, unknown>;
}): TileCapabilityRow {
  const now = Date.now();
  const existing = getTileCapability(params.tileId, params.capability);
  const row: TileCapabilityRow = {
    id: existing?.id ?? randomUUID(),
    tile_id: params.tileId,
    capability: params.capability,
    metadata: params.metadata ?? existing?.metadata ?? {},
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO tile_capabilities
         (id, tile_id, capability, metadata, created_at, updated_at)
       VALUES
         (@id, @tile_id, @capability, @metadata, @created_at, @updated_at)
       ON CONFLICT(tile_id, capability) DO UPDATE SET
         metadata = excluded.metadata,
         updated_at = excluded.updated_at`,
    )
    .run({ ...row, metadata: JSON.stringify(row.metadata) });

  return row;
}

export function getTileCapability(
  tileId: string,
  capability: string,
): TileCapabilityRow | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM tile_capabilities WHERE tile_id = @tileId AND capability = @capability",
    )
    .get({ tileId, capability }) as
    | (Omit<TileCapabilityRow, "metadata"> & { metadata: string })
    | undefined;

  return row ? { ...row, metadata: JSON.parse(row.metadata) as Record<string, unknown> } : null;
}

export function listTileCapabilities(
  filter: TileCapabilityFilter = {},
): TileCapabilityRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.tileId !== undefined) {
    conditions.push("tile_id = @tileId");
    params["tileId"] = filter.tileId;
  }
  if (filter.capability !== undefined) {
    conditions.push("capability = @capability");
    params["capability"] = filter.capability;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;
  const rows = getDb()
    .prepare(`SELECT * FROM tile_capabilities ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as (Omit<TileCapabilityRow, "metadata"> & {
    metadata: string;
  })[];

  return rows.map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }));
}

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM tile_capabilities").run();
}
