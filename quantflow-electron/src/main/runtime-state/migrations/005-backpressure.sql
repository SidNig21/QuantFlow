-- QuantFlow runtime state schema — migration 005
-- Semantic connection backpressure: queue_depth on connections[] rows.
-- queue_depth tracks in-flight messages per semantic cable.
-- Overflow fires when queue_depth >= QUEUE_DEPTH_MAX (10) at send time.

ALTER TABLE connections ADD COLUMN queue_depth INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (5, unixepoch() * 1000);
