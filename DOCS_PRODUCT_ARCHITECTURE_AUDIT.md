# DOCS_PRODUCT_ARCHITECTURE_AUDIT.md

**Subject:** QuantFlow — documents & architecture audit
**Branch audited:** `quantflow-v4`
**Audit type:** Skeptical senior technical / product architecture review (read-only)
**Date:** 2026-06-24

---

## Scope, method, and an honesty caveat (read this first)

**What I read (all present and read in full):**
`README.md`, `PRODUCT.md`, `DESIGN.md`, `KERNEL_CONSTITUTION.md`, `BUILD_PLAN_V4.md` (2,182 lines), `docs/v4/AGENTS.md`, `PERF_STACK_AUDIT.md`, `docs/v4/PERFORMANCE_LADDER.md`, `VISUAL_MANIFEST.md`, `VISUAL_COMPONENT_INVENTORY.md`.

**No requested document was missing.** Four (`PERF_STACK_AUDIT.md`, `PERFORMANCE_LADDER.md`, `VISUAL_MANIFEST.md`, `VISUAL_COMPONENT_INVENTORY.md`) were not on the pushed branch and were supplied separately; the rest came from the repo. I also cross-checked the supporting tree (`docs/v3/GLOSSARY.md`, `docs/v3/KERNEL_SCHEMA_V1.md`, `docs/v3/AUTHORITY_RULES.md`, `docs/v4/V4_TERRITORY_MAP.md`, `docs/v4/SPAWN_MODEL.md`, `docs/v4/EVE_SETUP.md`, `ARCHITECTURE.md`, `TESTING.md`, `src/harness/types.ts`, `src/kernel/schema/types.ts`, the `runtime-state/` directory) so I would not falsely flag present material as missing.

**The caveat that bounds everything below.** This is a **documentation and structure audit, not a code or test audit.** I read the docs and inspected the file/directory layout. I did **not** run the test suites. The `BUILD_PLAN_V4.md` ledger marks many rungs "machine-verified ✅ / approved." **I am treating those as claims, not verified facts.** A founder's single most dangerous failure mode is "docs that sound more finished than the code," and a self-reported green ledger is exactly the kind of claim an outside reviewer cannot confirm. Where I rely on a doc's self-assessment, I say so. Facts are cited to files; opinions and uncertainties are labelled.

**Receipt vocabulary (aligned with `START_HERE.md` §2):** Kernel SQLite tables hold canonical current state; receipts are durable evidence and audit proof — not the principal state-rebuild event store in v4. QuantFlow is **event-disciplined and receipt-backed**, not pure event-sourced.

---

## A. Executive verdict

**One-page blunt assessment.**

QuantFlow is **not built like shit.** The conceptual core — *Kernel owns truth; everything else is a projection of it* — is genuinely good, and `KERNEL_CONSTITUTION.md` is the best document in the repo: short, enforceable, and the kind of thing most first products never write. The performance audit (`PERF_STACK_AUDIT.md`) is also unusually disciplined for a first-time developer. Those two facts alone put this project above the median "ambitious solo app."

But the project has three structural problems that the documents themselves quietly admit.

**First, the constitution is louder than the codebase.** "Kernel owns truth" is stated everywhere, yet the shipped stack carries **two-to-four overlapping stores at once** — in-memory `canvas-state.js`, a JSON canvas save, the Kernel SQLite, and a *second* SQLite domain in `runtime-state/` whose repos mirror artifacts, connections, events, runs, and tasks (the "Envoy" bridge). The audit lists this as bottleneck #2 and complexity #3, and the build plan schedules consolidation at R3 — but R3's own ledger row says "**Deferred:** full `envoy_tasks` retirement." So the single most important rule in the product is, today, **partially enforced by intention rather than by structure.** (`KERNEL_CONSTITUTION.md`; `PERF_STACK_AUDIT.md` §A, §D; `BUILD_PLAN_V4.md` R3 row.)

**Second, the surface is already a set of monoliths.** `renderer.js` (~3,500–3,800 LOC depending on which doc you believe — the docs disagree with each other), `shell.css` (~3,600–4,200 LOC, z-index from 40 to 999999), plus `tile-manager.js`, `canvas-rpc.js`, `pty.ts`, and `tasks/index.ts` are all over the maintainability line. Six styling layers and 20+ IPC registrars compound it. This is the part most likely to rot, and it is the part a non-professional solo maintainer will struggle with most. The docs flag all of it honestly (`PERF_STACK_AUDIT.md` monolith table; `VISUAL_COMPONENT_INVENTORY.md` §I), which is to their credit — but flagging is not fixing.

**Third, scope is sprawling at exactly the moment it should be contracting.** The product is described, across docs, as a "canvas-first ADE," an "operator console," a "research-run operating system," and a "governed autonomous workflow" platform — and v4 simultaneously adopts **Eve (a beta Vercel agent framework) running on Vercel cloud** as the worker substrate. The build plan is candid that this is "betting on beta-Eve." That is a large new dependency, a new cloud surface, and a new failure domain layered onto a local-first product whose local foundations (single source of truth, monolith decomposition) are not yet settled.

