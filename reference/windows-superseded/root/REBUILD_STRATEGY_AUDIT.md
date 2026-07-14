# REBUILD_STRATEGY_AUDIT.md

**Companion to:** `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md`, `QUANTFLOW_STABILIZATION_PLAN.md`
**Question answered:** What is the best way to rebuild QuantFlow — refactor, strangle, clean-slate, or hybrid?
**Method:** Read-only audit of the `quantflow-v4` tree (real file sizes/paths cited), plus the product goal and target architecture you stated.
**Tone:** Blunt. No flattery. Tied to one goal: shipping a visual operator console for governed autonomous workflows.

---

## The one fact that drives this entire audit

You are **not at the start of a rebuild.** You are **roughly halfway through a strangler migration that stalled**, and the evidence is in your own tree:

- Your **Kernel is already a separate, clean domain.** `src/kernel/` has `commands/`, `queries/`, `events/`, `receipts/`, `artifacts/`, `tasks/`, `conductor/`, `workflows/`, `migrations/`, `schema/` — 72 TS files, organized as a **CQRS command/query core, receipt-backed** (not pure event-sourced), and **not** buried inside the Electron shell.
- The **shell is a separate inherited world.** `quantflow-electron/` (317 files) is your near-identical fork of collab-public's working canvas agent environment.
- The **seam between them already exists and is half-built.** `quantflow-electron/src/windows/shell/src/canvas-rpc.js` (1,064 lines, with a 1,189-line test) is the bridge that reads Kernel truth. But `canvas-state.js` (312 lines) is *still alive* as a parallel local store, referenced by `tile-manager.js`, `renderer.js`, `cable-overlay.js`, and `role-startup.js`.

So the shell currently reads truth from the Kernel **and** keeps its own competing copy. That stalled half-migration *is* the "multiple truth stores" problem your first audit ranked #1. It is not a design flaw requiring a rewrite. It is **an unfinished migration requiring completion.**

Every recommendation below follows from this: the cheapest, safest, fastest path to a shippable QuantFlow is to **finish the strangler you already started** — not to refactor aimlessly, and absolutely not to start over.

---

## A. Executive Verdict

**Recommendation: Hybrid / strangler rebuild around the Kernel contract — specifically, finish the migration already in flight.** Preserve the Kernel domain and the inherited shell; progressively sever the shell's parallel truth (`canvas-state.js`, JSON saves, runtime-state mirror) so the Kernel becomes the *only* source of truth and the canvas becomes a pure projection. Decompose the two grafted monoliths (`renderer.js`, `shell.css`) by extraction, not rewrite.

**Do not clean-slate.** The "slate" you'd throw away — infinite canvas, tiles, PTY/terminals, webview management, IPC, drag/cable geometry — is the *inherited, professionally-built* part from collab-public. It is your head start and it is **not** where your problems live. Your problems live in the delta you grafted on top, and they're fixable in place.

