# Kernel Schema v1

Canonical ontology and schema for the QuantFlow v3 Kernel.

This is the constitutional schema. Every v3 primitive has one name and one owner: the Kernel.

For authority rules governing this schema, see `docs/v3/AUTHORITY_RULES.md`.  
For type definitions, see `src/kernel/schema/types.ts`.  
For the SQL DDL, see `src/kernel/migrations/001-v3-baseline.sql`.

---

## Canonical Primitives

Fifteen canonical primitives. Do not create aliases or synonyms.

| Primitive | Table | Owner | Description |
| --- | --- | --- | --- |
| Workflow | `workflows` | Kernel | Persistent mission context. Top-level coordination unit. |
| Tile | `tiles` | Kernel | Visible canvas object. Rendered by canvas; owned by Kernel. |
| WorkerInstance | `worker_instances` | Kernel | Runtime participant. Has one Role, one Harness, one Model. |
| Role | `roles` | Kernel | The function a WorkerInstance plays. Not the Harness. Not the Model. |
| Harness | `harnesses` | Kernel | Runtime adapter type. Not the Role. Not the Model. |
| Model | `models` | Kernel | Intelligence backend. Not the Role. Not the Harness. |
| Task | `tasks` | Kernel | Coordination unit. State-machine object. Not a chat message. |
| TaskDependency | `task_dependencies` | Kernel | Declared prerequisite between tasks. |
| Receipt | `receipts` | Kernel | Append-only evidence. Proves what happened. Never deleted. |
| StateCard | `state_cards` | Kernel | Current compressed reality per tile/worker. Not history. |
| Artifact | `artifacts` | Kernel | Durable output produced during a task. |
| Event | `events` | Kernel | Append-only state-transition record. Drives renderer/watchers. |
| Connection | `connections` | Kernel | Visual link between tiles with semantic type. |
| Permission | `permissions` | Kernel | Access rule scoped to a WorkerInstance. |
| Command | `commands` | Kernel | Audit log of Kernel operation requests. |

---

## Table Definitions

### `workflows`

The top-level mission context. **Workflow IS the run instance (R3a, §10.1 resolved):
`run_id ≡ workflow_id`; no separate `runs` table.** `queryRun` projects a
references-only view (instance fields + task/artifact/receipt ids).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID. Also the `run_id`. |
| `name` | TEXT | Human-readable name |
| `objective` | TEXT | Mission statement |
| `status` | TEXT | `active`, `paused`, `complete`, `archived` |
| `active_correlation_id` | TEXT | Current active correlation chain |
| `vault_path` | TEXT | Obsidian export path (nullable) |
| `mode` | TEXT | R3a · run mode (`scout`/`research`/`deep`…), nullable; set by R6 templates |
| `budget_json` | TEXT | R3a · `{}` default. Budget **declared** here; **enforced** in R4 |
| `checkpoint_state` | TEXT | R3a · R5 human-checkpoint pause state, nullable |
| `created_at` | INTEGER | ms since epoch |
| `updated_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

> Migration `004-r3-workflow-instance.sql` adds `mode`/`budget_json`/`checkpoint_state`
> (additive, nullable). Artifacts already carry `workflow_id`, which serves as
> `run_id` — no redundant `artifacts.run_id` column is added (that would duplicate truth).

---

### `tiles`

Visible canvas objects. All tile position and status is Kernel-owned.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `workflow_id` | TEXT FK → workflows | Nullable (free tiles) |
| `display_name` | TEXT | Shown in canvas tile header |
| `tile_kind` | TEXT | `worker`, `conductor`, `viewer`, `region` |
| `x` | REAL | Canvas x position |
| `y` | REAL | Canvas y position |
| `width` | REAL | Canvas width |
| `height` | REAL | Canvas height |
| `z_index` | INTEGER | Stacking order |
| `status` | TEXT | `idle`, `active`, `blocked`, `complete`, `error` |
| `created_at` | INTEGER | ms since epoch |
| `updated_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

