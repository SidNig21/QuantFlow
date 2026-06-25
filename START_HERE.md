# START_HERE.md

> **The single front door to QuantFlow. Read this in full before doing anything — human or AI.**
> If any other document, comment, or prior message contradicts this file, **this file wins.**
> Last reframed: 2026-06-24 (receipt/event vocabulary) · Branch: `quantflow-v4`

---

## 0. Prime directive (read this twice)

**QuantFlow is in STRUCTURE-FREEZE mode.**

We are **not building new features.** We are **finishing a stalled migration** and **collapsing the codebase to one source of truth.** Until the structure-fix gates in §9 are all green, the answer to "can we add X?" is **no** — where X is any new feature, surface, agent type, cloud capability, or visual redesign.

This is **not a rebuild.** It is a **completion.** The foundation is sound; one migration was left half-done. We finish it. We do **not** start over.

If you are an AI coding agent: do not write or change code until you have read this file and the relevant module contract. See the hard rules in §8.

---

## 1. What QuantFlow is (so you don't drift)

QuantFlow is a **desktop visual operator console for governed autonomous workflows.** An infinite canvas where autonomous work becomes **visible, inspectable, approvable, replayable, and provable.** Tiles are agents / terminals / browsers / tools / artifacts. Cables carry context, delegation, verification, blockers, receipts. The operator's power is **control with evidence.**

It is **NOT**: a SaaS dashboard, a chat app, an AI toy, a multi-agent *coding* kanban, an agent dev kit, or a notes app (even though it was forked from one — see §3).

---

## 2. THE ONE RULE (everything else follows from this)

**The Kernel owns truth. Everything else is a projection or a cache.**

| This is TRUTH (authoritative) | This is NOT truth (derived / cache / export) |
|---|---|
| `src/kernel/` — **Kernel SQLite tables** hold current authoritative state; **commands** = only write door; **queries** = only read door; **events** = transition notifications | `quantflow-electron/.../canvas-state.js` — **legacy parallel store; being retired** |
| Append-only **receipts** (`src/kernel/receipts/`) = durable proof of outcomes, decisions, side effects, artifact creation, verification, and run milestones. Receipts are **not** the full state-rebuild event store in v4 | The **JSON canvas save** — export only, never read as truth |
| Content-addressed **artifacts** (`src/kernel/artifacts/`) | The `runtime-state/` SQLite **mirror** — must become strictly-derived |
| | The **canvas / DOM** — renders projection, owns nothing |

**The cardinal sin of this codebase: a second source of truth.** Any change that makes something *remember state* outside the Kernel is rejected on sight. If a value must persist, it goes through a **Kernel command**. No exceptions.

> Why this matters: the current bug we are fixing is that the shell reads Kernel truth via `canvas-rpc.js` **and** keeps its own copy in `canvas-state.js`. Two stores that can disagree. That is the whole problem. Do not add a third.

QuantFlow v4 is **event-disciplined and receipt-backed**, not a pure event-sourced rewrite. A future version may choose to make an append-only event store the principal source of truth, but structure-freeze explicitly does **not** add that new authority layer.

A runnable illustration of the target spine (Kernel query → projection, with a divergence check: Kernel snapshot == canvas projection; receipts corroborate transitions) may live in `kernel-spine-lab.html`. When in doubt about truth vs projection, prefer `KERNEL_CONSTITUTION.md` and `docs/v3/AUTHORITY_RULES.md`.

---

## 3. The lineage you must know

QuantFlow is a near-identical fork of **collab-public** (an Electron infinite-canvas agent environment: Electron 40 / React 19 / Tailwind 4 / xterm + node-pty). The **canvas, tiles, terminals, PTY, webviews, and IPC are inherited and they work** — that is our head start, **not** our problem. What *we* added on top is the **Kernel / governance / receipts / Conductor** layer. **Almost every structural problem is at the seam between the inherited shell and our Kernel.** Fix the seam; do not rewrite the inherited shell.

---

## 4. Read order (canonical — ignore everything not on this list)

