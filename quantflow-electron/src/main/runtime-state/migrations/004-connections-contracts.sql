-- QuantFlow runtime state schema — migration 004
-- Schema registry (§5 contracts) + connections table (v2 §3).

CREATE TABLE IF NOT EXISTS schemas (
  schema_id      TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL DEFAULT '1',
  body           TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id              TEXT PRIMARY KEY,
  tile_a_id       TEXT NOT NULL,
  tile_b_id       TEXT NOT NULL,
  from_tile_id    TEXT,
  from_side       TEXT,
  to_tile_id      TEXT,
  to_side         TEXT,
  type            TEXT NOT NULL DEFAULT 'string',
  kind            TEXT NOT NULL DEFAULT 'string',
  label           TEXT,
  config          TEXT NOT NULL DEFAULT '{}',
  watcher_enabled INTEGER NOT NULL DEFAULT 0,
  watcher_syntax  TEXT NOT NULL DEFAULT 'heredoc-v1',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS connections_tile_a_id ON connections (tile_a_id);
CREATE INDEX IF NOT EXISTS connections_tile_b_id ON connections (tile_b_id);
CREATE INDEX IF NOT EXISTS connections_tile_pair  ON connections (tile_a_id, tile_b_id);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, unixepoch() * 1000);