---

### `roles`

The function a WorkerInstance plays. Not the Harness. Not the Model.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `name` | TEXT UNIQUE | `planner`, `coder`, `verifier`, `shell`, etc. |
| `description` | TEXT | Nullable |
| `created_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

---

### `harnesses`

Runtime adapter types. Defines the available harness kinds.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `kind` | TEXT UNIQUE | `local-shell`, `herdr-shell`, `pi`, `codex`, `claude-code` |
| `description` | TEXT | Nullable |
| `config_schema_json` | TEXT | JSON schema for harness config |
| `created_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

---

### `models`

Intelligence backends available to WorkerInstances.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `provider` | TEXT | `minimax`, `claude`, `gpt`, `local`, `openrouter` |
| `name` | TEXT | Model name/version |
| `description` | TEXT | Nullable |
| `created_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

---

### `worker_instances`

Runtime participants connected to tiles.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `tile_id` | TEXT FK → tiles | Required |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `role_id` | TEXT FK → roles | Nullable |
| `harness_id` | TEXT FK → harnesses | Nullable |
| `model_id` | TEXT FK → models | Nullable |
| `status` | TEXT | `spawning`, `active`, `idle`, `stopped`, `error` |
| `permissions_json` | TEXT | `{}` — quick-access snapshot of active permissions |
| `envoy_space_id` | TEXT | Envoy space binding (nullable) |
| `herdr_pane_id` | TEXT | herdr pane binding (nullable) |
| `assigned_task_id` | TEXT FK -> tasks | Nullable; R1 reverse link to the task currently assigned to this worker |
| `created_at` | INTEGER | ms since epoch |
| `updated_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

---

### `tasks`

The coordination unit. A state-machine object owned entirely by the Kernel.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `parent_task_id` | TEXT FK → tasks | Self-referential; nullable |
| `correlation_id` | TEXT | Groups related tasks into a chain |
| `title` | TEXT | Short display title |
| `objective` | TEXT | Full task description |
| `status` | TEXT | See state machine below |
| `owner_worker_id` | TEXT FK → worker_instances | Current owner |
| `source_worker_id` | TEXT FK → worker_instances | Who created the task |
| `target_worker_id` | TEXT FK → worker_instances | Who should claim it |
| `priority` | INTEGER | `0` = normal; higher = more urgent |
| `approval_level` | TEXT | `none`, `operator`, `conductor` |
| `created_at` | INTEGER | ms since epoch |
| `updated_at` | INTEGER | ms since epoch |
| `claimed_at` | INTEGER | Nullable |
| `submitted_at` | INTEGER | Nullable |
| `verified_at` | INTEGER | Nullable |
| `completed_at` | INTEGER | Nullable |
| `metadata_json` | TEXT | `{}` |

**Task state machine:**

```text
open → claimed → working → submitted → verifying → complete
working → blocked → working
working / submitted / verifying → failed
```

The Kernel enforces all transitions. `complete` requires prior `submitted` and `verifying`.
As of v4 R1, `kernel.task.submit` requires `artifactId` or non-empty `artifactRefs`.
`kernel.task.verify` performs a structural artifact check before `verification_passed`:
the artifact row must link to the workflow/task/owning worker, its `uri` must resolve
under the allowed artifact root, the file must exist and be non-empty, and
`content_hash` must match sha256 when provided. Optional `attemptId` on submit/verify
is recorded in receipt metadata as the stable id for the same logical retry attempt.

**Status values:** `open`, `claimed`, `working`, `submitted`, `verifying`, `complete`, `blocked`, `failed`

---

### `task_dependencies`

Declared prerequisites between tasks.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `task_id` | TEXT FK → tasks | The dependent task |
| `depends_on_task_id` | TEXT FK → tasks | The prerequisite |
| `kind` | TEXT | `blocks` (default), `context_from` |
| `created_at` | INTEGER | ms since epoch |

Unique constraint: `(task_id, depends_on_task_id)`.

