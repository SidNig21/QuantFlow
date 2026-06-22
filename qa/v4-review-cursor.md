# QuantFlow v4 — Independent Review (Cursor)

**Scope:** `b381bcb..quantflow-v4` (`e30cc82`) · `src/`, `quantflow-electron/src/`, `tools/`  
**Method:** Skeptical read of load-bearing files + smokes as executable claims. Did not read `qa/v4-review-claude.md`.

---

## Findings

### [X-01]  blocker  ·  R4/EO  ·  `src/kernel/tasks/index.ts:439-447,489-492`

**Claim:** `attemptId` idempotency short-circuits before lifecycle checks, so replayed submit/verify after `kernel.task.recover` can return `ok: true` while the task remains `open`.

**Evidence:** `taskRecover` resets status to `open` but does not purge prior attempt receipts (`791-814`). `taskSubmit` returns idempotent success when a matching `task_submitted` receipt exists, without requiring `working`/`submitted` status (`439-447`). `taskVerify` returns `{ verified: true, idempotent: true }` when a matching `verification_passed` receipt exists, before the `submitted`/`verifying` guard at `527-531` (`489-492`). `smoke-pod.ts` re-delivers with a **new** `attemptId` after recover — does not exercise same-attempt replay.

**Recommendation:** Gate idempotent replay on compatible current status (or invalidate/namespace attempt receipts on recover). Add smoke: recover → resubmit/resubmit with **same** `attemptId` must either re-advance state or reject.

---

### [X-02]  major  ·  R2/REF  ·  `src/kernel/queries/index.ts:178-213`

**Claim:** Envelope sensitivity default-deny reads `metadata['sensitivity']` only and ignores the `artifacts.sensitivity` column added in migration 007.

**Evidence:** `sensitivityOf()` uses metadata only (`178-180`). `queryUpstreamArtifacts` filters with that helper (`213`). `kernel.artifact.create` writes top-level `payload['sensitivity']` to the column (`204:src/kernel/receipts/index.ts`) while `metadata_json` is a separate object. Column-only `sensitivity: 'restricted'` passes the filter and enters the envelope. `envelope.test.ts` puts sensitivity **inside metadata** (`101`), so smoke does not cover the column path.

**Recommendation:** Treat non-`normal` if **either** column or metadata says so. Add smoke with column-only sensitivity.

---

### [X-03]  major  ·  R6  ·  `src/main/conductor/run-template-runner.ts:601-659`

**Claim:** Template runner can mark a workflow `complete` without all compiled tasks reaching a terminal state.

**Evidence:** Driver loop exits when the scheduler returns no eligible **open** tasks (`601-605`). Completion gate is `validateArtifactExpectations` — artifact **kind** multiset only (`375-385`) — then unconditional `kernel.workflow.update { status: 'complete' }` (`659`). Tasks stuck in `working` after failed verify are not schedulable and not counted. No assertion that every `compiled.taskPhases` (+ spawned deepen tasks) is `complete`/`failed`.

**Recommendation:** Before completing, require all template task ids terminal, or fail the run with explicit leftover status. Extend `smoke-run-template` with a failed-verify leftover case.

---

### [X-04]  major  ·  R3/AUTH  ·  `src/kernel/tasks/index.ts:69-76` + `quantflow-electron/src/main/envoy-task-service.ts:279-285`

**Claim:** Envoy `completeTask` can mark Kernel tasks `complete` via legacy bypass without `verification_passed`, while DAG/upstream logic correctly refuses such tasks as satisfied — Envoy “done” and DAG truth diverge.

**Evidence:** `isUpstreamSatisfied` requires `complete` **and** a `verification_passed` receipt (`69-76`). Envoy path calls `kernel.task.complete` with `legacy: true` from `working`/`claimed` (`279-285`). Downstream `blocks` edges stay blocked forever in template/DAG runs even though Envoy mirror shows `done`.

**Recommendation:** Document as Hermes-compat seam only, or route Envoy complete through submit→verify for DAG-connected tasks. Add `smoke-authority` case: legacy-complete upstream → downstream claim blocked.

---

### [X-05]  major  ·  R7  ·  `src/evals/semantic-verification.ts:53-60`

**Claim:** Semantic verification is a deterministic pass-through after structural success — it performs no domain judgment despite R7 “judgment” framing.

**Evidence:** After structural ok + nonempty refs, stage always returns `ok: true` with fixed rationale (`53-60`); limitations string admits “Deterministic stage only.” `smoke-judgment.ts` checks receipt metadata presence, not semantic failure modes. No path produces `semantic.ok === false` after structural pass.

