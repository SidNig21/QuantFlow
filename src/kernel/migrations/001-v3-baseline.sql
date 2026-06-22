-- Kernel Schema v1 — Baseline Migration
-- Branch: quantflow-v3
-- Goal 1: Constitutional schema definition
--
-- This is the v3 Kernel canonical schema. It is NOT a migration of the
-- existing v2 runtime database at quantflow-electron/src/main/runtime-state/.
-- Goal 2 will wire the Kernel command/query boundary to the application.
--
-- Authority: docs/v3/KERNEL_SCHEMA_V1.md
-- Rules:     docs/v3/AUTHORITY_RULES.md
-- Types:     src/kernel/schema/types.ts
--
-- Invariants enforced by the application layer (not SQL alone):
--   - receipts and events are append-only (no UPDATE or DELETE)
--   - task status transitions follow the canonical state machine
--   - state_cards has exactly one row per tile_id (upserted, not appended)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Schema version tracking
-- ---------------------------------------------------------------------------

CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  description TEXT    NOT NULL,
  applied_at  INTEGER NOT NULL
);

INSERT INTO schema_migrations (version, description, applied_at)
VALUES (1, 'v3 baseline: canonical kernel schema', unixepoch() * 1000);

-- ---------------------------------------------------------------------------
-- Roles
-- The function a WorkerInstance plays. Not the Harness. Not the Model.
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,  -- 'planner', 'coder', 'verifier', 'shell'
  description  TEXT,
  created_at   INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Harnesses
-- Runtime adapter types. role ≠ harness ≠ model.
-- ---------------------------------------------------------------------------

