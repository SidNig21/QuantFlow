# REBUILD_QUEUE.md

> **The single ACTIVE execution queue for the QuantFlow structure-freeze.**
> This is the *ordered what-next*. `START_HERE.md` is the rules and wins any conflict;
> `REBUILD_STRATEGY_AUDIT.md` is the *why* (decision + §F boundary map + §L agent rules);
> `QUANTFLOW_STABILIZATION_PLAN.md` is the *governance/rationale*. **This file decides the order.**
> Created: 2026-06-24 · Branch: `quantflow-v4`

---

## 0. What this doc is (and is not)

The rebuild was scoped across three docs with three different phase numberings
(`START_HERE.md` §9 gates, `REBUILD_STRATEGY_AUDIT.md` §H Phase 1–9,
`QUANTFLOW_STABILIZATION_PLAN.md` P0–P5). They mostly agreed but disagreed on one
thing — *when to decompose the monoliths relative to collapsing truth* — and
`START_HERE.md` §9 had no safety gate. **This file reconciles all of that into one
ordered queue of chunks (Stage A → H).** A builder agent executes one chunk at a
time and does not start the next until the current chunk's gate is green.

- It is **not** a new plan with new ideas. Every chunk traces to a
  `REBUILD_STRATEGY_AUDIT.md` §F boundary-map row (see §6 coverage matrix).
- It is **not** verbose per-chunk specs. The full spec for a chunk is authored
  **at promotion** (see §1), matching the project's "one rung at a time" model.
- The **finish lines are the `START_HERE.md` §9 gates** (see §3 gate map).

Fresh `Stage A–H` IDs are used deliberately so they never collide with the
existing `R0–R8` (v4 spine), `S0–S6` (Surface ladder), `PF0–PF7` (perf ladder),
or `P0–P5` (stabilization) namespaces.

---

## 1. How to use this queue (the promotion model)

1. **Pick the lowest open chunk.** Chunks are ordered; do not skip ahead.
2. **Author the chunk's full spec** from the §5 template (objective · files ·
   layer label · must-not-change · proof command · exit gate · rollback). This is
   the handoff artifact for the builder agent. Keep it to one screen.
3. **Hand exactly that one chunk** to a builder agent. One chunk = one boundary-map
   row = one PR. No multi-chunk PRs (`START_HERE.md` §8.3).
4. **Gate before advancing.** The chunk's exit gate must be a *re-runnable `qa/`
   command*, not a typed checkmark. For the foundation gates, the **founder runs
   the proof** — not the agent that wrote the change.
5. **Mark STATUS** on the chunk row here (`Planned` → `Implemented-unverified` →
   `Implemented-verified` once a `qa/` command reproduces it).

Default STATUS for every chunk below is **`Planned`** until proven.

---

## 2. The reconciled spine (Stage A → H)

Each stage lists its chunks. `Layer` is the mandatory `START_HERE.md` §8.7 label.

### Stage A — Contract & vocabulary freeze  → closes **G-contract**
*Goal: one word per concept; freeze the Kernel contract as the strangler's fixed point.*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| A1 | Promote v4 glossary; resolve overloaded nouns (`harness`×2, `run`×3, `pause`) — **STATUS: Implemented-unverified** | authority | `docs/v4/GLOSSARY.md` (from `docs/v3/GLOSSARY.md`) |
| A2 | Freeze Kernel command/query/event **signatures** as the strangler contract (doc cites real signatures) | authority | `src/kernel/commands/`, `queries/`, `events/` |
| A3 | One mechanical rename codemod enforcing one-word-per-concept; tests green | authority + projection | renamed call sites; codemod commit |

**A1 note (2026-06-25):** founder approved PAUSE tiering, harness split (`eve-harness` KEEP), RUN projection renames, and Stage D exclusion from A3. Rename map in `docs/v4/GLOSSARY.md` is **APPROVED**; G-contract fully closes at A3.

**Exit (G-contract):** no overloaded core nouns; contract doc references real
signatures; codemod committed with green tests.

### Stage B — Measure + QA bootstrap  → closes **G-measure**
*Goal: a baseline + a real `qa/` harness so every later chunk proves "no regression."*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| B1 | Stand up the `qa/` harness skeleton (runner; "verified = re-runnable command") — it has **no** runnable tests today | QA | `qa/` |
| B2 | Land **PF0** spans behind `QUANTFLOW_TRACE=1`; flag-off = **byte-identical** receipts | authority | per `docs/v4/PERFORMANCE_LADDER.md` PF0 |
| B3 | `qa/perf-baseline.json` — B1/B3/B4 at p50/p95 over 5 trials | QA | `qa/perf-baseline.json` |
| B4 | Freeze **event taxonomy** + **span schema** (the contract PF1 and replay both bind to) | contract | `docs/v4/EVENT_TAXONOMY.md`, `docs/v4/SPAN_SCHEMA.md` |
| B5 | Capture a **golden run** (golden receipts for one real run) — the regression anchor | QA | `qa/golden/` |

