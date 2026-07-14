import { randomUUID } from "node:crypto";
import { getDb } from "./database";
import type { StatusTransitionRow, StatusFilter } from "./types";

// ─── Writes ──────────────────────────────────────────────────────────────────

export function appendStatusTransition(params: {
  paneId: string;
  tileId?: string | null;
  fromStatus: string;
  toStatus: string;
}): StatusTransitionRow {
  const row: StatusTransitionRow = {
    id: randomUUID(),
    pane_id: params.paneId,
    tile_id: params.tileId ?? null,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    created_at: Date.now(),
  };

  getDb()
    .prepare(
      `INSERT INTO status_transitions (id, pane_id, tile_id, from_status, to_status, created_at)
       VALUES (@id, @pane_id, @tile_id, @from_status, @to_status, @created_at)`,
    )
    .run(row);

  return row;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export function listStatusTransitions(filter: StatusFilter = {}): StatusTransitionRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.paneId !== undefined) {
    conditions.push("pane_id = @paneId");
    params["paneId"] = filter.paneId;
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

  return getDb()
    .prepare(
      `SELECT * FROM status_transitions ${where} ORDER BY created_at ASC LIMIT @limit`,
    )
    .all({ ...params, limit }) as StatusTransitionRow[];
}

/** Returns the most recent agent_status recorded for a pane. */
export function latestStatus(paneId: string): string | null {
  const row = getDb()
    .prepare(
      "SELECT to_status FROM status_transitions WHERE pane_id = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(paneId) as { to_status: string } | undefined;

  return row?.to_status ?? null;
}

// ─── Testing ─────────────────────────────────────────────────────────────────

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM status_transitions").run();
}
