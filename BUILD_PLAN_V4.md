# QuantFlow v4 Build Scope Plan

Branch: `quantflow-v4`
Base branch: `quantflow-v3`
Planning mode: Goal Sessions (one rung at a time)
Execution rule: one goal at a time; no parallel architecture tracks unless explicitly approved.

---

## Authority & reading order

v4 does **not** replace the v3 authority documents — it extends them. Read, in order:

1. Applicable `AGENTS.md` chain (root first, then the child for the target folder).
2. `docs/v4/V4_TERRITORY_MAP.md` — the full v4 territory, the four bands, the rung
   spine, the anti-swamp rule, and the open decisions. **This build plan is the
   promotion target; the territory map is the locked reference every goal is
   checked against.**
3. `BUILD_PLAN_V3.md` — shipped v3 ladder (Goals 0–9) and the goal-shape convention.
4. `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` + `docs/v3/KERNEL_SCHEMA_V1.md`
   + `docs/v3/GLOSSARY.md` — the One Rule, mutation/query paths, the 15 locked
   primitives, the task state machine. **All still binding in v4.**
5. This file's current goal.
6. Relevant repo files.

Nothing in this file or the territory map is authorized work until the operator
promotes a goal and explicitly authorizes it (one at a time). Workers never
approve their own goal completion.

---

## v4 in one frame

v3 is a governed, **operator-driven** orchestration surface: the task lifecycle,
receipts, verification gates, State Cards, and canvas visibility all work — but a
human clicks the buttons and **no real work happens**.

v4 is a **research-run operating system**: many real agents doing real work,
artifacts flowing between them, humans steering at checkpoints, runs lasting
minutes to overnight, output you can trust.

> v3 proved the courthouse works. v4 has to run real trials — many at once,
> overnight — with verdicts you trust.

It is **not a rewrite.** The v3 backbone (Kernel owns truth · Conductor plans ·
Harness adapts · Workers execute · Receipts prove · State Cards summarize · Vault
mirrors · Evals judge) survives intact. v4 adds four bands onto it — **A
Execution · B Flow · C Control · D Judgment & Compounding** — across an
8-rung spine. See territory map §1, §4, §8.

---

## v4 constitutional additions

The v3 **One Rule is unchanged**: *Kernel owns truth. Everything else derives.*
v4 adds three lines (territory map §2):

1. **Authority consolidation** — *Kernel decides. Envoy mirrors, bridges,
   exports, or displays.* Must be in force before dependency graphs get complex
   (by Rung 3).
2. **Anti-swamp rule** — *Every new system attaches to the atom or to the next
   rung.* No system is built at full size; only its smallest atom-adjacent
   version.
3. **Decision-authority rule** — *Kernel is terminal authority on truth. The
   human is terminal authority on decisions.* Workers never self-complete (Kernel
   verifies); agents never auto-decide (a run produces a briefing, not a committed
   action).

**Vocabulary impact is deliberately tiny.** Only `Run` is a candidate new
primitive and must be resolved against the vocab lock before it is named (open
decision §10.1). `Artifact` and `Permission` already exist in the lock;
`RunReplay`/`CostTelemetry`/`ContextEnvelope` are derived projections;
`SimulationHarness` is a `Harness` implementation. Do not coin new names for
existing concepts.

---

## Goal naming convention

v4 goals are named by their **rung number** to stay aligned with the territory
map (the authority), e.g. `Goal R0`, `Goal R1`. (This avoids the off-by-one trap
of "Goal 1 = Rung 0".) Detailed goal shapes are promoted **one rung at a time**;
they are written here, not in the territory map.

---

## The rung spine (orientation only — territory map §8 is authoritative)

| Rung | Name | Band | Done when (one line) |
| --- | --- | --- | --- |
| R0 | Auth / capability preflight *(parallel track)* | A (env) | one real worker reliably authed + ready; an operator-visible preflight report shows tool/provider/harness status |
| R1 | One real task atom | A | a Conductor task is executed by a worker, produces an artifact, verify provably opens it; mock green in CI, real green in dogfood |
| R2 | Upstream artifact → downstream context | B | worker B consumes worker A's verified artifact via a context envelope |
| R3 | Small DAG + authority consolidation | B | `collect→analyze→synthesize` with one parallel branch; Envoy resolved to mirror/bridge |
| R4 | Durable pod runtime | C | multiple workers, reload survival, stale/cancel/timeout, budget-bounded |
| R5 | Human checkpoint / deepen loop | C | run pauses, surfaces candidates, human picks, deepening tasks spawn |
| R6 | Run templates | B/C | a named run mode (Scout/Research/Deep) executes the full loop |
| R7 | Judgment & compounding | D | a completed run has a readable replay, a decision log, and an outcome→lesson trace |

