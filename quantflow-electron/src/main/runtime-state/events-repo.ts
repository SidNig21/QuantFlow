import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { EventRow, EventFilter } from "./types";

// ─── Writes ──────────────────────────────────────────────────────────────────

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

  getDb()
    .prepare(
      `INSERT INTO events (id, kind, task_id, tile_id, data, created_at)
       VALUES (@id, @kind, @task_id, @tile_id, @data, @created_at)`,
    )
    .run({ ...row, data: JSON.stringify(row.data) });

  return row;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export function listEvents(filter: EventFilter = {}): EventRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.kind !== undefined) {
    conditions.push("kind = @kind");
    params["kind"] = filter.kind;
  }
  if (filter.taskId !== undefined) {
    conditions.push("task_id = @taskId");
    params["taskId"] = filter.taskId;
  }
  if (filter.tileId !== undefined) {
    conditions.push("tile_id = @tileId");
    params["tileId"] = filter.tileId;
  }
  if (filter.since !== undefined) {
    conditions.push("created_at >= @since");
    params["since"] = filter.since;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;

  const rows = getDb()
    .prepare(`SELECT * FROM events ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as (Omit<EventRow, "data"> & { data: string })[];

  return rows.map((r) => ({ ...r, data: JSON.parse(r.data) as Record<string, unknown> }));
}

// ─── Testing ─────────────────────────────────────────────────────────────────

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM events").run();
}
