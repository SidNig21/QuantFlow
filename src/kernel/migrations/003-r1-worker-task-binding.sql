-- R1 worker/task reverse binding.
-- Additive: existing WorkerInstance rows keep assigned_task_id = NULL.

ALTER TABLE worker_instances
  ADD COLUMN assigned_task_id TEXT REFERENCES tasks(id);

CREATE INDEX worker_instances_assigned_task_id
  ON worker_instances(assigned_task_id);

INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
VALUES (3, 'r1: worker assigned task binding', unixepoch() * 1000);