**Recommendation:** Label R7 semantic stage as schema/scaffold in docs, or wire real rubric before “judgment” claims. Add negative semantic smoke once a real judge exists.

---

### [X-06]  major  ·  R6/F14  ·  `src/main/conductor/run-template-runner.ts:509-643`

**Claim:** R6 owns a full second orchestration loop (checkpoint scheduling, parallel low-attention batches, task dispatch), not only a compiler delegating to shared conductor-loop steps.

**Evidence:** 674-line module with `for (let guard = 0; guard < 100; guard++)` driver (`580-643`), `Promise.all` for low-attention phases (`607-625`), checkpoint sequencing parallel to but separate from `conductor-loop` step semantics. Reuses `readSchedulableTasks` and R5 checkpoint hooks — but duplicates orchestration logic.

**Recommendation:** Extract shared run-driver or document F14 as “scheduler shared, driver duplicated.” Decompose before adding more phase types.

---

### [X-07]  minor  ·  R4/EO  ·  `src/main/conductor/run-template-runner.ts:519`

**Claim:** Template `attemptId` is fixed per phase (`att-${phase.taskId}`) with no attempt counter — recover/retry collisions compound X-01.

**Evidence:** Deterministic attemptId at assign/deliver path. Combined with recover without receipt invalidation, redelivery semantics are unsafe in production.

**Recommendation:** Include workflow id + monotonic attempt sequence in `attemptId`.

---

### [X-08]  minor  ·  MIG  ·  `src/kernel/migrations/003-r1-worker-task-binding.sql`, `004-r3-workflow-instance.sql`

**Claim:** Migrations 003–004 use plain `INSERT INTO schema_migrations` without `OR IGNORE`, unlike 005–007.

**Evidence:** 003/004 vs `INSERT OR IGNORE` in `005-r4-runtime.sql:10-11` and `007-r7-typed-artifacts.sql:16-17`.

**Recommendation:** Align early migrations with `INSERT OR IGNORE` for idempotent re-exec in dev/test.

---

### [X-09]  minor  ·  smokes/F1  ·  `quantflow-electron/scripts/smoke-judgment.ts:244-245`

**Claim:** F1 smoke proves replay ignores events only vacuously — no events were ever written.

**Evidence:** Asserts `events` row count === 0. `buildRunReplay` never queries `events` (`src/main/conductor/run-replay.ts`) — code is correct; smoke does not prove immunity to populated events table.

**Recommendation:** Insert synthetic events rows, rebuild replay, assert projection unchanged and `usesEventsTable: false`.

---

### [X-10]  question  ·  R5  ·  `src/main/conductor/conductor-ipc.ts:92-99`

**Claim:** Production `hasPendingApproval` uses `receipts.find()` on a token match without explicitly proving the receipt is the latest **unconsumed** checkpoint for that workflow.

**Evidence:** Interface comment at `conductor-loop.ts:121-122` says “latest unconsumed”; IPC implementation finds first planning receipt with matching `proposalToken` and phase `awaiting-approval` or `awaiting-selection`. Works when receipts are newest-first and a newer `selected`/`stale` receipt supersedes — but no explicit “consumed after” scan. Smokes inject simplified `hasPendingApproval` hooks.

**Recommendation:** Scan for newest matching token where no later receipt with same token has terminal phase (`selected`, `executed`, `stale`). Add IPC-level regression beyond smoke mocks.

---

### [X-11]  nit  ·  R6  ·  `src/main/conductor/run-template-runner.ts`

**Claim:** R6 runner is a monolith (~674 lines) mixing compile, instantiate, checkpoint orchestration, and execution.

**Recommendation:** Split compile/load vs invoke before next feature work.

---

### [X-12]  question  ·  R7/F16  ·  `src/kernel/evals/auto-trigger.ts:76-90`

**Claim:** Auto-trigger scores tasks without `verification_passed` lower (`score: 1` vs `3`) but nothing reads those scores — however legacy-complete tasks produce misleading “verification_integrity” eval dimensions.

**Evidence:** `autoTriggerTaskEvaluations` scores based on receipt presence (`76-90`); evals are write-only per F16. Legacy Envoy completes create `task_completed` without `verification_passed`, yielding low scores that could confuse operators reading eval exports.

**Recommendation:** Non-blocking; document eval rows as diagnostic only. Optionally tag `legacy: true` in eval metadata when no verification receipt.

