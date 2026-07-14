-- QuantFlow runtime state schema - migration 002
-- Additive orchestration spine tables and nullable columns.

CREATE TABLE IF NOT EXISTS runs (
  id             TEXT    PRIMARY KEY,
  root_task_id   TEXT,
  status         TEXT    NOT NULL DEFAULT 'running',
  title          TEXT,
  metadata       TEXT    NOT NULL DEFAULT '{}',
  started_at     INTEGER NOT NULL,
  completed_at   INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS runs_root_task_id ON runs (root_task_id);
CREATE INDEX IF NOT EXISTS runs_status       ON runs (status);
CREATE INDEX IF NOT EXISTS runs_created_at   ON runs (created_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id           TEXT    PRIMARY KEY,
  run_id       TEXT,
  task_id      TEXT,
  tile_id      TEXT,
  kind         TEXT    NOT NULL,
  uri          TEXT,
  content_hash TEXT,
  media_type   TEXT,
  size_bytes   INTEGER,
  metadata     TEXT    NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS artifacts_run_id       ON artifacts (run_id);
CREATE INDEX IF NOT EXISTS artifacts_task_id      ON artifacts (task_id);
CREATE INDEX IF NOT EXISTS artifacts_tile_id      ON artifacts (tile_id);
CREATE INDEX IF NOT EXISTS artifacts_content_hash ON artifacts (content_hash);

CREATE TABLE IF NOT EXISTS tile_capabilities (
  id         TEXT    PRIMARY KEY,
  tile_id    TEXT    NOT NULL,
  capability TEXT    NOT NULL,
  metadata   TEXT    NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (tile_id, capability)
);

CREATE INDEX IF NOT EXISTS tile_capabilities_tile_id    ON tile_capabilities (tile_id);
CREATE INDEX IF NOT EXISTS tile_capabilities_capability ON tile_capabilities (capability);

CREATE TABLE IF NOT EXISTS tiles_runtime (
  tile_id       TEXT    PRIMARY KEY,
  pane_id       TEXT,
  status        TEXT,
  presence      TEXT    NOT NULL DEFAULT 'unknown',
  metadata      TEXT    NOT NULL DEFAULT '{}',
  last_seen_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tiles_runtime_pane_id      ON tiles_runtime (pane_id);
CREATE INDEX IF NOT EXISTS tiles_runtime_status       ON tiles_runtime (status);
CREATE INDEX IF NOT EXISTS tiles_runtime_presence     ON tiles_runtime (presence);
CREATE INDEX IF NOT EXISTS tiles_runtime_last_seen_at ON tiles_runtime (last_seen_at);

ALTER TABLE tasks ADD COLUMN run_id TEXT;
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT;
ALTER TABLE tasks ADD COLUMN correlation_id TEXT;
ALTER TABLE tasks ADD COLUMN thread_id TEXT;
ALTER TABLE tasks ADD COLUMN trace_id TEXT;
ALTER TABLE tasks ADD COLUMN origin TEXT;
ALTER TABLE tasks ADD COLUMN payload_hash TEXT;
ALTER TABLE tasks ADD COLUMN sent_at INTEGER;
ALTER TABLE tasks ADD COLUMN delivered_at INTEGER;
ALTER TABLE tasks ADD COLUMN completed_at INTEGER;

CREATE INDEX IF NOT EXISTS tasks_run_id         ON tasks (run_id);
CREATE INDEX IF NOT EXISTS tasks_parent_task_id ON tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS tasks_correlation_id ON tasks (correlation_id);
CREATE INDEX IF NOT EXISTS tasks_trace_id       ON tasks (trace_id);
CREATE INDEX IF NOT EXISTS tasks_from_tile_id   ON tasks (from_tile_id);
CREATE INDEX IF NOT EXISTS tasks_to_tile_id     ON tasks (to_tile_id);

ALTER TABLE events ADD COLUMN run_id TEXT;
ALTER TABLE events ADD COLUMN trace_id TEXT;
ALTER TABLE events ADD COLUMN correlation_id TEXT;
ALTER TABLE events ADD COLUMN cable_id TEXT;
ALTER TABLE events ADD COLUMN level TEXT;

CREATE INDEX IF NOT EXISTS events_run_id         ON events (run_id);
CREATE INDEX IF NOT EXISTS events_trace_id       ON events (trace_id);
CREATE INDEX IF NOT EXISTS events_correlation_id ON events (correlation_id);
CREATE INDEX IF NOT EXISTS events_cable_id       ON events (cable_id);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, unixepoch() * 1000);
