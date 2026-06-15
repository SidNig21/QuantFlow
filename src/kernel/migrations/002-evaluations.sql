-- Kernel Schema migration 002 — Evaluations (v3 Goal 9)
-- Branch: quantflow-v3
--
-- Adds the `evaluations` table: derived analysis of Kernel evidence. Evals are
-- NOT truth and NOT receipts. They never mutate task/worker/receipt/State-Card
-- state. One row per scored rubric dimension; rows sharing `eval_id` belong to
-- one evaluation of one unit.
--
-- Authority: docs/v3/EVALS_SPEC.md, KERNEL_CONSTITUTION.md
-- Invariants enforced by the application layer:
--   - evaluations are append-only derived records (no UPDATE/DELETE in v1)
--   - no runtime behavior reads evaluations to decide task/workflow state
--   - `not_applicable` is `applicable = 0` with NULL score, distinct from score 0

CREATE TABLE evaluations (
  id              TEXT PRIMARY KEY,          -- per-row id (one rubric dimension)
  eval_id         TEXT NOT NULL,             -- groups the dimensions of one evaluation
  eval_type       TEXT NOT NULL,             -- workflow_eval | task_eval | worker_eval | conductor_decision_eval | verification_eval
  workflow_id     TEXT REFERENCES workflows(id),
  task_id         TEXT REFERENCES tasks(id),
  worker_id       TEXT REFERENCES worker_instances(id),
  receipt_id      TEXT REFERENCES receipts(id),
  dimension       TEXT NOT NULL,             -- rubric dimension name (see EVALS_SPEC §4)
  score           INTEGER,                   -- 0..4, NULL when not applicable
  applicable      INTEGER NOT NULL DEFAULT 1, -- 1 applicable, 0 not_applicable (distinct from score 0)
  confidence      REAL NOT NULL,             -- 0.0..1.0, reported separately from score
  evidence_refs_json TEXT NOT NULL DEFAULT '[]', -- cited Kernel ids (receipt/task/artifact/worker/state_card)
  rationale       TEXT NOT NULL,             -- plain-language, references evidence ids
  limitations     TEXT,                      -- what was missing / uncertain / not evaluated
  created_at      INTEGER NOT NULL,          -- Kernel-persisted write time
  metadata_json   TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_evaluations_eval_id ON evaluations(eval_id);
CREATE INDEX idx_evaluations_workflow ON evaluations(workflow_id);
CREATE INDEX idx_evaluations_task ON evaluations(task_id);
CREATE INDEX idx_evaluations_worker ON evaluations(worker_id);
CREATE INDEX idx_evaluations_receipt ON evaluations(receipt_id);

INSERT INTO schema_migrations (version, description, applied_at)
VALUES (2, 'goal 9: evaluations table', unixepoch() * 1000);
