-- R3a: Workflow-as-Run instance fields.
-- §10.1 RESOLVED (see BUILD_PLAN_V4 § Eve Integration): extend `Workflow`; do NOT
-- introduce a new `Run` primitive. A Workflow IS the execution instance, so
-- run_id ≡ workflow_id and the "Run" is a references-only PROJECTION over the
-- tasks/artifacts/receipts that already carry workflow_id (see queryRun). These
-- columns add instance metadata only; they never duplicate task/artifact/receipt truth.
-- Additive + nullable: existing workflows keep mode/checkpoint_state NULL, budget '{}'.

ALTER TABLE workflows ADD COLUMN mode TEXT;                              -- run mode (scout|research|deep…); set by R6 templates
ALTER TABLE workflows ADD COLUMN budget_json TEXT NOT NULL DEFAULT '{}'; -- DECLARED here (R3), ENFORCED in R4
ALTER TABLE workflows ADD COLUMN checkpoint_state TEXT;                  -- R5 human-checkpoint pause state

INSERT INTO schema_migrations (version, description, applied_at)
VALUES (4, 'r3a: workflow run-instance fields (mode/budget/checkpoint_state)', unixepoch() * 1000);