Difficulty is back-loaded: R0–R1 are the smallest keystone; the real weight is
R4 and R7. Do not mistake "the atom works" for "v4 is done."

---

## Promotion discipline

```text
1. Operator promotes ONE rung at a time and explicitly authorizes it.
2. Worker implements only that goal's scope.
3. Worker submits the goal result + the verification evidence below.
4. Verifier checks the result against this goal's Acceptance Test and Regression Guard.
5. Verifier updates the ledger if approved, and pushes the approved branch state.
6. Operator authorizes the next rung.
```

Each rung ships and verifies independently on **both proof tracks**: a
deterministic sim/mock (machine proof, CI-safe, no auth, no cost) and one real
authed run (product proof). No rung's acceptance may depend *solely* on
real-agent auth (territory map §7).

---

# v4 Goal Status

This section is the durable progress ledger for the v4 branch.

| Goal | Status | Worker | Verifier | Verified date | Notes |
| --- | --- | --- | --- | --- | --- |
| R0 — Auth / capability preflight | Scoped / awaiting authorization | — | — | — | Extends the existing `diagnostics/` health-probe framework with a `capability` group; derived report only, no Kernel schema change. |
| R1 — One real task atom | Scoped / awaiting authorization | — | — | — | Wires the existing `kernel.artifact.create` into the task atom, binds worker via `harness.send`, and replaces `taskVerify`'s rubber-stamp with a structural artifact check. One additive migration (`worker_instances.assigned_task_id`); registers a `mock` harness for CI. |
| R2–R7 | Not yet scoped | — | — | — | — |

---

# Goal R0 — Auth / Capability Preflight

> Band A (environment) · parallel track · territory map §8 rung 0, §5 (policy
> envelope — "preflight-report-not-Settings"), §7 (two proof tracks), §9
> (credential accessor seam).

## Goal

Give the operator (and, later, the Conductor) a **truthful, at-a-glance answer to
"can this machine actually run a real worker right now, and with what?"** —
before any real task depends on it.

Today the app can tell whether an agent CLI is *installed*
(`role-service.ts` → `withRoleDiagnostics` sets `commandAvailable`). It cannot
tell whether that CLI is **authenticated and ready to run**, whether the
herdr/WSL spawn path is reachable, or whether a model provider has a working
credential. R0 closes that gap with a **capability preflight**: a set of probes
that classify each spawn-rail capability as present / reachable / authed / ready,
surfaced in an **operator-visible report**, and proven by getting **one real
worker reliably authed and ready** end-to-end.

R0 is a **derived, read-only report**. It does not spawn work, does not store a
new source of truth, and does not change spawn behavior.

## Why

The first live end-to-end runs (dogfooding sessions, `docs/v3/INCOMING_GOALS.md`)
found that the blocker for real autonomous work is **agent-side: CLI auth and
operator usage limits, plus intermittent herdr-wsl reachability** — *not* the
Kernel task spine. The territory map makes R0 the parallel track that R1's "real
half" depends on: you cannot prove "one real task executed by a real worker"
until at least one real worker is reliably authed and ready, and you cannot
debug that without a report that distinguishes *installed* from *authed* from
*reachable*. Presence ≠ readiness is the entire point of this rung.

R0 is also where two cheap, permanent seams from territory map §9 get adopted
early so they are never a retrofit:
- **credentials go through one accessor** (Electron `safeStorage` today);
- capability status is a **derived probe result**, never Kernel truth.

## Direct Repo Scope

Extend the **existing** diagnostics health-probe framework — do **not** invent a
parallel one.

Create or update:

