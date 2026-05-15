-- QuantFlow runtime state schema — migration 003
-- Opt-in message typing on tasks (Opus §5 / bridge doc alignment).

ALTER TABLE tasks ADD COLUMN schema_id TEXT;
ALTER TABLE tasks ADD COLUMN schema_version TEXT;

CREATE INDEX IF NOT EXISTS tasks_schema_id ON tasks (schema_id);

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, unixepoch() * 1000);
