-- R2 Context Envelope: artifact lineage references.
-- Stores upstream artifact ids only; artifact content remains in the artifact file.

ALTER TABLE artifacts ADD COLUMN derived_from TEXT NOT NULL DEFAULT '[]';

INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
VALUES (6, 'R2 artifact lineage derived_from references', unixepoch() * 1000);