The naming hygiene is a visible symptom of the sprawl: the docs contain explicit collision warnings for "harness" (overloaded), "run" (three meanings), "pause" (three concepts), "R0" (rung vs. distribution axis), and "PF#" vs. "P0–P3." Writing a warning beside a colliding name is a workaround; the senior move is to rename the thing.

**Is it salvageable and buildable as a real product? Yes — clearly.** The bones are right and the discipline is real. But the odds improve dramatically if the founder treats *subtraction* as the next phase: collapse the truth stores, decompose the two worst monoliths, freeze and shrink the documentation surface, and quarantine the cloud/Eve bet behind a hard seam so a beta dependency cannot take down the local product.

**Scores (1–10, with one-line justification):**

| Dimension | Score | One-line justification |
|---|---|---|
| **Product clarity** | **6** | Strong core metaphor and a good one-liner in `PRODUCT.md`; muddied by 4 competing category labels, oscillating audience, and rampant naming drift. |
| **Architecture coherence** | **6** | The Kernel model is coherent *as designed*; coherence drops because 2–4 real stores contradict "one truth," and consolidation is deferred. |
| **Implementation realism** | **5** | Disciplined rung plan and dual-proof tracks, but enormous scope + existing monoliths + a beta cloud dependency + solo non-pro maintainer. |
| **Maintainability** | **4** | Multiple 1k–3.8k-LOC hot-path files, six styling layers, two SQLite domains, 20+ IPC registrars. Honestly flagged, still present. |
| **Performance discipline** | **8** | `PERF_STACK_AUDIT.md` is the standout: correct diagnosis, measure-first PF0 keystone, explicit "do not optimize yet" list, p50/p95 benchmark plan. |
| **Documentation quality** | **6** | Deep, cross-referenced, with anti-patterns and failure signals — but the *volume itself* is a risk for a solo dev, `ARCHITECTURE.md` is a stale v3 stub, no `START_HERE`, glossary is v3-only. |

---

## B. What is strong (top 10 ideas worth preserving)

1. **"Kernel owns truth; everything else derives."** The single best decision in the project. It gives every other component a defined job and a reason to exist. Preserve it verbatim. (`KERNEL_CONSTITUTION.md`.)
2. **The constitution is short and enforceable.** A one-rule constitution with a "Who Does What" table, explicit mutation/query paths, and a task state machine is exactly how you keep a system honest. Most first products never write this. (`KERNEL_CONSTITUTION.md`.)
3. **Append-only receipts + ephemeral events.** Receipts are the durable evidence chain; events are explicitly *not* persisted, so Replay is "receipt-primary." This is a clean, defensible separation that prevents a second timeline store from sneaking in. (`KERNEL_CONSTITUTION.md`; `BUILD_PLAN_V4.md` R7/F1.)
4. **Structural verification gate (R1).** Making `taskVerify` actually open the artifact (record linked, under root, exists, non-empty, sha256 matches) rather than rubber-stamping completion is real engineering rigor and the right keystone. (`BUILD_PLAN_V4.md` R1.)
5. **Two proof tracks per rung (mock/sim + one real run).** Requiring a deterministic CI-safe proof *and* a real proof, and forbidding acceptance from depending solely on real-agent auth, is a genuinely mature testing philosophy. (`BUILD_PLAN_V4.md` promotion discipline; `docs/v4/AGENTS.md`.)
6. **The performance audit's measure-first stance.** PF0 (instrument + capture baseline) before any optimization, with an explicit approval bar and a "what not to optimize yet" list, is senior-level discipline. (`PERF_STACK_AUDIT.md` §E/§F/§I/§J; `PERFORMANCE_LADDER.md` PF0.)
7. **Correct diagnosis of the #1 performance bug.** Identifying `refreshWorkflowProjection()` re-querying the whole canvas on ~15 event kinds with no debounce — rather than blaming React or CSS — is the right root cause and the highest-ROI fix. (`PERF_STACK_AUDIT.md` bottleneck #1; `PERFORMANCE_LADDER.md` PF1.)
8. **The semantic string / cable model.** Color encodes *meaning* (delegation, verification, blocker, receipt handoff), mapped 1:1 from a Kernel `semantic_type`, with only blockers reading as alerts. It is a distinctive, product-defining idea and it's consistently specified across `DESIGN.md`, `VISUAL_MANIFEST.md` §3.6, and `VISUAL_COMPONENT_INVENTORY.md` §E.
9. **Honest self-inventory.** The project audits its own monoliths, z-index soup, orphan windows, and dual styling systems instead of hiding them. Self-awareness is a leading indicator of a fixable codebase. (`PERF_STACK_AUDIT.md` complexity tables; `VISUAL_COMPONENT_INVENTORY.md` §H/§I.)
10. **Explicit anti-patterns and failure signals per goal.** Each rung lists what *failure* looks like ("a task reaches complete with no artifact," "the harness writes Kernel state directly"). This is the right way to brief AI coding agents and to keep scope honest. (`BUILD_PLAN_V4.md` throughout.)

