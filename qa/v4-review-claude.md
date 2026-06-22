# v4 Independent Review — Claude

**Reviewer:** Claude (Opus 4.8) · **Date:** 2026-06-22 · **Scope:** `b381bcb..e30cc82` per
[REVIEW_BRIEF.md](../docs/v4/REVIEW_BRIEF.md). Blind to `qa/v4-review-cursor.md`.

**Method:** Read the load-bearing files end-to-end against the §3 invariant checklist, traced the
cross-rung execution + authority paths (task lifecycle → DAG gate → runtime recovery → checkpoint
→ template runner → replay/evals), and chased each invariant to its enforcement point rather than
trusting comments. Did **not** re-run smokes (that was the per-rung verification; this pass is a
fresh skeptical read of the code).

**Headline:** The build is genuinely solid. No blockers, no majors. Findings are minor/observation
class. The single most notable item is the MCP-reachable legacy self-completion (C-01) — conformant
with the docs but a soft guard. The Kernel-owns-truth discipline and the checkpoint token defense
are the strongest parts of the codebase.

---

## Findings

### [C-01]  minor  ·  R3c / MCP  ·  quantflow-electron/src/main/envoy-task-service.ts:281
**Claim:** The verification-gate bypass is reachable from any external MCP agent with no hard guard.
`qf_task_complete` → `envoy.taskComplete` → `dispatchEnvoyKernel("kernel.task.complete", { legacy: true })`.
**Evidence:** `tool-definitions.js:628` maps `qf_task_complete`→`envoy.taskComplete`;
`envoy-task-service.ts:279-287` hardcodes `legacy: true`; `validateComplete` (validators.ts:56)
then skips the `verification_passed` requirement. The guard is real only by *convention* — Track A
removed `qf_task_complete` from worker prompts — not by a tool-layer block.
**Mitigations that already hold (so this is minor, not major):** completions are receipt-tagged
`{ legacy: true, bypassedVerification: true }` (tasks/index.ts:718-720), and they are **DAG-safe** —
`isUpstreamSatisfied` (tasks/index.ts:69-76) requires a `verification_passed` receipt, which a legacy
completion never posts, so a bypassed task cannot unblock any downstream. The blast radius is a
*standalone terminal* task showing `complete`/`done` while unverified.
**Recommendation:** Now that `qf_task_submit` + `qf_task_verify` exist, consider either (a) dropping
`qf_task_complete` from the external tool surface, or (b) gating `legacy:true` behind an
operator/approval flag rather than hardwiring it on. Needs decision — it's intentional compat today.

