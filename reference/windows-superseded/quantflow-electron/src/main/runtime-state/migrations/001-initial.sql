-- QuantFlow runtime state schema — migration 001
-- All timestamps are ms since epoch (INTEGER).

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT    PRIMARY KEY,
  cable_id    TEXT,
  from_tile_id TEXT   NOT NULL,
  to_tile_id  TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending',
  payload     TEXT    NOT NULL DEFAULT '',
  result      TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_cable_id    ON tasks (cable_id);
CREATE INDEX IF NOT EXISTS tasks_status      ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_created_at  ON tasks (created_at);

CREATE TABLE IF NOT EXISTS events (
  id         TEXT    PRIMARY KEY,
  kind       TEXT    NOT NULL,
  task_id    TEXT,
  tile_id    TEXT,
  data       TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS events_kind       ON events (kind);
CREATE INDEX IF NOT EXISTS events_task_id    ON events (task_id);
CREATE INDEX IF NOT EXISTS events_tile_id    ON events (tile_id);
CREATE INDEX IF NOT EXISTS events_created_at ON events (created_at);

CREATE TABLE IF NOT EXISTS status_transitions (
  id          TEXT    PRIMARY KEY,
  pane_id     TEXT    NOT NULL,
  tile_id     TEXT,
  from_status TEXT    NOT NULL,
  to_status   TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS st_pane_id    ON status_transitions (pane_id);
CREATE INDEX IF NOT EXISTS st_tile_id    ON status_transitions (tile_id);
CREATE INDEX IF NOT EXISTS st_created_at ON status_transitions (created_at);

CREATE TABLE IF NOT EXISTS pty_sessions (
  id         TEXT    PRIMARY KEY,
  tile_id    TEXT    NOT NULL,
  shell      TEXT    NOT NULL DEFAULT '',
  pid        INTEGER,
  target     TEXT    NOT NULL DEFAULT 'local',
  cwd        TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  ended_at   INTEGER,
  exit_code  INTEGER
);

CREATE INDEX IF NOT EXISTS pty_tile_id    ON pty_sessions (tile_id);
CREATE INDEX IF NOT EXISTS pty_ended_at   ON pty_sessions (ended_at);
CREATE INDEX IF NOT EXISTS pty_created_at ON pty_sessions (created_at);

-- Schema version sentinel so the runner can detect future migrations.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, unixepoch() * 1000);