---

## C. What is weak / dangerous (top 15 risks, ranked by severity)

1. **Multiple live truth stores contradict the one rule (severity: critical).** In-memory canvas state + JSON canvas save + Kernel SQLite + `runtime-state/` SQLite (Envoy mirror with its own artifacts/connections/events/runs/tasks repos). "Kernel owns truth" is the product's spine, and it is the thing most violated in practice. Consolidation is scheduled (R3/PF3) but partially **deferred**. *Evidence:* `PERF_STACK_AUDIT.md` §A bottleneck #2, §D; `runtime-state/` directory; `BUILD_PLAN_V4.md` R3 "Deferred: full envoy_tasks retirement."
2. **`renderer.js` god-file (severity: critical).** ~3,500–3,800 LOC doing tiles, cables, watchtower, conductor, kernel events, webviews, and shortcuts. It is the contention magnet for at least five planned rungs (PF1, PF2, PF5-batch, PF6, PF7). Fixes here "don't stick" by the audit's own admission. *Evidence:* `PERF_STACK_AUDIT.md` complexity #1 / monolith table; `VISUAL_COMPONENT_INVENTORY.md` §I "Critical."
3. **Beta cloud dependency adopted before local foundations settle (severity: high).** Eve (Vercel, beta) becomes the durable worker substrate, on Vercel Functions/Workflows/Sandbox, with R4 durability "collapsing" onto Vercel Workflow replay. The plan itself says "betting on beta-Eve." A beta external framework on the critical path of a local-first product is a major risk-concentration. *Evidence:* `BUILD_PLAN_V4.md` Eve Integration section.
4. **`shell.css` z-index soup (severity: high).** ~3,600–4,200 LOC, z-index literals from 40 to 999999, redefining `:root` tokens that `Theme.css` is supposed to own. Visual work is "learned by trial, not contract." *Evidence:* `VISUAL_MANIFEST.md` §1; `VISUAL_COMPONENT_INVENTORY.md` §C/§G.
5. **Per-tile Electron webviews (severity: high).** Every terminal/browser/code tile ≈ one renderer process. Memory is the dominant cost for dense canvases, and the mitigation (pooling/lazy-mount) is explicitly parked as a *product* decision because it changes tile liveness. A "dense canvas" product whose density is memory-bounded has a ceiling it hasn't measured. *Evidence:* `PERF_STACK_AUDIT.md` bottleneck #4, risk table "No (product)"; `PERFORMANCE_LADDER.md` Parked.
6. **Documentation volume is itself a risk (severity: high).** `BUILD_PLAN_V4.md` is 2,182 lines / ~17k words; the doc set is large and self-referential. For a solo non-professional maintainer this crosses from asset to liability: the plan can drift from the code faster than one person can reconcile, and a reader cannot tell which lines are aspirational. *Evidence:* file sizes; absence of `START_HERE.md`.
7. **No security / threat model (severity: high).** There is no `SECURITY.md` or threat model anywhere, yet the product runs PTY/WSL shells, executes arbitrary agent work, stores provider API keys (OpenRouter), and reaches into cloud workers. For a product whose entire premise is *executing real work on real machines*, the absence of a written secrets/permission/threat model is a serious gap. *Evidence:* file check (absent); `BUILD_PLAN_V4.md` credential accessor (R0) exists but broad permission enforcement is explicitly deferred.
8. **Naming collisions papered over with warnings (severity: medium-high).** "harness" (Eve intra-agent vs QF runtime adapter), "run" (Workflow vs Eve session vs colloquial), "pause" (workflow status vs checkpoint_state vs loop phase), "R0" (preflight rung vs distribution axis), "PF#" vs "P0–P3." Each has a warning box instead of a rename. Collisions are the #1 way AI agents and future-you misroute work. *Evidence:* `BUILD_PLAN_V4.md` F28, F13, §10.1, Eve vocab locks; `PERFORMANCE_LADDER.md` name-collision warning.
9. **`ARCHITECTURE.md` is a stale v3 stub (severity: medium-high).** The top-level architecture doc points only to `BUILD_PLAN_V3.md`/`CONCEPT.md`/`BUILD_PLAN_V2.md`, says "Do not expand this file," and never mentions v4. The one file a newcomer (or a new AI agent) will open first is misleading. *Evidence:* `ARCHITECTURE.md` (full contents).
10. **Conductor sequential-by-design vs. the DAG/parallel ambition (severity: medium).** The Conductor loop is deliberately one-approved-action-per-step (a safety property), while R3–R6 push concurrent multi-branch DAG execution and templated parallel "pods." The tension is *acknowledged and reasonable*, but the seam where "operator approves one action" meets "ten agents run overnight" is under-tested and is where correctness bugs will concentrate. *Evidence:* `PERF_STACK_AUDIT.md` complexity #10, Appendix §4; `BUILD_PLAN_V4.md` R3/R4/R6.
11. **Two event/logging buses besides the Kernel emit (severity: medium).** Kernel `emitKernelEvent`, runtime-state `events-repo`, and renderer `operational-event-log`/`kernelEventLog` coexist; the audit notes you "cannot answer where did time go" across them. PF0 is meant to unify, but until it lands, observability is fragmented. *Evidence:* `PERF_STACK_AUDIT.md` complexity #2.
12. **README quickstart contradicts the Eve runtime requirement (severity: medium).** `README.md` says "Node.js 22+"; `docs/v4/EVE_SETUP.md` says Eve "requires Node 24 or newer." A founder (or contributor) following the quickstart will hit a wall on the v4 worker path. Small, but it's the literal first thing a user does. *Evidence:* `README.md` L23; `EVE_SETUP.md` L199/L206.
13. **Acceptance tests are strong on structure, thin on the hard part (severity: medium).** Structural verification is concrete and well-specified; **semantic** verification ("did the evidence support the claim") is the genuinely hard judgment and is mostly deferred to R7 with much lighter specification. The plan's hardest promise is its least specified. *Evidence:* `BUILD_PLAN_V4.md` R1 (concrete) vs R7 (semantic verify, lighter).
14. **No run-timeline / span schema is frozen (severity: medium).** PF7 and R7 both depend on reconstructing a timeline, and the only schema is a TypeScript `Span` interface inside the audit. Without a frozen, versioned schema, the two consumers (Replay, perf timeline) can drift. *Evidence:* `PERF_STACK_AUDIT.md` §E `Span`; no schema doc.
15. **Solo + heavy AI-agent reliance on a large surface (severity: medium).** Cursor/Codex/Claude workers are driving changes across a codebase with monoliths, colliding names, and deferred consolidations. The guardrails (failure signals, regression guards) are good, but the blast radius of a misinterpretation in `renderer.js` or the Kernel command path is large. *Evidence:* `docs/v4/AGENTS.md`; ledger worker/verifier columns.

