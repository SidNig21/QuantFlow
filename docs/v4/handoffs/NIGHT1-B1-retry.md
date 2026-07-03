# NIGHT 1 B1 RETRY - Stage B with Windows-scoped seed gates

> Builder: Codex
> Branch: `quantflow-v4`
> Starting point: A3 is already committed at `a3025ec67876e5e3c2aa55f41ec4be467f8aaf9c`
> Mission: resume Night 1 at B1, then continue B2-B5 only after each chunk passes its gate.

## 0. Read order

Read these before touching code:

1. `START_HERE.md`
2. `REBUILD_QUEUE.md` sections 1-2
3. `docs/v4/handoffs/NIGHT1-A3-stageB.md`
4. `docs/v4/handoffs/NIGHT1-RETRY-REPORT.md`
5. `docs/v4/PERFORMANCE_LADDER.md` PF0 only, including its Handoff Block
6. `docs/v4/PERF_STACK_AUDIT.md` sections E-F
7. The `AGENTS.md` file for any module you touch

Do not re-run or re-implement A3. Treat commit `a3025ec` as the landed A3 base.

## 1. Binding rules

The original `NIGHT1-A3-stageB.md` still binds unless this retry doc explicitly overrides it.

1. Start at B1. Do not redo A3.
2. Execute chunks strictly in order: B1, B2, B3, B4, B5.
3. One passing chunk equals one local commit. Do not push.
4. A gate that fails twice ends the session. Report it; do not improvise past red.
5. Do not self-mark anything `Implemented-verified`. The ceiling remains `Implemented-unverified`.
6. Leave unrelated operator dirt alone. Do not commit `Rebuild Prompt.md` or unrelated shell changes.

## 2. Why this retry exists

B1 previously stopped because its seeded `unit-kernel` check used `bun test src`, which is Windows-red on the current host for pre-existing baseline failures. The B1 runner shape was fine; the seed command was the wrong gate for native Windows.

Use the scoped A3 command for the blocking kernel seed:

```text
bun test src/kernel src/harness src/main/conductor src/evals
```

Keep the full suite visible as a named, non-blocking baseline check:

```text
bun test src
```

## 3. Chunk B1 retry - `qa/` runner skeleton

- Layer: QA
- Objective: create a repo-root `qa/` harness where every gate is a named, re-runnable command.
- Build: `qa/run.ts` using Bun.
- Existing `qa/` screenshots and review docs are evidence. Keep them. Move to `qa/evidence/` only if needed for runner clarity.

Seed checks:

| Check | Command | Gate role |
|---|---|---|
| `contract-nouns` | A3 forbidden-vocabulary `rg` checks | Blocking |
| `unit-kernel` | `bun test src/kernel src/harness src/main/conductor src/evals` | Blocking |
| `unit-kernel-full` | `bun test src` | Non-blocking Windows baseline, must report red/green |
| `unit-shell` | `cd quantflow-electron && bun test` | Blocking unless it is proven pre-existing Windows baseline red |

Required `contract-nouns` patterns:

```text
rg "WorkflowRun\b|runGet\b|'budget-paused'|kind: 'pause'" src/ -g "*.ts"
rg "state\.sessionId|EveState.*sessionId" src/harness/eve/ -g "*.ts"
```

For `contract-nouns`, `rg` exit code 1 means success if output is empty. Any matches are a failure.

Expected B1 proof:

```text
bun qa/run.ts --list
bun qa/run.ts contract-nouns
bun qa/run.ts unit-kernel
bun qa/run.ts unit-kernel-full
bun qa/run.ts unit-shell
```

Exit gate:

- `--list` shows at least the four checks above.
- `contract-nouns` is green.
- `unit-kernel` is green using the scoped command.
- `unit-kernel-full` runs and its result is recorded, but native-Windows baseline failure does not block B1.
- `unit-shell` is green. If it fails twice on pre-existing native-Windows baseline failures, stop and report instead of inventing a new scope silently.
- Commit message: `qa(B1): add named retry gate runner`

Rollback:

- Delete `qa/run.ts`.
- Delete only new B1 artifacts.
- Leave prior evidence files and unrelated operator dirt alone.

## 4. Continue B2-B5

After B1 passes and is committed, continue with B2-B5 exactly as specified in `NIGHT1-A3-stageB.md`.

Do not weaken B2-B5 proof gates because of the B1 retry. If a later full-suite command is Windows-red for a known baseline, stop after the second failure and report the exact output.

## 5. Return report

Write:

```text
docs/v4/handoffs/NIGHT1-B1-RETRY-REPORT.md
```

Use the template in `NIGHT1-A3-stageB.md` section 9, with these additions:

- State that A3 was already landed at `a3025ec` and was not modified.
- For B1, paste real output for all five commands in the expected proof list.
- For `unit-kernel-full`, report whether the native-Windows baseline is still red and cite the failing tests.
- If `unit-shell` is treated as pre-existing Windows-red, paste both failed attempts and stop.
- For every later chunk, include commit, proof command, real proof output, deviations with reasons, and verifier rerun commands.

## 6. Verifier checklist

Verifier should re-run:

```text
bun qa/run.ts --list
bun qa/run.ts contract-nouns
bun qa/run.ts unit-kernel
bun qa/run.ts unit-kernel-full
bun qa/run.ts unit-shell
```

If B2-B5 land, verifier should also re-run each chunk's proof from the return report.
