import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { RunFilter, RunRow, RunStatus } from "./types";

export function createRun(params: {
  rootTaskId?: string | null;
  status?: RunStatus;
  title?: string | null;
  metadata?: Record<string, unknown>;
  startedAt?: number;
} = {}): RunRow {
  const now = Date.now();
  const row: RunRow = {
    id: randomUUID(),
    root_task_id: params.rootTaskId ?? null,
    status: params.status ?? "running",
    title: params.title ?? null,
    metadata: params.metadata ?? {},
    started_at: params.startedAt ?? now,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO runs
         (id, root_task_id, status, title, metadata, started_at, completed_at, created_at, updated_at)
       VALUES
         (@id, @root_task_id, @status, @title, @metadata, @started_at, @completed_at, @created_at, @updated_at)`,
    )
    .run({ ...row, metadata: JSON.stringify(row.metadata) });

  return row;
}

export function updateRun(
  id: string,
  changes: {
    status?: RunStatus;
    title?: string | null;
    metadata?: Record<string, unknown>;
    completedAt?: number | null;
  },
): RunRow | null {
  const existing = getRun(id);
  if (!existing) return null;

  const updated: RunRow = {
    ...existing,
    status: changes.status ?? existing.status,
    title: changes.title !== undefined ? changes.title : existing.title,
    metadata: changes.metadata ?? existing.metadata,
    completed_at:
      changes.completedAt !== undefined ? changes.completedAt : existing.completed_at,
    updated_at: Date.now(),
  };

  getDb()
    .prepare(
      `UPDATE runs
       SET status = @status, title = @title, metadata = @metadata,
           completed_at = @completed_at, updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({ ...updated, metadata: JSON.stringify(updated.metadata) });

  return updated;
}

export function getRun(id: string): RunRow | null {
  const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as
    | (Omit<RunRow, "metadata"> & { metadata: string })
    | undefined;

  return row ? { ...row, metadata: JSON.parse(row.metadata) as Record<string, unknown> } : null;
}

export function listRuns(filter: RunFilter = {}): RunRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.rootTaskId !== undefined) {
    conditions.push("root_task_id = @rootTaskId");
    params["rootTaskId"] = filter.rootTaskId;
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
  const rows = getDb()
    .prepare(`SELECT * FROM runs ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as (Omit<RunRow, "metadata"> & { metadata: string })[];

  return rows.map((row) => ({
    ...row,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }));
}

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM runs").run();
}
