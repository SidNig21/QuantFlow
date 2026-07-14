import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import { appendEvent } from "./events-repo";
import type { TaskRow, TaskStatus, TaskFilter } from "./types";

// ─── Writes ──────────────────────────────────────────────────────────────────

export function createTask(params: {
  runId?: string | null;
  parentTaskId?: string | null;
  cableId: string | null;
  fromTileId: string;
  toTileId: string;
  correlationId?: string | null;
  threadId?: string | null;
  traceId?: string | null;
  origin?: string | null;
  payload: string;
  payloadHash?: string | null;
  schemaId?: string | null;
  schemaVersion?: string | null;
  sentAt?: number | null;
  deliveredAt?: number | null;
  completedAt?: number | null;
}): TaskRow {
  const now = Date.now();
  const row: TaskRow = {
    id: randomUUID(),
    run_id: params.runId ?? null,
    parent_task_id: params.parentTaskId ?? null,
    cable_id: params.cableId,
    from_tile_id: params.fromTileId,
    to_tile_id: params.toTileId,
    correlation_id: params.correlationId ?? null,
    thread_id: params.threadId ?? null,
    trace_id: params.traceId ?? null,
    origin: params.origin ?? null,
    status: "queued",
    payload: params.payload,
    payload_hash: params.payloadHash ?? null,
    schema_id: params.schemaId ?? null,
    schema_version: params.schemaVersion ?? null,
    result: null,
    sent_at: params.sentAt ?? null,
    delivered_at: params.deliveredAt ?? null,
    completed_at: params.completedAt ?? null,
    created_at: now,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO tasks
         (id, run_id, parent_task_id, cable_id, from_tile_id, to_tile_id, correlation_id,
          thread_id, trace_id, origin, status, payload, payload_hash, schema_id,
          schema_version, result, sent_at, delivered_at, completed_at, created_at,
          updated_at)
       VALUES
         (@id, @run_id, @parent_task_id, @cable_id, @from_tile_id, @to_tile_id,
          @correlation_id, @thread_id, @trace_id, @origin, @status, @payload,
          @payload_hash, @schema_id, @schema_version, @result, @sent_at,
          @delivered_at, @completed_at, @created_at, @updated_at)`,
    )
    .run(row);

  return row;
}

export function updateTask(
  id: string,
  changes: {
    status?: TaskStatus;
    result?: string;
    sentAt?: number | null;
    deliveredAt?: number | null;
    completedAt?: number | null;
  },
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
    sent_at: changes.sentAt !== undefined ? changes.sentAt : existing.sent_at,
    delivered_at:
      changes.deliveredAt !== undefined ? changes.deliveredAt : existing.delivered_at,
    completed_at:
      changes.completedAt !== undefined ? changes.completedAt : existing.completed_at,
    updated_at: Date.now(),
  };

  db.prepare(
    `UPDATE tasks
     SET status = @status,
         result = @result,
         sent_at = @sent_at,
         delivered_at = @delivered_at,
         completed_at = @completed_at,
         updated_at = @updated_at
     WHERE id = @id`,
  ).run(updated);

  return updated;
}

/**
 * Transitions a task to a new status, auto-stamping the relevant timestamp,
 * and appends a task.transition event so the relay log stays consistent.
 */
export function transitionTask(
  id: string,
  toStatus: TaskStatus,
  meta?: { tileId?: string; now?: number },
): TaskRow | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
    | TaskRow
    | undefined;
  if (!existing) return null;

  const fromStatus = existing.status;
  const now = meta?.now ?? Date.now();

  const changes: Parameters<typeof updateTask>[1] = { status: toStatus };
  if (toStatus === "sent" && existing.sent_at == null) {
    changes.sentAt = now;
  } else if (toStatus === "delivered" && existing.delivered_at == null) {
    changes.deliveredAt = now;
  } else if (toStatus === "failed" || toStatus === "cancelled") {
    changes.completedAt = now;
  }

  const updated = updateTask(id, changes);

  appendEvent({
    runId: existing.run_id,
    kind: "task.transition",
    taskId: id,
    correlationId: existing.correlation_id,
    traceId: existing.trace_id,
    cableId: existing.cable_id,
    tileId: meta?.tileId ?? existing.from_tile_id,
    data: {
      task_id: id,
      correlation_id: existing.correlation_id,
      from_state: fromStatus,
      to_state: toStatus,
      at_ms: now,
    },
  });

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
  if (filter.runId !== undefined) {
    conditions.push("run_id = @runId");
    params["runId"] = filter.runId;
  }
  if (filter.parentTaskId !== undefined) {
    conditions.push("parent_task_id = @parentTaskId");
    params["parentTaskId"] = filter.parentTaskId;
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
  if (filter.correlationId !== undefined) {
    conditions.push("correlation_id = @correlationId");
    params["correlationId"] = filter.correlationId;
  }
  if (filter.traceId !== undefined) {
    conditions.push("trace_id = @traceId");
    params["traceId"] = filter.traceId;
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