---

## Smokes vs claims (skeptical)

| Smoke | Proves | Does **not** prove |
|---|---|---|
| `smoke-task-atom` | Assign→verify chain, structural negatives | Recover/idempotency, semantic stage |
| `smoke-dag` | Scheduler + Kernel claim gate | Legacy upstream complete, live harness |
| `smoke-context-flow` | Refs-only envelope, metadata sensitivity deny | Column-only sensitivity (X-02) |
| `smoke-checkpoint` | No auto-pick; forged/drifted/replayed tokens stale | Production IPC `hasPendingApproval` (X-10) |
| `smoke-pod` | Stale→recover→redeliver with **new** attemptId | Same-attemptId replay after recover (X-01) |
| `smoke-run-template` | Config-only templates; explicit checkpoint selection | All tasks terminal before workflow complete (X-03) |
| `smoke-judgment` | Replay shape; eval non-gating regression | Real semantic judgment; replay with events present |

---

## Invariant table verdict

| ID | Verdict | Note |
|---|---|---|
| **KT** | **holds** (v4 paths) / **unproven** (legacy) | v4 conductor/runtime/Envoy bridge use `dispatchKernelCommand`; harness has no direct kernel table writes. Legacy `kernel.task.complete` + Envoy MCP path remains a documented bypass. |
| **F1** | **holds** | `buildRunReplay` reads workflows/tasks/receipts/artifacts only; `usesEventsTable: false`. Smoke under-proves (X-09). |
| **F14** | **unproven** | Scheduler + R5 checkpoint reused; R6 owns duplicated driver loop (X-06). |
| **F15** | **holds** | Structural gates first (`verification-stages.ts:23-32`); semantic blocked when structural fails; `taskVerify` rejects on `!stages.semantic.ok` (`554-562`). Stage is scaffold, not judgment (X-05). |
| **F16** | **holds** | Eval auto-trigger post-completion in swallowed try/catch (`595-603:tasks/index.ts`); write-only; smoke proves progression despite failing eval row. |
| **NSS** | **holds** | No `runs` table; `queryRun` projects workflow; Envoy/vault are mirrors; artifact row is truth. |
| **MIG** | **holds** / **minor gap** | 004–007 additive ALTER only; 003/004 lack `INSERT OR IGNORE` (X-08). |
| **EO** | **violated** | attemptId idempotency unsafe after recover (X-01); smokes avoid same-attempt replay. |
| **REF** | **violated** | Column sensitivity bypass (X-02); refs-only and verified-only otherwise hold in code + smoke. |
| **AUTH** | **holds** (checkpoints) / **concerns** (legacy) | Checkpoints require explicit selection; token drift/forgery → stale in smoke. Legacy Envoy complete bypasses verify gate (X-04). |

---

## Per-rung + overall verdict

| Rung | Verdict |
|---|---|
| **R0** (preflight) | **clean** — capability probes; no Kernel mutation observed. |
| **R1** (task atom) | **findings(1)** — structural verify solid; EO/recover hole is cross-rung (X-01). |
| **R2** (envelope) | **findings(1)** — pure projection + refs-only proven; sensitivity column gap (X-02). |
| **R3** (DAG/authority) | **findings(1)** — Kernel gate + scheduler align; legacy-complete vs DAG mismatch (X-04). |
| **R4** (pod runtime) | **findings(2)** — runtime-manager dispatches Kernel only; recover/idempotency (X-01, X-07). |
| **R5** (checkpoint) | **concerns(1)** — token binding proven in smoke; production IPC pending-approval thin (X-10). |
| **R6** (templates) | **findings(2)** — config-only templates good; completion gate weak + driver duplication (X-03, X-06). |
| **R7** (judgment) | **findings(2)** — replay/eval plumbing present; semantic stage is scaffold (X-05); F1 smoke weak (X-09). OKF export trigger wired (positive). |
| **R8/R8.5** | **not audited in depth** — legend/settings UI outside load-bearing kernel/conductor review focus. |

**Overall:** v4 is **machine-complete for mock/sim happy paths** as claimed, but **not production-hardened**. One **blocker** (EO after recover, X-01) and two **guardrail gaps** (REF sensitivity X-02, R6 completion gate X-03) should be addressed before treating the ladder as ship-ready. Semantic “judgment” is honestly scaffold-only — align docs or deepen implementation. Live-proof batch and known mock-harness seam remain operator work, not code defects, unless they surface worse than documented.