```text
quantflow-electron/src/main/diagnostics/types.ts            (add "capability" to HealthGroup; capability result shape)
quantflow-electron/src/main/diagnostics/capability-probes.ts (NEW — the preflight probes)
quantflow-electron/src/main/diagnostics/capability-probes.test.ts (NEW — machine proof, injected fakes)
quantflow-electron/src/main/diagnostics/preflight.ts         (NEW — runPreflight() façade over runHealth for the capability group)
quantflow-electron/src/main/diagnostics/preflight.test.ts    (NEW — deterministic report aggregation/render)
quantflow-electron/src/main/credentials/credential-accessor.ts (NEW — single getCredential() seam over safeStorage)
quantflow-electron/src/main/credentials/credential-accessor.test.ts (NEW)
quantflow-electron/src/main/role-service.ts                  (reuse/export getRoleCommandName + commandExists; do not duplicate)
quantflow-electron/src/main/ipc-*.ts (or existing diagnostics IPC)  (expose preflight:run / preflight:snapshot, read-only)
quantflow-electron/src/windows/shell/...                     (a minimal read-only preflight report view/panel)
cli/qf.mjs (and wiring)                                      (OPTIONAL: `qf preflight` prints the capability matrix)
docs/v4/V4_TERRITORY_MAP.md                                  (no change — reference only)
BUILD_PLAN_V4.md                                             (ledger update on approval — verifier only)
```

### Capability model (illustrative shape, align to existing `ProbeCheckResult`)

Reuse `HealthProbe` / `runProbe` / `runHealth` and the `healthy|degraded|down`
levels. A capability probe's `detail` block carries the structured status:

```ts
// detail on a capability ProbeCheckResult
{
  capabilityId: string;        // e.g. "role:codex", "harness:herdr-wsl", "provider:claude"
  kind: "role" | "harness" | "provider";
  present: boolean;            // binary install/exists check
  reachable: boolean;          // runtime path (WSL/herdr/socket/network) responds
  authed: boolean | null;      // logged-in / credential valid; null = not auth-bearing
  ready: boolean;              // present && reachable && (authed !== false)
  checkedAt: string;           // ISO
}
// level mapping: ready -> healthy ; present-but-not-ready -> degraded ; absent/unreachable -> down
// `remediation` (already on HealthProbe) carries the one-line operator fix hint.
```

### Probes to implement (capability group)

1. **Agent-CLI readiness, one per spawn-rail role** that has a `commandTemplate`
   (`codex`, `claude-worker`/`claude-reviewer` → `claude`, `opencode`, `hermes`):
   - `present`: reuse `commandExists(getRoleCommandName(role))` from
     `role-service.ts` (covers `where.exe`/`which` + WSL `command -v` fallback).
   - `authed`: run a **bounded, non-interactive** readiness command per CLI
     (e.g. a `--version` / status / whoami that exits non-zero or prints a
     "not logged in" signal when unauthenticated). Where no clean non-interactive
     auth command exists, the documented fallback is a **bounded** interactive
     spawn that polls for the agent prompt via `isAgentPromptReady` /
     `waitForWorkflowAgentPrompt` (`workflow-agent-ready.ts`) and reports
     `ready`. Each CLI's probe config (command + how to classify authed) lives in
     a small per-CLI table, injectable for tests.
2. **herdr-wsl reachability** (`harness:herdr-shell`):
   - WSL present, herdr socket/pane RPC reachable, and the **UNC cwd path
     resolves** (the known intermittent `windows-node-proxy UNC` blocker from the
     dogfooding notes). Classify `reachable` / `down` with a remediation hint
     (normalize UNC → drive path). This probe makes the herdr blocker *visible*;
     it does not have to fully fix the spawn path — but R0's product proof (below)
     requires at least one real herdr-wsl worker to reach ready, so the minimal
     reachability fix needed to achieve that is in scope.
3. **local-shell / windows-pty** (`harness:local-shell`):
   - The always-available baseline. Should always report `ready` on a supported
     platform so the report is never empty and there is a guaranteed-green lane.
4. **Model provider readiness** (`provider:<id>`), behind the existing
   `ConductorModelProvider` abstraction (`src/main/conductor/model-provider.ts`):
   - `present`/`authed`: a credential exists via the **new `getCredential()`
     accessor** (safeStorage). `reachable`: a **cheap** reachability check (e.g. a
     lightweight models-list/ping) — explicitly avoid any call that consumes
     paid tokens or runs a real completion. The shipped `manual` provider (no
     network, no secret) always reports `ready`.

### Operator-visible report (not a Settings UI)

- A read-only `runPreflight()` façade (over `runHealth({ probeNames: capability… })`)
  returning a `ControllerHealth`-shaped result filtered to the capability group.
