# v4 Rung Handoff — R6 — Run Templates (Scout / Research / Deep)

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R3 ✅ (DAG) · R4 ✅ (runtime/budgets) · **R5 (checkpoint loop)** — R5 must
be built first. **Draft note:** this handoff is written against the *plan*; when R6 is
promoted, **confirm the exact R5 checkpoint-controller API** (pause/candidate/selection)
and wire to it rather than re-implementing it.

> **Where v4 becomes a product:** the operator picks **"Scout this" / "Research this" /
> "Deep-research this"** and a tuned run executes the whole `collect → checkpoint (R5) →
> deepen` loop from one named invocation. R6 is a **compiler/driver over the existing
> engine**, NOT a new orchestrator and NOT a Kernel primitive.

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R6 — Run Templates" + § "Eve Integration"
(R6 row). Binding. **If brief and plan disagree, the plan wins — flag it.**

## 1. Read before coding (in order)
- `AGENTS.md` chain → `docs/v4/AGENTS.md` → child `AGENTS.md` for folders you touch.
- `BUILD_PLAN_V4.md` § "Goal R6" + § "Eve Integration".
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` + `docs/v3/GLOSSARY.md`.
- **What's shipped that R6 COMPILES ONTO (reuse, do not re-implement — F14):**
  - **`src/main/conductor/dag-scheduler.ts` (R3)** — eligibility/gating. The template runner
    compiles a template → a DAG, then runs it through **this** scheduler. Do NOT write a second
    gating/scheduling path.
  - **Runtime manager + budgets (R4)** — `workflows.budget_json` is the budget container; the
    executor enforces it. Templates *declare* budgets; R4 enforces.
  - **The R5 checkpoint controller** — templates *declare* checkpoint phases; R5 owns
    pause/candidate/selection. (Confirm R5's actual API at promotion.)
  - **The legend registry (R8/R8.5)** — `roles/*.json`. Templates **only reference roleIds
    already stocked** in the legend; they NEVER define agents or carry spawn logic.
  - **DB test seam** (`setKernelDbForTesting`) + the `sim` harness (R4) drive `smoke:run-template`.
  - Today only a **hardcoded `rl-training`** template exists in
    `src/windows/shell/src/legend-dock.js` — R6 makes templates **data-driven + multi-template**.
- Seam files (plan § Direct Repo Scope is exhaustive):
  - Templates as plan-layer config: `<QUANTFLOW_DIR>/run-templates/*.json` (like `roles/*.json`)
  - `src/main/conductor/` (template **runner** = compile template → DAG + phase metadata → run via the shared scheduler/runtime/checkpoint)
  - `scout.json` / `research.json` / `deep.json` (DAG depth · roles · budgets · stop conditions · artifact expectations · per-phase attention profile `high|medium|low`)
  - attention-profile enforcement (serialize high-attention phases; parallelize only low-attention)
  - `quantflow-electron/scripts/smoke-run-template.ts` + `quantflow-electron/package.json` (`smoke:run-template`)

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)
- **Templates = plan-layer config, NOT a Kernel primitive.** A template is a saved layout:
  `tiles[]` (each a `roleId` + canvas position) + `connections[]` + workflow wiring
  (DAG/roles/budgets/stop/artifact-expectations/attention-profile). It references roleIds from
  the top-half legend; it carries **no spawn logic and no Run truth**.
- **The runner is a compiler/driver (F14):** compile template → DAG + phase metadata, then
  execute through the **same `dag-scheduler` (R3) + runtime manager (R4) + checkpoint controller
  (R5)**. It must NOT re-implement gating, scheduling, budget, or checkpoint logic — three
  potential orchestrators (loop / template runner / runtime manager) must stay **one executor**.
- **Attention Profile (plan-layer attribute, NOT a primitive):** each phase declares a touch
  level — **high** (spec/clarification/final decision), **medium** (plan review/candidate
  selection/verifier objections), **low** (collection/analysis/report). The runner runs **one
  human-led high-attention lane + one or more low-attention execution lanes** with artifact
  handoff. **Serialize high-attention phases; parallelize only low-attention** — never let
  several high-attention agents interrogate the operator at once.
- **Three templates:** `scout` (shallow/fast), `research` (medium + checkpoint), `deep` (deeper
  DAG + budgets + multiple checkpoints). Each invokable by name → full loop.
- **Eve delta:** a template role can target the `eve-harness` ("spawn N Eve research agents");
  structure unchanged — templates still only reference stocked roleIds.

## 3. Hard guardrails — do NOT (the R6 Failure Signals as rules)
- A template must NOT become a Kernel primitive / truth store — it is **plan-layer config**.
- A run must NOT **duplicate** Run truth inside the template.
- Do NOT ignore the attention profile — a high-attention phase must never be parallelized and
  swarm the operator.
- The template runner must NOT re-implement gating/scheduling/budget/checkpoint — it **compiles
  to a DAG and drives the existing executor** (F14). No second orchestrator.
- Templates define **no agents** and carry **no spawn logic** — they reference stocked roleIds only.
- No Night-Shift packaging / morning-briefing, no Run Replay / semantic verify / lessons (R7).
- **One rung only. Commit locally. Do NOT push. Do NOT touch the ledger. Do NOT self-approve.**

## 4. Definition of done (acceptance)

**Machine proof (CI, `sim` harness) — `bun run smoke:run-template`:**
- Invoking a named template (e.g. **Scout**) instantiates a Run, executes its DAG on `sim`
  workers **within its declared budget**, hits its **checkpoint(s)**, and produces the expected
  artifacts.
- A **high-attention phase is serialized** (not parallelized) while a **low-attention phase runs
  in parallel**, per the template's attention profile.
- The runner uses the shared `dag-scheduler` (assert no second scheduling path), and the template
  is **config only** (no Kernel schema/primitive added).

**Product proof (LIVE CANVAS — the standing bar):**
> A real **Scout** run (and one of Research/Deep) executes end-to-end **from a single named
> invocation** in the live app: clicking the template restores the layout and runs the full
> `collect → checkpoint → deepen` loop. Capture the named invocation + the resulting run.

**Regression guard (cumulative — Appendix A). From `quantflow-electron/`:** the full stack
through R5 (`...smoke:context-flow smoke:checkpoint smoke:run-template`) + harness-ops +
health-runner + dag-scheduler + build + MCP. **`smoke:dag`/`smoke:pod`/`smoke:checkpoint` stay
green** (R3/R4/R5 intact — the runner drives them, doesn't replace them).

## 5. Verification handoff — paste THIS back
1. **Diff** — `git diff <last-approved-ref>..HEAD` (or changed-files + full contents).
2. **Command outputs** — full real output of every §4 command, pass/fail, no trimming.
3. **Self-assessment** — table: each §4 criterion → met/not-met → evidence.
4. **Notes** — confirm the runner **compiles to a DAG and reuses `dag-scheduler`/runtime/checkpoint**
   (not a second orchestrator), that templates are config-only (no primitive), how the attention
   profile serializes high / parallelizes low, and that templates reference only stocked roleIds.
   Note how you wired to R5's actual checkpoint API. Flag any scope deviation.

> Verifier rule: approved only when the diff matches scope, every §4 command is green in the
> pasted output, no guardrail is tripped (esp. *one executor*, *config-not-primitive*, *attention
> profile honored*), and the live-canvas named-run proof is witnessed. Workers never self-approve.