1. **`START_HERE.md`** (this file) — the rules.
2. **`KERNEL_CONSTITUTION.md`** — the one rule, in full.
3. **`REBUILD_STRATEGY_AUDIT.md`** — the decision (*why*): finish the strangler. (See §F boundary map, §L agent rules.)
4. **`REBUILD_QUEUE.md`** — the **active ordered execution queue** (*what next* — Stage A→H, one chunk at a time). **This is the marching order.**
5. **The contract of whatever module you're touching** (e.g. `src/kernel/AGENTS.md`, `src/harness/AGENTS.md`).

`QUANTFLOW_STABILIZATION_PLAN.md` (governance/rationale) and `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md` (original diagnosis) are **reference background** — the order to execute now lives in `REBUILD_QUEUE.md`.

**Unsure whether any doc is current?** Consult **`DOC_AUTHORITY_MAP.md`** — it classifies every file as CURRENT / REFERENCE / ARCHIVE. A `v3` folder name does **not** mean stale: v4 extends v3, so `docs/v3/` holds the still-binding foundation.

**Stale — do NOT follow:** `ARCHITECTURE.md` (now archived under `reference/v3-superseded/`), `BUILD_PLAN_V2.md`, `BUILD_PLAN_V3.md`, and any v2/v3 *execution* doc. **Live vocabulary:** [`docs/v4/GLOSSARY.md`](docs/v4/GLOSSARY.md) (promoted A1); [`docs/v3/GLOSSARY.md`](docs/v3/GLOSSARY.md) remains the v3 base for unchanged terms.

`docs/v4/PERF_STACK_AUDIT.md` and `docs/v4/PERFORMANCE_LADDER.md` are the performance source of truth (PF0-first). `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md` is the original diagnosis (background).

---

## 5. Where things live

**Truth layer (our delta — clean, this is the fixed contract):**
- `src/kernel/` — `commands/` (only write door), `queries/` (only read door), `events/`, `receipts/`, `artifacts/`, `tasks/`, `conductor/`, `workflows/`, `schema/`, `migrations/`
- `src/harness/` — execution + the external boundary (PTY/shell/browser/cloud). Design its adapter contract **A2A-shaped** (external interop) — but do not integrate the A2A wire protocol during structure-freeze.
- `src/main/` — process, `ipc/`, `conductor/` (decision logic — being merged into one Conductor entry point)
- `src/vault/` — secrets. All secret reads go through the single credential accessor.

**Shell layer (inherited from collab-public — projection only):**
- `quantflow-electron/src/windows/shell/src/` — `renderer.js` (god-file, being extracted), `shell.css` (token consolidation pending), `canvas-rpc.js` (the seam bridge — **keep/build on**), `canvas-state.js` (**retire**), `tile-manager.js`, `cable-overlay.js`, `watchtower-view.js`
- `quantflow-electron/src/main/pty.ts` — terminals (keep, fence behind harness)

**The seam to close:** the shell must read truth **only** through `canvas-rpc` → Kernel. `canvas-state.js` becomes a throwaway render cache, then is deleted.

---

## 6. What we are doing now / NOT doing now

**Doing — in this order (full per-chunk queue: `REBUILD_QUEUE.md`):**
1. **Freeze contract & vocabulary** (Stage A) — v4 glossary; frozen Kernel command/query/event signatures; one-word rename codemod.
2. **Measure + QA bootstrap** (Stage B) — stand up `qa/`; PF0 spans + `qa/perf-baseline.json`; frozen event-taxonomy/span schema; a golden run (so every step proves "no regression").
3. **Thin seam extraction** (Stage C) — carve the event-router + projection read path out of `renderer.js` (the PF1 enabler). *Thin, not bulk.*
4. **Collapse duplicate truth** (Stage D) — boot from Kernel only; retire `canvas-state.js`, JSON, runtime-state mirror; divergence test. **This is the centerpiece.**
5. **Clean projection/event handling** (Stage E) — incremental router, one event path, PTY out of projection.
6. **Make it safe** (Stage F) — secrets via one accessor; Eve fence + kill switch. (Cheap insurance; SDK adapter contract deferred.)
7. **Bulk decompose + token spine** (Stage G) — every hot-path file < 800 LOC; merge the Conductor; one `Theme.css` spine.
8. **QA closeout** (Stage H) — every gate is a re-runnable command.