- An IPC entry (reuse the diagnostics IPC if present) `preflight:run` /
  `preflight:snapshot` — **read-only**, returns the report; never mutates.
- A **minimal in-app report view**: one row per capability with a status badge
  (green/amber/red mapped from `healthy|degraded|down`), the one-line message, and
  `remediation`. This is a *report*, not configuration — no credential editing,
  no provider setup forms.
- OPTIONAL but recommended: `qf preflight` CLI subcommand (the `qf` wrapper
  already ships via `cli-installer.ts`) that prints the same matrix — the
  cheapest operator-visible, scriptable report.

## Out of Scope (defer to the R0 / distribution axis — territory map §9)

- No Settings UI for credentials, provider setup, or capability configuration.
- No credential **manager** (only the single `getCredential()` accessor seam).
- No capability **registry**, packaging, signing, or auto-install of CLIs.
- No **broad** permission enforcement (shell/network/provider-key/vault/browser).
- No `worker_instances.auth_status` column or any Kernel schema migration — auth
  status is a **derived probe result** here; the schema field is reserved for
  Band C (Runtime Manager, R4).
- No change to spawn behavior; the preflight never auto-spawns or auto-auths.
- No fixing usage-limit/billing economics (environmental; out of code scope).
- No Conductor consumption of the report yet (a later rung may add a read-tool;
  R0 only produces the report).

## Tool / URL Requirements

- Existing repo seams: `diagnostics/{types,probes,health-runner}.ts`,
  `role-service.ts`, `workflow-agent-ready.ts`, `conductor/model-provider.ts`,
  `harness-service.ts`, `cli-installer.ts`.
- Electron `safeStorage` API (credential accessor).
- The agent CLIs themselves for the real proof: WSL + at least one of
  `codex` / `claude` reachable and authenticatable by the operator.

## Acceptance Test (the completion signal)

R0 is complete only when **all** of the following hold.

### Machine proof (CI-safe, no auth, no network, no cost)

- `capability-probes.test.ts` drives every probe with **injected fakes** and
  asserts the full matrix:
  - present + authed + reachable → `ready` / `healthy`;
  - present + not authed → `degraded`, `authed:false`, `ready:false`, with a
    remediation hint;
  - absent command → `down`, `present:false`;
  - herdr unreachable / UNC unresolved → `down` with remediation;
  - non-auth-bearing capability (local-shell, manual provider) → `authed:null`,
    `ready:true`.
- `preflight.test.ts` asserts `runPreflight()` aggregates levels deterministically
  (worst-of, matching `aggregateLevel`) and the report render is stable
  (sorted, no timestamps in the compared body).
- `credential-accessor.test.ts` asserts get/has behavior over an injected
  storage fake (no real safeStorage in CI).

### Operator-visible report (verified live, capture evidence)

- Launching the app (or `qf preflight`) shows a capability row for **every**
  spawn-rail role + each harness + each configured provider, each with
  present/reachable/authed/ready and a remediation line where not ready.
- `local-shell` shows green on the dev machine (the guaranteed baseline).
- A CLI that is installed-but-not-logged-in shows **amber "present, not
  authenticated"** — NOT green. (This is the core proof that presence ≠ readiness.)

### Product proof (one real worker — capture evidence)

> **The real worker spawn is a manual verification action, not something the
> preflight performs.** For product proof only, the operator manually
> starts/authenticates one real worker using the normal worker path. The
> preflight report *observes* readiness; it never *initiates* the worker. This
> protects the read-only / never-auto-spawn rule above.

- The operator authenticates one real agent (recommend `claude-worker` or
  `codex` via herdr-wsl — session-2 confirmed a real herdr-wsl agent can come up
  `running`). That worker **spawns and reaches its interactive prompt**
  (`isAgentPromptReady` true), and its capability probe flips to
  `ready / healthy` in the report. Capture a screenshot/printout of the report
  before (amber) and after (green) auth.

### Regression Guard (do not break v3 — this is the "doesn't mess anything up" check)

All of these must still pass, unchanged, after R0:

```text
cd quantflow-electron
bun run smoke:kernel-task
bun run smoke:state-card
bun run smoke:conductor
bun run smoke:conductor-actions
bun run smoke:conductor-loop
bun run smoke:worker-harness
bun run smoke:harness-interface
bun run smoke:workflow-region
bun run smoke:vault-export
bun run smoke:eval
bun test src/main/harness-ops.test.ts
bun test src/main/diagnostics/health-runner.test.ts   # existing health framework intact
bun run build

cd ../tools/quantflow-mcp && node --test
```

