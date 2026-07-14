# v4 Review Fixes (2026-06-22)

Addresses adjudication punch list from `qa/v4-review-adjudication.md`.

## Shipped (code)

| # | Issue | Fix |
|---|--------|-----|
| 1 | **REF** sensitivity column leak | `sensitivityOf()` uses stricter of column + metadata (`src/kernel/queries/index.ts`) |
| 2 | **R6** false workflow complete | `validateAllRunTasksVerifiedComplete()` before `status: complete` (`run-template-runner.ts`) |
| 3 | **EO** stale attempt after recover | Idempotent submit/verify gated on compatible status (`tasks/index.ts`) |
| 3b | **X-07** fixed template attemptId | Per-run epoch in attemptId (`run-template-runner.ts`) |
| 5 | **C-03** stale claim reclaim | Clear prior worker bind; no silent old-owner reuse on stale reclaim (`tasks/index.ts`) |
| 7 | **X-10** hasPendingApproval | Latest-token phase check + 500 receipt window (`conductor-ipc.ts`) |
| 8 | **C-05** envelope spec fields | Task metadata → acceptance/artifact/verify fields (`envelope.ts`, `TaskSnapshot.metadata`) |
| 6 | **X-09** F1 smoke gap | Synthetic events row; replay unchanged (`smoke-judgment.ts`) |
| 9 | **C-02/X-05** semantic scaffold | Label in `semantic-verification.ts` limitations |
| 10 | **X-08** migration style | `INSERT OR IGNORE` on 003/004 |

## Smokes extended

- `smoke:context-flow` — column-only `sensitivity='restricted'`
- `smoke:task-atom` — EO recover + replay lifecycle
- `smoke-run-template` — failed verify blocks completion

## Documented (no code change)

| # | Item | Where |
|---|------|--------|
| 4 | Legacy `qf_task_complete` preserved, DAG-safe | `docs/v4/INCOMING_GOALS.md` |
| — | Envoy demoted (mirror/spawn) | already in INCOMING_GOALS |

## Parked (intentionally not in this pass)

| # | Item | Why |
|---|------|-----|
| 11 | `queryRun.endedAt` from mutable `updated_at` | Nit; needs product decision on stable terminal timestamp |
| 12 | Split R6 runner monolith | Maintainability; no correctness bug |
| — | R6 mock harness on live canvas | Known live-proof seam (documented in R6 verifier notes) |
| — | Real semantic judgment | Scaffold only until rubric/LLM judge authorized |

## Verify locally

From `quantflow-electron/`:

```text
bun run smoke:context-flow && bun run smoke:task-atom && bun run smoke:run-template && bun run smoke:judgment && bun run smoke:pod
```
