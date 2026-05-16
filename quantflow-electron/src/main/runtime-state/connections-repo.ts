import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { ConnectionFilter, ConnectionRow } from "./types";

export function createConnection(params: {
  id?: string;
  tileAId: string;
  tileBId: string;
  fromTileId?: string | null;
  fromSide?: "N" | "E" | "S" | "W" | null;
  toTileId?: string | null;
  toSide?: "N" | "E" | "S" | "W" | null;
  type?: string;
  kind?: string;
  label?: string | null;
  config?: Record<string, unknown>;
  watcherEnabled?: boolean;
  watcherSyntax?: string;
  createdAt?: number;
  updatedAt?: number;
}): ConnectionRow {
  const now = Date.now();
  const row: ConnectionRow = {
    id: params.id ?? randomUUID(),
    tile_a_id: params.tileAId,
    tile_b_id: params.tileBId,
    from_tile_id: params.fromTileId ?? null,
    from_side: params.fromSide ?? null,
    to_tile_id: params.toTileId ?? null,
    to_side: params.toSide ?? null,
    type: params.type ?? "string",
    kind: params.kind ?? "string",
    label: params.label ?? null,
    config: JSON.stringify(params.config ?? {}),
    watcher_enabled: params.watcherEnabled ? 1 : 0,
    watcher_syntax: params.watcherSyntax ?? "heredoc-v1",
    created_at: params.createdAt ?? now,
    updated_at: params.updatedAt ?? now,
  };

  getDb()
    .prepare(
      `INSERT INTO connections
         (id, tile_a_id, tile_b_id, from_tile_id, from_side, to_tile_id, to_side,
          type, kind, label, config, watcher_enabled, watcher_syntax, created_at, updated_at)
       VALUES
         (@id, @tile_a_id, @tile_b_id, @from_tile_id, @from_side, @to_tile_id, @to_side,
          @type, @kind, @label, @config, @watcher_enabled, @watcher_syntax, @created_at, @updated_at)`,
    )
    .run(row);

  return row;
}

export function getConnection(id: string): ConnectionRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM connections WHERE id = ?")
      .get(id) as ConnectionRow | undefined) ?? null
  );
}

export function listConnections(filter: ConnectionFilter = {}): ConnectionRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.tileId !== undefined) {
    conditions.push("(tile_a_id = @tileId OR tile_b_id = @tileId)");
    params["tileId"] = filter.tileId;
  } else {
    if (filter.tileAId !== undefined) {
      conditions.push("tile_a_id = @tileAId");
      params["tileAId"] = filter.tileAId;
    }
    if (filter.tileBId !== undefined) {
      conditions.push("tile_b_id = @tileBId");
      params["tileBId"] = filter.tileBId;
    }
  }

  if (filter.label !== undefined) {
    conditions.push("label = @label");
    params["label"] = filter.label;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;

  return getDb()
    .prepare(`SELECT * FROM connections ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as ConnectionRow[];
}

export function updateConnection(
  id: string,
  changes: {
    fromTileId?: string | null;
    fromSide?: "N" | "E" | "S" | "W" | null;
    toTileId?: string | null;
    toSide?: "N" | "E" | "S" | "W" | null;
    type?: string;
    kind?: string;
    label?: string | null;
    config?: Record<string, unknown>;
    watcherEnabled?: boolean;
    watcherSyntax?: string;
  },
): ConnectionRow | null {
  const existing = getConnection(id);
  if (!existing) return null;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if ("fromTileId" in changes) { sets.push("from_tile_id = @fromTileId"); params["fromTileId"] = changes.fromTileId ?? null; }
  if ("fromSide" in changes) { sets.push("from_side = @fromSide"); params["fromSide"] = changes.fromSide ?? null; }
  if ("toTileId" in changes) { sets.push("to_tile_id = @toTileId"); params["toTileId"] = changes.toTileId ?? null; }
  if ("toSide" in changes) { sets.push("to_side = @toSide"); params["toSide"] = changes.toSide ?? null; }
  if ("type" in changes) { sets.push("type = @type"); params["type"] = changes.type; }
  if ("kind" in changes) { sets.push("kind = @kind"); params["kind"] = changes.kind; }
  if ("label" in changes) { sets.push("label = @label"); params["label"] = changes.label ?? null; }
  if ("config" in changes) { sets.push("config = @config"); params["config"] = JSON.stringify(changes.config ?? {}); }
  if ("watcherEnabled" in changes) { sets.push("watcher_enabled = @watcherEnabled"); params["watcherEnabled"] = changes.watcherEnabled ? 1 : 0; }
  if ("watcherSyntax" in changes) { sets.push("watcher_syntax = @watcherSyntax"); params["watcherSyntax"] = changes.watcherSyntax; }

  if (sets.length === 0) return existing;

  const now = Date.now();
  sets.push("updated_at = @updatedAt");
  params["updatedAt"] = now;

  getDb()
    .prepare(`UPDATE connections SET ${sets.join(", ")} WHERE id = @id`)
    .run(params);

  return getConnection(id);
}

export function deleteConnection(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM connections WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

// ─── Backpressure ─────────────────────────────────────────────────────────────

/** Maximum in-flight messages per semantic cable before overflow fires. */
export const QUEUE_DEPTH_MAX = 10;

/**
 * Atomically increment queue_depth for a connection and report whether the
 * new depth exceeds QUEUE_DEPTH_MAX (overflow).  Returns the updated depth.
 * No-ops gracefully if the connection does not exist (returns depth=0, overflow=false).
 */
export function incrementQueueDepth(id: string): { queue_depth: number; overflow: boolean } {
  getDb()
    .prepare("UPDATE connections SET queue_depth = queue_depth + 1 WHERE id = ?")
    .run(id);

  const row = getDb()
    .prepare("SELECT queue_depth FROM connections WHERE id = ?")
    .get(id) as { queue_depth: number } | undefined;

  const depth = row?.queue_depth ?? 0;
  return { queue_depth: depth, overflow: depth > QUEUE_DEPTH_MAX };
}

/**
 * Decrement queue_depth for a connection, clamping to 0.
 * Called after a send completes (success or error path).
 */
export function decrementQueueDepth(id: string): void {
  getDb()
    .prepare("UPDATE connections SET queue_depth = MAX(0, queue_depth - 1) WHERE id = ?")
    .run(id);
}

/** Returns current queue_depth for a connection, or 0 if not found. */
export function getQueueDepth(id: string): number {
  const row = getDb()
    .prepare("SELECT queue_depth FROM connections WHERE id = ?")
    .get(id) as { queue_depth: number } | undefined;
  return row?.queue_depth ?? 0;
}

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM connections").run();
}