**Exit (G-measure):** `smoke:perf-trace` green; flag-off proven a no-op; baseline +
golden exist; taxonomy/span frozen and **referenced by code**, not just prose.

### Stage C — Thin seam extraction  → first slice of G-extract; sets up G-projection
*Goal: just enough extraction to get a clean single read path BEFORE collapse. Thin, not bulk.*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| C1 | Carve `renderer-event-router.js` out of `renderer.js` (behavior-preserving) | projection | `renderer.js` → `renderer-event-router.js` |
| C2 | **PF1** incremental projection router (targeted per-event refresh + ~50ms debounce) | projection | router |
| C3 | Carve `projection.js` (the single read path) out of `renderer.js` | projection | `renderer.js` → `projection.js` |

**Exit:** golden run identical; router landed; one read path exists. **Does NOT yet
require** <800 LOC everywhere (that's Stage G) or one-truth (that's Stage D).

### Stage D — Collapse duplicate truth  → closes **G-one-truth**  *(THE CENTERPIECE)*
*Goal: the Kernel is the only truth. Highest-risk stage — phase it: demote-read before stop-write; reversible flag; never big-bang.*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| D0 | **Tile-extension schema** — Kernel home for canvas-only fields (position, transport) | authority | `tile_extensions` (or equiv) in Kernel schema |
| D1 | Boot from Kernel only — **no read of `canvas-state.json` on boot** | authority + projection | boot/hydration |
| D2 | Demote JSON canvas save → on-demand **export artifact** only | projection | JSON save path |
| D3 | Retire `canvas-state.js` (→ read-through cache → delete); rewire `tile-manager.js` + `cable-overlay.js` to **dispatch commands / render from projection** | projection | `canvas-state.js`, `tile-manager.js`, `cable-overlay.js` |
| D4 | Collapse `runtime-state/` → strictly-derived **async mirror**; un-defer Envoy retirement | authority | `runtime-state/` |
| D5 | **Divergence test** — Kernel snapshot == canvas projection == derived mirror; receipts corroborate, not authority | QA | `qa/` divergence test |

**Exit (G-one-truth):** boot reads Kernel only; a connection round-trips with **no**
`runtime.db` write; divergence test passes; `canvas-state.js` is a cache or deleted;
Envoy/runtime-state retirement un-deferred. **Founder personally runs this proof.**

### Stage E — Clean projection / event handling  → closes **G-projection**
*Goal: kill snapshot churn; one event path; PTY out of projection.*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| E1 | One event path; deprecate the other event/log buses | projection | event buses |
| E2 | Fence the **PTY raw stream out of projection** — only milestone facts → receipts | harness + projection | `pty.ts`, projection |
| E3 | 100-event storm → **0** full-snapshot refetches vs the PF0 baseline (the PF1 payoff) | QA | `qa/` storm test |

**Exit (G-projection):** 0 refetches under storm; one event path; PTY excluded from projection.

