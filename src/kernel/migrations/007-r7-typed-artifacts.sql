-- R7 Judgment & Compounding: typed research artifacts and eval/RL prep.
-- Additive only. Artifact rows remain Kernel truth; files/vault remain storage
-- and mirrors. Evals remain derived, non-authoritative records.

ALTER TABLE artifacts ADD COLUMN source_refs TEXT NOT NULL DEFAULT '[]';
ALTER TABLE artifacts ADD COLUMN observed_at INTEGER;
ALTER TABLE artifacts ADD COLUMN source_kind TEXT;
ALTER TABLE artifacts ADD COLUMN confidence REAL;
ALTER TABLE artifacts ADD COLUMN quote_or_snapshot_ref TEXT;
ALTER TABLE artifacts ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE evaluations ADD COLUMN outcome_artifact_id TEXT REFERENCES artifacts(id);
ALTER TABLE evaluations ADD COLUMN lesson_artifact_id TEXT REFERENCES artifacts(id);
ALTER TABLE evaluations ADD COLUMN rl_trajectory_json TEXT NOT NULL DEFAULT '{}';

INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
VALUES (7, 'R7 typed artifact provenance and eval/RL prep', unixepoch() * 1000);
