# QuantFlow v4 Review Adjudication

Date: 2026-06-22

Scope: neutral adjudication of `qa/v4-review-claude.md` and `qa/v4-review-cursor.md` against the live `quantflow-v4` codebase. I treated both reviews as untrusted, checked the cited code paths, ran focused probes for the testable claims, and reran the required smokes.

## Test Evidence

- `bun run smoke:judgment` from `quantflow-electron/`: PASS, 0 failures.
- `bun run smoke:run-template` from `quantflow-electron/`: PASS, 0 failures.
- Focused EO probe: after `task.submit` then `task.recover`, replaying the same `attemptId` returned `ok:true`/`idempotent:true` while the task remained `open`. After a failed `task.verify`, `task.recover` plus same-attempt verify replay also returned `ok:true` while the task remained `open`. Reopening a terminal verified-complete task is rejected.
- Focused REF probe: a top-level `artifacts.sensitivity='restricted'` row with no `metadata.sensitivity` was still returned by default `queryUpstreamArtifacts`, proving the column-only sensitivity leak.
- Focused R6 probe: a template task that submitted an artifact but failed structural verification left the task `working` while `executeTemplateRun` still marked the workflow `complete`.

## Per-Finding Verdicts

| Finding | Verdict | True severity | Adjudication |
|---|---:|---:|---|
| C-01 legacy MCP/Envoy completion is externally reachable | Needs-decision | Minor | Factually real: `tools/quantflow-mcp/tool-definitions.js:628` exposes `qf_task_complete`, `quantflow-electron/src/main/envoy-task-service.ts:279` calls `kernel.task.complete` with `legacy:true`, and `src/kernel/tasks/index.ts:719` tags `legacy`/`bypassedVerification`. It is documented and DAG-safe because `src/kernel/tasks/index.ts:69` requires upstream `verification_passed`, but the external compatibility surface should be explicitly kept, gated, or retired. |
| C-02 semantic verification is structurally wired but inert | Confirmed | Minor | `src/kernel/tasks/index.ts:539` runs verification stages and rejects semantic failure, but `src/evals/semantic-verification.ts:59` says deterministic only and passes any structurally valid artifact with refs. This is a scaffold gap, not a broken F15 integration. |
| C-03 stale claim reclaim rough edges | Confirmed | Minor | `src/kernel/tasks/index.ts:351` allows stale reclaim, `src/kernel/tasks/index.ts:378` can reuse the previous owner when no owner/tile is supplied, and `src/kernel/worker-instances/index.ts:197` assigns the new worker without clearing older worker rows. No explicit release receipt is written. |
| C-04 `queryRun.endedAt` uses mutable `workflows.updated_at` | Confirmed | Nit | `src/kernel/workflows/index.ts:222` documents the projection and `src/kernel/workflows/index.ts:235` returns `updated_at` for completed/archived runs. Later workflow updates can shift the projected end time. |
| C-05 context envelope under-delivers task spec fields | Confirmed | Minor | `src/kernel/context/envelope.ts:99`-`101` hardcode `acceptance_criteria`, `expected_artifact`, and `verification_rule` to null, with a static permissions summary nearby. This is a completeness gap, not a context leak. |
| C-06 migration rerun/idempotency caveat | Partial | Question | The runner is version-gated by `src/kernel/database.ts:71` onward, so normal app startup should not reapply old migrations. The concern is still true outside that runner: several migrations use bare `ALTER TABLE ADD COLUMN`, including `src/kernel/migrations/007-r7-typed-artifacts.sql:5`. |
| C-07 R6 hardcodes mock harness | Confirmed | Nit | `src/main/conductor/run-template-runner.ts:428` sets `harnessKind:'mock'`. This matches the known R6 mock-harness seam called out as out-of-scope unless it worsened; no new blocker found. |
| X-01 attemptId idempotency short-circuits after recover | Partial | Major | The core EO claim is real: `src/kernel/tasks/index.ts:446`, `:492`, and `:497` return idempotent success before lifecycle compatibility checks, so recovered/open tasks can accept stale submit or failed-verify replays as `ok`. The blocker severity is overstated because `src/kernel/tasks/index.ts:788` prevents reopening terminal complete/failed tasks, so I did not reproduce a false terminal completion. |
| X-02 restricted artifact sensitivity column leaks by default | Confirmed | Major | `src/kernel/queries/index.ts:178` reads sensitivity only from metadata, while R7 stores top-level column sensitivity in `src/kernel/receipts/index.ts:177` onward and migration `src/kernel/migrations/007-r7-typed-artifacts.sql:10`. The focused probe confirmed default upstream context returned a column-only restricted artifact. |
| X-03 template run can complete workflow with non-terminal tasks | Confirmed | Major | `src/main/conductor/run-template-runner.ts:375` checks artifact kinds/counts, not task terminality; `src/main/conductor/run-template-runner.ts:645` validates artifact expectations; `src/main/conductor/run-template-runner.ts:659` marks the workflow complete. The focused probe reproduced `task-status working` with `workflow-status complete`. |
| X-04 legacy complete lets Envoy and DAG truth diverge | Needs-decision | Minor | Same root as C-01. A legacy complete can mark a standalone task complete without verification, but DAG gating remains protected by `src/kernel/tasks/index.ts:69`. It is a real authority surface to decide, not the major DAG-corruption issue claimed. |
| X-05 semantic verification pass-through | Confirmed-but-mis-sevved | Minor | Same root as C-02. Cursor's major severity is too high because structural verification remains first and semantic failure is already wired as a separate rejection path. The problem is that the current deterministic semantic stage lacks independent judgment after structural success. |
| X-06 R6 runner is a second orchestrator | Refuted | Nit | The runner is a large driver, but the F14 violation is not proven. It uses the shared scheduler and checkpoint controller rather than private task truth: see scheduler call path around `src/main/conductor/run-template-runner.ts:601` and checkpoint handling around the same module's approval paths. The monolith concern is real as X-11. |
| X-07 fixed template attemptId | Confirmed | Minor | `src/main/conductor/run-template-runner.ts:519` uses `attemptId: att-${phase.taskId}`. This compounds X-01 for retries/recoveries but is not independently major. |
| X-08 migrations 003/004 lack `OR IGNORE` | Confirmed-but-mis-sevved | Nit | `src/kernel/migrations/003-r1-worker-task-binding.sql:10` and `004-r3-workflow-instance.sql:13` use plain inserts, but normal execution is version-gated by the migration runner. This is consistency hardening, not a live migration blocker. |
| X-09 `smoke:judgment` under-proves F1 event-table immunity | Confirmed | Minor | `src/main/conductor/run-replay.ts:151` sets `usesEventsTable:false` and imports no event query, so F1 implementation appears correct. The smoke only checks `eventCount === 0` in `quantflow-electron/scripts/smoke-judgment.ts:234`, so it should be hardened with synthetic event rows. |
| X-10 `hasPendingApproval` lacks explicit latest-unconsumed proof | Partial | Minor | `quantflow-electron/src/main/conductor/conductor-ipc.ts:92` scans the newest 100 workflow receipts and finds a matching planning token. This likely works for the existing selected-planning receipt flow, but it is not an explicit latest-unconsumed token scan and has a 100-receipt blind spot. |
| X-11 runner monolith | Confirmed | Nit | `src/main/conductor/run-template-runner.ts` is doing compile/instantiate/drive/checkpoint handling in one large file. This is maintainability debt, not a correctness blocker. |
| X-12 auto-trigger writes low scores for legacy-complete tasks | Needs-decision | Question | Legacy completion can auto-produce low verification/task evals through the `src/kernel/tasks/index.ts:722` eval trigger path. F16 still holds because eval rows do not gate Kernel state, but operator labeling may need a clearer legacy/bypassed display. |