---

### `receipts`

Append-only evidence. Never deleted or modified.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `task_id` | TEXT FK → tasks | Nullable |
| `worker_id` | TEXT FK → worker_instances | Nullable |
| `tile_id` | TEXT FK → tiles | Nullable |
| `type` | TEXT | See canonical types below |
| `summary` | TEXT | Human-readable one-liner |
| `artifact_refs_json` | TEXT | `[]` — references to artifact IDs |
| `parent_receipt_id` | TEXT FK → receipts | For chained receipts |
| `correlation_id` | TEXT | Correlates across the chain |
| `created_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

**Canonical receipt types:**

```text
task_created
task_claimed
task_started
progress
artifact_created
task_blocked
task_submitted
verification_started
verification_passed
verification_failed
task_completed
task_failed
planning          (Goal 5A: Conductor planning evidence; not a task transition)
```

---

### `state_cards`

Current compressed reality per tile/worker. Not history. Not a chat log.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `tile_id` | TEXT FK → tiles UNIQUE | One State Card per tile |
| `worker_id` | TEXT FK → worker_instances | Nullable |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `current_task_id` | TEXT FK → tasks | Active task (nullable) |
| `status` | TEXT | `idle`, `active`, `blocked`, `complete`, `error` |
| `blocker` | TEXT | What is blocking (nullable) |
| `last_meaningful_update` | TEXT | Human-readable summary of last significant change |
| `next_action` | TEXT | What the worker/system will do next (nullable) |
| `artifacts_json` | TEXT | `[]` — recent artifact IDs |
| `last_receipt_id` | TEXT FK → receipts | Most recent receipt |
| `caveman_summary` | TEXT | Ultra-compressed single-sentence status (nullable) |
| `updated_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

**Invariant:** One row per tile. Updated in-place by the watcher. Not historical.

---

### `artifacts`

Durable outputs produced during tasks.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `task_id` | TEXT FK → tasks | Nullable |
| `worker_id` | TEXT FK → worker_instances | Nullable |
| `tile_id` | TEXT FK → tiles | Nullable |
| `receipt_id` | TEXT FK → receipts | Producing receipt (nullable) |
| `kind` | TEXT | `file`, `code`, `analysis`, `test_output`, `image`, etc. |
| `uri` | TEXT | File path or external reference (nullable) |
| `summary` | TEXT | Human-readable description (nullable) |
| `content_hash` | TEXT | SHA-256 of content (nullable) |
| `media_type` | TEXT | MIME type (nullable) |
| `size_bytes` | INTEGER | Nullable |
| `created_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

---

### `events`

Append-only state-transition history. Never deleted. Drives renderer and StateCard watchers.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `task_id` | TEXT FK → tasks | Nullable |
| `tile_id` | TEXT FK → tiles | Nullable |
| `worker_id` | TEXT FK → worker_instances | Nullable |
| `kind` | TEXT | Event kind (e.g. `tile.created`, `task.claimed`, `task.submitted`) |
| `correlation_id` | TEXT | Nullable |
| `payload_json` | TEXT | `{}` |
| `created_at` | INTEGER | ms since epoch |

**Note:** Events are distinct from receipts. Events are ephemeral coordination signals; receipts are durable evidence.

---

### `connections`

Visual links between tiles with semantic type.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `tile_a_id` | TEXT FK → tiles | One endpoint |
| `tile_b_id` | TEXT FK → tiles | Other endpoint |
| `from_tile_id` | TEXT FK → tiles | Directional source (nullable) |
| `to_tile_id` | TEXT FK → tiles | Directional target (nullable) |
| `semantic_type` | TEXT | See types below |
| `label` | TEXT | Nullable |
| `status` | TEXT | `active`, `inactive` |
| `created_at` | INTEGER | ms since epoch |
| `updated_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

**Semantic connection types** (Goal 7 adds full semantic resolution):

```text
delegation
context_flow
artifact_dependency
verification
blocker
receipt_handoff
manual_connection    ← default
```