**NOT doing until §9 is green (hard stop):** cloud/Eve as primary runtime · A2A wire integration · new agent/tile types · collaboration/swarm · semantic verification · browser automation · RL/trading demos · any visual redesign beyond token/z-index consolidation · a clean-slate rewrite of anything.

---

## 7. STATUS labeling (no claim without proof)

Every rung, feature, and capability claim in any doc carries exactly one tag:

- **`STATUS: Implemented-verified`** — a re-runnable command in `qa/` proves it. (Name the command.)
- **`STATUS: Implemented-unverified`** — code exists, no reproducible proof yet.
- **`STATUS: Planned`** — not built.

**"Verified" is never a checkmark someone typed.** It is a command a third party can run and watch pass. Anything unlabeled is treated as `Planned`. The founder personally runs the proof for the truth-collapse step (§6.4).

---

## 8. Hard rules for AI coding agents (Cursor / Codex / Claude)

Non-negotiable. A change that violates any of these is rejected without review.

1. **Read before edit.** Start every session with this file → the rebuild strategy → the module's contract.
2. **No new truth stores. Ever.** (See §2. This is the one that kills the project if ignored.)
3. **One module / one boundary-map row at a time.** No multi-subsystem changes.
4. **No self-approval.** The agent that wrote a change is not its final verifier.
5. **No hidden rewrites.** "Refactor" means behavior-preserving extraction. Replacing a module needs explicit human authorization + a parity proof.
6. **No giant PRs.** Touching more than one area → split it.
7. **Every change is labeled by layer:** **authority** (Kernel/commands) · **projection** (canvas/render) · **visual** (tokens/CSS) · **harness** (execution/external) · **QA**. A change that can't be labeled doesn't understand itself — reject it.
8. **Every PR carries a re-runnable `qa/` acceptance test** and names the golden it preserves.
9. **No literal `z-index` and no `:root` token redefinition outside `Theme.css`.**
10. **The Kernel contract is frozen.** Command/query/event signatures change only by deliberate, documented decision — never as a side effect of a shell change.

---

## 9. Definition of done — the structure-fix gates

Structure-freeze lifts (and feature work may resume) only when **all** of these are green, each proven by a named `qa/` command:

- [ ] **G-measure:** PF0 baseline exists; trace is a no-op when off (byte-identical receipts).
- [ ] **G-contract:** Kernel command/query/event signatures frozen; v4 glossary live; no overloaded core nouns (`harness`, `run`, `pause` disambiguated).
- [ ] **G-extract:** no hot-path file > 800 LOC; full shell test suite unchanged vs the golden run.
- [ ] **G-one-truth:** boot reads the Kernel only (no read of `canvas-state.json`); a connection round-trips with **no** `runtime.db` write; the **divergence test passes**: Kernel authoritative state, Kernel event-carried projection updates, and canvas-visible projection agree for the same run (receipts provide proof and audit evidence, not independent state authority); `canvas-state.js` is a cache or deleted; Envoy/runtime-state retirement un-deferred.
- [ ] **G-projection:** 100-event storm → **0** full-snapshot refetches vs baseline; one event path; PTY stream excluded from projection.
- [ ] **G-safe:** every secret read routes through the single `getCredential()` accessor; the Eve fence conformance test passes (no Kernel-canonical fact originates in Eve) and a kill switch proves the app runs fully with Eve unreachable. *(The full SDK adapter contract is deferred past freeze.)*
- [ ] **G-tokens:** one `Theme.css` spine; CSS lint rejects literal z-index in shell.
- [ ] **G-qa:** every gate above has a re-runnable command in `qa/`, not a typed checkmark.

When all eight are green: the boring core is real, the codebase agrees with itself about what is true, and **only then** does the magical canvas (live projection, dense tiles, replayable timelines, governed autonomy, A2A, cloud) get built — on a foundation that can finally hold it.

---

*This file is the contract. Keep it short. If it grows past two screens, something belongs in the stabilization plan instead. Update it only by deliberate decision, and note the date at the top.*