- No change to `kernel.db` schema, `KERNEL_SCHEMA_V1`, or the task state machine.
- No new Kernel command, receipt type, or event kind.
- The existing 14 diagnostics probes and their results are unchanged; the new
  capability probes are additive under a new `capability` group.

## Failure Signals

- Preflight reports **green for a CLI that is installed but not authenticated**
  (presence mistaken for readiness) — defeats the rung's whole purpose.
- Preflight **mutates** Kernel/worker/task state, or writes any `kernel.*`
  command — it must be derived and read-only.
- An `auth_status` column or any new truth store is added — reserved for Band C.
- The work grows into a **Settings/credential-management UI** or a capability
  registry — scope creep into the deferred R0/distribution axis.
- A provider readiness check **spends paid tokens** or runs a real completion.
- Credentials are read from more than one place instead of the single
  `getCredential()` accessor.
- A second health/probe framework is created instead of extending
  `diagnostics/`.
- Any existing v3 smoke, the diagnostics health test, the MCP tests, or
  `bun run build` regresses.

## Handoff Block

```text
Branch quantflow-v4.
Read order: applicable AGENTS.md chain → docs/v4/V4_TERRITORY_MAP.md →
BUILD_PLAN_V3.md → KERNEL_CONSTITUTION.md + docs/v3/AUTHORITY_RULES.md →
this goal (R0).

Goal R0 is the auth/capability preflight (territory map rung 0). It is a DERIVED,
READ-ONLY report — it never writes Kernel truth, never adds schema, never spawns
or auto-auths.

Build by EXTENDING the existing diagnostics health-probe framework
(quantflow-electron/src/main/diagnostics/) with a new `capability` group. Reuse
role-service.ts (commandExists / getRoleCommandName), workflow-agent-ready.ts
(isAgentPromptReady) for the readiness signal, and the ConductorModelProvider
abstraction for the provider probe. Add ONE credential accessor (safeStorage).

Two proof tracks are mandatory:
- Machine proof: probes + report unit-tested with injected fakes (CI, no auth).
- Product proof: one real authed worker reaches its prompt and flips its
  capability to green in the report.

Presence is NOT readiness — an installed-but-unauthed CLI MUST show amber, not
green. That single behavior is the heart of this goal.

Do not: build a Settings/credential UI, a credential manager, a capability
registry, broad permission enforcement, an auth_status column, or any Kernel
schema migration. Do not spend paid tokens in a probe.

Run the full Regression Guard before submitting. Commit locally before handoff;
the verifier reviews the diff, updates the BUILD_PLAN_V4 ledger if approved, and
pushes.
```

---

# Goal R1 — One Real Task Atom

> Band A (execution) · the keystone · territory map §4 Band A, §5 (Artifact
> record + structural verification checklist), §8 rung 1, §10.3 (artifact storage
> root), §10.5 (idempotency seam — design now, enforce in C).

## Goal

Make **one** Conductor-driven task do **real work, end to end, with proof**: the
task is assigned to a real worker, the instruction is delivered to that worker
through the harness `send` seam (not terminal paste), the worker produces a real
**artifact**, the task is submitted **with** that artifact, and verification
**provably opens and checks the artifact** before the task is allowed to complete.

This is the keystone of v4. v3 proved the *process* (a task can move
`created → claimed → started → submitted → verifying → complete` with a full
receipt chain) but the operator clicked the buttons and **no work happened** —
the artifact plumbing exists but nothing flows through it, and `taskVerify`
rubber-stamps completion without ever reading an artifact. R1 closes that gap on
exactly one task, on two proof tracks (a deterministic mock harness in CI; one
real authed worker in dogfood).

R1 is deliberately the *smallest* important rung: no second task, no DAG, no
multi-worker, no semantic judgment. Just the atom.

## Why

From the first live end-to-end run (`docs/v3/INCOMING_GOALS.md`, headline
candidate): the Conductor drove a task through the full receipt chain, but
`tasks.owner_worker_id` was left `null`, the worker sat idle, no artifact was
produced, and Submit/Verify carried no artifact. The territory map names three
fixes — task→worker delivery, worker executes, report-with-proof — and makes them
the keystone "everything else is multiplication."