---

### `permissions`

Access rules scoped to WorkerInstances.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `worker_id` | TEXT FK → worker_instances | Nullable (workflow-level if null) |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `resource_kind` | TEXT | `file`, `network`, `shell`, `kernel_command`, etc. |
| `resource_pattern` | TEXT | Glob or regex pattern |
| `access_level` | TEXT | `read`, `write`, `execute`, `deny` |
| `granted_by` | TEXT | Who granted (nullable) |
| `created_at` | INTEGER | ms since epoch |
| `expires_at` | INTEGER | Nullable |
| `metadata_json` | TEXT | `{}` |

---

### `commands`

Audit log of Kernel operation requests. Append-only in practice.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `command_type` | TEXT | e.g. `kernel.tile.create`, `kernel.task.claim` |
| `requested_by` | TEXT | `worker_id`, `renderer`, `conductor`, `mcp` |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `payload_json` | TEXT | `{}` |
| `result_json` | TEXT | Nullable |
| `status` | TEXT | `pending`, `accepted`, `rejected` |
| `rejection_reason` | TEXT | Nullable |
| `created_at` | INTEGER | ms since epoch |
| `completed_at` | INTEGER | Nullable |

---

### `evaluations` (migration 002, Goal 9)

Derived analysis of Kernel evidence — **not truth, not a receipt.** One row per
scored rubric dimension; rows sharing `eval_id` form one evaluation of one unit.
Evals never mutate other Kernel state and no runtime path reads them to decide
task/workflow state. See `docs/v3/EVALS_SPEC.md`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | UUID (one rubric dimension) |
| `eval_id` | TEXT | Groups the dimensions of one evaluation |
| `eval_type` | TEXT | `workflow_eval`/`task_eval`/`worker_eval`/`conductor_decision_eval`/`verification_eval` |
| `workflow_id` | TEXT FK → workflows | Nullable |
| `task_id` | TEXT FK → tasks | Nullable |
| `worker_id` | TEXT FK → worker_instances | Nullable |
| `receipt_id` | TEXT FK → receipts | Nullable |
| `dimension` | TEXT | Rubric dimension (EVALS_SPEC §4) |
| `score` | INTEGER | 0–4, NULL when `not_applicable` |
| `applicable` | INTEGER | 1 applicable, 0 `not_applicable` (distinct from score 0) |
| `confidence` | REAL | 0.0–1.0, reported separately from score |
| `evidence_refs_json` | TEXT | Cited Kernel ids |
| `rationale` | TEXT | References evidence ids |
| `limitations` | TEXT | Nullable |
| `created_at` | INTEGER | ms since epoch |
| `metadata_json` | TEXT | `{}` |

---

## Relationships Overview

```text
Workflow 1──* Tile
Workflow 1──* Task
Workflow 1──* WorkerInstance (via tile)

Tile 1──1 WorkerInstance (primary)
Tile 1──1 StateCard
Tile 1──* Connection (as tile_a or tile_b)

WorkerInstance *──1 Role
WorkerInstance *──1 Harness
WorkerInstance *──1 Model

Task 1──* Receipt
Task 1──* TaskDependency
Task 1──* Artifact (via receipts)
Task 0/1──* Task (parent_task_id self-join)

Receipt *──* Artifact (via artifact_refs_json)

StateCard *──1 Task (current_task_id)
StateCard *──1 Receipt (last_receipt_id)

Event is correlated via correlation_id and workflow_id (not FK-joined)
```

---

## Schema Version

This is `KERNEL_SCHEMA_V1`. It is the constitutional baseline.

Additions require:
1. A new migration file in `src/kernel/migrations/`.
2. Updated field tables in this document.
3. Updated `src/kernel/schema/types.ts`.
4. A note in `V3_MIGRATION_NOTES.md` if any v2 concept is affected.

Do not modify this document to reflect a non-Kernel state source. The Kernel is the only entity whose schema belongs here.
