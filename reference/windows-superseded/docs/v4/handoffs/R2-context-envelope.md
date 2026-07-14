# v4 Rung Handoff — R2 — Upstream Artifact → Downstream Context

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R1 ✅ (atom). Lands into a world where **R3 ✅ (DAG + one authority) and
R4 ✅ (durable runtime) are already shipped** — so R2 *composes with* them (see §2).

> **The smallest Band-B increment, and the keystone for everything after it.** R2 makes
> ONE downstream task actually *consume* ONE upstream **verified** artifact. Until R2,
> the DAG is topology only — agents don't build on each other. Keep it a straight line:
> no graph, no parallelism, no new truth store. Pure projection + `harness.send` + one
> additive lineage column.

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R2 — Upstream Artifact → Downstream Context"
+ the **R2 row** of § "Eve Integration" — both binding. This brief front-loads essentials
+ the verification contract. **If brief and plan disagree, the plan wins — flag it.**

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → the child `AGENTS.md` for every folder you touch
  (esp. `src/kernel/AGENTS.md`).
- `BUILD_PLAN_V4.md` § "Goal R2" **and** § "Eve Integration" (the R2 delta).
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` + `docs/v3/KERNEL_SCHEMA_V1.md`
  + `docs/v3/GLOSSARY.md` (all binding).
- **What's already shipped that R2 builds ON (do not re-create — and do not collide):**
  - **`task_dependencies` already has `kind = 'context_from'`** (baseline schema) alongside
    `'blocks'`. R2 reads the `context_from` edges; `kernel.task.depend` already accepts
    `kind: 'context_from'` (added in R3). **Use it to declare the context edge — do not add
    a new edge mechanism.**
  - **The R3 claim gate (`unmetBlockingDependencies`) gates only `'blocks'` deps.**
    `context_from` is for *context*, not gating — keep that separation. (So R2's "weak
    assignment gate" caveat from the plan is largely handled: if you *also* want B blocked
    until A verifies, that's a `'blocks'` edge, already enforced by R3. R2 itself only
    guarantees the *envelope* marks an upstream `verified` truthfully.)
  - **Migrations 001–005 exist** (005 = R4). **Your migration is `006-r2-artifact-lineage.sql`**
    — wire it into `src/kernel/database.ts` MIGRATIONS array (version 6) AND exec it in the
    new smoke (the smokes exec migration files by name). Do NOT reuse 00X from the plan text.
  - **DB test seam:** `setKernelDbForTesting` / `loadBetterSqlite3` in `src/kernel/database.ts`
    — use the in-memory DB injection pattern (study `smoke:dag` / `smoke:task-atom`).
  - The R1 atom path (`conductor-actions.assign_task` → `harness.send` → mock draft → caller
    posts `kernel.artifact.create` → submit → structural verify) — R2 *extends* the assign
    step to build + deliver the envelope.
- Seam files (plan § Direct Repo Scope is exhaustive):
  - `src/kernel/context/envelope.ts` (NEW — **pure** ContextEnvelope v0 builder) + `.test.ts`
  - `src/kernel/queries/index.ts` (add `queryUpstreamArtifacts(taskId)` — verified artifacts via `context_from`)
  - `src/kernel/migrations/006-r2-artifact-lineage.sql` (NEW — additive `artifacts.derived_from`) + `database.ts` + `schema/types.ts` + `docs/v3/KERNEL_SCHEMA_V1.md`
  - `src/kernel/receipts/index.ts` (`kernel.artifact.create` accepts/records `derived_from`)
  - `src/main/conductor/conductor-actions.ts` (assign builds the envelope + delivers via `harness.send`)
  - `quantflow-electron/scripts/smoke-context-flow.ts` + `quantflow-electron/package.json` (`smoke:context-flow`)

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)
- **`src/kernel/context/envelope.ts` — a PURE read-path projection.** Build the envelope from
  existing Kernel reads (`queryArtifactList`/`queryReceiptList`/`queryStateCardList`/`queryTaskGet`
  + the new `queryUpstreamArtifacts`). Shape (territory map §5):
  `run{run_id?, mode?, objective?}` · `role` · `task{objective, acceptance_criteria,
  expected_artifact, verification_rule}` · `permissions` · `upstream_artifacts[{artifact_id,
  title, uri, kind, verification_status, produced_by_task}]` · `relevant_state_cards` ·
  `recent_receipts` · `instrumentation{context_tokens_estimate, raw_receipt_count}`.
- **References, never copies (F-secondstore):** the envelope references upstream artifacts by
  `artifact_id` + `uri` — it **never copies artifact content/truth**.
- **`verification_status` is read from Kernel truth:** an upstream is `verified` ONLY when its
  task reached `complete` via a `verification_passed` receipt; unverified/incomplete upstreams
  are excluded (or clearly not `verified`).
- **Sensitivity hook (default-deny):** `sensitivity != normal` artifacts are **not injected by
  default**. R2 defaults everything to `normal` but implements the exclusion hook so turning it
  on at R7 isn't a retrofit.
- **Instrumentation = measurement only:** capture `context_tokens_estimate` / `raw_receipt_count`;
  **build NO densifier/RAG** (territory map §3 — densify only if measured pain appears).
- **Builder purity (F19):** `envelope.ts` imports **only** `kernel/queries`, issues **no
  mutation**, and has **no imports from `conductor/` or `renderer/`**. Treat this as a hard rule.
- **Lineage:** additive migration `006` adds `artifacts.derived_from` (JSON array of artifact_ids,
  default `[]`/null); `kernel.artifact.create` accepts + records it; the downstream artifact
  records `derived_from: [A.artifact_id]`.
- **Delivery:** `assign_task` for the downstream task builds the envelope and delivers it via
  `getWorkerHarness(kind).send(handle, { … })` — **never** paste / `terminal_write`. The mock
  must receive the **envelope object**, not a bare string.
- **Eve delta:** unchanged build (the cross-agent envelope is yours). For an Eve worker the
  envelope rides in the **Eve session message** (Eve consumes it via instructions/skills) — no
  callback needed (cloud Eve can't reach the local Kernel directly).

## 3. Hard guardrails — do NOT (the R2 Failure Signals as rules)
- Do NOT let the envelope **copy** artifact content/truth — reference by `artifact_id` + `uri` only.
- Do NOT pass an unverified/incomplete upstream as `verified` context.
- Do NOT mutate Kernel state while building the envelope (it's a pure projection).
- Do NOT inject a sensitive artifact by default.
- Do NOT deliver context by paste / `terminal_write` — only `harness.send`.
- Do NOT add a DAG, Run object, parallelism, densifier/RAG, or any provenance field beyond
  `derived_from` (the rest are R7). Migration is **additive** only.
- A harness returns drafts; the **caller posts to the Kernel** (F4). No second truth store.
- **One rung only. Commit locally. Do NOT push. Do NOT self-approve.**

## 4. Definition of done (acceptance)

**Machine proof (CI, mock harness, deterministic) — `bun run smoke:context-flow`:**
- Task A (mock) produces a **verified** artifact (reuse the R1 atom).
- Task B is declared `context_from` A (via `kernel.task.depend`, `kind: 'context_from'`).
  `assign_task` for B builds a Context Envelope whose `upstream_artifacts` contains A's artifact
  with `verification_status: verified`, `uri`, `produced_by_task: A`, delivered via `mock.send`
  (assert the mock received the **envelope object**, not a bare string).
- B's produced artifact records `derived_from: [A.artifact_id]`.
- Building the envelope issues **no** Kernel mutation (assert: receipt/row counts unchanged).
- `instrumentation.context_tokens_estimate` / `raw_receipt_count` present.
- **Negatives:** an upstream not yet `complete`/verified is **not** marked `verified` (or
  excluded); a `sensitivity != normal` artifact is **not** injected by default.

**Product proof (LIVE CANVAS — this is now the bar, not a console exercise):**
> From R2 onward the product proof must run through the **live app**, not a DevTools-only
> seed. Demonstrate: a real downstream worker (Eve or CLI tile) receives A's verified artifact
> **via the envelope in its `send` payload** and uses it to produce B's artifact, which records
> `derived_from`. Capture: the envelope delivered to the downstream tile + B's artifact + its
> `derived_from` link. (Seeding the two-node link via DevTools/MCP is acceptable *setup*; the
> **handoff itself must be a real `harness.send` envelope to a real worker**, witnessed live.)

**Regression guard (must stay green — cumulative, Appendix A). From `quantflow-electron/`:**
```text
bun run smoke:kernel-task && bun run smoke:state-card && bun run smoke:conductor && \
bun run smoke:conductor-actions && bun run smoke:conductor-loop && bun run smoke:worker-harness && \
bun run smoke:harness-interface && bun run smoke:workflow-region && bun run smoke:vault-export && \
bun run smoke:eval && bun run smoke:capability-preflight && bun run smoke:task-atom && \
bun run smoke:dag && bun run smoke:authority && bun run smoke:pod && bun run smoke:context-flow && \
bun test src/main/harness-ops.test.ts && bun test src/main/diagnostics/health-runner.test.ts && \
bun test ../src/main/conductor/dag-scheduler.test.ts && bun run build
cd ../tools/quantflow-mcp && node --test
```
- **`smoke:task-atom` / `smoke:dag` / `smoke:pod` must stay green** — R1/R3/R4 intact. Migration
  `006` is **additive** (`artifacts.derived_from` defaults empty).

## 5. Verification handoff — paste THIS back (so the verifier needs no repo access)
1. **Diff** — `git diff <last-approved-ref>..HEAD` (or changed-files list + full contents).
2. **Command outputs** — the **full, real** output of every §4 command (each smoke, the
   regression stack, the build), pass/fail, **no trimming of failures**.
3. **Self-assessment** — table: each §4 criterion → met / not-met → evidence line.
4. **Notes** — confirm the envelope is a pure projection (no conductor/renderer imports, no
   mutation), how `verification_status` is derived from Kernel truth, the sensitivity-default-deny
   hook, the migration number (`006`) and that it's additive, and the **live-canvas product
   proof** evidence. Flag any scope deviation.

> Verifier rule: R2 is approved only when the diff matches scope, every §4 command is green in
> the pasted output, no guardrail is tripped (esp. *no copied truth*, *pure projection*,
> *verified-only*, *harness.send delivery*), **and the live-canvas product proof is witnessed**.
> Workers never self-approve.

---

### Known adjacent gap (NOT R2 scope, but flag if you trip it)
**Verify ownership:** today a human plays verifier on the canvas (the R3 `r3FinishTask` grind).
R2 does not fix this — but do **not** design the envelope flow in a way that *assumes* the
operator clicks verify. The downstream task should still complete via a real `verification_passed`
receipt (a verifier worker or the conductor path), not a legacy `qf_task_complete`. If the only
way to close B in your product proof is the operator clicking verify, note it — it's the
self-serve gap R5/R6 must close, and it shouldn't silently calcify here.