The seams already exist, which is what keeps R1 an atom:
- `kernel.artifact.create` ([receipts/index.ts]) already inserts an artifact row
  + posts `artifact_created` and backfills `receipt_id`.
- `kernel.task.submit` already accepts `artifactRefs` (but does not require them).
- `WorkerHarness.send/readState/collectReceipts` ([src/harness/types.ts]) is a
  shipped contract.
- `tasks.owner_worker_id` and the `artifacts` table (`task_id`/`worker_id`/`uri`/
  `content_hash`/`kind`) already exist.

What is missing — and what R1 builds — is the **wiring and the gates**: bind the
worker and push the instruction through `send`; require an artifact on submit;
and make `taskVerify` **structural** instead of a rubber stamp.

## Direct Repo Scope

Create or update:

```text
src/kernel/artifacts/verify.ts            (NEW — structural verification helpers, fs injectable)
src/kernel/artifacts/verify.test.ts       (NEW — machine proof for the structural checklist)
src/kernel/tasks/index.ts                 (submit requires an artifact; verify runs the structural gate)
src/kernel/tasks/validators.ts            (add: no-submit-without-artifact; structural-pass-before-complete)
src/kernel/migrations/00X-r1-worker-task-binding.sql (NEW — additive: worker_instances.assigned_task_id)
src/kernel/schema/types.ts                (add assigned_task_id to the worker row type)
docs/v3/KERNEL_SCHEMA_V1.md               (document the new column + migration)
src/kernel/worker-instances/index.ts      (set assigned_task_id on assign; clear on complete/stop)
src/harness/types.ts                      (HarnessKind += 'mock')
src/harness/mock/index.ts                 (NEW — deterministic mock harness, full WorkerHarness contract)
src/harness/mock/index.test.ts            (NEW)
src/harness/registry.ts                   (register mock descriptor + createHarness('mock'))
src/main/conductor/conductor-actions.ts   (assign binds worker + delivers via harness.send; submit carries artifactId)
quantflow-electron/scripts/smoke-task-atom.* (NEW — end-to-end mock atom + negative cases)
quantflow-electron/package.json           (wire `smoke:task-atom`)
ENVOY.md / docs note                      (the atom uses Kernel task authority; full Envoy consolidation is R3, not here)
BUILD_PLAN_V4.md                          (ledger update on approval — verifier only)
```

### The three pieces (territory map §4 Band A)

**1. Task → worker delivery (bind + send).**
- `assign_task` (`conductor-actions.ts`) must result in a **non-null
  `tasks.owner_worker_id`** (today it arrives null because nothing supplies the
  binding) — pass `tileId`/`ownerWorkerId` so `taskClaim` binds the tile's
  `worker_instance`, and set the reverse link `worker_instances.assigned_task_id`.
- The task **instruction is delivered through `getWorkerHarness(kind).send(handle,
  { text })`** (`harness-service.ts` + the Goal 6 contract) — **never** terminal
  paste, `terminal_write`, or MCP. The send payload is the task objective plus
  minimal context (full structured context is R2's Context Envelope — keep it a
  plain instruction here).

**2. Worker executes (two harnesses, same contract).**
- **Mock harness (NEW, registered `mock` kind)** — deterministic, CI-safe, no
  auth, no cost. `spawn` returns a fake handle; `send` records the instruction;
  the mock **produces a real artifact file** at a deterministic path under the
  artifact root and calls `kernel.artifact.create`; `collectReceipts` returns a
  `ReceiptDraft` carrying the `artifactId`; `readState` reports a scripted
  `working → done`; `stop` is a no-op. It implements the **same** `WorkerHarness`
  interface so it is a true drop-in (territory map §7).
- **Real harness** — the existing `local-shell` / `herdr-shell`, driven via
  `send`, with the R0-authed worker producing a real artifact (e.g. a vault
  markdown file). `readState`/`collectReceipts` report progress.

**3. Report with proof (artifact-gated verify).**
- **No submit without an artifact.** `taskSubmit` must reject a submit that
  carries no `artifactRefs`/`artifactId` (territory map §5 minimal enforcement).
