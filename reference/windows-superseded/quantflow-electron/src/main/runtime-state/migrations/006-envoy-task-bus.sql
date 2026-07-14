-- QuantFlow runtime state schema - migration 006
-- Envoy task bus MVP: canvas-scoped spaces, rich task lifecycle, and receipts.

CREATE TABLE IF NOT EXISTS envoy_spaces (
  canvas_id TEXT PRIMARY KEY,
  workspace_hash TEXT,
  space_name TEXT NOT NULL,
  envoy_space_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS envoy_spaces_space_name
  ON envoy_spaces(space_name);

CREATE INDEX IF NOT EXISTS envoy_spaces_envoy_space_id
  ON envoy_spaces(envoy_space_id);

CREATE TABLE IF NOT EXISTS envoy_tasks (
  task_id TEXT PRIMARY KEY,
  envoy_task_id TEXT,
  canvas_id TEXT NOT NULL,
  envoy_space_id TEXT NOT NULL,
  source_tile_id TEXT NOT NULL,
  target_tile_id TEXT,
  connection_id TEXT,
  correlation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  claimed_by TEXT,
  claimed_at INTEGER,
  result_summary TEXT,
  receipt_ids TEXT NOT NULL DEFAULT '[]',
  artifact_paths TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS envoy_tasks_canvas_id
  ON envoy_tasks(canvas_id);

CREATE INDEX IF NOT EXISTS envoy_tasks_envoy_task_id
  ON envoy_tasks(envoy_task_id);

CREATE INDEX IF NOT EXISTS envoy_tasks_status
  ON envoy_tasks(status);

CREATE INDEX IF NOT EXISTS envoy_tasks_target_tile_id
  ON envoy_tasks(target_tile_id);

CREATE INDEX IF NOT EXISTS envoy_tasks_correlation_id
  ON envoy_tasks(correlation_id);

CREATE INDEX IF NOT EXISTS envoy_tasks_connection_id
  ON envoy_tasks(connection_id);

CREATE TABLE IF NOT EXISTS envoy_receipts (
  receipt_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  canvas_id TEXT NOT NULL,
  envoy_space_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  connection_id TEXT,
  kind TEXT NOT NULL,
  actor_tile_id TEXT,
  agent_name TEXT,
  envoy_message_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES envoy_tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS envoy_receipts_task_id
  ON envoy_receipts(task_id);

CREATE INDEX IF NOT EXISTS envoy_receipts_canvas_id
  ON envoy_receipts(canvas_id);

CREATE INDEX IF NOT EXISTS envoy_receipts_correlation_id
  ON envoy_receipts(correlation_id);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (6, unixepoch() * 1000);
