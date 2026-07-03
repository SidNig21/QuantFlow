# Chunk A3 — one-word-per-concept rename codemod

- **STATUS:** Planned
- **Layer:** authority + projection
- **Boundary-map row:** `REBUILD_STRATEGY_AUDIT.md` §C "Blurred agent/tool/tile concepts" (fix mode: in-place rename); closes **G-contract** (Stage A exit).
- **Authority for the map:** `docs/v4/GLOSSARY.md` § RENAME MAP — **APPROVED, founder 2026-06-25.** This spec adds nothing to that map; it only executes it.

## Precondition (verified 2026-07-02)

A2 signature rows are already landed with deprecated aliases kept:
`WorkflowStatus` uses `'suspended'` (`src/kernel/schema/types.ts:17`); RPC
`kernel.workflowProjection` + deprecated `kernel.run` alias
(`quantflow-electron/src/main/ipc-kernel-reads.ts:30–37`); MCP
`quantflow_kernel_workflow_projection` + deprecated `quantflow_kernel_run`
(`tools/quantflow-mcp/tool-definitions.js:973–983`). A3 is unblocked.

## Files in scope (exactly the A3 rows of the RENAME MAP)

- **RUN:** `src/kernel/workflows/index.ts` (`WorkflowRun`→`WorkflowProjection`, drop `runId`),
  `src/kernel/queries/index.ts` (drop `runGet` alias), `src/kernel/context/envelope.ts` + test
  (`run_id`→`workflow_id`), `src/main/conductor/conductor-loop.ts` + test + `conductor-ipc.ts`
  (`readRun`→`readWorkflowProjection`), `run-replay.ts`→`workflow-replay.ts`,
  `run-template-runner.ts`→`workflow-template-runner.ts`, smoke scripts (locals only).
- **HARNESS:** `src/harness/eve/index.ts` + test (`EveState.sessionId`→`eveSessionId`),
  prose fixes in `docs/v4/EVE_SETUP.md`, `BUILD_PLAN_V4.md`, `docs/v4/handoffs/R4-durable-pod-runtime.md`
  ("Eve loop as harness" → `eve-session-loop`).
- **PAUSE:** `conductor-planner.ts` / `conductor-loop.ts` + test / `conductor-ipc.ts` /
  `src/evals/rubrics/index.ts` / smoke scripts (`'pause'`→`'await_operator'`,
  `'paused'`→`'awaiting_operator'`, `'budget-paused'`→`'budget_exceeded'`,
  `pauseRun`→`suspendWorkflow`).

## Must NOT change

- **Any Stage D row** (`quantflow-electron/src/main/runtime-state/**`,
  `orchestration-service.ts`, `ipc-orchestration.ts`, orchestration MCP tools) — excluded by founder decision.
- **Every KEEP row:** `queryRun()` name, `run-templates/`, `src/harness/**` path, `harnesses` table,
  `harnessKind`, kind string `eve-harness`, `createEveHarness`, `checkpoint_state`, `human_decision`,
  `watchtowerPaused`, legend `pause` icon, span names `harness.*`.
- Runtime behavior, Kernel schema, receipts, migrations (beyond the already-frozen A2 rows).
- The deprecated aliases (`kernel.run`, `quantflow_kernel_run`) stay until Stage D coordination.

## Proof command

```bash
bun test src && (cd quantflow-electron && bun test)
grep -rn "WorkflowRun\b\|runGet\|'budget-paused'\|kind: 'pause'" src/ --include="*.ts"          # → 0 hits
grep -rn "state\.sessionId\|EveState.*sessionId" src/harness/eve/ --include="*.ts"              # → 0 hits
```

## Exit gate

Both test suites green; all three greps return zero hits; one commit.

## Rollback

Single-commit codemod → `git revert <sha>`. No schema/data migration involved.