## Invariant Reconciliation

| Invariant | Adjudicated status | Notes |
|---|---:|---|
| KT | Holds | Kernel remains the authoritative state writer for task/workflow transitions. Legacy complete is a Kernel command, not an outside state store. |
| F1 | Holds with test gap | Replay code is receipt/artifact/task/run primary and not event-table backed. The current smoke should be strengthened with populated-event immunity. |
| F14 | Holds with maintainability debt | Template runner compiles and drives through shared scheduler/checkpoint seams. It is too large, but I do not find a second scheduler/truth engine. |
| F15 | Holds with scaffold caveat | Structural before semantic is wired; semantic is deterministic/pass-through after refs and structural success. |
| F16 | Holds | Evaluations are write/query artifacts, not state gates. Legacy low-score display semantics remain a product decision. |
| NSS | Holds with projection nit | No second store found. `queryRun.endedAt` is a mutable projection from `workflows.updated_at`. |
| MIG | Holds with hardening caveat | Version-gated migration runner is the real guard. Bare `ALTER TABLE ADD COLUMN` and non-`OR IGNORE` rows are not re-runnable outside that runner. |
| EO | Violated | Same-attempt submit/verify idempotency can report `ok` after recover even though the task is open and no fresh lifecycle progress happened. |
| REF | Violated | Default context filtering misses top-level `artifacts.sensitivity`, leaking column-only restricted artifacts. |
| AUTH | Holds with decision item | R5 checkpoint token flow remains coherent. External legacy complete via MCP/Envoy is scoped and tagged but should be explicitly accepted, gated, or retired. |

