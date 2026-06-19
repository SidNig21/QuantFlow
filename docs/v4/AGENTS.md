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
- The per-rung **work orders** live in `/BUILD_PLAN_V4.md` (repo root), one
  section per rung (R0…R7) in the v3 goal-shape convention.

## Read order for v4 work

1. Applicable `AGENTS.md` chain (root → child for the target folder).
2. `docs/v4/V4_TERRITORY_MAP.md` — territory + open decisions.
3. `/BUILD_PLAN_V4.md` — the current rung's goal shape + its **cumulative
   regression guard** (Appendix A).
4. `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` +
   `docs/v3/KERNEL_SCHEMA_V1.md` + `docs/v3/GLOSSARY.md` — **all still binding.**
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
