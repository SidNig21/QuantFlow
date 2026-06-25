# docs/v4 — v4 build territory & plan (AGENTS)

This subtree holds the **v4** planning authority. It does not change v3 — v4
extends the shipped v3 backbone (Kernel owns truth; Conductor plans; Harness
adapts; Workers execute; Receipts prove; State Cards summarize; Vault mirrors;
Evals judge).

## What lives here

- `V4_TERRITORY_MAP.md` — the locked **reference**: the full v3→v4 territory, the
  four bands (A Execution · B Flow · C Control · D Judgment), the 8-rung spine,
  the anti-swamp rule, and the open decisions. Every rung promotion is checked
  against it. It is *reference*, not a per-rung work order.
- The per-rung **work orders** for the **v4 spine** live in `/BUILD_PLAN_V4.md`
  (repo root), one section per rung (R0…R7) in the v3 goal-shape convention.
  **The spine (R0–R8.5) is complete** — that file is now mostly a record.
- `SURFACE_LADDER.md` — the **authoritative build plan for the post-spine Surface
  / Canvas Reflection phase (rungs S0–S6)**: project the shipped spine onto the
  canvas. It is self-sufficient; Surface workers read it **instead of** the
  R0–R8.5 bodies in `/BUILD_PLAN_V4.md`.
- `PERFORMANCE_LADDER.md` — the **scope plan for the Performance phase (rungs
  PF0–PF7)**: derived from `PERF_STACK_AUDIT.md` (this folder), it makes the app feel instant
  (instrument first, kill snapshot-polling, collapse the persistence layers). It is
  self-sufficient + carries its own parallel-execution waves; `PF#` ≠ the audit's
  `P0–P3` priority bands.
- `GLOSSARY.md` — **canonical v4 vocabulary** (structure-freeze); wins on resolved
  overloaded terms (`run`, `harness`, `pause`). `docs/v3/GLOSSARY.md` remains the v3 base.

## Read order for v4 work

> **Surface-phase (S-rung) work:** follow the short reading order in
> `SURFACE_LADDER.md` instead — that doc is self-sufficient and you do **not**
> need the R0–R8.5 goal bodies. The order below is for the (complete) spine.

1. Applicable `AGENTS.md` chain (root → child for the target folder).
2. `docs/v4/V4_TERRITORY_MAP.md` — territory + open decisions.
3. `/BUILD_PLAN_V4.md` — the current rung's goal shape + its **cumulative
   regression guard** (Appendix A).
4. `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` +
   `docs/v3/KERNEL_SCHEMA_V1.md` + **`docs/v4/GLOSSARY.md`** (live vocabulary;
   `docs/v3/GLOSSARY.md` for unchanged v3 base terms) — **all still binding.**
5. `BUILD_PLAN_V3.md` — shipped v3 ladder (reference) + the goal-shape convention.

## Binding rules for v4

- **One rung at a time.** Implement only the promoted rung's scope. Worker submits
  + the rung's verification evidence; verifier checks against the Acceptance Test
  and the cumulative Regression Guard; verifier updates the `BUILD_PLAN_V4.md`
  ledger and pushes. Workers do not self-approve.
- **The three v4 constitutional lines hold:** *Kernel decides; Envoy mirrors* ·
  *every new system attaches to the atom or the next rung* · *Kernel is terminal
  on truth, the human is terminal on decisions.*
- **Naming:** `R0` = the auth/capability preflight rung. The deferred
  distribution work the territory map §9 calls "Distribution / R0" is the
  **distribution axis** — not this rung.
- **Two proof tracks per rung:** deterministic mock/sim (CI, no auth, no cost) +
  one real run. No rung's acceptance depends *solely* on real-agent auth.
- **Do not** create a second truth store, let the canvas mutate truth, let a
  worker self-complete, make a harness write Kernel state, make MCP the internal
  fast path, or make a projection (Context Envelope / Run Replay / evals)
  authoritative.

## Note on this subtree's git tracking

`docs/*` is git-ignored except `docs/v3/**` and `docs/v4/**` (see `.gitignore`).
New files here are tracked; do not add planning files outside `docs/v4/` expecting
them to be tracked.
