# v4 Rung Handoff Template

The reusable shape for each rung handoff. Workflow:

```text
Claude drafts the rung handoff (this shape) → operator pastes it to Codex →
Codex builds + commits locally + pastes back the §5 verification bundle →
operator pastes that to Claude → Claude verifies against §4/§5 → ledger update.
```

The handoff is a **brief + a verification contract**, not a re-statement of the
plan. `BUILD_PLAN_V4.md` § "Goal <Rung>" stays the authoritative scope.

---

# v4 Rung Handoff — <R# — Name>

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** <prior rung(s) that must be approved first, or "none">

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal <R#>" — read it as binding. This brief
front-loads essentials + the verification contract. If brief and plan disagree,
**the plan wins — flag the discrepancy, don't silently pick.**

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → the child `AGENTS.md` for every folder you touch
- `BUILD_PLAN_V4.md` § "Goal <R#>" **and** § "Eve Integration" (for the Eve delta)
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` (+ `KERNEL_SCHEMA_V1.md` if touching schema)
- Seam files: <exact files this rung touches>

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)
- <crisp bullets: files to create/change, the contracts/shapes, the Eve delta if any>

## 3. Hard guardrails — do NOT
- <this rung's Failure Signals, as do-not rules>
- One rung only. Config/roles ≠ Kernel truth. A harness returns drafts; the caller posts to the Kernel (F4). No second truth store. No `kernel.*` schema change unless this rung's scope says so.
- Commit locally. **Do NOT push. Do NOT self-approve.**

## 4. Definition of done (acceptance)
- **Machine proof (CI, deterministic, no auth/cost):** <exact test/smoke commands + what each asserts>
- **Product proof (manual, if any):** <what to demonstrate + what to capture>
- **Regression guard (must stay green — cumulative, Appendix A):** <the full smoke/test/build stack for this rung>

## 5. Verification handoff — paste THIS back (so the verifier needs no repo access)
1. **Diff** — `git diff <base-ref>..HEAD` (or: list of changed files + full contents of every new/changed file).
2. **Command outputs** — the **full, real** output of every command in §4 (each test, the regression stack, the build), showing pass/fail. Do **not** summarize or trim failures.
3. **Self-assessment** — a table: each §4 acceptance criterion → met / not-met → the evidence line.
4. **Notes** — any deviation from scope, any guardrail you were tempted to cross, any spike result (e.g. the R0 OpenRouter-provider finding), any new file the plan didn't anticipate.

> Verifier rule: a rung is approved only when the diff matches scope, the §4
> commands are green in the pasted output, no guardrail is tripped, and the
> spikes are resolved or explicitly carried forward. Workers never self-approve.