## Conflict Resolution

- Legacy complete: Claude called it minor/decision, Cursor called it major. I agree with Claude on severity but keep it as a real decision item because the MCP surface is externally reachable.
- Semantic verification: both found the inert stage; Cursor over-sevved it. F15 architecture is present, but semantic judgment is not independently meaningful yet.
- R6 F14: Cursor's "second orchestrator" claim is refuted as an invariant breach. The runner is a driver using shared scheduler/checkpoint seams; the true issue is monolith/maintainability plus the separate completion-gate bug.
- EO idempotency: Cursor found a real issue Claude missed. It is major, but not a blocker as written because terminal complete recovery is rejected.
- REF sensitivity and R6 completion gate: Cursor found two true majors Claude missed.

## Consolidated True Punch List

1. Major - Fix EO idempotent replay after recover. Revalidate same-attempt submit/verify against the current task lifecycle, or invalidate/namespace attempts on recover. Add a smoke that recovers after submit and after failed verify, then retries the same attempt.
2. Major - Fix REF sensitivity filtering. `queryUpstreamArtifacts`/context filtering must consider both top-level `artifacts.sensitivity` and metadata sensitivity, default-denying any non-normal value. Add a column-only restricted artifact smoke.
3. Major - Fix R6 workflow completion gating. Before `workflow.update status:'complete'`, require all tasks owned/created by the template run to be terminal and verified as required; structural verification failure must block run completion even if an artifact row exists.
4. Minor - Decide and document the fate of external legacy complete. Either retire/gate `qf_task_complete`/Envoy legacy completion or explicitly preserve it as a compatibility path with operator-only guardrails and clear bypass labeling.
5. Minor - Clean up stale claim reclaim. Clear old worker `assigned_task_id`, avoid silent old-owner reuse on reclaim, and consider a `task_released`/reclaim receipt.
6. Minor - Harden F1 smoke by inserting synthetic event rows before replay and proving replay output is unchanged.
7. Minor - Harden `hasPendingApproval` to prove latest unconsumed token semantics without a 100-receipt blind spot.
8. Minor - Populate context envelope spec fields (`acceptance_criteria`, `expected_artifact`, `verification_rule`, permissions) from task/template metadata where available.
9. Question/Nit - Label semantic verification as deterministic scaffold until a real independent judge is added.
10. Nit - Make migration idempotency style consistent where practical, or document that only the version-gated runner is supported.
11. Nit - Decide whether `queryRun.endedAt` needs a stable terminal timestamp instead of `workflows.updated_at`.
12. Nit - Split the R6 runner when convenient and introduce attempt sequencing for real retries.

## Overall

v4 is machine-green on the required smokes, but not machine-complete as-is. The true blockers for final approval are the three majors: EO stale-attempt replay after recover, REF sensitivity-column leakage, and R6 workflow completion despite non-terminal tasks. The remaining findings are compatibility decisions, smoke hardening, and maintainability cleanup.
