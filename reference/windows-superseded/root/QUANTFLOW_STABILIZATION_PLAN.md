# QUANTFLOW_STABILIZATION_PLAN.md

**Companion to:** `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md`
**Purpose:** Convert the audit into a sequenced, capacity-realistic plan that gets QuantFlow from "ambitious app" to "honest, maintainable product."
**Branch context:** `quantflow-v4`
**Status of this document:** Plan / governance. Not implementation. Revise as reality pushes back.

---

## 0. How to read and use this plan

This plan is **deliberately sequential.** QuantFlow is built by one founder plus AI coding agents. A nine-track parallel program would repeat the exact mistake the audit caught — an impressive plan no one can execute. So the work is organized as **gated phases, one focus at a time.** Finish a phase's gate before starting the next.

Three rules govern everything below:

1. **Subtract before you add.** The next era of this project is *cleaning*, not building. Every phase here either removes a store, removes a monolith, removes a contradiction, or makes something measurable. New capability resumes only in Phase 5.
2. **No claim without proof or a label** (adopted from the second-opinion review, operationalized). Every rung, feature, or doc claim must be one of: **Implemented-verified** (a re-runnable command in `qa/` proves it), **Implemented-unverified** (code exists, no reproducible proof yet), or **Planned**. "Verified" is never a checkmark someone typed; it is a command a third party can run.
3. **One source of truth, structurally.** The Kernel is canonical. Anything else is a projection, a cache, or an export — enforced by tests, not by intention.

**Effort sizing** uses S / M / L (a session, a few sessions, a multi-session project) rather than calendar dates, because velocity is unknown. **Gates** are hard stops: do not pass without the listed evidence.

---

## 1. The governing principle (one paragraph)

QuantFlow's foundation is sound and its performance instinct is excellent (audit scores: architecture 6, performance discipline 8). Its danger is gravity: too many truth stores, two giant files, doc sprawl, and a beta cloud dependency adopted early (maintainability 4). The fix is not a rewrite and not more ambition — it is **ruthless constraint applied in a fixed order: make it measurable, make it truthful, make it safe, make it maintainable, then resume building.** Each phase makes the next one safer.

---

## 2. The phase ladder (overview)

| Phase | Theme | Exit gate (one line) | Effort |
|---|---|---|---|
| **P0** | Orientation & honesty | One front door; contradictions fixed; every claim labeled; living-doc count down | S–M |
| **P1** | Make it measurable | PF0 spans + baseline live; event taxonomy & span schema frozen | M |
| **P2** | Make it truthful | Kernel is the only canonical store; others are derived/export, enforced by a test | **L (the centerpiece)** |
| **P3** | Make it safe | Secrets/execution boundary written; Eve/cloud fenced with conformance test + kill switch; SDK adapter contract | M |
| **P4** | Make it maintainable | No hot-path file > 800 LOC; one token spine; named z-index | L |
| **P5** | Resume capability | Foundation proven; selected feature/Surface rungs resume on the clean path | ongoing |

**Why this order, explicitly:** P0 is free and removes confusion that would otherwise corrupt every later step. P1 must precede P2 because you cannot safely change where truth lives (P2) without a baseline that proves you didn't break behavior. P2 is the centerpiece because the single-source-of-truth violation is the #1 architecture risk and the tax on everything. P3 must precede any real cloud use because the cloud path is what creates the new trust boundary. P4 (decomposition) is gated on P1's baseline so "no behavior change" is provable. P5 is everything you actually want to build — it waits.

---

## 3. The phases in detail

### Phase 0 — Orientation & honesty *(S–M)*

**Objective:** make the repo legible and stop the docs from out-running the code.

| # | Work item | Done-when | Size |
|---|---|---|---|
| 0.1 | Write `START_HERE.md` | A new agent given only this file reads the right 5 docs, in order, knows the branch is v4, knows the current phase, and does **not** open `BUILD_PLAN_V2.md`. | S |
| 0.2 | Retire/replace the stale `ARCHITECTURE.md` | It no longer points only to v3; either a one-screen v4 map or a redirect to `START_HERE.md`. | S |
| 0.3 | Fix the trust-eroding contradictions | README Node floor matches `EVE_SETUP.md` (pick 24 if Eve is in scope); the Constitution and `docs/v4/AGENTS.md` point to **one** read-order. | S |
| 0.4 | Add the `STATUS:` convention | Every rung in `BUILD_PLAN_V4.md` and every feature claim carries `Implemented-verified` / `Implemented-unverified` / `Planned`. "Verified" requires a `qa/` command. | M |
| 0.5 | **Doc diet** | Archive or freeze historical/v2 docs into `reference/`; the count of *living* docs goes **down**. Every new doc added in later phases is paired with an archive. | S |
| 0.6 | Promote the glossary to v4 | `docs/v4/GLOSSARY.md` defines Workflow / EveSession / checkpoint and resolves the overloaded nouns (see 3-after-P0 rename note). | S |