CREATE TABLE harnesses (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL UNIQUE,  -- 'local-shell', 'herdr-shell', 'pi', 'codex', 'claude-code'
  description        TEXT,
  config_schema_json TEXT NOT NULL DEFAULT '{}',
  created_at         INTEGER NOT NULL,
  metadata_json      TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Models
-- Intelligence backends. role ≠ harness ≠ model.
-- ---------------------------------------------------------------------------

CREATE TABLE models (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,  -- 'minimax', 'claude', 'gpt', 'local', 'openrouter'
  name        TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Workflows
-- Top-level mission context. All tiles, tasks, and receipts belong to a workflow.
-- ---------------------------------------------------------------------------

CREATE TABLE workflows (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  objective             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active',  -- 'active', 'paused', 'complete', 'archived'
  active_correlation_id TEXT,
  vault_path            TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  metadata_json         TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Tiles
-- Visible canvas objects. All tile state is Kernel-owned.
-- Canvas renders tiles from Kernel snapshots; canvas never writes tile state.
-- ---------------------------------------------------------------------------

CREATE TABLE tiles (
  id            TEXT PRIMARY KEY,
  workflow_id   TEXT REFERENCES workflows(id),
  display_name  TEXT NOT NULL,
  tile_kind     TEXT NOT NULL DEFAULT 'worker',  -- 'worker', 'conductor', 'viewer', 'region'
  x             REAL NOT NULL DEFAULT 0,
  y             REAL NOT NULL DEFAULT 0,
  width         REAL NOT NULL DEFAULT 320,
  height        REAL NOT NULL DEFAULT 240,
  z_index       INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'idle',    -- 'idle', 'active', 'blocked', 'complete', 'error'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX tiles_workflow_id ON tiles(workflow_id);

-- ---------------------------------------------------------------------------
-- WorkerInstances
-- Runtime participants. Has exactly one Role, one Harness, and one Model.
-- ---------------------------------------------------------------------------

CREATE TABLE worker_instances (
  id               TEXT PRIMARY KEY,
  tile_id          TEXT NOT NULL REFERENCES tiles(id),
  workflow_id      TEXT REFERENCES workflows(id),
  role_id          TEXT REFERENCES roles(id),
  harness_id       TEXT REFERENCES harnesses(id),
  model_id         TEXT REFERENCES models(id),
  status           TEXT NOT NULL DEFAULT 'spawning',  -- 'spawning', 'active', 'idle', 'stopped', 'error'
  permissions_json TEXT NOT NULL DEFAULT '{}',
  envoy_space_id   TEXT,
  herdr_pane_id    TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  metadata_json    TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX worker_instances_tile_id ON worker_instances(tile_id);
CREATE INDEX worker_instances_workflow_id ON worker_instances(workflow_id);

-- ---------------------------------------------------------------------------
-- Tasks
-- The coordination unit. A state-machine object owned by the Kernel.
-- State machine: open → claimed → working → submitted → verifying → complete
-- Side paths:    working → blocked → working
--               working/submitted/verifying → failed
-- ---------------------------------------------------------------------------

CREATE TABLE tasks (
  id               TEXT PRIMARY KEY,
  workflow_id      TEXT REFERENCES workflows(id),
  parent_task_id   TEXT REFERENCES tasks(id),
  correlation_id   TEXT NOT NULL,
  title            TEXT NOT NULL,
  objective        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  -- valid: 'open', 'claimed', 'working', 'submitted', 'verifying', 'complete', 'blocked', 'failed'
  owner_worker_id  TEXT REFERENCES worker_instances(id),
  source_worker_id TEXT REFERENCES worker_instances(id),
  target_worker_id TEXT REFERENCES worker_instances(id),
  priority         INTEGER NOT NULL DEFAULT 0,
  approval_level   TEXT NOT NULL DEFAULT 'none',  -- 'none', 'operator', 'conductor'
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  claimed_at       INTEGER,
  submitted_at     INTEGER,
  verified_at      INTEGER,
  completed_at     INTEGER,
  metadata_json    TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX tasks_correlation_id ON tasks(correlation_id);
CREATE INDEX tasks_status ON tasks(status);

-- ---------------------------------------------------------------------------
-- TaskDependencies
-- Declared prerequisites between tasks.
-- ---------------------------------------------------------------------------

CREATE TABLE task_dependencies (
  id                  TEXT PRIMARY KEY,
  task_id             TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id  TEXT NOT NULL REFERENCES tasks(id),
  kind                TEXT NOT NULL DEFAULT 'blocks',  -- 'blocks', 'context_from'
  created_at          INTEGER NOT NULL,
  UNIQUE(task_id, depends_on_task_id)
);

-- ---------------------------------------------------------------------------
-- Receipts
-- Append-only evidence. NEVER deleted or modified after creation.
-- ---------------------------------------------------------------------------

CREATE TABLE receipts (
  id                TEXT PRIMARY KEY,
  workflow_id       TEXT REFERENCES workflows(id),
  task_id           TEXT REFERENCES tasks(id),
  worker_id         TEXT REFERENCES worker_instances(id),
  tile_id           TEXT REFERENCES tiles(id),
  type              TEXT NOT NULL,
  -- canonical: task_created, task_claimed, task_started, progress, artifact_created,
  --            task_blocked, task_submitted, verification_started, verification_passed,
  --            verification_failed, task_completed, task_failed,
  --            human_decision (R5 checkpoint selection),
  --            planning (Goal 5A: Conductor planning evidence; not a task transition)
  summary           TEXT NOT NULL DEFAULT '',
  artifact_refs_json TEXT NOT NULL DEFAULT '[]',
  parent_receipt_id TEXT REFERENCES receipts(id),
  correlation_id    TEXT,
  created_at        INTEGER NOT NULL,
  metadata_json     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX receipts_task_id ON receipts(task_id);
CREATE INDEX receipts_correlation_id ON receipts(correlation_id);

-- ---------------------------------------------------------------------------
-- StateCards
-- Current compressed reality per tile/worker. NOT history. NOT a chat log.
-- One row per tile_id. Updated in-place by the watcher.
-- ---------------------------------------------------------------------------

CREATE TABLE state_cards (
  id                     TEXT PRIMARY KEY,
  tile_id                TEXT NOT NULL UNIQUE REFERENCES tiles(id),
  worker_id              TEXT REFERENCES worker_instances(id),
  workflow_id            TEXT REFERENCES workflows(id),
  current_task_id        TEXT REFERENCES tasks(id),
  status                 TEXT NOT NULL DEFAULT 'idle',
  blocker                TEXT,
  last_meaningful_update TEXT,
  next_action            TEXT,
  artifacts_json         TEXT NOT NULL DEFAULT '[]',
  last_receipt_id        TEXT REFERENCES receipts(id),
  caveman_summary        TEXT,
  updated_at             INTEGER NOT NULL,
  metadata_json          TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Artifacts
-- Durable outputs produced during tasks.
-- ---------------------------------------------------------------------------

CREATE TABLE artifacts (
  id            TEXT PRIMARY KEY,
  workflow_id   TEXT REFERENCES workflows(id),
  task_id       TEXT REFERENCES tasks(id),
  worker_id     TEXT REFERENCES worker_instances(id),
  tile_id       TEXT REFERENCES tiles(id),
  receipt_id    TEXT REFERENCES receipts(id),
  kind          TEXT NOT NULL,  -- 'file', 'code', 'analysis', 'test_output', 'image', etc.
  uri           TEXT,
  summary       TEXT,
  content_hash  TEXT,
  media_type    TEXT,
  size_bytes    INTEGER,
  created_at    INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX artifacts_task_id ON artifacts(task_id);

-- ---------------------------------------------------------------------------
-- Events
-- Append-only state-transition history. NEVER deleted or modified.
-- Drives canvas re-renders and StateCard watchers.
-- ---------------------------------------------------------------------------

CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  workflow_id   TEXT REFERENCES workflows(id),
  task_id       TEXT REFERENCES tasks(id),
  tile_id       TEXT REFERENCES tiles(id),
  worker_id     TEXT REFERENCES worker_instances(id),
  kind          TEXT NOT NULL,
  correlation_id TEXT,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);

CREATE INDEX events_workflow_id ON events(workflow_id);
CREATE INDEX events_tile_id ON events(tile_id);
CREATE INDEX events_correlation_id ON events(correlation_id);

-- ---------------------------------------------------------------------------
-- Connections
-- Visual links between tiles. Semantic type added in Goal 7.
-- ---------------------------------------------------------------------------

CREATE TABLE connections (
  id             TEXT PRIMARY KEY,
  workflow_id    TEXT REFERENCES workflows(id),
  tile_a_id      TEXT NOT NULL REFERENCES tiles(id),
  tile_b_id      TEXT NOT NULL REFERENCES tiles(id),
  from_tile_id   TEXT REFERENCES tiles(id),
  to_tile_id     TEXT REFERENCES tiles(id),
  semantic_type  TEXT NOT NULL DEFAULT 'manual_connection',
  -- types: delegation, context_flow, artifact_dependency, verification,
  --        blocker, receipt_handoff, manual_connection
  label          TEXT,
  status         TEXT NOT NULL DEFAULT 'active',  -- 'active', 'inactive'
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  metadata_json  TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Permissions
-- Access rules scoped to WorkerInstances.
-- ---------------------------------------------------------------------------

CREATE TABLE permissions (
  id               TEXT PRIMARY KEY,
  worker_id        TEXT REFERENCES worker_instances(id),
  workflow_id      TEXT REFERENCES workflows(id),
  resource_kind    TEXT NOT NULL,     -- 'file', 'network', 'shell', 'kernel_command', etc.
  resource_pattern TEXT NOT NULL,
  access_level     TEXT NOT NULL,     -- 'read', 'write', 'execute', 'deny'
  granted_by       TEXT,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER,
  metadata_json    TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Commands
-- Audit log of Kernel operation requests.
-- ---------------------------------------------------------------------------

CREATE TABLE commands (
  id               TEXT PRIMARY KEY,
  command_type     TEXT NOT NULL,  -- e.g. 'kernel.tile.create', 'kernel.task.claim'
  requested_by     TEXT,           -- worker_id, 'renderer', 'conductor', 'mcp'
  workflow_id      TEXT REFERENCES workflows(id),
  payload_json     TEXT NOT NULL DEFAULT '{}',
  result_json      TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected'
  rejection_reason TEXT,
  created_at       INTEGER NOT NULL,
  completed_at     INTEGER
);

CREATE INDEX commands_workflow_id ON commands(workflow_id);
CREATE INDEX commands_status ON commands(status);
