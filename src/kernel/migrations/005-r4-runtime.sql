-- R4 Durable Pod Runtime: worker liveness/auth fields.
-- Workflow budget/run fields shipped in 004; do not add a second Run store.

ALTER TABLE worker_instances ADD COLUMN auth_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE worker_instances ADD COLUMN last_seen INTEGER;

CREATE INDEX IF NOT EXISTS idx_worker_instances_status ON worker_instances(status);
CREATE INDEX IF NOT EXISTS idx_worker_instances_last_seen ON worker_instances(last_seen);

INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
VALUES (5, 'R4 durable pod runtime worker liveness fields', unixepoch() * 1000);