**Gate G0:** `START_HERE.md` exists and is accurate; no Node-version or read-order contradiction remains; every rung is labeled; living-doc count is lower than before.

> **Naming note (do during 0.6, not later):** rename the colliding nouns instead of warning about them — e.g. `runtime-adapter` vs `eve-session-loop` (not "harness"/"harness"); keep `Workflow` and `EveSession`, drop colloquial "run"; `checkpoint_state` is the *only* thing called "pause." Land it as one mechanical codemod pass with tests, so the warning boxes can be deleted.

---

### Phase 1 — Make it measurable *(M)*

**Objective:** you cannot honestly fix or verify anything without a baseline. This is the project's own #1 rule (PF0-first), and it is the prerequisite for safely doing Phase 2.

| # | Work item | Done-when | Size |
|---|---|---|---|
| 1.1 | Land **PF0** exactly as `PERFORMANCE_LADDER.md` specifies | Span log behind `QUANTFLOW_TRACE=1`; `qa/perf-baseline.json` with B1/B3/B4 at p50/p95 over 5 trials; **byte-identical** receipts when the flag is off. | M |
| 1.2 | Freeze the **event taxonomy** | `docs/v4/EVENT_TAXONOMY.md` promoted from `PERF_STACK_AUDIT.md` §E; this is the contract PF1 and R7 both bind to. Short and load-bearing. | S |
| 1.3 | Freeze the **span / run-timeline schema** | `docs/v4/SPAN_SCHEMA.md` (the `Span` interface, versioned). Replay (R7) and the perf timeline import the same names. | S |

**Gate G1:** `smoke:perf-trace` is green; flag-off path is proven a no-op; baseline file exists; taxonomy and span schema are frozen and referenced by code, not just prose.

> **Note on PF1:** PF1 (incremental projection router) is high-ROI and safe, and it produces the first module extracted from `renderer.js`. It can land at the **end of Phase 1 or the start of Phase 2** — it does not depend on which store is canonical (it just stops over-fetching from whatever the canonical read path is). Treat it as the bridge into Phase 2.

---

### Phase 2 — Make it truthful *(L — the centerpiece)*

**Objective:** structurally enforce "Kernel owns truth." This is the audit's #1 architecture risk and the reason the product cannot yet be called reliable. It is a **product-integrity** task, not a cleanup chore — which is why it gets its own phase and a schema gate, rather than being "move 6, then we'll see."

**Prerequisite (do first, it unblocks the rung):** write the **tile-extension schema** — the Kernel-side home for canvas-only fields (position, transport type) that currently justify the JSON store. Without this doc the collapse cannot proceed cleanly.

| # | Work item | Done-when | Size |
|---|---|---|---|
| 2.0 | Tile-extension schema doc | Defines `tile_extensions` (or equivalent) so canvas-only fields live in the Kernel. | S |
| 2.1 | PF1 incremental projection router | 100-event storm → **0** full-snapshot refetches vs the PF0 baseline; targeted per-event refresh + 50ms debounce. | M |
| 2.2 | Boot from Kernel only | Hydration reads `kernel.canvas.snapshot` + `tile_extensions`; **no read of `canvas-state.json` on boot**. | M |
| 2.3 | Demote JSON to export | `canvas-state.json` becomes an on-demand cache/export artifact, never authoritative. | S |
| 2.4 | Collapse `runtime-state` to a derived mirror | Connections/tasks/artifacts/runs are canonical in the Kernel; `runtime-state` is a strictly-derived **async** mirror. Un-defer the Envoy retirement that R3 left open. | L |
| 2.5 | Divergence test | A test asserts Kernel authoritative snapshot, canvas projection, and any derived mirror agree for the same run; receipts corroborate committed transitions but do not rebuild authoritative state. | M |

**Phase the risk (this is the highest-risk work in the whole plan):** demote-read **before** stop-write; keep a reversible fallback behind a flag until proven; never big-bang it. (`PERFORMANCE_LADDER.md` PF3 marks this the riskiest rung — respect that.)

**Gate G2:** boot reads Kernel only; a connection round-trips with no `runtime.db` write; the divergence test exists and passes (Kernel snapshot == canvas projection == any derived mirror; receipts audit, not authority); the in-memory/JSON/runtime stores are demonstrably non-authoritative. **This is the gate that turns "cool app" into "real product."**

---

### Phase 3 — Make it safe *(M)*

**Objective:** write the boundaries the product has outgrown — *before* the cloud path goes live, because the cloud path is what creates the new trust surface.