- **Structural verification, not a rubber stamp.** Before `taskVerify` posts
  `verification_passed`, it runs the structural checklist over the submitted
  artifact(s) and **fails verification** (→ `verification_failed`, back to
  `working`) if any check fails. Completion stays impossible without a
  `verification_passed` receipt (already enforced):

  ```text
  [ ] artifact record exists and is linked (workflow_id, task_id, worker_instance_id)
  [ ] uri is under the allowed artifact_root (policy)
  [ ] file exists and is non-empty
  [ ] sha256 matches content_hash when content_hash is provided
  [ ] a verification receipt was emitted
  [ ] task reaches complete ONLY after the verification_passed receipt
  ```

- The structural helpers live in `src/kernel/artifacts/verify.ts` with an
  **injectable fs** so the checklist is unit-tested deterministically without
  touching the real disk.

### artifact_root convention (open decision §10.3 — pick the smallest)

R1 introduces one **allowed artifact write root** used by structural
verification. Smallest version: a single resolved root (e.g. the workflow's
`vault_path` when set, else a configured `<QUANTFLOW_DIR>/artifacts` dir), with
`uri` required to resolve **under** it. Document the chosen convention in the
goal result. Do **not** build a per-worker/per-run policy matrix — that is Band C.

### Idempotency seam (open decision §10.5 — design now, enforce later)

Give `submit`/`verify` an optional **attempt key** (e.g. `attemptId` on the
payload) so a retried submit/verify can later be made exactly-once. R1 only
**threads the field through**; full exactly-once enforcement is R4. Do not add a
dedup table here.

## Out of Scope

- No second task, no `TaskDependency` execution, no DAG, no parallel branches (R3).
- No Context Envelope / structured upstream context (R2) — `send` carries a plain
  instruction.
- No `Run` object, no `run_id` on artifacts (reserved until §10.1 resolves, R3).
- No multi-worker, runtime manager, budgets, recovery, or reload-survival (R4).
- No **semantic** verification ("did the evidence support the claim") — R1 verify
  is **structural only** (Band D owns semantic).
- No Envoy retirement/migration — R1 simply uses Kernel task authority for the
  atom; "Kernel decides; Envoy mirrors" is enforced at R3.
- No new artifact provenance fields (`sensitivity`/`derived_from`/`source_refs`…)
  — reserved (territory map §5).
- No cost telemetry build-out (capturing tokens/cost is optional, not required).
- No permission enforcement beyond the three minimal gates (no submit without
  artifact; uri under artifact_root; no complete without verification receipt).

## Tool / URL Requirements

- Existing seams: `src/kernel/tasks/index.ts`, `src/kernel/receipts/index.ts`
  (`handleArtifactCommand`), `src/kernel/worker-instances/index.ts`,
  `src/harness/{types,registry}.ts`, `src/main/conductor/conductor-actions.ts`,
  `quantflow-electron/src/main/harness-service.ts`.
- Existing smokes under `quantflow-electron/scripts/` as the pattern for
  `smoke:task-atom`.
- For the real proof: one R0-green authed worker.

## Acceptance Test (the completion signal)

### Machine proof (CI-safe, mock harness, no auth, no cost)

`bun run smoke:task-atom` drives the full atom on the `mock` harness and asserts
the receipt chain in `kernel.db`:

```text
task_created → task_claimed → task_started → artifact_created → task_submitted
→ verification_started → verification_passed → task_completed
```

- After assign, `tasks.owner_worker_id` is **non-null** and
  `worker_instances.assigned_task_id` points back at the task (the live-run bug
  fixed).
- The instruction reached the worker via the harness `send` seam (assert the mock
  recorded it) — no terminal paste path is exercised.
- `verify` **opened the artifact file** (structural pass) before completing.
- **Negative cases each BLOCK completion** (task never reaches `complete`):
  - submit with no artifact → rejected at submit;
  - artifact `uri` outside `artifact_root` → `verification_failed`;
  - artifact file missing → `verification_failed`;
  - empty artifact file → `verification_failed`;
  - `content_hash` provided but sha256 mismatch → `verification_failed`.
- A worker may not verify its own task (`validateVerifierDistinct` still holds).
- `artifacts/verify.test.ts` covers the checklist over an injected fs;
  `mock/index.test.ts` covers the mock contract. Deterministic (no
  timestamps/uuids in compared bodies).

### Product proof (one real worker — manual, capture evidence)

> The real worker is started manually via the normal worker path (as in R0). The
> Kernel atom and structural verify do the gating; the machine proof above does
> **not** depend on this real run.