### Stage F — Make it safe  → closes **G-safe** *(new gate — add to `START_HERE.md` §9)*
*Goal: cheap insurance only. The expensive SDK adapter contract is DEFERRED past freeze (it's feature-prep for cloud growth you are not doing now).*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| F1 | Secrets & execution boundary doc; **all** secret reads route through the single `getCredential()` accessor | authority + security | `src/vault/`, secret read sites |
| F2 | **Eve/cloud fence** — conformance test (no Kernel-canonical fact originates in Eve) + **kill switch** (app runs fully on local/mock harness with Eve unreachable) | harness | Eve seam, harness |
| ~~F3~~ | ~~SDK adapter contract (A2A-shaped)~~ — **DEFERRED past freeze** (shape it later; not now) | — | — |

**Exit (G-safe):** secrets route through one accessor; Eve conformance test + kill
switch pass. *Rationale: Eve is already partially wired; an unfenced cloud path is a
second truth store in a cloud costume — fencing it serves the one-truth goal.*

### Stage G — Maintainable: bulk decompose + token spine  → closes **G-extract** + **G-tokens**
*Goal: now that truth is settled, finish decomposition and unify styling — behavior-preserving, gated on the B golden.*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| G1 | Full `renderer.js` decomposition — `watchtower-host.js`, `cable-host.js`, remaining splits; **no hot-path file > 800 LOC** | projection | `renderer.js` |
| G2 | Merge the **duplicate Conductor** (`src/kernel/conductor/` + `src/main/conductor/`) to one decision entry point | authority | both `conductor/` |
| G3 | `Theme.css` token spine; shell/legend/viewer consume; named `--z-*`; CSS lint bans literal z-index | visual | `shell.css`, `legend-v1.css`, viewer `App.css`, `Theme.css` |
| G4 | Cut orphan/dead surfaces (`terminal-list/`, dead `#drag-drop-overlay`, disabled legend connect-mode); archive inherited knowledge-app surfaces | projection + visual | shell surfaces |
| G5 | IPC rationalization — group channels into authority / projection / harness / system | main | `preload/universal.ts`, registrars |

**Exit (G-extract + G-tokens):** no hot-path file > 800 LOC; shell unit suite
unchanged vs the B golden; CSS lint rejects literal z-index in shell; orphan
surfaces gone. **Guardrail:** do not touch `tile-interactions.js` geometry,
`--cable-w-hit`, port sizes, or drag/cable math.

### Stage H — QA closeout  → closes **G-qa**
*Goal: every gate is a command a third party can run.*

| Chunk | Objective | Layer | Key files |
|---|---|---|---|
| H1 | Every prior gate has a **named, re-runnable `qa/` command** | QA | `qa/` |
| H2 | Visual regression screenshots (baseline + post-token diff) | QA | `qa/` |
| H3 | Receipt/timeline verification + a short **operator acceptance** script | QA | `qa/` |

**Exit (G-qa):** every gate above is a command, not a typed checkmark.

---

## 3. Gate map (queue → `START_HERE.md` §9 finish lines)

| `START_HERE.md` §9 gate | Closed by stage |
|---|---|
| G-contract | **A** |
| G-measure | **B** |
| G-one-truth | **D** (read path prepped by **C**) |
| G-projection | **E** |
| **G-safe** *(new — add to §9)* | **F** |
| G-extract | **G** (first slice in **C**) |
| G-tokens | **G** |
| G-qa | **H** (and each stage feeds it) |

When all gates are green, structure-freeze lifts and feature work may resume.

---

## 4. The two reconciliations baked into this order

1. **Extract is split (the one real contradiction).** `START_HERE.md` §6 /
   `REBUILD_STRATEGY_AUDIT.md` §H put extraction before collapse; the stabilization
   plan put decomposition after. Resolution: **thin seam extraction (Stage C —
   event-router + projection, the PF1 enabler) runs before collapse; bulk
   decomposition (Stage G — everything < 800 LOC) runs after.** You need a clean
   read path to collapse safely, but you do not decompose around a moving truth target.
2. **Safe is scoped to cheap insurance.** Stage F keeps the secrets accessor + Eve
   fence/kill-switch (which protect the one-truth goal) and **defers the SDK adapter
   contract** past freeze. A `G-safe` gate is added to `START_HERE.md` §9 so the gate
   list is internally consistent.

---

## 5. Per-chunk spec template (author this at promotion)

```
### Chunk <ID> — <objective>
- STATUS: Planned | Implemented-unverified | Implemented-verified
- Layer: authority | projection | visual | harness | QA
- Boundary-map row: <which REBUILD_STRATEGY_AUDIT.md §F row>
- Files in scope: <exact paths>
- Must NOT change: <frozen behavior / geometry / schema>
- Proof command: <a re-runnable qa/ command + the golden it preserves>
- Exit gate: <the one-line pass condition>
- Rollback: <how to revert safely (flag / per-module)>
```

---

## 6. Coverage matrix — every §F boundary-map row is placed

| `REBUILD_STRATEGY_AUDIT.md` §F row | Chunk(s) |
|---|---|
| `renderer.js` (god-file) | C1, C3, G1 |
| `shell.css` (z-index soup) | G3 |
| `canvas-state.js` (parallel truth) | D3 |
| `tile-manager.js` | D3 |
| Cable system (`cable-overlay.js`/`cable-renderer.js`) | D3, E1 |
| Terminal/PTY (`pty.ts`) | E2 |
| Legend dock (`legend-v1.css`, `legend-spawn.js`) | G3, G4 |
| Settings | F1 |
| Kernel commands/queries/events | A2 (freeze) |
| Conductor (kernel + main duplication) | G2 |
| Receipts/artifacts | A2 (freeze schema), B5 |
| Runtime-state mirror | D4 |
| JSON canvas save | D2 |
| Webviews / browser tiles | parking lot (baseline in B; product decision later) |
| IPC bridge (`preload/universal.ts`) | G5 |
| Visual tokens (six authorities) | G3 |

---

## 7. NOT in this queue (until freeze lifts)

Out of scope while any §9 gate is red — enforced by `START_HERE.md` §6/§8 and
`REBUILD_STRATEGY_AUDIT.md` §L:

- All feature/cloud work: `docs/v4/SURFACE_LADDER.md` (S0–S6),
  `docs/v4/PERFORMANCE_LADDER.md` PF2+, stabilization P5, REBUILD §H Phase 9.
- New agent/tile types · collaboration/swarm · semantic verification · browser
  automation · RL/trading demos · visual redesign beyond token/z-index · cloud/Eve
  as primary runtime · A2A wire integration · any clean-slate rewrite.
- **Contingency only:** REBUILD §H Phase 7 ("replace a shell subsystem") — only if
  Stage C/G measurement proves extraction costlier than reimplementation behind the
  same contract; requires explicit authorization + a parity proof.

---

*This is the active marching order. Keep it ordered and lean. Update a chunk's
STATUS in the same change that proves it. When all §9 gates are green, this queue is
done and `START_HERE.md` §6 reopens feature work.*