---

## D. What is missing (docs, schemas, decisions, tests, contracts)

**Genuinely absent (and why each matters):**

- **`START_HERE.md` / onboarding entry point — urgent.** With ~30 markdown files and a 2,182-line build plan, there is no single front door that says "read these five, in this order, ignore the rest." Without it, every new contributor and every fresh AI agent session re-derives context (or worse, opens the stale `ARCHITECTURE.md`). *Risk without it:* wasted context, inconsistent reads, agents acting on v3 assumptions in a v4 repo.
- **Security / secrets / threat model (`SECURITY.md`) — urgent.** No written model for: where provider keys live and how they're protected, what a spawned shell is allowed to touch, network egress policy, or the trust boundary between local and cloud (Eve) workers. *Risk without it:* a credential leak, an over-permissioned agent, or an unreviewed cloud data path — in a product whose whole job is executing real work.
- **SDK / adapter contract — soon.** The architecture claims "SDK adapters connect QuantFlow to external systems," and `integrations.ts` is referenced, but there is no contract doc defining the adapter envelope (auth, retry, timeout, error normalization, receipt/permission hooks). The audit even notes adapters lack standard spans. *Risk without it:* every adapter is a bespoke snowflake; latency and failures are unattributable.
- **Local-vs-cloud policy — soon.** "Local-first, cloud-extended" is a slogan, not a policy. The Eve/Vercel boundary is described in scattered prose inside `BUILD_PLAN_V4.md` but there is no standalone document stating what may run in cloud, what data may cross the boundary, what happens offline, and how "leave Vercel later" is actually guaranteed. *Risk without it:* the seam erodes, and the local-first promise quietly dies.
- **Frozen run-timeline / span schema — soon.** See risk C14. *Risk without it:* Replay and perf timeline diverge.
- **Release / versioning / migration-forward strategy — later.** Migrations exist (001–007) and are additive, but there's no doc on how releases are cut, how schema versions are gated in the field, or how a user upgrades. *Risk without it:* a bad migration on a real user's `kernel.db` with no rollback story.
- **User-facing product walkthrough — later (but important for clarity).** Everything is written for builders/agents. There is no "here is what an operator actually does, start to finish." This is partly *why* the category feels fuzzy. *Risk without it:* the founder can't crisply explain the product, and feature decisions lack a user-journey anchor.

**Present — do NOT re-create (the prompt lists these as "possibly missing," but they exist):**