- Using an R0-green real worker, the operator runs the atom once: the Conductor
  assigns a task, the instruction is delivered to the real agent **via
  `harness.send`** (not paste), the agent produces a real artifact (e.g. a vault
  markdown file at a known path), submit carries the `artifactId`, `verify`
  opens the file and passes, and the task completes.
- The full receipt chain is present in `kernel.db`, `owner_worker_id` is
  non-null, and the artifact row links workflow/task/worker. Capture the chain +
  the produced artifact path.

### Regression Guard (do not break v3)

All must still pass, unchanged, after R1:

```text
cd quantflow-electron
bun run smoke:kernel-task
bun run smoke:state-card
bun run smoke:conductor
bun run smoke:conductor-actions
bun run smoke:conductor-loop
bun run smoke:worker-harness
bun run smoke:harness-interface
bun run smoke:workflow-region
bun run smoke:vault-export
bun run smoke:eval
bun run smoke:task-atom        # new
bun test src/main/harness-ops.test.ts
bun run build

cd ../tools/quantflow-mcp && node --test
```

- The migration is **additive**: existing `worker_instances` rows get
  `assigned_task_id = NULL`; no existing column changes. `KERNEL_SCHEMA_V1.md`
  and `schema/types.ts` are updated to match.
- No change to the verifier-distinct guard or the legacy-bypass semantics of
  `kernel.task.complete`.
- No new receipt type or event kind (reuse `artifact_created`,
  `verification_started/passed/failed`, `task_completed`).

## Failure Signals

- A task reaches `complete` with **no artifact**, or with an artifact whose file
  is missing / empty / outside `artifact_root` / hash-mismatched — verify must be
  structural, not a rubber stamp.
- The instruction is delivered via terminal paste, `terminal_write`, or MCP
  instead of `harness.send`.
- `tasks.owner_worker_id` is still null after assign.
- Artifact **truth** is stored anywhere other than the Kernel `artifacts` table
  (the vault file / disk is *storage*; the artifact row is *truth*).
- The mock harness writes Kernel state directly instead of going through Kernel
  commands / the `WorkerHarness` contract.
- `verify` reads the file but completion proceeds even on a structural failure.
- The migration is non-additive, or an existing smoke / the MCP tests /
  `bun run build` regresses.
- Scope creep: a second task, a DAG, a Context Envelope, a Run object, or
  semantic verification appears in the diff.

## Handoff Block

```text
Branch quantflow-v4.
Read order: applicable AGENTS.md chain → docs/v4/V4_TERRITORY_MAP.md →
BUILD_PLAN_V3.md → KERNEL_CONSTITUTION.md + docs/v3/AUTHORITY_RULES.md +
docs/v3/KERNEL_SCHEMA_V1.md → this goal (R1).

Goal R1 is the keystone: make ONE Conductor task do real work with proof, on two
tracks (deterministic mock harness in CI; one real authed worker in dogfood).

Three pieces:
1. Bind + send — assign sets tasks.owner_worker_id AND worker_instances.assigned_task_id,
   and delivers the instruction through getWorkerHarness(kind).send(...) — NEVER paste.
2. Worker executes — add a registered `mock` harness (deterministic, produces a
   real artifact file + kernel.artifact.create); the real local-shell/herdr path
   does the same via the same WorkerHarness contract.
3. Artifact-gated verify — submit is REJECTED without an artifact; taskVerify runs
   the structural checklist (record linked, uri under artifact_root, file exists +
   non-empty, sha256 matches if provided, verification receipt emitted) and FAILS
   verification if any check fails. Completion stays impossible without a
   verification_passed receipt.

The structural artifact check is the heart of this goal — verify must provably
OPEN the artifact, not rubber-stamp it.

kernel.artifact.create already exists (receipts/index.ts) — WIRE it into the
atom, do not re-create it. The artifacts table and tasks.owner_worker_id already
exist. The only schema change is the additive worker_instances.assigned_task_id
migration (update KERNEL_SCHEMA_V1.md + schema/types.ts).

Do not: add a second task, a DAG, a Context Envelope, a Run object, semantic
verification, Envoy migration, or new artifact provenance fields. Verify is
STRUCTURAL only here.

Run the full Regression Guard (including the new smoke:task-atom) before
submitting. Commit locally before handoff; the verifier reviews the diff, updates
the BUILD_PLAN_V4 ledger if approved, and pushes.
```

---

*Goals R2–R7 are scoped one at a time, after the prior rung is approved.*