### [C-02]  minor  ·  R7 (F15)  ·  src/evals/semantic-verification.ts:27
**Claim:** The semantic verification stage is wired but **inert** — it can never independently fail a
structurally-valid task, so F15's "escalating stage" currently adds no real gate.
**Evidence:** `runSemanticVerificationStage` returns `ok:false` only when `!structural.ok` (line 31)
or `artifactRefs.length === 0` (line 42); otherwise always `ok:true` (line 53). Since `taskVerify`
already rejects on `!structural.ok` first (tasks/index.ts:544) and structural verify requires a
non-empty artifact, the semantic branch (tasks/index.ts:554) is unreachable-as-failure today.
**Recommendation:** Fine as a scaffold (it's honestly labelled "deterministic stage only"), but track
that semantic verification provides **zero signal** until a real judge is wired — don't let the
green checkmark imply semantic gating exists. Conformance: F15 *structure* holds; F15 *function* is
deferred.

### [C-03]  minor  ·  R3  ·  src/kernel/tasks/index.ts:351-393
**Claim:** Stale-claim reclaim has three rough edges: (a) reclaim without an explicit
`ownerWorkerId`/`tileId` reuses the **old** owner (`?? task.owner_worker_id`, line 378-379) — a no-op
reclaim to the same stale worker; (b) when a *different* worker reclaims, the previous owner's
`worker_instances.assigned_task_id` is never cleared, leaving a stale pointer; (c) no receipt records
the forced release, so the evidence chain shows two `task_claimed` with no intervening release.
**Evidence:** lines 351-359 fall through on stale; 378-393 resolve/assign the new owner via
`assignWorkerToTask(db, ownerWorkerId, id)` but never null out the prior owner.
**Recommendation:** On stale reclaim, clear the prior owner's assignment and post a
`progress`/release receipt (mirrors what `taskRecover` already does at line 802/804).

### [C-04]  nit  ·  R3a (NSS)  ·  src/kernel/workflows/index.ts:235
**Claim:** `queryRun.endedAt` uses `workflows.updated_at` as the run-end timestamp, so any later
workflow update (e.g. a metadata touch) silently moves the "end" time.
**Evidence:** `endedAt: ended ? wf.updated_at : null` (line 235); `ended` is derived from
`status complete|archived`.
**Recommendation:** Acceptable for a references-only projection (comment acknowledges it), but if a
stable run-end is ever needed, derive it from the terminal `task_completed`/workflow receipt instead.

### [C-05]  minor  ·  R2 (REF)  ·  src/kernel/context/envelope.ts:99-104
**Claim:** The envelope under-delivers the task spec: `acceptance_criteria`, `expected_artifact`,
and `verification_rule` are hardcoded `null`, and `permissions.summary` is a static string. So the
"verification_rule"/"permissions" fields are decorative — a downstream worker receives no acceptance
criteria or real permission scope.
**Evidence:** envelope.ts:99-101 (`null` literals), 103-105 (static permissions string).
**Recommendation:** REF itself holds (references-only, verified-only, sensitivity default-deny all
enforced in `queryUpstreamArtifacts` — see invariant table). This is a *completeness* gap, not a
leak: populate from task metadata when available so the envelope earns those fields.

### [C-06]  question  ·  MIG  ·  src/kernel/migrations/00{3..7}-*.sql
**Claim:** Migrations are additive and correctly version-stamped, but they use bare
`ALTER TABLE ... ADD COLUMN` (SQLite has no `ADD COLUMN IF NOT EXISTS`). Re-applying a migration
outside the `schema_migrations` version tracker would throw "duplicate column".
**Evidence:** e.g. `007-r7-typed-artifacts.sql` (6× `ADD COLUMN`); the defensive `hasWorkflowColumn`
guards in `workflow-commands.ts` suggest the team is already aware columns may/may not exist.
**Recommendation:** Confirm the migration runner strictly gates by recorded version (so each runs
exactly once). If it does, this is a non-issue; flagging because it's invisible until a re-run.

### [C-07]  nit  ·  R6  ·  src/main/conductor/run-template-runner.ts:428
**Claim:** `instantiateTemplate` hardcodes `harnessKind:'mock'` for spawned tiles, so R6 has no
real-harness path in code — a live named invocation runs mock workers.
**Evidence:** line 428.
**Recommendation:** Already documented as the live-proof-batch wiring seam; restating only for
completeness. **Not worse than documented** — no action beyond the existing note.

---

## Invariant table verdict

| ID | Verdict | Note |
|---|---|---|
| **KT** (kernel owns truth) | **holds** | `runtime-manager` (index.ts) and `envoy-kernel-bridge` mutate only via `dispatchKernel`→`kernel.*`; all canonical writes are in `src/kernel/**/commands`; `queries/index.ts` is read-only. No stray writer found. |
| **F1** (replay = projection) | **holds** | `run-replay.ts` reads tasks/receipts/artifacts only; zero `events` access; `usesEventsTable:false`; smoke asserts `eventCount===0`. |
| **F14** (one executor) | **holds** | `dag-scheduler.ts` is a pure eligibility function backing the Kernel claim gate; R6 runner is a compiler/driver that *asks* the scheduler + routes checkpoints through the R5 loop. No second orchestrator. |
| **F15** (semantic verify own stage) | **holds (structure) / inert (function)** | Own module, escalates after structural; but currently cannot fail a structurally-valid task — see **C-02**. |
| **F16** (evals non-authoritative) | **holds** | `auto-trigger.ts` writes eval rows only, fires post-completion in swallowed try/catch (tasks/index.ts:595, 722), and is **never read back** — replay/queries don't feed evals into state. |
| **NSS** (no second store) | **holds** | No `runs` table — `queryRun` is references-only (workflows/index.ts:190); Envoy is a Kernel-keyed mirror; vault is a mirror. |
| **MIG** (additive + sequential) | **holds** | 003→007 are ADD COLUMN / additive only, no DROP/DELETE; version-stamped. One re-run caveat — **C-06**. |
| **EO** (exactly-once / idempotency) | **holds** | `attemptId` dedup on submit/verify/complete (`findAttemptReceipt`, reject-on-different-refs); proposalToken reuse; `evalExists` guards idempotent eval inserts. |
| **REF** (envelope refs-only + verified-only) | **holds** | `queryUpstreamArtifacts` (queries/index.ts:194) filters `complete` + `verification_passed` + sensitivity default-deny; envelope passes ids/uri/hash, never bodies. Completeness gap only — **C-05**. |
| **AUTH** (decision authority) | **holds as documented** | Checkpoint token defense is strong — missing/forged/drifted/replayed → `stale`, spawn nothing (conductor-loop.ts:337, 472). Self-verify blocked (validators.ts:95). Legacy bypass reachable-but-flagged-and-DAG-safe — **C-01**. |

---

## Per-rung + overall verdict

| Rung | Verdict |
|---|---|
| R0 preflight | clean (not deeply re-read; out of the hot path) |
| R1 task atom | clean — verify gate is solid; semantic add-on inert (C-02) |
| R2 envelope | clean — REF enforced; envelope under-delivers task spec (C-05) |
| R3 DAG + authority | clean — strong; stale-claim edges (C-03), endedAt nit (C-04), MCP legacy (C-01) |
| R4 durable runtime | **clean — exemplary**; runtime-manager is the model for KT (zero stray SQL) |
| R5 checkpoint | **clean — strong**; token forge/drift/replay defense is the best-guarded surface |
| R6 run templates | clean — compiler/driver holds; mock-harness seam known (C-07) |
| R7 judgment | clean — F1/F16 solid, F15 structurally present but inert (C-02) |
| R8 / R8.5 | not the focus of this code pass (legend/settings UI); no findings raised |

**Overall:** v4 is **machine-complete as claimed.** No blockers, no majors; the ten invariants hold
(F15 holds structurally but is functionally deferred). The Kernel-as-sole-truth boundary is clean
across every rung — the cross-rung composition (F14 end-to-end) is real, not just per-rung. Before
leaning on multi-agent runs in anger I'd address **C-01** (harden/retire the MCP legacy-complete
path) and **C-03** (stale-claim hygiene); everything else is polish or honestly-labelled scaffold
(**C-02**, **C-05**, **C-07**). Nothing here blocks declaring the machine ladder done or proceeding
to the operator live-proof batch.