- **Glossary:** `docs/v3/GLOSSARY.md` exists (but is **v3-only** — it should be promoted/extended to v4, since v4 adds Run/Eve/checkpoint vocabulary). *Action: extend, don't create.*
- **Source-of-truth map:** the `KERNEL_CONSTITUTION.md` "Who Does What" table is effectively this. *Action: keep; reconcile it with the runtime-state reality.*
- **Kernel/receipt schema:** `docs/v3/KERNEL_SCHEMA_V1.md` (491 lines) + `src/kernel/schema/types.ts` cover the receipt/artifact/task schema. *Action: keep current with migrations.*
- **Harness contract:** `src/harness/types.ts` + `src/harness/AGENTS.md` define the `WorkerHarness` contract in code. *Action: it exists as code; a one-page prose summary would help, but it is not "missing."*
- **Event taxonomy:** partially present in `PERF_STACK_AUDIT.md` §E. *Action: promote it to a frozen doc (PF0 depends on freezing it anyway).*
- **Runtime flow diagram:** `PERF_STACK_AUDIT.md` §B has an ASCII stack map. *Action: good enough; keep.*
- **Testing strategy:** `TESTING.md` (91 lines) exists. *Action: verify it reflects the two-proof-track model in the build plan.*

---

## E. Contradictions / unclear authority

| # | Document / section | Claim | Contradiction / ambiguity | Why it matters | Suggested fix |
|---|---|---|---|---|---|
| 1 | `KERNEL_CONSTITUTION.md` (One Rule) vs `PERF_STACK_AUDIT.md` §A/§D + `runtime-state/` | "Kernel owns truth… Canvas never a database." | A second SQLite domain (`runtime-state/`) plus JSON canvas saves plus in-memory canvas state hold task/connection/artifact/run data concurrently. | The product's spine is contradicted by its storage reality; divergence bugs and reconciliation tax are inevitable. | Land PF3/R3 properly: make Kernel canonical, demote JSON to export, make runtime-state a strictly-derived async mirror, and **un-defer** the Envoy retirement. Align receipt vocabulary with `START_HERE.md` §2 (receipts = proof, not event-sourced truth store). |
| 2 | `BUILD_PLAN_V4.md` (Eve) | "Eve owns execution; the Kernel owns truth… no split-brain." | True *only if* a beta framework reliably defers persistence to your DB in practice. The plan also admits "betting on beta-Eve." | If Eve's session state ever becomes load-bearing, you have a cloud truth store you didn't intend. | Add an explicit conformance test that asserts no Kernel-canonical fact originates in Eve; keep the harness seam hard; document the boundary as policy. |
| 3 | `README.md` L23 vs `docs/v4/EVE_SETUP.md` L199/206 | README: "Node.js 22+". EVE_SETUP: "Eve requires Node 24 or newer." | Direct version contradiction on the v4 worker path. | First-run friction; contributors blocked; signals docs aren't reconciled. | Pick one floor (24 if Eve is in scope), update README, note the WSL nvm launcher requirement. |
| 4 | `ARCHITECTURE.md` vs the entire v4 tree | "The active architecture path lives in `BUILD_PLAN_V3.md`… Do not expand this file." | The repo is on v4; the top-level architecture doc points only to v3. | The first file a newcomer/agent opens is stale and misrouting. | Replace with a 1-screen v4 map or fold into a new `START_HERE.md`. |
| 5 | `PRODUCT.md` / `README.md` / `BUILD_PLAN_V4.md` | "canvas-first ADE" vs "operator console" vs "research-run operating system" vs "governed autonomous workflows." | Four category labels for one product, plus an audience that swings between "trading/RL power operator" and "general multi-agent orchestration." | Category confusion weakens positioning, scoping, and every "is this in scope?" decision. | Pick **one** primary category sentence; make the others sub-claims. (See §J for candidates.) |
| 6 | `KERNEL_CONSTITUTION.md` "Vocabulary Lock" vs `BUILD_PLAN_V4.md` Eve vocab | "Use only canonical primitives… do not invent new names." | "harness" (two meanings), "run" (three), "pause" (three) are all overloaded, then governed by warning boxes. | Overloaded core nouns are the top cause of AI-agent misrouting and human miscommunication. | Rename: e.g. `eve-session-loop` vs `runtime-adapter`; `Workflow`/`EveSession`/(drop colloquial "run"); `checkpoint_state` is the only thing called "pause." |
| 7 | `KERNEL_CONSTITUTION.md` read order vs `docs/v4/AGENTS.md` read order | Constitution lists a v3 read order ending in `BUILD_PLAN_V2.md`; v4 AGENTS lists a different chain centering `V4_TERRITORY_MAP.md` + `BUILD_PLAN_V4.md`. | Two "read this first" sequences that don't match. | Agents and humans get different canonical reading paths depending on which file they open. | Single authoritative read-order in `START_HERE.md`; have both files point to it. |
| 8 | `BUILD_PLAN_V4.md` ledger ("machine-verified ✅") vs verifiability | Many rungs "Complete / approved," verifier often the same author ("Claude/Codex"). | Worker and verifier are sometimes the same agent family; the audit cannot confirm green checks. | Self-verification + self-reported completion is exactly the "docs better than code" trap. | Keep a separate, runnable `qa/` evidence artifact per rung that a third party can execute; record the *command + output hash*, not just a checkmark. |
| 9 | `PERFORMANCE_LADDER.md` "PF#" vs `PERF_STACK_AUDIT.md` "P0–P3" | PF# = rung; P0–P3 = priority band. | Same letters, different meaning, in two tightly-coupled docs. | Reader/agent confuses a priority for a rung and sequences work wrongly. | Rename priority bands (e.g. "Prio-A/B/C") so no token means two things. |
| 10 | `VISUAL_MANIFEST.md` §3.15 (named z-index 0–600) vs `VISUAL_COMPONENT_INVENTORY.md` §C (production 9000–999999) | Manifest defines a clean z-index scale; inventory documents the real one is soup. | Plan vs reality gap in the styling spine. | Visual work keeps guessing stacking; the manifest is aspirational until Phase 1 lands. | Treat the z-index migration as the first, isolated PF/visual task; assert "no literal z-index in shell" in CI. |