| # | Work item | Done-when | Size |
|---|---|---|---|
| 3.1 | **Secrets & execution boundary** (`SECURITY.md` or `SECRETS_AND_EXECUTION_POLICY.md`) | States where keys live (the R0 `getCredential()` accessor is the seam), who can read them, what a spawned shell may touch, what requires approval, what may cross to cloud, what is logged, what is **never** logged. Short and concrete. | M |
| 3.2 | **Fence Eve / cloud now** (it's already partially wired) | A conformance test asserts **no Kernel-canonical fact originates in Eve**; a kill switch proves **the app runs fully on the local/mock harness with Eve unreachable**. | M |
| 3.3 | **Local-vs-cloud execution policy** | One doc: what may run in cloud, what data may cross, behavior offline, and how "leave Vercel later" is guaranteed (the harness seam as policy, not vibes). | S |
| 3.4 | **SDK adapter contract** | Defines the adapter envelope: auth, retry, timeout, error normalization, receipt/permission hooks, standard spans. Every adapter conforms. | M |

**Gate G3:** the secrets/execution boundary is written and every secret read routes through the single accessor; the Eve conformance test + kill switch pass; the adapter contract exists and the existing integrations conform (or are flagged `Planned`).

> **Why P3 is after P2, not before:** the truth-store collapse (P2) changes what is canonical; writing the cloud data-crossing policy against a still-shifting truth model would just need rewriting. Settle truth, then fence it.

---

### Phase 4 — Make it maintainable *(L)*

**Objective:** attack the lowest score (maintainability 4). Decompose the two worst monoliths and unify the styling spine — **behavior-preserving**, gated on the P1 baseline so "nothing changed" is provable.

| # | Work item | Done-when | Size |
|---|---|---|---|
| 4.1 | Decompose `renderer.js` (PF6) | No hot-path file > 800 LOC; extract `renderer-event-router.js` (from PF1), `projection.js`, `watchtower-host.js`; full shell unit suite unchanged. | L |
| 4.2 | Visual Phase 1 only: token spine + z-index | `Theme.css` is the single token source; shell imports it; **no literal z-index in shell** (named `--z-*` only), enforced by a CI check. | M |
| 4.3 | Cut orphan/dead surfaces | Remove or wire `terminal-list/`, the dead `#drag-drop-overlay` reference, and the disabled legend "connect mode." | S |

**Gate G4:** no hot-path file exceeds 800 LOC; the shell unit suite is green and behavior is unchanged vs the P0 golden; a CI check rejects literal z-index in shell; orphan surfaces are gone.

> **Hard guardrail for this phase:** do **not** touch `tile-interactions.js` geometry, `--cable-w-hit`, port sizes, or drag/cable math during the visual work. Structural split and token consolidation only. (Audit §G.)

---

### Phase 5 — Resume capability *(ongoing, only after G0–G4)*

**Objective:** build the things you actually want — now that the foundation is honest, measured, single-truth, fenced, and maintainable.

- **First:** put `SURFACE_LADDER.md` on the table and re-scope S2 (Live Run Projection) **on the clean projection path.** *Do not* sequence S2 before this — the Surface ladder was not part of the audited document set, so its current state is unknown.
- **Then, selectively,** resume feature rungs (templates, richer agents, semantic verification) one at a time, each with the two-proof-track discipline and a `STATUS:` label.
- **Cloud expansion** (broader Eve use, remote pods) only after G3's fence has held in real use.

**There is no gate here** — this is the steady state. The discipline (one rung, reproducible proof, labeled status) is what carries forward.

---

## 4. Decisions you must make *before* Phase 2 (gates on the plan itself)

These are the audit's hard questions, reduced to the ones that block the foundation work. Answer them in writing (they belong in `START_HERE.md` or a short `DECISIONS.md`):

1. **Category, one sentence, no "and":** ADE, operator console, or research-run OS? (Everything else becomes a sub-claim.)
2. **Day-one user, named:** you, a trading/RL operator, or general multi-agent builders?
3. **Is local-first a *value* (works fully offline) or a *default* (cloud when convenient)?** The Eve fence depends on this answer.
4. **Canonical owner of a tile's position/transport:** today it's "all three stores" — declare the one it must be (this scopes Phase 2).
5. **What may cross the local→cloud boundary, and who reviews it?** (Gates Phase 3.)
6. **Can a third party reproduce a rung's "verified" with one command?** If not, "verified" is redefined as of Phase 0.

---

## 5. The parking lot — explicitly NOT now

Do not start these until G0–G4 are passed. Listing them here is how you resist the pull.

- Full Cloudflare/cloud routing or making cloud the primary runtime.
- Broad Eve dependency beyond the fenced seam; R4 "collapsing onto Vercel."
- RL training / GRPO / fine-tuning (schema-prep only, per the build plan's own deprioritization).
- Visual redesign Phases 2–6 (only Phase 1 token/z-index now).
- Webview pooling / lazy-mount (a product decision, not a perf tweak).
- A `renderer.js` *behavior* rewrite (structural split only).
- All-agent legend expansion; trading-bot execution.
- SQLite pragma re-tuning or re-doing the 16ms PTY batch (already done).
- Parallelizing the Conductor approval gate (safety property — needs explicit authorization).

---

## 6. Coverage matrix — every audit finding maps to a phase

This is how you can see the plan addresses the *full* audit, not a convenient subset.

| Audit finding | Where it's handled |
|---|---|
| **C1** multiple truth stores (critical) | **P2** (centerpiece) |
| **C2** `renderer.js` god-file | P1 (first extract) → **P4** |
| **C3** beta cloud dependency early | **P3** fence + kill switch; P5 gates expansion |
| **C4** `shell.css` z-index soup | **P4.2** |
| **C5** per-tile webview cost | Parking lot (measure in P1; product decision later) |
| **C6** doc volume is a risk | **P0.5 doc diet** + the "no claim without label" rule |
| **C7** no security/threat model | **P3.1** |
| **C8** naming collisions | **P0.6** rename codemod |
| **C9** stale `ARCHITECTURE.md` | **P0.2** |
| **C10** sequential Conductor vs DAG ambition | Guardrail (parking lot); revisit in P5 |
| **C11** multiple event/log buses | **P1.1** PF0 unifies; others deprecated |
| **C12** README vs Eve Node version | **P0.3** |
| **C13** semantic verify under-specified | P5 (resumes only post-foundation) |
| **C14** no frozen run-timeline schema | **P1.3** |
| **C15** solo + heavy AI reliance | Governance rules (§0) + reproducible proofs throughout |
| **D** missing docs (START_HERE, security, SDK contract, local/cloud policy, taxonomy, span schema) | **P0** (START_HERE, glossary), **P1** (taxonomy, span), **P3** (security, SDK, local/cloud) — each short, load-bearing, paired with an archive |
| **E** contradictions table (10 rows) | **P0.2/0.3/0.4/0.6** + the divergence test in **P2.5** |
| **F** what to simplify | woven through P0–P4 + the parking lot |
| **G** what not to touch yet | parking lot + per-phase guardrails |

---

## 7. Governance — how to actually run this

- **One rung at a time.** Promote a single work item, authorize it, implement only its scope, prove it, then move. (This is already your model — keep it.)
- **Worker ≠ final verifier where it matters.** For each *foundation* gate (G1–G4), **you personally run the real-proof**, not the agent that wrote it. The machine proof must be a command in `qa/`, recorded with its output — not a checkmark.
- **Every new doc is short, load-bearing, and paired with an archive.** If a doc isn't a contract a test or an agent binds to, it goes in `reference/`, not the living set.
- **The `STATUS:` label is non-negotiable.** Anything unlabeled is treated as `Planned` until proven. This is the structural antidote to "docs more finished than code."
- **Re-baseline after P2 and P4.** The PF0 baseline is the truth-teller; refresh it after the two structural phases so later optimization claims remain honest.

---

## 8. Risk register for this plan

| Risk to the plan | Likelihood | Mitigation |
|---|---|---|
| Phase 2 (truth-store collapse) drags or destabilizes the app | High (it's the hard one) | Phase it (demote-read before stop-write); reversible flag; do it only after G1 baseline; never big-bang. |
| The plan itself becomes doc sprawl | Medium | This file + `START_HERE.md` are the only *new* governance docs; everything else is short and paired with an archive. |
| Foundation work feels unrewarding vs building features | Medium (motivation risk for a solo founder) | Each gate is a visible, demonstrable win ("boot reads Kernel only," "0 refetches under storm"); celebrate gates, not features. |
| AI agents misinterpret a phase and damage a monolith | Medium | Decompose (P4) is gated on the P0 golden; failure-signal lists per rung; you run the real-proof. |
| Eve/cloud pulls focus back early | Medium | P3 fence + kill switch makes "is this safe to lean on?" a yes/no test, not a judgment call; parking lot is explicit. |
| "Verified" reverts to meaning "a checkmark" | Medium | The `qa/` reproducible-command rule; you personally run foundation real-proofs. |

---

## 9. The one-line summary

**Make it measurable, make it truthful, make it safe, make it maintainable — in that order — and resume building only after the Kernel is the only thing that owns the truth.** Everything you want QuantFlow to become depends on that gate, and nothing else you build will be reliable until it's passed.

---

*This plan is grounded in `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md` and the ten audited documents. It prescribes no code changes here; it sequences them. Self-reported "verified" status in existing docs is treated as a claim until a `qa/` command reproduces it.*
