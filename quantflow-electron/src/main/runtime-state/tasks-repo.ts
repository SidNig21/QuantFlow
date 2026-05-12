import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { TaskRow, TaskStatus, TaskFilter } from "./types";

// ─── Writes ──────────────────────────────────────────────────────────────────

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

  getDb()
    .prepare(
      `INSERT INTO tasks
         (id, cable_id, from_tile_id, to_tile_id, status, payload, result, created_at, updated_at)
       VALUES
         (@id, @cable_id, @from_tile_id, @to_tile_id, @status, @payload, @result, @created_at, @updated_at)`,
    )
    .run(row);

  return row;
}

export function updateTask(
  id: string,
  changes: { status?: TaskStatus; result?: string },
): TaskRow | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
    | TaskRow
    | undefined;
  if (!existing) return null;

  const updated: TaskRow = {
    ...existing,
    status: changes.status ?? existing.status,
    result: changes.result !== undefined ? changes.result : existing.result,
    updated_at: Date.now(),
  };

  db.prepare(
    "UPDATE tasks SET status = @status, result = @result, updated_at = @updated_at WHERE id = @id",
  ).run({ id, status: updated.status, result: updated.result, updated_at: updated.updated_at });

  return updated;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export function getTask(id: string): TaskRow | null {
  return (
    (getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | TaskRow
      | undefined) ?? null
  );
}

export function listTasks(filter: TaskFilter = {}): TaskRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.cableId !== undefined) {
    conditions.push("cable_id = @cableId");
    params["cableId"] = filter.cableId;
  }
  if (filter.fromTileId !== undefined) {
    conditions.push("from_tile_id = @fromTileId");
    params["fromTileId"] = filter.fromTileId;
  }
  if (filter.toTileId !== undefined) {
    conditions.push("to_tile_id = @toTileId");
    params["toTileId"] = filter.toTileId;
  }
  if (filter.status !== undefined) {
    conditions.push("status = @status");
    params["status"] = filter.status;
  }
  if (filter.since !== undefined) {
    conditions.push("created_at >= @since");
    params["since"] = filter.since;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;

  return getDb()
    .prepare(`SELECT * FROM tasks ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as TaskRow[];
}

// ─── Testing ─────────────────────────────────────────────────────────────────

/** Truncates all task rows — used in tests only. */
export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM tasks").run();
}