---

## F. What to simplify (reduce / postpone / merge / cut)

1. **Cut or quarantine the Eve/Vercel cloud bet for now.** It is the largest single source of new complexity and the only beta dependency on the critical path. Either (a) defer it until the local single-source-of-truth and the two worst monoliths are fixed, or (b) keep it strictly behind the existing harness seam with a conformance test, and stop letting R4 "collapse onto Vercel." Local-first should *mean* local-first until proven. (`BUILD_PLAN_V4.md` Eve section.)
2. **Collapse the truth stores before adding features.** Four stores → one canonical (Kernel) + one derived async mirror + JSON-as-export. This is PF3/R3; it should jump the queue because every other subsystem pays tax until it's done. (`PERF_STACK_AUDIT.md` §A/§D.)
3. **Shrink the documentation surface.** Freeze `BUILD_PLAN_V4.md` to a stable ledger + per-rung handoff files; move the 17k words of rationale into an appendix or archive. Add one `START_HERE.md`. A solo dev cannot keep 30 living docs honest. (file sizes.)
4. **Rename the colliding nouns instead of warning about them.** Every warning box in §E row 6/8/9 should become a rename. One word, one meaning. (`BUILD_PLAN_V4.md` vocab locks.)
5. **Merge the event/log buses.** Three logging paths → one span/emit at the Kernel boundary (this is literally PF0's job; treat the others as deprecated once it lands). (`PERF_STACK_AUDIT.md` complexity #2.)
6. **Postpone semantic verification, RL, and "Night Shift" packaging.** These are R7+ aspirations; they should stay explicitly parked until the atom→DAG→durable-pod spine is real on one truth store. The build plan already deprioritizes RL/lessons — extend that to all of Band D until the foundation is settled. (`BUILD_PLAN_V4.md` operator-priority note.)
7. **Cut the orphan/duplicate surfaces.** `terminal-list/` (built, not wired), the dead `#drag-drop-overlay` reference, and the disabled legend "connect mode" all ship complexity for no user value. Delete or wire. (`VISUAL_COMPONENT_INVENTORY.md` §H/§I.)
8. **Defer the full visual redesign (Phases 2–6) behind PF0/PF1.** Do the Theme.css token + z-index consolidation (Phase 1, isolated, low-risk), then stop; don't restyle tiles/cables/panels until the projection path is clean and measured. (`VISUAL_MANIFEST.md` §6; `PERFORMANCE_LADDER.md` sequencing note.)

---

## G. What NOT to touch yet (too risky before measurement/specs exist)

1. **`renderer.js` behavior.** Decompose *structurally* (extract modules, no behavior change) only after PF0 gives a green baseline to prove "nothing changed." Do not refactor its logic and its structure in the same pass. (`PERF_STACK_AUDIT.md` §I; `PERFORMANCE_LADDER.md` PF6.)
2. **`tile-interactions.js` geometry.** Drag/resize/port/cable hit targets are pixel-perfect expectations. Do not touch `--cable-w-hit`, port sizes, or drag math during any visual pass. (`VISUAL_MANIFEST.md` §4.4/§7; `VISUAL_COMPONENT_INVENTORY.md` §I "Critical.")
3. **The Conductor approval gate / sequential loop.** Do not parallelize it for performance without explicit, deliberate authorization — it's a safety property, not an oversight. (`PERF_STACK_AUDIT.md` §I.)
4. **Receipt write semantics.** Receipts are append-only and authority-bearing; don't batch/drop them to win a benchmark. Demote only non-milestone *chatter*, behind a flag, after measuring. (`KERNEL_CONSTITUTION.md`; `PERFORMANCE_LADDER.md` PF4.)
5. **SQLite pragmas / the 16ms PTY batch.** Already set (WAL+NORMAL) / already done. Re-tuning them is wasted motion until a baseline says otherwise. (`PERF_STACK_AUDIT.md` §I.)
6. **Webview pooling / lazy-mount.** It changes product behavior (tile liveness). Treat as a product decision after the canvas path is clean, not a silent perf tweak. (`PERFORMANCE_LADDER.md` Parked.)
7. **Cross-store migrations under the "one truth" change.** When you collapse stores (F2), phase it: demote-read before stop-write, keep a reversible fallback. Do not big-bang it. (`PERFORMANCE_LADDER.md` PF3; this is the highest-risk rung.)

---

## H. Recommended next 10 moves (concrete order of operations)

> Ordering principle: **make the foundation honest and measurable before building higher.** Subtraction and instrumentation first; new capability later.

**Move 1 — Write `START_HERE.md` and retire the stale `ARCHITECTURE.md`.**
*Goal:* one front door with the canonical 5-doc read order and a one-line "we are on v4." *Why now:* every human and agent session currently re-derives context or reads stale v3 pointers. *Output:* `START_HERE.md`; `ARCHITECTURE.md` replaced by a v4 one-screen map or a redirect. *Risk:* trivial. *Verify:* a new agent, given only `START_HERE.md`, reads the right files and doesn't open `BUILD_PLAN_V2.md`.

**Move 2 — Reconcile the two contradictions that cost first-run trust.**
*Goal:* fix Node 22-vs-24 (README ↔ EVE_SETUP) and the read-order mismatch (Constitution ↔ AGENTS). *Why now:* they're cheap, concrete, and erode trust on contact. *Output:* updated README + a single read-order. *Risk:* none. *Verify:* `grep` shows one Node floor; both AGENTS files point to `START_HERE.md`.

**Move 3 — Land PF0 (instrument + baseline), exactly as the ladder specifies.**
*Goal:* span log behind `QUANTFLOW_TRACE=1` + `qa/perf-baseline.json` (B1/B3/B4), zero behavior change when off. *Why now:* nothing else can be honestly optimized or verified without it; it's the project's own #1 rule. *Output:* `smoke:perf-trace`, baseline file, a longest-span summary. *Risk:* low (additive). *Verify:* flag-off byte-identical receipts vs golden; baseline has p50/p95 over 5 trials. (`PERFORMANCE_LADDER.md` PF0.)

**Move 4 — Freeze the event taxonomy and the `Span`/run-timeline schema as versioned docs.**
*Goal:* promote `PERF_STACK_AUDIT.md` §E into frozen contracts that PF1 and R7 both bind to. *Why now:* PF0 needs a frozen taxonomy anyway, and it closes risk C14. *Output:* `docs/v4/EVENT_TAXONOMY.md` + `docs/v4/SPAN_SCHEMA.md`. *Risk:* low. *Verify:* PF1 router and R7 Replay both import the same names.

**Move 5 — Land PF1 (incremental projection router) and harvest PF6's first module.**
*Goal:* kill snapshot polling; targeted per-event refresh + 50ms debounce; extract `renderer-event-router.js`. *Why now:* it's the #1 measured bottleneck and the first safe slice out of the monolith. *Output:* `smoke` proving 0 full-snapshot refetches under a 100-event storm vs baseline. *Risk:* low–medium (renderer hot path — that's why PF0 precedes it). *Verify:* measured projection-latency drop vs PF0 baseline. (`PERFORMANCE_LADDER.md` PF1.)

