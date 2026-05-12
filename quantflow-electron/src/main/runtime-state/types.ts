/**
 * Shared row types for the QuantFlow runtime state layer.
 *
 * These types define the API surface that both the in-memory stub (Phase 2)
 * and the SQLite implementation (Phase 7) must satisfy. All callers import
 * from here — never from the concrete repo files.
 *
 * Column naming follows SQLite conventions (snake_case) so Phase 7 can map
 * rows directly from `better-sqlite3` with zero type changes.
 */

export type TaskStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "cancelled";

/** One unit of work delegated via a cable from one tile to another. */
export interface TaskRow {
  id: string;
  /** The cable (connection) that carried the task, if any. */
  cable_id: string | null;
  from_tile_id: string;
  to_tile_id: string;
  status: TaskStatus;
  /** Raw message text sent as the task payload. */
  payload: string;
  /** Agent response, populated when status reaches 'done'. */
  result: string | null;
  created_at: number; // ms since epoch
  updated_at: number;
}

/** One discrete event in the system — relay send, relay fail, PTY spawn, etc. */
export interface EventRow {
  id: string;
  /** Dot-separated kind: 'cable.send', 'cable.fail', 'pty.spawn', 'herdr.status_change' */
  kind: string;
  task_id: string | null;
  tile_id: string | null;
  /** Arbitrary structured payload for the event kind. */
  data: Record<string, unknown>;
  created_at: number;
}

/** A herdr agent_status change for a pane — idle → working → done, etc. */
export interface StatusTransitionRow {
  id: string;
  pane_id: string;
  /** QuantFlow tile linked to this herdr pane, if known. */
  tile_id: string | null;
  from_status: string;
  to_status: string;
  created_at: number;
}

/** Lifecycle record for one PTY session. */
export interface PtySessionRow {
  id: string;
  tile_id: string;
  shell: string;
  pid: number | null;
  /** 'sidecar' | 'tmux' | 'local' */
  target: string;
  cwd: string;
  created_at: number;
  ended_at: number | null;
  exit_code: number | null;
}

// ─── Filter types used by list queries ───────────────────────────────────────

export interface TaskFilter {
  cableId?: string;
  fromTileId?: string;
  toTileId?: string;
  status?: TaskStatus;
  since?: number;
  limit?: number;
}

export interface EventFilter {
  kind?: string;
  taskId?: string;
  tileId?: string;
  since?: number;
  limit?: number;
}

export interface StatusFilter {
  paneId?: string;
  tileId?: string;
  since?: number;
  limit?: number;
}

export interface PtySessionFilter {
  tileId?: string;
  active?: boolean; // true = ended_at IS NULL
  since?: number;
  limit?: number;
}
