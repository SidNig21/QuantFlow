import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { EventRow, EventFilter } from "./types";

// ─── Writes ──────────────────────────────────────────────────────────────────

export function appendEvent(params: {
  runId?: string | null;
  kind: string;
  taskId?: string | null;
  tileId?: string | null;
  traceId?: string | null;
  correlationId?: string | null;
  cableId?: string | null;
  level?: string | null;
  data?: Record<string, unknown>;
}): EventRow {
  const row: EventRow = {
    id: randomUUID(),
    run_id: params.runId ?? null,
    kind: params.kind,
    task_id: params.taskId ?? null,
    tile_id: params.tileId ?? null,
    trace_id: params.traceId ?? null,
    correlation_id: params.correlationId ?? null,
    cable_id: params.cableId ?? null,
    level: params.level ?? null,
    data: params.data ?? {},
    created_at: Date.now(),
  };

  getDb()
    .prepare(
      `INSERT INTO events
         (id, run_id, kind, task_id, tile_id, trace_id, correlation_id, cable_id, level, data, created_at)
       VALUES
         (@id, @run_id, @kind, @task_id, @tile_id, @trace_id, @correlation_id, @cable_id, @level, @data, @created_at)`,
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
  if (filter.runId !== undefined) {
    conditions.push("run_id = @runId");
    params["runId"] = filter.runId;
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
  if (filter.traceId !== undefined) {
    conditions.push("trace_id = @traceId");
    params["traceId"] = filter.traceId;
  }
  if (filter.correlationId !== undefined) {
    conditions.push("correlation_id = @correlationId");
    params["correlationId"] = filter.correlationId;
  }
  if (filter.cableId !== undefined) {
    conditions.push("cable_id = @cableId");
    params["cableId"] = filter.cableId;
  }
  if (filter.level !== undefined) {
    conditions.push("level = @level");
    params["level"] = filter.level;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;

  const rows = getDb()
    .prepare(`SELECT * FROM events ${where} ORDER BY created_at ASC LIMIT @limit`)
    .all({ ...params, limit }) as (Omit<EventRow, "data"> & { data: string })[];

  return rows.map((r) => ({ ...r, data: JSON.parse(r.data) as Record<string, unknown> }));
}

export function listEventCorrelationGroups(
  filter: EventFilter = {},
): Array<{ correlationId: string; events: EventRow[] }> {
  const rows = listEvents({ ...filter, limit: filter.limit ?? 500 });
  const grouped = new Map<string, EventRow[]>();
  for (const row of rows) {
    if (!row.correlation_id) continue;
    const group = grouped.get(row.correlation_id) ?? [];
    group.push(row);
    grouped.set(row.correlation_id, group);
  }
  return Array.from(grouped.entries())
    .map(([correlationId, events]) => ({ correlationId, events }))
    .sort((a, b) => (a.events[0]?.created_at ?? 0) - (b.events[0]?.created_at ?? 0));
}

// ─── Testing ─────────────────────────────────────────────────────────────────

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM events").run();
}