**Move 6 — Write the security/threat + secrets/permissions model.**
*Goal:* document where keys live (the R0 `getCredential()` accessor is the seam), what a spawned shell may touch, egress policy, and the local↔cloud trust boundary. *Why now:* the product executes real work and now reaches cloud; this is overdue and blocks safe Eve use. *Output:* `SECURITY.md`. *Risk:* low to write, high value. *Verify:* every secret read routes through the single accessor; a reviewer can name the trust boundary.

**Move 7 — Execute the single-source-of-truth collapse (PF3/R3), phased.**
*Goal:* Kernel canonical; JSON → export; `runtime-state` → strictly-derived async mirror; un-defer Envoy retirement. *Why now:* it's the root contradiction and the tax on everything. *Output:* boot reads Kernel only; a divergence test that *can't* disagree. *Risk:* **high** — phase it (demote-read before stop-write; reversible fallback). *Verify:* no read of `canvas-state.json` on boot; connection round-trips with no `runtime.db` write. (`PERFORMANCE_LADDER.md` PF3 — needs the tile-extension schema doc first.)

**Move 8 — Decompose `renderer.js` and `shell.css` (PF6 + Visual Phase 1), behavior-preserving.**
*Goal:* no hot-path file >800 LOC; named z-index tokens; one Theme.css spine. *Why now:* maintainability is the lowest score and the highest long-term solo-dev risk. *Output:* `projection.js`, `watchtower-host.js`, router module; "no literal z-index in shell" CI check. *Risk:* medium (refactor) — gated by PF0 green. *Verify:* full shell unit suite unchanged; cable pan p95 < 16ms. (`PERFORMANCE_LADDER.md` PF6; `VISUAL_MANIFEST.md` Phase 1.)

