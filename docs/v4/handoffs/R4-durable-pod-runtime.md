# v4 Rung Handoff — R4 — Durable Pod Runtime

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R0 ✅ · R1 ✅ · **R3 ✅ — Complete/approved 2026-06-21** (DAG + Workflow-as-Run
+ one task authority; Envoy is now a read-only Kernel mirror, `smoke:authority` green).

> **This is the heaviest rung — weeks, not days.** Design around *partial failure as
> the norm*, not the happy path. Build it as the ordered sub-milestones in §2 with
> separate smokes so the review surface stays bounded; do not land it as one blob.

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R4 — Durable Pod Runtime" + the **R4 row**
of the § "Eve Integration" per-rung delta table — read both as binding. This brief
front-loads essentials + the verification contract. **If brief and plan disagree, the
plan wins — flag it, don't silently pick.**

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → the child `AGENTS.md` for every folder you touch
  (`src/kernel/AGENTS.md`, `src/harness/AGENTS.md`, `src/main/conductor/AGENTS.md` if present).
- `BUILD_PLAN_V4.md` § "Goal R4" **and** § "Eve Integration" (the R4 delta + vocab locks).
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` + `docs/v3/KERNEL_SCHEMA_V1.md`
  + `docs/v3/GLOSSARY.md` (all still binding) — especially the **One Rule** (Kernel owns
  truth) and the **decision-authority rule** (workers never self-complete).
- **What R3 already built that you build ON (do not re-create):**
  - `src/kernel/workflows/index.ts` → `queryRun` (the Run projection) + `WorkflowRun`.
    **The Run/budget container already exists:** workflow columns `mode`, `budget_json`,
    `checkpoint_state` shipped in migration `004` (R3a). **Do NOT re-add budget columns.**
  - `src/main/conductor/dag-scheduler.ts` → `schedulableTasks` (pure) + `readSchedulableTasks(db, wfId)`.
  - `src/kernel/tasks/index.ts` → claim gate `unmetBlockingDependencies`, plus
    `queryTaskDependencies` / `queryVerifiedTaskIds`, and `kernel.task.depend`.
  - `src/harness/mock/index.ts` → the deterministic mock harness (multi-task capable;
    resets `collected` per send). **Your `sim` harness EXTENDS this — see §2 R4c (F11).**
  - **DB test seam (added during R3c-b):** `src/kernel/database.ts` exposes
    `setKernelDbForTesting` / `loadBetterSqlite3` so smokes inject an in-memory DB. **Use this
    pattern in `smoke:pod`** (and study `smoke:dag` / `smoke:authority` as the working examples).
  - The R1 idempotency seam: `attemptId` is already threaded onto `submit`/`verify` and
    recorded on receipt metadata — **R4 ENFORCES exactly-once on top of it** (R1 left dedup
    out on purpose).
- Seam files you will create/touch (plan § Direct Repo Scope is exhaustive):
  - `src/kernel/migrations/005-r4-runtime.sql` (additive) + `src/kernel/schema/types.ts` + `docs/v3/KERNEL_SCHEMA_V1.md`
  - `src/harness/runtime-manager/` (NEW — control plane) · `src/harness/sim/` (NEW — failure-catalog harness)
  - `src/kernel/tasks/index.ts` + `src/kernel/commands/*` (attempt-keyed exactly-once; stale-task recovery → `open`)
  - `src/kernel/worker-instances/index.ts` + `src/kernel/commands/worker-commands.ts` (mark-stale / recover commands)
  - `src/main/conductor/conductor-loop.ts` (executor checks Run budgets / stop conditions; pause on exhaustion)
  - `quantflow-electron/src/main/canvas-persistence.ts` + worker restore (reload survival)
  - `quantflow-electron/scripts/smoke-pod.ts` + `quantflow-electron/package.json` (`smoke:pod`)

## 2. Build — ordered sub-milestones (each with its own assertions)

### R4a — Schema + worker-status reconciliation + idempotency + write-concurrency
- **Migration `005-r4-runtime.sql` (additive, column-guarded):** extend
  `worker_instances` with the new status values + `auth_status` + `last_seen`. **Do NOT
  add Run/budget columns — they already exist (R3a migration 004).**
- **Worker status reconciliation map (F7) — write it in the goal result + KERNEL_SCHEMA
  before the migration.** Shipped v3 enum: `spawning | active | idle | stopped | error`.
  Territory-map R4 list: `spawning | idle | assigned | working | blocked | stale | stopped
  | failed`. **Extend the existing enum; do not fork a parallel worker state machine.**
  Rules: `assigned` = worker has a non-null `assigned_task_id`; keep `active` = "runtime
  up"; `failed` = terminal error, distinct from transient `error`. **Do NOT put task-like
  states (`working`/`blocked`) on the worker — those belong to the TASK, not the worker.**
- **Exactly-once submit/verify/complete (enforce the R1 `attemptId` seam):** a retried
  submit/verify/complete with the same `attemptId` must be idempotent — no double artifact,
  no double `task_completed`. (R1 recorded `attemptId` but did not dedup; you add the dedup.)
- **SQLite write-concurrency strategy:** SQLite is single-writer — add a strategy
  (serialized writer / WAL + busy-timeout / queue) so concurrent receipt writes from many
  workers don't contend, deadlock, or corrupt. State the chosen strategy in the goal result.

### R4b — Worker Runtime Manager (control plane, NOT a truth store)
- `src/harness/runtime-manager/` tracks many workers and drives harness verbs:
  **timeout / cancel / restart / mark-stale / recover-task.**
- **No shadow authority (F12):** the manager mutates state **only through Kernel commands**,
  never direct SQL. **Name exactly which commands** implement mark-stale and recover-task —
  use `kernel.worker.status_update` for stale/cancel/restart, and a `kernel.task.*` command
  to return a recovered task to `open` (**add `kernel.task.recover` if missing**, don't write
  rows from the manager). Worker status **truth stays in the Kernel** (`worker_instances.status`
  / State Cards); the manager reports + drives, it does not own truth.
- **`last_seen` heartbeat → stale detection:** a worker silent past a threshold is marked
  `stale` (via the command), and its in-flight task is recovered to `open` so the DAG can
  re-dispatch it through the existing claim gate.

### R4c — Simulation harness (machine proof of the failure catalog)
- `src/harness/sim/` implements the **same `WorkerHarness` contract** and fakes the full
  catalog (territory map §7): *worker succeeds · submits bad artifact · times out ·
  rate-limited · returns a blocker · verifier rejects · human-checkpoint waits · downstream
  receives a missing artifact · app reloads mid-run.*
- **One fake-harness lineage (F11):** `sim` = `mock` **+ injectable failure modes** — it
  EXTENDS/wraps `src/harness/mock` (shared spawn/handle/draft plumbing), it is **not** a
  second independently-drifting fake. State this relationship in the goal result.

### R4d — Reload survival + budget enforcement + `smoke:pod`
- **Reload survival:** on app reload, worker/task/run state is **restored from the Kernel**
  (re-derive spawned tiles + their workers + in-flight tasks). This fixes the
  "MCP-tiles-lost-on-reload" finding. Persist/restore the spawned tiles so the run continues.
- **Budget enforcement by the executor:** `conductor-loop.ts` (which stays one-approved-
  action-per-step) checks the Run's budgets/stop conditions from `workflows.budget_json`
  before dispatching — `max_workers · max_wallclock · max_spend · max_tool_calls ·
  max_retries · requires_checkpoint`. **Budget exhaustion → the run PAUSES** (it does not
  silently blow the budget). Use the R3 `dag-scheduler` for the eligible set; the loop adds
  the budget gate. Do NOT inline a second orchestrator.
- **`smoke:pod`** (`quantflow-electron/scripts/smoke-pod.ts`, wire `smoke:pod` in
  package.json), driven by the `sim` harness — see §4 for exactly what it must assert.

### Eve delta — this rung COLLAPSES for the Eve lane (read the Eve Integration § R4 row)
- **Eve workers get durability / sandbox / recovery / park-resume from Vercel Workflow
  replay — do NOT hand-build it for them.** For the Eve lane the Runtime Manager shrinks to
  a **thin control + mapping layer**: persist `task ↔ sessionId`, drive Eve cancel/recover
  via its API, consume `session.*` events → Kernel worker status, restore the mapping on
  reload (the session survives on Vercel).
- **The heavy durability engine (R4a–R4d above) is for the LOCAL lane**, which gets
  *light* durability only: **reload-survive + restart-on-fail**, NOT the full park/resume
  machinery. Build heavy durability ONCE; it's Eve's (Vercel's).
- **Driver seams only — NO cloud code.** Interfaces/seams for the Vercel path, not Vercel
  deploy/runtime code. (Hosting/deploy is a separate future decision.)

## 3. Hard guardrails — do NOT (these are the R4 Failure Signals as rules)
- Do NOT let the Runtime Manager become a **truth store** — worker status truth lives in the
  Kernel; the manager mutates only via Kernel commands (F12).
- A reload must NOT lose worker/task/run state.
- A retry must NOT double-write an artifact or double-complete a task (enforce exactly-once).
- Budgets must be **enforced**, not just declared — a run must not silently blow its budget.
- Concurrent writes must NOT corrupt or deadlock the DB.
- Do NOT invent `auth_status`/worker status outside the Kernel.
- Do NOT add cloud/production code — **driver seams only.**
- Do NOT build the human-checkpoint UI/deepen loop (R5), run templates (R6), or judgment (R7).
- Do NOT fork a second fake harness — `sim` extends `mock` (F11). Do NOT put task states on
  the worker (F7). Do NOT re-add the Run budget columns (they exist from R3a).
- A harness returns `ReceiptDraft`s; the **caller posts to the Kernel** (F4). No second truth
  store. Migration is **additive** only.
- **One rung only. Commit locally. Do NOT push. Do NOT self-approve.**

## 4. Definition of done (acceptance)

**Machine proof (CI, deterministic, `sim` harness, no auth/cost) — `bun run smoke:pod`:**
- Multiple `sim` workers run a DAG (reuse the R3 `collect→{analyze,extract}→synthesize` shape).
- **Reload mid-run → worker / task / run state survives** (restored from Kernel).
- A worker **timeout → marked `stale` → its in-flight task recovered to `open`** (and the
  scheduler re-dispatches it through the claim gate).
- **Cancel** stops a worker; **budget exceeded → the run stops/pauses** (not silent overrun).
- Each **failure-catalog** case (bad artifact / rate-limited / blocker / verifier-reject /
  missing-downstream-artifact / reload) is handled **without corrupting state**.
- A **retried submit/verify is exactly-once** — no double artifact, no double `task_completed`
  (assert by replaying the same `attemptId`).
- Concurrent receipt writes from many workers do **not** corrupt or deadlock.
- Plus unit tests: `runtime-manager` (mark-stale/recover via Kernel commands only),
  `sim` harness (failure injection), idempotency dedup.

**Product proof (operator, manual — capture evidence):** a real multi-worker run survives an
**app reload** and a **worker kill**, and recovers (the killed worker's task returns to `open`
and is re-run). Capture before/after Kernel state + the recovered receipt chain.

**Regression guard (must stay green — cumulative, Appendix A). Run from `quantflow-electron/`:**
```text
bun run smoke:kernel-task && bun run smoke:state-card && bun run smoke:conductor && \
bun run smoke:conductor-actions && bun run smoke:conductor-loop && bun run smoke:worker-harness && \
bun run smoke:harness-interface && bun run smoke:workflow-region && bun run smoke:vault-export && \
bun run smoke:eval && bun run smoke:capability-preflight && bun run smoke:task-atom && \
bun run smoke:dag && bun run smoke:authority && bun run smoke:pod && \
bun test src/main/harness-ops.test.ts && bun test src/main/diagnostics/health-runner.test.ts && \
bun test ../src/main/conductor/dag-scheduler.test.ts && bun run build
cd ../tools/quantflow-mcp && node --test
```
- **`smoke:dag`, `smoke:authority`, and `smoke:task-atom` must stay green** — proves the R3 DAG
  + one task authority + R1 atom are intact under the new runtime. The migration is **additive**;
  existing rows get the new worker columns as NULL/defaults.
- Note: `smoke:context-flow` (R2) does not exist (R2 deferred) — omit it.

## 5. Verification handoff — paste THIS back (so the verifier needs no repo access)
1. **Diff** — `git diff <last-approved-ref>..HEAD` (or: changed-files list + full contents of
   every new/changed file).
2. **Command outputs** — the **full, real** output of every §4 command (each smoke, the
   regression stack, the build), pass/fail, **no trimming of failures**.
3. **Self-assessment** — a table: each §4 acceptance criterion → met / not-met → evidence line.
4. **Notes** — the resolved decisions this rung required: the **worker-status reconciliation
   map** (F7), the named **mark-stale / recover-task commands** (F12), the **write-concurrency
   strategy**, the **`sim` = `mock` + failures** relationship (F11), and the **Eve-vs-local
   durability split** (what's a Vercel-Workflow driver seam vs hand-built local light
   durability). Flag any scope deviation or guardrail you were tempted to cross.

> Verifier rule: R4 is approved only when the diff matches scope, every §4 command is green in
> the pasted output, no guardrail is tripped (esp. *no cloud code*, *manager-not-a-truth-store*,
> *exactly-once*, *reload-survival*), and the §4 Notes decisions are all resolved. Workers never
> self-approve.
