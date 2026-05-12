import { getDb } from "./database";
import type { PtySessionRow, PtySessionFilter } from "./types";

// ─── Writes ──────────────────────────────────────────────────────────────────

export function createPtySession(params: {
  sessionId: string;
  tileId: string;
  shell: string;
  pid?: number | null;
  target: string;
  cwd: string;
}): PtySessionRow {
  const row: PtySessionRow = {
    id: params.sessionId,
    tile_id: params.tileId,
    shell: params.shell,
    pid: params.pid ?? null,
    target: params.target,
    cwd: params.cwd,
    created_at: Date.now(),
    ended_at: null,
    exit_code: null,
  };

  getDb()
    .prepare(
      `INSERT INTO pty_sessions
         (id, tile_id, shell, pid, target, cwd, created_at, ended_at, exit_code)
       VALUES
         (@id, @tile_id, @shell, @pid, @target, @cwd, @created_at, @ended_at, @exit_code)`,
    )
    .run(row);

  return row;
}

export function endPtySession(
  sessionId: string,
  exitCode?: number | null,
): PtySessionRow | null {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM pty_sessions WHERE id = ?")
    .get(sessionId) as PtySessionRow | undefined;
  if (!existing) return null;

  const ended_at = Date.now();
  const exit_code = exitCode ?? null;

  db.prepare(
    "UPDATE pty_sessions SET ended_at = @ended_at, exit_code = @exit_code WHERE id = @id",
  ).run({ id: sessionId, ended_at, exit_code });

  return { ...existing, ended_at, exit_code };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export function getPtySession(sessionId: string): PtySessionRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM pty_sessions WHERE id = ?")
      .get(sessionId) as PtySessionRow | undefined) ?? null
  );
}

export function listPtySessions(filter: PtySessionFilter = {}): PtySessionRow[] {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.tileId !== undefined) {
    conditions.push("tile_id = @tileId");
    params["tileId"] = filter.tileId;
  }
  if (filter.active === true) {
    conditions.push("ended_at IS NULL");
  } else if (filter.active === false) {
    conditions.push("ended_at IS NOT NULL");
  }
  if (filter.since !== undefined) {
    conditions.push("created_at >= @since");
    params["since"] = filter.since;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;

  return getDb()
    .prepare(
      `SELECT * FROM pty_sessions ${where} ORDER BY created_at ASC LIMIT @limit`,
    )
    .all({ ...params, limit }) as PtySessionRow[];
}

// ─── Testing ─────────────────────────────────────────────────────────────────

export function _resetForTesting(): void {
  getDb().prepare("DELETE FROM pty_sessions").run();
}
