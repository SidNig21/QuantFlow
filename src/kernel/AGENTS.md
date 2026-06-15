# src/kernel — Agent Guide

The Kernel is the sole source of truth for QuantFlow v3.

## What This Subtree Owns

All canonical state and the mutation/query boundary:

- `schema/types.ts` — TypeScript interfaces for all canonical primitives.
- `migrations/001-v3-baseline.sql` — SQLite schema DDL (v3 baseline).
- `database.ts` — SQLite singleton; opens `kernel.db`, runs baseline migration. (Goal 2)
- `events/index.ts` — EventEmitter event bus; forwards `KernelEventPayload` to subscribed WebContents. (Goal 2)
- `commands/types.ts` — `CommandResult` interface. (Goal 2)
- `commands/index.ts` — Command dispatcher; writes audit row to `commands` table, routes by prefix. (Goal 2)
- `commands/tile-commands.ts` — Tile CRUD: create, move, resize, rename, status_update, remove. (Goal 2)
- `commands/connection-commands.ts` — Connection CRUD: create, update, delete. `create`/`update` coerce `semantic_type` to a known type via `workflows/normalizeSemanticType`; `update` sets a string's semantic type/label after it is drawn. (Goal 2 + Goal 7)
- `commands/workflow-commands.ts` — Workflow CRUD: create, update. (Goal 2)
- `workflows/index.ts` — Workflow region projection: `queryWorkflowRegion`/`queryWorkflowRegionList` aggregate a workflow's member tiles (padded bounding box), task/receipt counts, blocked task ids, and semantic-string-type counts. Read-only — a projection of existing truth, not new authority. Owns the canonical `SEMANTIC_CONNECTION_TYPES` set + `normalizeSemanticType`. (Goal 7)
- `queries/index.ts` — Read-only queries: canvas snapshot, tile list/get, task list/get, receipt list, state_card list/get, workflow region/region_list. (Goal 2 + Goal 3 + Goal 4 + Goal 7)
- `tasks/state-machine.ts` — Canonical task transition table + `canTransition`/`assertTransition`. (Goal 3)
- `tasks/validators.ts` — Lifecycle guards: complete requires verifying + verification_passed receipt (or documented legacy bypass); self-verification refused. (Goal 3)
- `tasks/index.ts` — Task command handlers (create/claim/start/submit/verify/reject/complete/block/fail) + task queries. Posts a receipt for every transition. (Goal 3)
- `receipts/index.ts` — Append-only receipt store: `postReceipt`, `kernel.receipt.post`, `kernel.artifact.create`, receipt-chain query. (Goal 3)
- `state-cards/index.ts` and `watchers/index.ts` — Kernel-owned StateCard upserts/queries and the event watcher that promotes task, receipt, and tile events into current tile summaries. (Goal 4)
- `worker-instances/index.ts` — Kernel-authoritative worker identity. `ensureWorkerInstanceForTile` (one default worker per tile, harness=local-shell + default model when seeded), `spawnWorkerForTile` (role/harness/model + status='spawning'), `updateWorkerInstance` (status + herdr_pane_id/envoy_space_id), `seedHarnessRegistry` (harnesses + default model from src/harness config), worker queries. (Goal 4 link → Goal 6A authority)
- `commands/worker-commands.ts` — `kernel.worker.spawn` / `status_update` / `stop`. The shell role-spawn + herdr status paths route through these; the Kernel authorizes worker identity/status before/around the runtime, never mirroring after the fact. (Goal 6A)
- `conductor/index.ts` — read-only Conductor surface: `queryConductorContext` (aggregate read of workflow/tiles/state-cards/tasks/receipts), `queryWorkflowSnapshot`, and `kernel.conductor.plan` which appends an append-only `planning` receipt (the Conductor's only write). No task advancement. (Goal 5A)
- `evals/index.ts` — evaluations persistence (Goal 9): `kernel.eval.create` (create-only; writes one `evaluations` row per scored rubric dimension) + `queryEvaluationList`/`queryEvaluationGet`. Evaluations are DERIVED ANALYSIS, not truth — they never mutate task/worker/receipt/State-Card state and no runtime path reads them to decide Kernel state. `applicable = 0` (NULL score) is `not_applicable`, distinct from score 0. The pure scoring lives in `src/evals`. Schema added by migration `002-evaluations.sql`.
- `database.ts` migrations are now version-incremental (`MIGRATIONS` list): each migration's SQL records its own `schema_migrations` row, and `runMigrations` applies every version ahead of the DB's current version, so EXISTING dev databases gain new tables (e.g. `evaluations`), not only fresh ones.
- Future: full WorkerInstance registry — roles, harness, model, permissions, lifecycle (Goal 6).
- Future: Harness registry — configuration only, not harness implementations (Goal 6).

## Authority Rules

```text
Kernel owns truth.
All state mutations go through Kernel commands.
Do not import renderer state.
Do not let workers self-complete tasks without verification.
Receipts are append-only.
Events are append-only.
State Cards are current summaries, not history.
```

## Command Idempotency (Goal 2)

`tile.create` and `connection.create` are idempotent: a re-create of an
existing id is a no-op success (`{ ok: true }`). This lets the same canonical
create arrive via both the manual shell gate and the MCP/RPC gate, and lets
restore re-hydrate stable ids, without double-insert errors.

`tile.remove` and `connection.delete` are idempotent: a missing row is success
(the desired end state already holds). An event fires only when a row actually
changed. Because DELETE is authoritative-idempotent, the canvas-rpc path does
not need a "not found" bypass — the gate stays strict (`!ok` throws).

## What This Subtree Must Not Do

- Import from `src/renderer/`.
- Store authoritative state outside the canonical SQLite schema.
- Allow a task to transition from `working` to `complete` without `submitted` and `verifying` gates.
- Accept mutations from MCP directly — MCP tools must call Kernel commands.
- Delete or modify receipts or events.

## Canonical Task Transitions

```text
open → claimed → working → submitted → verifying → complete
working → blocked → working
working / submitted / verifying → failed
```

Enforce these transitions centrally here. Do not let callers bypass them.

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. This file
6. Relevant kernel source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