**Move 9 — Quarantine Eve behind a conformance-tested seam (or defer it).**
*Goal:* prove a beta cloud dependency cannot become a truth store or take down local. *Why now:* it's the biggest risk concentration; settle it before building R4+ on top. *Output:* a test asserting no Kernel-canonical fact originates in Eve; the harness seam documented as policy. *Risk:* medium. *Verify:* the app runs fully on the local/mock harness with Eve unreachable. (`BUILD_PLAN_V4.md` Eve seam.)

**Move 10 — Promote the glossary to v4 and rename the colliding nouns.**
*Goal:* one word, one meaning; v4 vocabulary (Run/Workflow/EveSession/checkpoint) defined once. *Why now:* collisions are the top AI-agent failure mode and you rely on AI agents. *Output:* `docs/v4/GLOSSARY.md`; renames landed with a codemod. *Risk:* medium (touches many files — do it as one mechanical pass with tests). *Verify:* no warning boxes left that disambiguate a reused name.

---

## I. Questions the founder must answer (20)

1. In one sentence with no "and," what *category* is QuantFlow — ADE, operator console, or research-run OS? Pick one.
2. Who is the day-one user, concretely — you, a trading-research operator, or general multi-agent builders? Name one.
3. What is the smallest end-to-end task a real user does that proves the product's value? Can you demo it today on one truth store?
4. Is local-first a *value* (works fully offline) or a *default* (cloud when convenient)? The Eve decision hinges on this.
5. If Eve (beta) breaks or pivots, what is your fallback, and have you tested that the app runs without it?
6. Which is canonical for a tile's position and transport: Kernel, JSON, or in-memory? Today the honest answer is "all three" — what should it be?
7. When does `runtime-state` SQLite get retired, specifically — and what blocks it right now?
8. Can a third party (not you, not your AI agents) run one command and reproduce a rung's "machine-verified ✅"? If not, what does the checkmark mean?
9. Who is allowed to be both the worker and the verifier of a rung, and is that ever acceptable?
10. Where do provider API keys live, who can read them, and what stops a spawned agent from exfiltrating them?
11. What is a spawned shell *not* allowed to do (filesystem, network)? Is that enforced or aspirational?
12. What data is allowed to cross the local→cloud boundary, and who reviewed that?
13. What's your ceiling on simultaneous webview tiles before memory degrades — and have you measured it?
14. If you could only ship three rungs this quarter, which three, and why those?
15. What happens to a real user's `kernel.db` on a bad migration — is there a rollback?
16. How will you cut a release and tell users what changed? Is there any versioning story?
17. Which single document, if it drifted from the code, would hurt most — and how often do you reconcile it?
18. How many of the ~30 docs are *load-bearing* vs. historical? Can you archive the rest this week?
19. What is your honest weekly capacity, and does the size of `BUILD_PLAN_V4.md` fit inside it?
20. If a senior engineer joined Monday, what would embarrass you most in the codebase — and why isn't that #1 on the list?

---

## J. Final founder-friendly explanation (plain English)

Here's the straight version.

**What you're doing right.** You had one genuinely good idea — *the Kernel owns the truth, and everything you see is just a picture of that truth* — and you wrote it down clearly enough that it can actually govern the system. That's rare. Most first products are a pile of features with no center. Yours has a center. You also did two things that engineers with ten more years of experience often skip: you wrote a short, enforceable constitution, and you audited your own performance honestly before optimizing anything. The performance audit in particular is the strongest document you have; trust its instinct to *measure first*.

**What you need to be careful about.** Your documents are currently more finished than your code, and that gap is the single most dangerous place a first-time founder can live. The constitution says "one source of truth," but the running app has two-to-four — and your own audit found it. The plan says "local-first," but you're adopting a beta cloud framework as the engine that does the actual work. The build plan is enormous (over two thousand lines), and you are one person. None of these is fatal. All of them are the same disease: **you're adding before you've finished subtracting.** The next phase of this project should feel like *cleaning*, not building — collapse the duplicate stores, break up the two giant files (`renderer.js` and `shell.css`), write the security model you don't have, and shrink the docs to what you can actually keep honest. Quarantine the cloud bet so a beta dependency can never take down the thing that works locally.

**The thing to internalize.** Your architecture model is right. Your discipline is real. Your biggest risk isn't that the foundation is wrong — it's that you'll keep stacking ambitious floors (Eve, cloud pods, semantic verification, RL, "Night Shift") on a foundation whose ground floor (one truth store, maintainable surface) isn't poured yet. Pour the ground floor first. If you do the ten moves in section H roughly in order, this becomes a real, defensible product. If you skip straight to the cloud and the AI-orchestration spectacle, you'll spend next year fighting divergence bugs in a 4,000-line file you're afraid to touch.

You're not building it like shit. You're building it like someone with good instincts and too much rope. Use less rope.

---

*End of audit. No code was modified; no implementation changes were made. Findings are grounded in the ten named documents plus verification of the supporting `docs/`, `src/`, and `runtime-state/` tree. Self-reported test/ledger status in `BUILD_PLAN_V4.md` was treated as claim, not verified fact.*
