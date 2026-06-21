# v4 Rung Handoff — R5 — Human Checkpoint / Deepen Loop

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R4 ✅ (durable runtime + sim harness). Builds on R2 ✅ / R3 ✅ too.

> **The steering wheel, NOT autopilot.** R5 makes a run **pause at a checkpoint, show
> the human a candidate set, take a token-bound selection, and spawn deepening tasks for
> the chosen candidate(s) — then resume.** It operationalizes the decision-authority rule:
> *Kernel is terminal on truth; the human is terminal on decisions.* The run must NEVER
> auto-decide. No new templates, no replay, no semantic verify (those are R6/R7).

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R5 — Human Checkpoint / Deepen Loop" + the
**R5 row** of § "Eve Integration". Both binding. **If brief and plan disagree, the plan
wins — flag it.**

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → child `AGENTS.md` for every folder you touch.
- `BUILD_PLAN_V4.md` § "Goal R5" **and** § "Eve Integration" (R5 delta).
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` + `docs/v3/KERNEL_SCHEMA_V1.md`
  + `docs/v3/GLOSSARY.md` — esp. the **decision-authority rule**.
- **What's already shipped that R5 REUSES (do not re-create, do not collide):**
  - **`workflows.checkpoint_state` ALREADY EXISTS** (R3a migration `004`). So R5 likely needs
    **NO new column** — use the existing field for the run pause. **If** you genuinely need a
    new column, it's migration `007` (006 = R2 is taken); but first confirm you can't use
    `checkpoint_state` + `metadata_json`. Don't re-add `checkpoint_state`.
  - **The 5D approval-token machinery is ALREADY in `src/main/conductor/conductor-loop.ts`** —
    `proposalToken` drift-proofing, an `awaiting-approval` phase, and **stale/forged/drifted
    token refusal**. **REUSE this exact mechanism for the selection token** (same drift-proof
    property: an operator approves the exact candidate set shown, not a drifted one). Do NOT
    invent a second token scheme. The loop also has `budget-paused` (R4) and is one-approved-
    action-per-step — add the checkpoint/selection flow as a **sibling phase**, not a rewrite.
  - **The `sim` harness (R4)** — `src/harness/sim/` — drives `smoke:checkpoint` deterministically.
  - **`kernel.task.depend`** (R3) declares the deepening-task links (`task_dependencies`).
  - **`queryRun`** (R3a) reads the run incl. `checkpoint_state`. **DB test seam:**
    `setKernelDbForTesting` / in-memory injection (study `smoke:pod` / `smoke:context-flow`).
- Seam files (plan § Direct Repo Scope is exhaustive):
  - `src/main/conductor/conductor-loop.ts` (checkpoint phase: pause → surface candidates → token-bound selection → spawn deepening tasks → resume)
  - `src/kernel/tasks/index.ts` (deepening tasks created from the selected candidate, linked via `task_dependencies`)
  - the candidate set = an **artifact with `kind: 'candidate'`** (`artifact.kind` is free TEXT today — **no enum/migration work**, F24)
  - `src/kernel/workflows/index.ts` (checkpoint_state transitions: running → `awaiting-selection` → resumed) — likely no migration
  - `quantflow-electron/scripts/smoke-checkpoint.ts` + `quantflow-electron/package.json` (`smoke:checkpoint`)

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)
- **Checkpoint pause:** at a checkpoint, the run pauses with `checkpoint_state = 'awaiting-selection'`.
- **Three "pause" concepts — name the owner (F13):** `checkpoint_state` = the **run-instance**
  pause (`awaiting-selection`); `workflows.status` stays the **mission-level** pause; the loop's
  own phase is **transient per-step**. State this ownership in your goal notes so the executor/UI
  don't special-case all three.
- **Candidate-set artifact:** the options are surfaced as a typed **`candidate` artifact**
  (`kind: 'candidate'`), NOT live mutable state. It references its option payloads; it's created
  through `kernel.artifact.create` like any artifact.
- **Token-bound selection (reuse 5D):** the operator submits a selection **bound to the exact
  candidate set shown** (reuse the `proposalToken` drift-proofing in `conductor-loop.ts`). The
  selection is recorded as a **human-decision receipt**.
- **Deepening tasks spawn ONLY for the selected candidate(s)**, linked via `task_dependencies`
  (`kernel.task.depend`); then the run resumes (`checkpoint_state` → resumed).
- **Eve delta:** Eve's `input.requested` / `authorization.required` events **park** the session;
  the QF loop surfaces the candidate set and takes the **token-bound** selection (5D decision
  authority stays QuantFlow's), then resumes via `continuationToken`. Eve provides pause/resume;
  **QuantFlow keeps the decision.**

## 3. Hard guardrails — do NOT (the R5 Failure Signals as rules)
- The run must **NEVER auto-decide** at a checkpoint — no selection ⇒ it stays paused indefinitely.
- The selection **must be token-bound** — an operator must not be able to approve set A and have
  the run deepen a drifted set B (reuse 5D stale/forged/drifted-token refusal).
- **No deepening task spawns without a valid human selection.**
- The candidate set is a **`candidate` artifact**, not live mutable state.
- **No auto-selection of any kind.** No templates (R6), no replay / decision-log-as-typed-artifact
  / semantic verify (R7). Migration is additive (or none — prefer reusing `checkpoint_state`).
- A harness returns drafts; the **caller posts to the Kernel** (F4). No second truth store. The
  5D loop approval semantics must be **unchanged** for existing paths.
- **One rung only. Commit locally. Do NOT push. Do NOT update the BUILD_PLAN ledger. Do NOT self-approve.**

## 4. Definition of done (acceptance)

**Machine proof (CI, `sim` harness, deterministic) — `bun run smoke:checkpoint`:**
- A run reaches a checkpoint and **pauses** (`checkpoint_state = 'awaiting-selection'`).
- It surfaces a **candidate-set artifact** (`kind: 'candidate'`).
- The operator submits a **token-bound** selection; deepening task(s) spawn for the **selected
  candidate only**; the run **resumes**.
- The selection is recorded as a **human-decision receipt**.
- **Decision-authority negatives:** with no selection submitted the run **stays paused**
  indefinitely (no auto-pick); a **stale / forged / drifted** selection token is **refused**
  (reuse 5D behavior); **no deepening task spawns** without a valid selection.

**Product proof (LIVE CANVAS — the standing bar from R2 on):**
> A real run, in the live app, **pauses at a checkpoint**, the operator **picks** from the
> candidate set, and the deepening tasks **run**. Capture: the paused run + candidate artifact +
> the recorded selection receipt + the spawned deepening task(s). (DevTools/MCP seeding is
> acceptable *setup*; the pause→pick→deepen must be witnessed live.)
> **Verify-ownership note:** closing the deepening tasks may still need operator-verify today —
> that's the R5/R6 self-serve gap; don't design the checkpoint flow to *assume* it, and flag it.

**Regression guard (must stay green — cumulative, Appendix A). From `quantflow-electron/`:**
```text
bun run smoke:kernel-task && bun run smoke:state-card && bun run smoke:conductor && \
bun run smoke:conductor-actions && bun run smoke:conductor-loop && bun run smoke:worker-harness && \
bun run smoke:harness-interface && bun run smoke:workflow-region && bun run smoke:vault-export && \
bun run smoke:eval && bun run smoke:capability-preflight && bun run smoke:task-atom && \
bun run smoke:dag && bun run smoke:authority && bun run smoke:pod && bun run smoke:context-flow && \
bun run smoke:checkpoint && \
bun test src/main/harness-ops.test.ts && bun test src/main/diagnostics/health-runner.test.ts && \
bun test ../src/main/conductor/dag-scheduler.test.ts && bun run build
cd ../tools/quantflow-mcp && node --test
```
- **`smoke:conductor-loop` must stay green** — proves the existing 5D approval semantics are
  unchanged. `smoke:pod` / `smoke:context-flow` green = R4/R2 intact.

## 5. Verification handoff — paste THIS back (so the verifier needs no repo access)
1. **Diff** — `git diff <last-approved-ref>..HEAD` (or changed-files list + full contents).
2. **Command outputs** — the **full, real** output of every §4 command, pass/fail, **no trimming**.
3. **Self-assessment** — table: each §4 criterion → met / not-met → evidence line.
4. **Notes** — confirm: which field owns checkpoint pausing (F13); that you **reused** the 5D
   `proposalToken` machinery (not a new scheme); whether you needed a migration (and that
   `checkpoint_state` already existed); how the candidate set is a `candidate` artifact (not
   mutable state); and the decision-authority negatives (no-selection-stays-paused, drifted-token
   refused). Flag the verify-ownership gap. Note any scope deviation.

> Verifier rule: R5 is approved only when the diff matches scope, every §4 command is green in
> the pasted output, no guardrail is tripped (esp. *never auto-decides*, *token-bound selection*,
> *candidate-as-artifact*, *5D semantics unchanged*), and the live-canvas product proof is
> witnessed. Workers never self-approve.