**Scores for the current path** (direction stated per line so there's no ambiguity):

| Dimension | Score | Direction | Note |
|---|---|---|---|
| Product potential | **8/10** | higher = better | Real niche (canvas + browser tiles + governance + provable runs), strong identity, inherited solid base. |
| Architecture risk | **7/10** | higher = *worse* | The stalled truth-store migration is a real, central risk — but a known, located one. |
| Rebuild risk (clean-slate) | **9/10** | higher = *worse* | Rewriting an inherited working shell with AI is how solo projects die. Avoid. |
| Rebuild risk (hybrid/strangler) | **4/10** | higher = *worse* | The seam exists; you're finishing, not inventing. |
| Maintainability | **4/10** | higher = better | Two 3.8k–4.2k-LOC monoliths, six styling authorities, conductor duplication. |
| Shipping realism | **5/10 now → 7/10** | higher = better | Rises to 7 the moment you commit to "finish the strangler" instead of "rebuild." |

**The single biggest mistake to avoid next:** a clean-slate rewrite. It trades a known, bounded, half-solved problem (one truth store to collapse) for an unbounded one (re-deriving a working operator shell from zero). The second-biggest mistake is subtler and more likely: *calling this a "rebuild" at all*, which psychologically licenses throwing away working code. This is a **completion**, not a rebuild.

---

## B. Product North Star

**What QuantFlow is (one paragraph):** QuantFlow is a desktop visual operator console for governed autonomous workflows — an infinite canvas where autonomous work becomes *visible, inspectable, approvable, replayable, and provable*. Agents, terminals, browsers, tools, and artifacts live as tiles; cables carry context, delegation, verification, blockers, and receipts. The Kernel owns truth; the canvas is a projection of it; the Conductor decides the next action; harnesses do the real work; receipts prove what happened; spans explain where time went. The operator's superpower is *control with evidence*: pause, approve, replay, and understand.

**What QuantFlow is NOT:** a generic SaaS dashboard; a chat app; a playful AI toy; a multi-agent **coding** kanban (the crowded lane — Vibe Kanban, Claude Squad, worktree managers); an agent **development kit** (LangGraph/CrewAI/ADK); a notes/knowledge app (even though it inherited those bones from collab-public). Its wedge is the combination almost nobody else has: *spatial canvas + browser tiles + governance/receipts/provable runs.*

**The smallest version that proves the product (build to exactly this):** one operator, one canvas, spawn one **real** harness (a terminal or a single agent), it does one real piece of work, **every meaningful state transition produces a Kernel receipt** (authoritative state lives in Kernel tables), the canvas renders **only** from Kernel projection (no `canvas-state.js` truth), the operator can **pause/approve one action** before it proceeds, and the operator can **replay the run timeline from receipts** afterward. If that loop is clean and provable on **one** truth store, the product is proven. Everything else is expansion on top of a proven core.

**Feature triage:**
- **Essential (the proof):** Kernel-as-sole-truth; canvas projection; one harness type that does real work; receipts + replay; pause/approve one action; spans for "where did time go."
- **Optional (after proof):** multiple harness types, browser tiles, templates, richer cables, the legend dock, multi-run timelines.
- **Premature (defer hard):** cloud/Eve as primary runtime, dynamic edge workers, A2A wire integration, semantic verification, collaboration/swarm, RL/trading demos, visual redesign beyond token consolidation.
- **Distracting (vestigial inheritance):** the knowledge-app surfaces inherited from collab-public (rich-text BlockNote/TipTap editing, Monaco, KaTeX, the concept/source lists) — they came free with the fork but are not operator-console features. Archive or quarantine; don't maintain them as if they're yours.

---

## C. Current Codebase Mistakes

| Mistake | Where (real files) | Why it happened | Why it's dangerous | Fix mode | What replaces it |
|---|---|---|---|---|---|
| **Duplicate truth stores** | `canvas-state.js` (312) vs `canvas-rpc.js`→Kernel; plus `runtime-state/` SQLite mirror; plus JSON canvas save | The fork inherited collab's local canvas persistence; you added the Kernel on top and only half-migrated the shell off the old store | The product's entire value (governed, provable truth) is undermined when two stores can disagree; this is your #1 risk | **Strangle** | Kernel is sole truth; `canvas-state` becomes a derived render cache or is deleted; runtime-state becomes a strictly-derived async mirror |
| **God-file renderer** | `renderer.js` (3,777) | Collab's renderer was already large; you grafted watchtower, conductor hooks, cables, kernel-event handling onto it | Five+ migration steps all contend here; fixes don't stick; AI agents have huge blast radius | **Extract** (not rewrite) | `projection.js`, `event-router.js`, `watchtower-host.js`, `cable-host.js` — split along the fork seam (inherited vs grafted) |
| **Fragmented visual authority** | `shell.css` (4,189) + `legend-v1.css` (850) + viewer `App.css` (1,295) + shared tokens + Tailwind islands + component CSS | Six styling systems accreted across the fork seam and feature additions | Z-index soup, token redefinition, "visual work learned by trial not contract" | **In-place consolidate** | One `Theme.css` token spine; named `--z-*`; CSS lint forbidding literal z-index in shell |
| **Conductor duplication** | `src/kernel/conductor/` AND `src/main/conductor/run-template-runner.ts` (711) | Decision logic grew in two places as runtime and kernel evolved separately | Two homes for "what happens next" = ambiguous authority, drift | **Extract/merge** | One Conductor module with a single decision entry point; the other becomes a thin caller |
| **State/projection confusion in the shell** | `tile-manager.js` (1,183), `cable-overlay.js` (1,023) both touch `canvas-state` | Shell components were written against the old local store before the Kernel existed | They mutate local state directly instead of dispatching commands → the multiple-truth bug in miniature | **Strangle** | Components dispatch Kernel commands and render from projection only (the spine-lab pattern) |
| **IPC sprawl** | `preload/universal.ts` (737) + 20+ registrars (per prior audit) | Each feature added its own bridge channels | Hard to reason about what crosses the process boundary; lifecycle bugs | **In-place rationalize** | One typed IPC surface grouped by domain (authority / projection / harness / system) |
| **Terminal/PTY bleed risk** | `pty.ts` (1,225) | Inherited, substantial, proven — but status/output streams can leak toward canvas-level handling | PTY chatter polluting projection causes churn (your perf audit's concern) | **Keep + fence** | PTY stays in main behind the harness contract; only milestone facts become receipts, raw stream stays out of projection |
| **Stale/contradictory docs** | `ARCHITECTURE.md` (v3 stub), README Node 22 vs EVE_SETUP Node 24, glossary v3-only | Docs outran code across versions | New agents/contributors act on stale assumptions | **In-place fix** | `START_HERE.md`, reconciled versions, v4 glossary (see stabilization plan P0) |
| **Blurred agent/tool/tile concepts** | tile types across shell + `src/kernel/worker-instances/` | Vocabulary overloaded ("harness" x2, "run" x3) | AI agents and humans misroute work | **In-place rename** | One word, one meaning; codemod pass (stabilization plan P0.6) |
| **Too many live surfaces** | orphan `terminal-list/`, disabled legend connect-mode, vestigial collab knowledge views | Fork inheritance + feature sprawl | Maintenance cost with no user value | **Delete/archive** | Prune to operator-console surfaces only |

**Root cause, stated once:** almost every mistake is a **fork-seam artifact** — the boundary between collab-public's inherited app and the Kernel/governance layer you grafted on. That's *good news*: the mistakes are concentrated at one seam, not smeared through a badly-conceived system. Close the seam cleanly and most of the list resolves.

---

## D. Rebuild Strategy Options

### 1. In-place cleanup (refactor as you go)
- **Benefits:** no migration overhead; keeps shipping.
- **Risks:** without a hard contract, cleanup drifts; the two monoliths resist piecemeal fixes; you can clean forever and never close the truth seam.
- **Preserves:** everything. **Deletes:** nothing structurally.
- **Timeline:** indefinite (that's the problem).
- **Failure mode:** eternal polishing; the truth-store bug never actually gets killed because nothing forces it.
- **Best use case:** systems with no central structural defect. **Not yours** — you have one specific structural defect that needs a decisive move.

### 2. Strangler rebuild (around stable interfaces)
- **Benefits:** replace subsystems behind a fixed contract while the app keeps running; low blast radius; provable at each step.
- **Risks:** requires a real, stable contract to strangle *around*; if the contract is fuzzy, the strangler leaks.
- **Preserves:** the Kernel contract + inherited shell behavior. **Deletes:** the shell's parallel truth, incrementally.
- **Timeline:** weeks-to-months, but shippable throughout.
- **Failure mode:** the "stalled strangler" — exactly where you are now (canvas-rpc built, canvas-state never retired).
- **Best use case:** **yours** — you already have the stable contract (the Kernel) and the seam bridge (`canvas-rpc`). You just stopped halfway.

### 3. Clean-slate rewrite
- **Benefits:** mythical "do it right this time."
- **Risks:** you'd be re-deriving collab-public's working canvas/PTY/webview/IPC shell from zero, with AI, while also re-implementing your Kernel — doubling the surface and discarding your head start. Receipts, tests, and the inherited interaction feel all go to zero.
- **Preserves:** ideas only. **Deletes:** ~92k lines of mostly-working code, including a real test suite.
- **Timeline:** long, and historically the highest-mortality option for solo + AI builds.
- **Failure mode:** the rewrite never reaches parity; the project dies in the valley between old and new.
- **Best use case:** when the foundation is fundamentally wrong. **Yours is not** — it's a fork of a sound base with one unfinished migration.

### 4. Hybrid rebuild (preserve Kernel/protocol, progressively replace shell/canvas)
- **Benefits:** all the strangler's benefits, plus explicit permission to *replace* (not just clean) the shell/canvas **if and only if** a specific part proves unsalvageable after measurement.
- **Risks:** "progressively replace" can become "rewrite" if undisciplined.
- **Preserves:** Kernel + protocol + receipts + tests + interaction feel. **Deletes:** parallel truth, dead surfaces, and any shell module that measurement proves is cheaper to replace than extract.
- **Timeline:** weeks-to-months, shippable throughout.
- **Failure mode:** scope-creep into a stealth rewrite — guard against it with the agent rules in §L.
- **Best use case:** **yours, and this is the pick.**

### ✅ Recommended: **Hybrid/strangler around the Kernel contract.**
Strangler is the engine; hybrid is the permission slip to replace a *specific* shell module only when measurement justifies it (e.g., if `renderer.js` extraction proves more expensive than rewriting one isolated subsystem behind the same contract). The Kernel contract is the fixed point. Nothing crosses it without going through commands/queries/events. You finish the migration that's already 50% done.

---

## E. Recommended Architecture

Stated in plain terms, with **truth vs projection made explicit**. This is the target spine model at production scale (`START_HERE.md` §2; optional `kernel-spine-lab.html` illustration if present).

- **Kernel authority model (TRUTH).** `src/kernel/` is the single source of truth: authoritative state in **Kernel SQLite tables**; **commands** (`src/kernel/commands/`) are the only write door; **queries** (`src/kernel/queries/`) are the only read door. No other module owns state. *Everything else in the system is projection or cache.*
- **Event / receipt / span model.** Committed changes update Kernel tables, emit **events** (transition notifications — not a persisted truth store in v4), and append **receipts** (durable proof of outcomes, decisions, side effects, artifact creation, verification, and run milestones — the evidence/audit chain, **not** the canonical state-rebuild store). **Spans** are a separate, derived observability layer (the PF0 trace) explaining *where time went*; they are diagnostics, never authority. QuantFlow is **event-disciplined and receipt-backed**, not pure event-sourced. **Do not build a full formal event-sourcing framework** during structure-freeze — gold-plating it is in §I's defer list.
- **Canvas projection model (PROJECTION/CACHE only).** The canvas renders a query result. It owns nothing. `canvas-state.js` must become a *throwaway render cache* (or be deleted); drag/move/spawn all dispatch commands and re-render from projection. The canvas may be optimistic in the UI, but truth is only what the Kernel recorded.
- **Conductor role (DECISION).** One module decides the next action (currently split `src/kernel/conductor/` + `src/main/conductor/` — merge to one entry point). It is the durable-execution brain: deterministic, with an auditable timeline from receipts (operator replay view — not state rebuild from log). Keep its sequential-approval gate as a *safety property*, not an oversight to optimize away.
- **Harness role (EXECUTION + EXTERNAL BOUNDARY).** `src/harness/` executes real work (PTY/shell/browser/Python/Node/cloud). It is the **only** place that touches the outside world, and it is where the **A2A-shaped adapter contract** lives (external interop with opaque/remote agents — see the A2A discussion; adopt the protocol in a late phase, but shape the contract now). Harnesses never write Kernel state directly — they report facts the Kernel records.
- **SDK adapter role (EXTERNAL).** A typed adapter envelope (auth, retry, timeout, error normalization, receipt/permission hooks, standard spans). Design it A2A-shaped so A2A drops in later without a rewrite. This is the contract your first audit said was missing.
- **Terminal/PTY handling.** Stays in `main` (`pty.ts`) behind the harness contract. Raw streams stay out of projection; only milestone facts become receipts. This kills the "PTY bleed into canvas churn" risk.
- **Browser tile handling.** Electron webviews (the reason you keep Electron over Tauri — bundled Chromium = identical browser tiles everywhere). Treated as a harness output surface; memory ceiling is a measured product decision (pooling/lazy-mount), not a silent perf tweak.
- **Artifact handling (TRUTH).** Artifacts are Kernel-owned (`src/kernel/artifacts/`), content-addressed (sha256), verified by the structural gate (the artifact exists, is under root, is non-empty, hash matches). The canvas shows them; it doesn't own them.
- **Settings/preferences handling (CONFIG, not truth).** A clearly separate config store (`src/vault/` appears to hold secrets — keep secrets behind the single credential accessor per the security boundary). Preferences are not workflow truth and must not live in the canvas store.
- **Visual token system (ONE SPINE).** One `Theme.css` owns tokens (color, type, spacing, `--z-*`). Shell/legend/viewer/components consume, never redefine. Semantic cable colors map 1:1 from Kernel `semantic_type`.
- **Module boundaries.** Top-level: `src/kernel` (truth) · `src/main` (process/IPC/PTY) · `src/harness` (execution+external) · `quantflow-electron` (projection/shell). The rule: **truth flows one direction**, kernel → projection, never back.
- **Testing/QA strategy.** See §K. Every phase proves "I didn't break it" against a frozen baseline.

**The single sentence that defines the architecture:** *the Kernel is the only truth; receipts are its durable proof chain; the canvas, the runtime mirror, the JSON save, and `canvas-state.js` are all projections or caches derivable from Kernel queries and are never authoritative.*

---

## F. Rebuild Boundary Map

| Area | Current problem | Keep / Replace / Extract / Delete | Target owner/module | Migration risk | First safe step |
|---|---|---|---|---|---|
| `renderer.js` (3,777) | God-file; grafted concerns | **Extract** | Split into `projection.js`, `event-router.js`, `watchtower-host.js`, `cable-host.js` under shell | High | Carve out the event router first (pairs with PF1); prove behavior unchanged vs golden |
| `shell.css` (4,189) | Z-index soup; token redefinition | **Extract tokens, keep rules** | `Theme.css` spine + thin shell.css | Medium | Move `:root` tokens to Theme.css; add CSS lint banning literal z-index |
| `canvas-state.js` (312) | **Parallel truth store** | **Replace → cache, then likely Delete** | Kernel projection via `canvas-rpc` | High (the core one) | Make it read-through from Kernel; stop writing to it as truth; then demote to render cache |
| `tile-manager.js` (1,183) | Mutates local state directly | **Extract + rewire** | Dispatches Kernel commands; renders from projection | High | Route one mutation (tile move) through a command; prove via receipt |
| Cable system (`cable-overlay.js` 1,023 + `cable-renderer.js`) | Reads `canvas-state`; large | **Keep concept, rewire source** | Projection of Kernel `semantic_type` edges | Medium | Point cable data at the Kernel projection, not local state |
| Terminal tile (`pty.ts` 1,225, `terminal-tile/`) | Inherited, proven; bleed risk | **Keep + fence** | Harness contract; main process | Low | Assert raw PTY stream never enters projection; only facts → receipts |
| Legend dock (`legend-v1.css` 850, `legend-spawn.js`) | Separate visual authority; disabled modes | **Keep, consolidate styling; delete dead modes** | Theme.css tokens; one legend module | Low | Delete disabled connect-mode; fold styling into token spine |
| Settings | Risk of living near canvas truth | **Keep, isolate** | Dedicated config store; secrets via `src/vault` accessor | Low | Confirm settings/secrets never touch the canvas store |
| Kernel commands/queries/events (`src/kernel/*`) | **Already clean** | **Keep (this is the contract)** | `src/kernel/` | None | Freeze the public command/query/event signatures as the strangler contract |
| Conductor (`src/kernel/conductor` + `src/main/conductor` 711) | Duplicated homes | **Extract/merge** | One Conductor entry point | Medium | Make `run-template-runner` call the kernel Conductor; remove the second decision path |
| Receipts/artifacts (`src/kernel/receipts`, `artifacts`) | Sound | **Keep (preserve)** | `src/kernel/` | None | Freeze receipt/artifact schema; add the verify command to QA |
| Runtime-state mirror (`runtime-state/` SQLite) | Mirrors Kernel tables as competing truth | **Replace → derived async mirror** | Strictly-derived from Kernel | High | Demote-read before stop-write; add divergence test; un-defer Envoy retirement |
| JSON canvas save | Competing persisted truth | **Replace → export artifact** | On-demand export only | Medium | Stop reading it on boot; boot from Kernel only |
| Webviews (`viewer/`, browser tiles) | Memory cost; viewer `App.css` 1,295 | **Keep; measure** | Harness output surface | Low-Med | Add a webview-count perf baseline; defer pooling as a product decision |
| IPC bridge (`preload/universal.ts` 737, registrars) | Sprawl | **Keep, rationalize** | One typed IPC surface by domain | Medium | Group channels into authority/projection/harness/system namespaces |
| Visual tokens | Six authorities | **Consolidate** | `Theme.css` | Medium | Theme.css becomes the only token source; others import |

---

## G. The "Boring Core" Plan

Before any advanced feature, QuantFlow must have exactly **one** of each of these — boring, singular, and provable:

1. **One source of truth:** the Kernel. (`canvas-state`, JSON, runtime-state are derived/cache.)
2. **One command path:** `src/kernel/commands/` — the only write door.
3. **One event path:** the Kernel's emit; all other event/log buses deprecated.
4. **One projection path:** query → render. The canvas reads here and nowhere else.
5. **One visual token spine:** `Theme.css`.
6. **One tile lifecycle model:** create/move/close are commands → receipts → projection. No tile state outside the Kernel.
7. **One cable lifecycle model:** cables are projections of Kernel `semantic_type` edges; no local cable truth.
8. **One terminal lifecycle model:** PTY in main behind the harness; facts → receipts; raw stream excluded from projection.
9. **One receipt/artifact lifecycle model:** append-only receipts; content-addressed, structurally-verified artifacts.
10. **One QA path:** a `qa/` suite where "verified" means a re-runnable command (deterministic smoke + the divergence check: Kernel snapshot == canvas projection == any derived mirror; receipts corroborate transitions).

**Why the boring core enables the magical canvas later:** the "magic" you want — live multi-run projection, dense heterogeneous tiles, overnight autonomous swarms, replayable timelines, browser automation on canvas — are all *projections of, or executions recorded by, the Kernel.* If there is one truth and one projection path, every magical feature is "add a new view of the same truth" or "add a new harness that reports facts." If there are four truths and tangled projection, every magical feature multiplies the divergence surface and the churn. **The boring core is not the opposite of the magic — it is the substrate that makes the magic cheap and safe to add.** You cannot build a reliable spatial operator console on a foundation that can't agree with itself about where a tile is.

---

## H. Migration Plan (no big-bang)

This is the rebuild-specific phasing; it aligns with `QUANTFLOW_STABILIZATION_PLAN.md` and refines it for the strangler. Sequential by default (you're one founder + AI). Each phase is shippable.

**Phase 1 — Measure.** *Goal:* a baseline so every later step proves "no regression." *Scope:* PF0 spans behind `QUANTFLOW_TRACE=1`; `qa/perf-baseline.json`; golden receipts for one real run. *Touches:* instrumentation only. *Must not change:* behavior when the flag is off (byte-identical receipts). *Proof:* `smoke:perf-trace` green; flag-off = no-op. *Rollback:* delete the flag. *Acceptance:* baseline exists at p50/p95 over 5 trials.

**Phase 2 — Freeze vocabulary & contract.** *Goal:* one word per concept; freeze the Kernel command/query/event signatures as the strangler contract. *Scope:* `START_HERE.md`, v4 glossary, rename codemod, freeze taxonomy + span schema. *Touches:* docs + mechanical renames. *Must not change:* runtime behavior. *Proof:* no overloaded core nouns; contract doc references real signatures. *Rollback:* revert codemod commit. *Acceptance:* a fresh agent reads the contract and uses one name per concept.

**Phase 3 — Extract module boundaries.** *Goal:* break the two monoliths by extraction, behavior-preserving. *Scope:* carve `event-router.js` (with PF1), then `projection.js`, `watchtower-host.js`, `cable-host.js` out of `renderer.js`; merge the duplicate Conductor. *Touches:* `renderer.js`, conductor. *Must not change:* observable behavior vs Phase-1 golden. *Proof:* full shell test suite unchanged; no file >800 LOC in the hot path. *Rollback:* extraction is reversible per-module. *Acceptance:* golden run identical.

**Phase 4 — Collapse duplicate truth (the centerpiece).** *Goal:* Kernel is the only truth. *Scope:* boot from Kernel only; `canvas-state.js` → read-through cache then delete; JSON → export; runtime-state → derived async mirror; un-defer Envoy retirement. *Touches:* `canvas-state.js`, `tile-manager.js`, `cable-overlay.js`, `runtime-state/`, boot. *Must not change:* the Kernel schema or the canvas's *visual* behavior. *Proof:* no read of `canvas-state.json` on boot; connection round-trips with no `runtime.db` write; **divergence test passes** (Kernel authoritative state, event-carried projection updates, and canvas-visible projection agree; receipts provide proof, not independent state authority). *Rollback:* feature-flag the cache fallback; demote-read before stop-write. *Acceptance:* the divergence invariant holds in the real app.

**Phase 5 — Clean projection/event handling.** *Goal:* kill snapshot churn. *Scope:* PF1 incremental router fully landed; one event path; deprecate the other buses; PTY stream excluded from projection. *Touches:* router, projection, event buses. *Must not change:* which facts are recorded. *Proof:* 100-event storm → 0 full-snapshot refetches vs baseline. *Rollback:* revert router. *Acceptance:* measured projection-latency drop.

**Phase 6 — Align visual tokens.** *Goal:* one token spine. *Scope:* `Theme.css` owns tokens + `--z-*`; shell/legend/viewer consume; delete dead visual surfaces. *Touches:* CSS only. *Must not change:* `tile-interactions.js` geometry, `--cable-w-hit`, port sizes, drag math. *Proof:* CSS lint rejects literal z-index in shell; visual-regression screenshots within tolerance. *Rollback:* revert CSS. *Acceptance:* no token redefinition outside Theme.css.

**Phase 7 — Rebuild/replace shell canvas *only if justified*.** *Goal:* replace a specific shell subsystem **only** if Phase-3 measurement proved extraction more expensive than a clean reimplementation behind the same contract. *Scope:* one isolated subsystem at a time. *Touches:* that subsystem. *Must not change:* the Kernel contract or the projection path. *Proof:* contract conformance + golden run. *Rollback:* keep the old module behind a flag until the new one passes. *Acceptance:* parity on the golden run. **Default expectation: you will NOT need this. It exists so "hybrid" is honest, not so you reach for it.**

**Phase 8 — Add QA/operator harnesses.** *Goal:* the rebuild proves itself continuously. *Scope:* deterministic smoke, Playwright/Electron, exploratory tests, visual regression, receipt/timeline verification, operator acceptance scripts. *Proof:* CI runs them per phase. *Acceptance:* every prior phase has a re-runnable proof in `qa/`.

**Phase 9 — Reintroduce advanced agent/collaboration features.** *Goal:* expand on the proven core. *Scope:* more harness types, browser tiles, A2A wire integration, templates, multi-run timelines, then (much later) collaboration/swarm. *Proof:* each rides the single truth + single projection path with a labeled status. *Acceptance:* no feature introduces a new truth store (enforced by §L).

---

## I. What To Delete or Defer (be aggressive)

**Delete / archive now (vestigial or dead):**
- Orphan `terminal-list/`, disabled legend connect-mode, dead `#drag-drop-overlay` reference.
- Inherited collab **knowledge-app surfaces** not used by the operator console (rich-text BlockNote/TipTap editing, KaTeX math, concept/source lists, possibly Monaco) — archive to `reference/`; stop maintaining them as if they're core.

**Defer hard (cool but premature — every one of these is a foundation-killer if added now):**
- **Full event-sourcing framework rewrite.** You already have append-only receipts for audit/timeline. Do **not** promote receipts into the principal state-rebuild store or build snapshots/projection-rebuild infrastructure/event-versioning machinery before you've collapsed to one truth store. Keep receipt-backed discipline; defer the apparatus.
- **Dynamic edge workers / Cloudflare-style routing.** No.
- **Cloud-first orchestration / Eve as primary runtime / R4 "collapse onto Vercel."** Eve stays fenced behind the harness seam with a kill switch (it's already partially wired — fence it, don't expand it).
- **A2A wire integration.** Shape the adapter contract A2A-style now; integrate the protocol in Phase 9.
- **Too many agent/tile types.** One real harness proves the product. Resist a zoo.
- **Collaboration / swarm features.** Multi-operator and agent swarms are Phase 9+.
- **Visual redesign before token authority.** Only token/z-index consolidation now; no restyle of tiles/cables/panels.
- **Browser automation on canvas before the core is stable.** Browser tiles render now; *automation* waits.
- **RL / trading-bot demos.** Schema-prep only; these are the *last* thing, not the first. A trading demo on an unstable truth model is how you lose real money on a divergence bug.

---

## J. What To Preserve (do not throw away)

- **Product identity.** The "serious operator console for governed autonomous workflows" framing and the restrained-neon visual DNA (`DESIGN.md`). It's a real wedge; protect it.
- **The Kernel constitution AND the actual Kernel domain.** `src/kernel/` is *clean and well-organized* — commands/queries/events/receipts/artifacts/tasks/conductor/workflows. This is your crown jewel and the strangler's fixed contract. Do not rewrite it.
- **The inherited canvas interaction feel.** Pan/zoom/drag/tiles from collab-public *work* and feel right. Re-deriving this is pure downside.
- **Tile/cable concept + semantic strings.** Distinctive and consistent; preserve the model, rewire the data source.
- **Terminal/PTY work.** `pty.ts` (1,225) is substantial, inherited, and proven. Keep it; fence it behind the harness.
- **Receipts/artifacts.** The evidence chain and the structural verification gate are production-grade thinking. Preserve and freeze.
- **The performance audit + build-plan ledger.** `PERF_STACK_AUDIT.md` is your best document; PF0-first is correct. The ledger is a real record — keep it, just relabel claims with `STATUS:`.
- **The real test suite.** You have substantial tests: `canvas-rpc.test.ts` (1,189), `watchtower-view.test.ts` (1,151), `cable-overlay.test.ts` (846), `server.test.ts` (828), `tool-definitions.test.js` (754), `canvas-state.test.ts`, `role-tile-spawn.test.ts`. A clean-slate rewrite throws all of this away. **This alone is a strong argument against rewriting.**
- **`canvas-rpc.js` as the seam bridge.** It's the half of the strangler you already built. Build *on* it; don't discard it.

---

## K. Testing and QA Strategy

The rebuild's safety depends entirely on proving each phase didn't break the product. Stack:

- **Deterministic smoke tests** (CI-safe, no real-agent auth): divergence invariants — Kernel snapshot == canvas projection == any derived mirror; boot-from-Kernel-only; one meaningful mutation → one receipt. These are the backbone; they must pass on every phase.
- **Playwright/Electron tests:** drive the real shell — spawn a tile, move it, close it, confirm the canvas reflects Kernel projection. Catches IPC/lifecycle regressions the unit tests miss.
- **Exploratory / human-like tests (UI-TARS or similar):** let an agent poke the UI for states your scripts didn't anticipate — orphan windows, stuck cables, churn under rapid actions. Run before each phase gate.
- **Visual regression screenshots:** baseline the canvas, legend, tiles; diff after the token-consolidation phase (Phase 6) so styling changes are intentional, not accidental. Guards the geometry you must not touch.
- **Performance baselines (PF0):** the `qa/perf-baseline.json` p50/p95; re-baseline after Phases 4 and 6; every optimization claim is measured against it.
- **Receipt/timeline verification:** assert a run's receipt timeline matches committed Kernel transitions and operator-visible facts; assert the span timeline matches receipt order. Receipts prove and audit — they do not replace Kernel tables as authority. This is the product's core promise — test it like it matters.
- **Manual operator acceptance:** a short scripted checklist a human runs per phase ("spawn a real harness, pause it, approve one action, replay the run, confirm the timeline reads true"). The product is an *operator* console; a human must confirm it feels like one.

**How every phase proves it:** each phase's gate names a re-runnable `qa/` command and a golden artifact (receipts/screenshots/baseline). "Verified" is never a typed checkmark — it's a command a third party (or future-you) can run and watch pass. You personally run the real-proof for the truth-collapse phase (Phase 4), because that's the one you most need to trust.

---

## L. Agent / Cursor / Codex Rules (for this rebuild)

Non-negotiable, because you build 100% with AI and the blast radius in `renderer.js` and the Kernel command path is large:

1. **No code before reading the strategy.** An agent session starts by reading `START_HERE.md` → this doc → the relevant module's contract. No edits before context.
2. **One module / one rung at a time.** No multi-subsystem PRs. Scope is a single boundary-map row.
3. **No self-approval.** The agent that wrote the change is not its final verifier. *You* run the foundation proofs.
4. **No hidden rewrites.** "Refactor" never means "replace silently." Replacing a module (Phase 7) requires explicit authorization and a parity proof.
5. **No new truth stores. Ever.** This is the cardinal rule of this rebuild. Any change that introduces a place that "remembers" state outside the Kernel is rejected on sight. If a value needs to persist, it goes through a Kernel command.
6. **No raw visual redesign without token authority.** No literal z-index, no `:root` token redefinition outside `Theme.css`. Enforced by CSS lint.
7. **No giant PRs.** If a change touches more than one boundary-map area, it's split.
8. **Every PR carries an acceptance test.** A re-runnable `qa/` command + the golden it preserves. No green checkmark without a command behind it.
9. **Every change is labeled.** The PR states which layer it touches: **authority** (Kernel/commands), **projection** (canvas/render), **visual** (tokens/CSS), **harness** (execution/external), or **QA**. A change that can't be labeled is a change that doesn't understand itself — reject it.
10. **The Kernel contract is frozen.** Command/query/event signatures change only by deliberate, documented decision — never as a side effect of a shell change.

---

## M. Final Recommendation (founder-level, blunt)

**Is the codebase salvageable?** Yes — *more* than salvageable. You have a clean Kernel, a working inherited shell, a real test suite, and a seam bridge already built. The thing people fear ("it's a mess, start over") is wrong: it's a sound fork with **one unfinished migration** and **two grafted monoliths**. Both are fixable in place.

**Is a rebuild worth it?** Not a *rewrite* — that would be a serious, possibly fatal mistake. A **hybrid/strangler completion** is absolutely worth it, and it's mostly already underway. You're finishing, not restarting.

**What to do next (first 3 moves):**
1. **Reframe it in your own head: this is a completion, not a rebuild.** Write `START_HERE.md` saying so, freeze the Kernel contract as the strangler's fixed point, and reconcile the stale docs. (Cheap, unblocks every agent session.)
2. **Land PF0 and freeze the contract/vocabulary** — get the baseline that lets every later step prove "no regression," and the one-word-per-concept glossary that stops agents misrouting.
3. **Kill the parallel truth.** Finish the `canvas-state.js` → Kernel migration: boot from Kernel only, demote the JSON and runtime-state mirror, ship the divergence test. This is the move that turns "cool app" into "product."

**What NOT to do next:** do not clean-slate; do not add cloud/Eve/A2A/swarm/RL/browser-automation; do not restyle before the token spine; do not let any agent introduce a second source of truth.

**What would make this project fail:** (a) a clean-slate rewrite that strands you between old and new; (b) never finishing the strangler — leaving `canvas-state.js` alive forever so the truth bug becomes permanent; (c) adding cloud, swarm, or trading features on top of the unfinished truth model and drowning in divergence bugs; (d) believing the AI agents will hold the architecture for you — they won't; that's your job now.

**What would make it win:** finish the strangler to **one source of truth**, build the **boring core** (one command/event/projection path, one token spine, one QA path), preserve the inherited shell and the Kernel, and *then* layer the magical canvas — live projection, dense tiles, replayable timelines, governed autonomy — on a foundation that can finally agree with itself. The vision is right, the niche is real, the base is sound. The only thing standing between you and a shippable QuantFlow is the discipline to **finish what you started before you start anything new.**

---

*Read-only audit. No code modified. File sizes, paths, and structure cited from the `quantflow-v4` working tree. Self-reported ledger status treated as claim until a `qa/` command reproduces it. Receipt/event vocabulary aligned with `START_HERE.md` §2 (2026-06-24). This document decides the rebuild strategy; `QUANTFLOW_STABILIZATION_PLAN.md` executes it phase by phase.*
