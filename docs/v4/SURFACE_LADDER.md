# QuantFlow v4 — Surface Phase Build Plan (Canvas Reflection Layer)

> **This is the authoritative build plan for the v4 Surface phase (rungs S0–S6).**
> It is the promotion target: the operator promotes ONE rung at a time into the
> ledger below and explicitly authorizes it; workers never self-approve a rung.
>
> The v4 **spine (R0–R8.5) is COMPLETE** — its record lives in `BUILD_PLAN_V4.md`.
> **You do not need to read `BUILD_PLAN_V4.md` to work a Surface rung.** This doc
> is self-sufficient; consult the spine record only for the specific R-rung a
> Surface rung explicitly names (e.g. R7 receipt-primary replay for S5).

Branch target: a new `quantflow-v4-surface` (or continue `quantflow-v4`).
Base: `quantflow-v4` (the 8-rung spine, machine-verified + pushed).

## Reading order (per Surface rung — keep it short)

1. Applicable `AGENTS.md` chain (root → target folder).
2. This file: § "Constitutional guards" + the one rung you are assigned.
3. `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` — the One Rule still
   binds (Kernel owns truth; the canvas derives).
4. Only the repo files the assigned rung names.

**Do not read the R0–R8.5 goal bodies in `BUILD_PLAN_V4.md`** — they are shipped
spine and irrelevant to a Surface rung unless that rung calls one out.

## Promotion discipline

```text
1. Operator promotes ONE S-rung and explicitly authorizes it.
2. Worker implements only that rung's scope.
3. Worker submits the result + the rung's machine + product proof evidence.
4. Verifier checks against the rung's Acceptance, updates the ledger, pushes.
5. Operator authorizes the next rung.
```

## Goal status ledger

| Rung | Status | Worker | Verifier | Notes |
| --- | --- | --- | --- | --- |
| S0 — Events / live-projection | **Machine-verified ✅ (Claude re-ran)** | Codex | Claude | emit/forward/ephemeral green (commit `883eed4`); visible proof rides S0.1 / S2 |
| S0.1 — Watchtower → live Kernel event log | **Built + machine-verified ✅ (`851162d`)** | Codex | Claude | repoint done; product proof → filter too narrow → S0.2 |
| S0.2 — Watchtower event breadth | **Authorized → Codex (2026-06-22)** | Codex | Claude | include structural tile/connection events; closes S0 visible proof |
| S1 — Canvas grid (Müller-Brockmann) | **Machine-verified ✅ (Claude re-ran)** | Codex | Claude | grid/overlay/verifier green (commit `07f70fb`); product proof pending S1.2 |
| S1.1 — Snap-on-drop + Shift-to-free + Align-all | **Built + machine-verified ✅ (`a6e242a`)** | Codex | Claude | snap-on-drop done; product proof → stale-pin trap → S1.2 |
| S1.2 — Pin semantics (Align-all + plain-drag override pins) | **Built + machine-verified ✅ (`fb072a1`)** | Codex | Claude | pin override done; proof → 8px snap invisible → S1.3 |
| S1.3 — Tidy re-pack + dock button | **Authorized → Codex (2026-06-22)** | Codex | Claude | re-pack to columns + visible button; closes S1 product proof |
| S2 — Live Run Projection | Not started | — | — | depends S0,S1 · closes R1/R2/R3 |
| S3 — Real spawn + DAG/role layout | Not started | — | — | depends S1,S2 · closes R4/R6 |
| S4 — Checkpoint surface | Not started | — | — | depends S0,S1,S3 · closes R5 |
| S5 — Run Replay + judgment | Not started | — | — | depends S1,S3 · closes R7 |
| S6 — Conductor chat + model binding | Not started | — | — | depends S1,S2 |

---

## The frame

v4 built the **spine**: Workflow/Run · Task · Worker instance · Harness ·
Artifact · Receipt · Checkpoint · Replay · Template. It is machine-verified, but
several rungs still carry an open *"live-canvas product proof = operator"* item
(R2, R4, R5, R6, R7). The work is done in the Kernel; it is **not visible on the
canvas**.

This ladder is the **canvas reflection layer**: project the existing spine onto
the surface so that —

> **When the backend changes, the canvas explains what happened without opening
> logs, SQLite, DevTools, or terminals.**

**Operator decision (locked):** the spine of this ladder is *closing the open v4
proofs* — each Surface rung's acceptance is an existing v4 rung becoming visibly
provable on the canvas. This is not a fresh feature ladder; it discharges proofs
we already owe.

**Consolidation note (2026-06-22):** an earlier draft had 10 thin rungs (S0–S9).
Consolidated to **7** so every rung carries a goal-session's weight: the three
"make one run legible" rungs (agent tile + run region + artifact dock) merged into
**S2 Live Run Projection**; the legend-taxonomy rung moved off this ladder to an
**R8.5 follow-on** (it composes with the `roles/*.json` registry + Settings→Agents
pane already in flight). Foundations (S0/S1) and the two heavies (S3/S5) stay
distinct.

## Two keystones, then projection

The canvas needs two foundations before anything is rendered onto it:

- **S0 makes it _live_** — every backend transition pushes an event, so the canvas
  reflects truth without polling.
- **S1 makes it _neat_** — a real modular grid disciplines every position, so tiles
  align instead of stacking on top of each other.

S0 and S1 are **independent and can run in parallel**. Everything after lands *on
the grid* and updates *via the events*.

## Constitutional guards (every rung)

1. **No new Kernel truth.** Every rung is a *projection* of existing Kernel
   queries/receipts/events. The Kernel owns truth; the canvas derives. (v4 One
   Rule, unchanged.)
2. **Two proof tracks**, same as the spine: a deterministic machine proof
   (CI-safe, no auth/cost) + an operator product proof. The product proof is
   always the same shape: *"Ryan understands X on the canvas without backend
   logs."*
3. **Additive only.** No schema migration, no new receipt/event *truth*; new
   ephemeral notify-events are allowed (see S0) but must not be persisted
   (Replay stays receipt-primary — F1/F8).
4. **Respect the operator.** If the user has moved/locked a tile, neither the grid
   snap nor the auto-layout ever fights it.
5. **Sensitivity default-deny.** Any surface that reads artifacts honors the
   R2/R7 sensitivity gate (column + metadata, default-deny non-normal).

## It is a *rebind*, not a rebuild

Most surfaces already exist from the v3 / Goal-7 era and project *early-Kernel*
state. The work is pointing them at the **v4 spine**. Inventory:

| Surface | Exists | File(s) |
| --- | --- | --- |
| Workflow region overlay | ✅ live projector | `windows/shell/src/workflow-region-overlay.js` · `src/renderer/components/WorkflowRegion/workflow-region-view.ts` |
| Typed strings (cables) | ✅ semantic types | `@qf-renderer/components/StringOverlay/semantic-string-view` · `cable-renderer.js` · `cable-inspector.js` |
| Tile State Card | ✅ live `kernel.state_card.get` | `windows/shell/src/tile-state-card.js` · `@qf-renderer/.../StateCardView` |
| Kernel event push | ✅ in-memory + webContents.send | `src/kernel/events/index.ts` (`emitKernelEvent`) · subscriber `renderer.js:~3593` |
| Watchtower / event log | ✅ (some 2s polling) | `watchtower-view.js` · `operational-event-log.js` |
| Conductor panel | ✅ partial | `windows/shell/src/conductor-panel.js` |
| Legend + readiness | ✅ (R8.5 in flight) | `legend-readiness.js` · `roles/*.json` · Settings→Agents pane |
| Kernel read RPC | ✅ | `quantflow-electron/src/main/ipc-kernel-reads.ts` · `src/kernel/queries/index.ts` (`queryRun`, `queryUpstreamArtifacts`) |
| Worker↔task binding | ✅ (R1) | `worker_instances.assigned_task_id` (migration 003) · `src/kernel/worker-instances/index.ts` |
| Run Replay projection | ✅ backend only | `src/main/conductor/run-replay.ts` (receipt-primary) |
| Canvas viewport / state | ✅ (free placement, no grid) | `windows/shell/src/canvas-viewport.js` · `canvas-state.js` |
| **Modular grid / snap / overlay** | ❌ missing | — |
| Artifact dock / card | ❌ missing | — |
| Checkpoint card on canvas | ❌ backend only | `conductor-loop.ts` checkpoint phase |
| DAG/role auto-layout | ❌ missing | — |
| Real template spawn | ❌ mock seam | `run-template-runner.ts` `instantiateTemplate` hardcodes `harnessKind:'mock'` |

---

## The rung spine (7 rungs)

| Rung | Name | Closes (open v4 proof) | Weight |
| --- | --- | --- | --- |
| **S0** | Event taxonomy + live-projection audit | the "live" keystone | keystone |
| **S1** | Canvas Grid System (Müller-Brockmann) | the "neat" keystone | medium |
| **S2** | Live Run Projection (region + agent tiles + artifact dock) | **R1 binding · R2 · R3** | heavy |
| **S3** | Real template spawn + DAG/role auto-layout | **R4/R6** (mock-seam carry-forward) | heavy |
| **S4** | Checkpoint surface | **R5 live-canvas** | medium |
| **S5** | Run Replay view (+ decision/outcome/lesson, local eval badges) | **R7 live-canvas** | heavy |
| **S6** | Conductor chat + visible model binding | safe + legible agent control | medium |

Difficulty: **S0 + S1** are the keystones (parallelizable); **S2, S3, S5** are the
weight. S2 product-proves against a single manually-summoned real worker (Mode-1
legend, R8 ✅); the real-harness wiring lands at **S3** (first real *multi-agent*
run).

> **Off this ladder → R8.5 follow-on:** *Legend taxonomy cleanup* (split the legend
> into Runs / Tiles / Layers / Backends; role+backend separation so the operator
> never picks "Hermes Researcher vs Eve Researcher"). It composes with the R8.5
> `roles/*.json` registry + Settings→Agents pane already in flight and is daily-use
> polish, not a v4-proof rung — so it belongs to R8.5, not here.

---

## S0 — Event taxonomy + live-projection audit

- **Band/closes:** the "live" keystone. Unblocks every "live" claim downstream.
- **Goal:** guarantee that *every* v4 backend transition pushes a renderer event,
  so the canvas updates live instead of polling. Today `emitKernelEvent`
  (`src/kernel/events/index.ts`, in-memory `EventEmitter` + `webContents.send`)
  is called from `tasks/`, `evals/`, `conductor/`, `tile-commands` — but the
  renderer subscriber (`renderer.js:~3593`) mainly handles `state_card.updated`,
  and watchtower still notes *"polled every 2s — events.subscribe pending"*.
- **Builds:**
  - Audit `emitKernelEvent` call-site coverage against the v4 transition set:
    `artifact_created`, `verification_started/passed/failed`, checkpoint
    `awaiting-selection`, `human_decision`, run/workflow status change,
    `eval-written`. Add the missing emissions at the existing Kernel seams (no
    new bus).
  - Add renderer subscriber handlers for each kind that re-project the relevant
    surface (region, tile, dock, checkpoint).
  - Retire the 2s polling fallbacks where a real event now covers them.
- **Machine proof:** a smoke drives each v4 transition and asserts (a) the
  corresponding `emitKernelEvent` fires with the expected payload, and (b) a
  fake subscriber receives it. Deterministic, no canvas.
- **Product proof:** a real task transition (claim→start→artifact→verify→
  complete) updates the canvas live, no DevTools, no visible 2s lag.
- **Guards / out of scope:** events stay **ephemeral** (in-memory + webContents
  only) — **do not persist an events table** (Replay is receipt-primary, F1/F8).
  No new Kernel truth; emissions are notifications of receipts that already
  exist.
- **Depends on:** nothing (first rung; independent of S1).
- **Grounding (verified in code 2026-06-22 — do NOT rebuild these):**
  - The main→renderer **bridge already exists**: `emitKernelEvent` pushes to
    subscribed `webContents` via `wc.send('kernel:event', payload)`
    (`src/kernel/events/index.ts`); `canvas-rpc.ts:56` calls
    `subscribeWebContents(win.webContents)`; the renderer listens via
    `window.kernelApi.onEvent` (`renderer.js:~3600`). **Build no new bus/bridge.**
  - Emissions that ALREADY fire (audit baseline): task transitions (generic
    `kind` from `tasks/index.ts:141`), `worker.spawned/status_updated/stopped`,
    `workflow.created/updated`, `receipt.posted` (`receipts/index.ts:89` — also
    fires on artifact-create, since that posts a receipt), `evaluation.created`
    (`evals/index.ts:171`), `state_card.updated`, `tile.*`, `connection.*`,
    `conductor.plan_posted`.
  - The renderer subscriber today reacts with a **broad** `refreshWorkflowProjection()`
    re-query for any `tile.*`/`task.*`/`connection.*`/`workflow.*`/`receipt.posted`
    — and **drops `evaluation.created` entirely** (its kind matches no handler).
- **The real audit deliverable (where the gaps are):**
  - Confirm which v4 transitions emit a **distinct, typed** kind vs. only surface
    through generic `receipt.posted`. Likely **missing dedicated kinds:**
    checkpoint `awaiting-selection`, `human_decision`, and a distinct
    `artifact.created`. Add them at the existing Kernel seams (`conductor-loop.ts`
    checkpoint phase; the artifact-create path in `receipts/index.ts`; the
    human-decision receipt path) — no new bus.
  - Give the renderer **targeted** handlers (route artifact/checkpoint/eval/
    verification events to the specific surface refresh — dock/checkpoint/badge —
    not only the broad re-query); make `evaluation.created` no longer a no-op.
  - Retire the watchtower **2s polling** (`renderer.js:~2233`) where a real event
    now covers it.

### Acceptance Test — S0

**Machine proof (CI-safe, no canvas, no auth):** a new `smoke:event-projection`
drives each v4 transition through the Kernel and asserts, for every kind in the
set {task lifecycle, `worker.status_updated`, `artifact.created`,
`verification_passed`/`failed`, checkpoint `awaiting-selection`, `human_decision`,
`workflow` status, `evaluation.created`}: (a) `emitKernelEvent` fires once with the
expected typed `kind` + correlationId/taskId/workflowId, captured via
`onKernelEvent`; (b) a fake subscriber registered through `subscribeWebContents`
receives the same payload. A coverage assertion **fails** if any transition in the
set emits no event or only an untyped `receipt.posted`. Deterministic.

**Product proof (operator, capture evidence):** with DevTools closed, run one real
task atom (claim→start→artifact→verify→complete); the canvas reflects each
transition **live** (status badge, region counts), no visible 2s lag, and the
watchtower no longer shows "polled every 2s" for covered surfaces.

### Regression Guard — S0 (must stay green, unchanged)

```text
cd quantflow-electron
bun run smoke:kernel-task   smoke:state-card   smoke:conductor   smoke:conductor-actions
bun run smoke:conductor-loop   smoke:worker-harness   smoke:harness-interface
bun run smoke:workflow-region   smoke:vault-export   smoke:eval   smoke:task-atom
bun run smoke:dag   smoke:authority   smoke:context-flow   smoke:pod
bun run smoke:checkpoint   smoke:run-template   smoke:judgment
bun run smoke:event-projection            # new
bun test src/main/harness-ops.test.ts
bun test src/windows/shell/src/workflow-region-overlay.test.ts
bun run build
cd ../tools/quantflow-mcp && node --test   # 24/24
```

No schema migration. No new persisted store (events stay ephemeral — F1/F8). Do
**add**, never rename, existing event kinds the current subscriber depends on.

### Failure Signals — S0

- An **events table** / any persisted event store is added (Replay must stay
  receipt-primary — F1/F8).
- A **second** bus/bridge is built instead of reusing `emitKernelEvent` /
  `subscribeWebContents` / `kernelApi.onEvent`.
- A v4 transition still has **no** live event; the canvas only updates on reload
  or the 2s poll.
- Any Kernel **truth** written from the renderer/subscriber.
- A regression in any guard smoke, the MCP tests, or `bun run build`.

### Handoff Block — S0 (Codex)

```text
Branch quantflow-v4 (or quantflow-v4-surface). Read: applicable AGENTS.md chain →
docs/v4/SURFACE_LADDER.md § "Constitutional guards" + this S0 rung ONLY. Do NOT
read the R0–R8.5 goal bodies in BUILD_PLAN_V4.md.

S0 is an AUDIT-AND-FILL rung, not a new subsystem. The main→renderer event bridge
ALREADY exists (emitKernelEvent → subscribeWebContents → kernelApi.onEvent) — do
not rebuild it. Find which v4 transitions lack a distinct typed event (likely
checkpoint awaiting-selection, human_decision, artifact.created), add those
emissions at the existing Kernel seams, give the renderer targeted handlers, make
evaluation.created no longer a no-op, and retire the 2s poll where covered.

Events stay EPHEMERAL — never persist an events table (Replay is receipt-primary).
Projection only — the subscriber writes no Kernel truth.

Two proofs: machine smoke:event-projection (emit+receive coverage for every kind)
+ operator live-canvas proof (real atom updates the canvas, DevTools closed). Run
the full Regression Guard before submitting. Commit locally; verifier (Claude)
independently re-runs the stack + audits the diff, updates the ledger, pushes.
```

## S1 — Canvas Grid System (Müller-Brockmann)

- **Band/closes:** the "neat" keystone. The design law every spatial rung obeys
  so tiles align cleanly instead of overlapping. Cross-cutting foundation.
- **Source:** `QuantFlow Vault/S2 Grid Canvas.md` — adapts the Müller-Brockmann /
  Swiss International Typographic grid (Josef Müller-Brockmann, *Grid Systems in
  Graphic Design*) as the canvas layout discipline. Aesthetic intent: a classy,
  controlled hedge-fund-operator-console feel — high signal, not random agent
  chaos. **Key principle from the skill:** a grid you cannot toggle on and
  *measure* is decoration, not a system — so the overlay + verification harness
  are part of the rung, not optional.
- **Two layout problems, kept separate (the architecture):**
  1. *Workflow-graph layout* (where roles go) = DAG/role logic — that is **S3**.
  2. *Visual grid discipline* (does it look aligned/intentional/premium) = **this
     rung**. The rule: **DAG/role layout decides rough placement; the grid snaps
     and disciplines the final placement.**
- **Builds:**
  - **One grid source of truth** as shared tokens in `@qf-renderer` (e.g. 12-col
    grid, 8px baseline rhythm, consistent gutters/margins). Every surface reads
    these, not ad-hoc pixel values.
  - A **pure `snapToGrid(position, size, { locks, regionBounds })`** util in the
    canvas layer (`canvas-state.js` / a new `canvas-grid.js`) — deterministic,
    unit-testable, no DOM.
  - A **toggleable grid overlay** in the shell (reveal columns/baseline to
    measure alignment) — extends `canvas-viewport.js`.
  - **Reserved string lanes** so cables route through predictable gutters rather
    than crossing tiles (feeds `cable-renderer.js` routing).
  - A **visual verification harness** (pure test) that flags overlap / off-grid
    placement — the "prove alignment" half of the skill.
- **Machine proof:** `snapToGrid` is deterministic and idempotent; the
  verification harness catches an overlapping pair and an off-grid tile; a locked
  tile is never snapped.
- **Product proof:** existing tiles align to the grid; the operator toggles the
  overlay and sees clean columns + baseline rhythm; no two tiles overlap.
- **Guards / out of scope:** **respect operator-moved/locked tiles** — snapping
  suggests, it never overrides a manual placement. Pure renderer concern (no
  Kernel, no truth). Applies to *existing* positions too, not only spawned runs.
  Not the DAG/role placement logic (that is S3) — this rung only provides the
  grid the DAG layout snaps to.
- **Depends on:** nothing (foundational; can land alongside S0).
- **Grounding (verified in code 2026-06-22 — reconcile, don't fork):**
  - A primitive snap **already exists**: `canvas-state.js:200` `const GRID_CELL =
    20; export function snapToGrid(tile)` rounds x/y/width/height to 20px,
    **unconditionally** (lock-blind), mutating the tile in place. **Extend this
    seam** into the real modular grid — the 12-col + 8px-baseline token math
    supersedes the ad-hoc 20px cell. Audit every caller of `snapToGrid`/`GRID_CELL`
    and migrate them; do not add a parallel grid.
  - There is **no lock/`userPlaced` flag** on the Tile typedef (`canvas-state.js:1`)
    today. **Decide FIRST:** the smallest representation of "the operator placed
    this" (e.g. a `userPlaced`/`locked` boolean set on manual drag-end) so snapping
    can skip it — the acceptance test depends on "locked tiles are never snapped."
  - Grid tokens live in the shared `@qf-renderer` (`src/renderer/components/...`)
    so the live shell and any future renderer agree on one source of truth.

### Acceptance Test — S1

**Machine proof (CI-safe, pure functions, no DOM):** a new `canvas-grid.test.ts`
asserts: grid tokens are a single exported source of truth (columns/gutter/margin/
baseline); `snapToGrid(position, size, { locks, regionBounds })` is deterministic
and **idempotent** (snapping a snapped value is a no-op); a **locked/userPlaced**
tile is returned unchanged; the **alignment verification harness** flags (a) an
overlapping tile pair and (b) an off-grid tile, and passes a clean grid-aligned
layout. `canvas-state.test.ts` is updated for the new snap contract.

**Product proof (operator, capture evidence):** existing tiles align to the grid;
the operator toggles the **grid overlay** and sees clean columns + baseline rhythm;
no two tiles overlap; a tile the operator drags stays exactly where they put it
(not re-snapped against their will).

### Regression Guard — S1 (must stay green, unchanged)

```text
cd quantflow-electron
bun test src/windows/shell/src/canvas-state.test.ts        # updated for new snap
bun test src/windows/shell/src/canvas-viewport.test.ts
bun test src/windows/shell/src/cable-renderer.test.ts
bun test src/windows/shell/src/cable-overlay.test.ts
bun test src/windows/shell/src/tile-renderer.test.ts
bun test src/windows/shell/src/workflow-region-overlay.test.ts
bun test src/windows/shell/src/canvas-grid.test.ts          # new
bun run build
# v4 spine untouched (no Kernel changes) — spot-check:
bun run smoke:task-atom   smoke:workflow-region
```

Pure renderer concern — **no Kernel/schema/event change**, no MCP change.

### Failure Signals — S1

- A **parallel** grid system is created instead of extending the existing
  `snapToGrid`/`GRID_CELL` seam.
- Snapping **overrides** a manually-moved/locked tile (fights the operator).
- The grid is decoration — **no overlay toggle** or **no verification harness**
  (violates the skill's "you must be able to toggle + measure it" rule).
- Any Kernel write / schema change from this renderer-only rung.
- A regression in the shell unit tests or `bun run build`.

### Handoff Block — S1 (Codex)

```text
Branch quantflow-v4 (or quantflow-v4-surface). Read: applicable AGENTS.md chain →
docs/v4/SURFACE_LADDER.md § "Constitutional guards" + this S1 rung ONLY. Do NOT
read the R0–R8.5 goal bodies in BUILD_PLAN_V4.md.

S1 is a PURE RENDERER rung (no Kernel, no truth). A primitive snapToGrid +
GRID_CELL=20 already exists in canvas-state.js — EXTEND it into a real
Müller-Brockmann modular grid (12-col + 8px baseline tokens in @qf-renderer), make
snapping LOCK-AWARE (define the userPlaced/locked flag FIRST), add a toggleable grid
overlay + a pure alignment verification harness. Do not fork a second grid.

Respect the operator: snapping suggests, it never overrides a manual placement.
This rung is the DESIGN LAW the later DAG/role layout (S3) snaps to — it is NOT the
DAG placement logic.

Two proofs: machine canvas-grid.test.ts (deterministic + idempotent snap, locks
respected, harness catches overlap/off-grid) + operator overlay/alignment proof.
Run the Regression Guard before submitting. Commit locally; verifier (Claude)
re-runs + audits the diff, updates the ledger, pushes.
```

## S2 — Live Run Projection (region + agent tiles + artifact dock)

- **Band/closes:** **R1 worker/task binding · R2 live-canvas · R3 run-as-container**
  — all three in one witnessed proof.
- **Goal:** make a single real run *fully legible* on the canvas: its **container**
  (run region), its **actors** (agent tiles), and its **outputs** (artifact dock +
  lineage). This is the consolidation of the three thin "projection" rungs into one
  coherent goal — the container, the things inside it, and what they produce are one
  picture.
- **Builds — (a) Run Region → `queryRun`:**
  - Bind `workflow-region-overlay.js` / `workflow-region-view.ts` to `queryRun`
    (`src/kernel/queries/index.ts` via `ipc-kernel-reads.ts`): mode · budget ·
    status · checkpoint_state · artifact count.
  - Region header chrome: title, mode (Scout/Research/Deep), status, budget/time,
    artifact + checkpoint counts, collapse/expand, replay-button stub (wired S5).
    Region bounds snap to S1 grid zones.
- **Builds — (b) Unified Agent Tile:**
  - A projector (shared `@qf-renderer`) turning a worker-instance + its assigned
    task (R1 `worker_instances.assigned_task_id`) into an agent-tile badge model:
    role · backend (harness) · model · current task · status · artifact count ·
    trust badge.
  - Render on the tile (extend `tile-state-card.js` / `tile-renderer.js`),
    refreshed by S0 events, positioned on the S1 grid. Tile *transport* typing
    (term/webview) stays underneath — additive projection, not a tile rewrite.
- **Builds — (c) Artifact dock + lineage:**
  - Artifact card component (title · kind · producer tile · task id · verification
    status · created · open · use-as-input · connect-to-tile).
  - Per-run **Artifact Dock** (snapped to a grid baseline band) + **promote-to-tile**
    for important artifacts (clutter control).
  - Render R2 `derived_from` lineage (artifact A → B) as an `artifact` semantic
    string (reuse `semantic-string-view`), routed through S1 lanes.
  - Read via `ipc-kernel-reads.ts` (artifact rows + `queryUpstreamArtifacts`).
- **Machine proof:** region model from a `queryRun` projection; agent-tile
  projector formats a worker/task row into the expected badges (idle/working/
  blocked/complete); dock model from artifact rows incl. lineage edges; **sensitivity
  default-deny proven** (a `restricted` artifact does not surface). Deterministic,
  no canvas.
- **Product proof:** a real Mode-1-summoned worker's tile shows its live task +
  status flipping idle→working→complete inside a labeled run region; its produced
  artifact lands in the dock with verification status, opens, and its A→B lineage
  shows as a string — closing R1 binding + R2 + R3 in one demo.
- **Out of scope:** multi-agent auto-layout (S3 — here a single/few tiles is fine);
  the replay view (S5); agent-authored dashboards (parked); editing artifacts
  (read-only). No model *routing* (model shown if known).
- **Depends on:** S0, S1. (Region/tile/string surfaces already exist — this is
  mostly a rebind + the new dock.)

## S3 — Real template spawn + DAG/role auto-layout

- **Band/closes:** **R4/R6** — the R6 mock-harness carry-forward + R4 durable-run
  visibility. The central product proof of the whole ladder.
- **Goal:** a named run (Scout/Research/Deep) spawns **real** agent tiles, placed
  by role and snapped to the grid — not piled at random.
- **Builds:**
  - **Wire one real harness** at the `run-template-runner.ts` `instantiateTemplate`
    seam (today hardcodes `harnessKind:'mock'`). Work still flows through the
    injected `executeTask` atom — this is the seam swap, not a new orchestrator.
  - The **DAG/role layout layer** (problem #1 from S1): input = template DAG +
    task roles + tile types; output = *rough* role-based placement (conductor
    center/top · collectors left · analysts middle · skeptics right · verifier
    bottom-right · artifacts bottom · checkpoint center-bottom · browser sidecar).
  - **Snap that rough placement through the S1 grid** (problem #2): regions →
    grid zones, tiles → modules, strings → lanes, dock → baseline band. Operator
    locks always win.
- **Machine proof:** the DAG/role layer places a given DAG deterministically; the
  composed layout (rough → grid-snapped) honors locked positions; no overlap per
  the S1 verification harness (pure-function test, no canvas).
- **Product proof:** a real Scout/Research template spawns a grid-aligned region
  of **real** agents doing real work — closing R6's "live named invocation needs
  a real harness" note and R4's durable-run visibility.
- **Out of scope:** budgets/recovery logic (already R4 in the Kernel — this only
  *renders* it); model routing; the grid system itself (S1).
- **Depends on:** S1 (grid), S2. (Heaviest rung.)

## S4 — Checkpoint surface

- **Band/closes:** **R5 live-canvas proof.**
- **Goal:** the human checkpoint stops being a backend state and becomes a
  clickable card.
- **Builds:**
  - A checkpoint decision card/tile (grid-aligned) rendering the candidate set
    (`kind='candidate'` artifacts) with per-candidate actions (deepen / reject /
    save).
  - Selection drives the **existing** token-bound `human_decision` flow
    (`proposalToken`, `conductor-loop.ts` checkpoint phase) — no second token
    scheme.
  - Strings show candidate-set → checkpoint → deepener.
- **Machine proof:** card model from candidate artifacts; a selection posts the
  correct token-bound decision; a forged/replayed token spawns nothing (reuse R5
  negatives).
- **Product proof:** a real run pauses, the operator clicks to pick candidates,
  deepening tasks spawn — all on canvas.
- **Out of scope:** changing R5 authority semantics (QF stays terminal on
  decisions); auto-decide is forbidden (no selection ⇒ no spawn).
- **Depends on:** S0, S1, S3 (needs a real run to pause).

## S5 — Run Replay view (+ decision/outcome/lesson, local eval badges)

- **Band/closes:** **R7 live-canvas proof.**
- **Goal:** a finished run has a readable replay + a decision/outcome/lesson trace
  on the canvas.
- **Builds:**
  - A replay timeline view over `src/main/conductor/run-replay.ts`
    (**receipt-primary — must not read an events table, F1**).
  - Surface `decision_log` / `outcome` / `lesson` artifacts (R7 typed kinds).
  - **Local** eval-score badges from existing eval rows (Kernel `evals`), as
    trust badges on artifacts/verifier cards. **No Braintrust** (parked).
  - Wire the S2 replay-button stub to open this view.
- **Machine proof:** replay view renders from receipts only — assert zero
  events-table access (mirror R7's `usesEventsTable:false` / `eventCount===0`).
- **Product proof:** the operator scrubs a finished run's timeline and reads its
  decision log + lesson without opening SQLite — closing R7's open live-canvas
  proof.
- **Out of scope:** RL/lessons *compounding* (deprioritized per operator);
  external trace vendors (Braintrust parked); agent-authored dashboards (parked).
  Optional seed here: a *fixed* template-owned run-summary dashboard (the
  fixed-first step of the parked Visual Manifest) — only if cheap.
- **Depends on:** S1, S3 (a real completed run).

## S6 — Conductor chat + visible model binding

- **Band/closes:** makes Axis-1 agent canvas-control safe + legible.
- **Goal:** the Conductor is the one "person" you talk to, and the UI answers
  *what model is behind it, what it can do, and whether it is approval-gated.*
- **Builds:**
  - Extend `conductor-panel.js`: show model (OpenRouter / deepseek) · mode
    (approval-gated) · tools (read canvas · propose tasks/tiles/strings) ·
    status.
  - Make the **propose → Kernel validates → operator approves → canvas updates**
    loop visible. (Agents can already mutate the canvas via MCP tile/cable tools;
    this rung makes that *proposal-gated and visible*, per the decision-authority
    rule.) Proposed tiles land grid-snapped (S1).
- **Machine proof:** panel model derived from provider config + approval state;
  a proposed mutation requires an approval token before it renders.
- **Product proof:** the operator chats the Conductor, sees its model/tools, gets
  a proposed plan, approves, and the canvas updates.
- **Out of scope:** auto-apply of proposals (always gated); model routing.
- **Depends on:** S1, S2.

---

## In-flight refinements (from the S0/S1 product proof, 2026-06-22)

Both S0 and S1 passed machine verification (Claude independently re-ran:
`smoke:event-projection`, `canvas-grid.test`, `canvas-state.test`, regression
spot-checks, `bun run build` — all green). The operator product proof surfaced two
scope refinements (both originally scoping gaps, not Codex defects):

### S1.1 — Snap-on-drop default + Shift-to-free + Align-all

- **Why:** S1 shipped snap as *opt-out* — the first drag marks a tile `userPlaced`,
  and `snapToGrid` skips `userPlaced`/`locked` (`canvas-grid.js:53`), so nothing
  visibly aligns and pre-existing tiles never snap. The acceptance criterion I wrote
  ("dragged tile stays where you put it") specified exactly this — a **scoping miss**.
  Operator decision: **snap by default; hold Shift to place freely.**
- **Builds:**
  - `tile-interactions.js` drag-end + resize-end: **normal** drop → `snapToGrid`
    (snaps; do **not** mark `userPlaced`). **Shift held during the drag** → free
    placement: skip snap **and** `markUserPlaced(tile)` (sticks; excluded from snap
    + future S3 auto-layout). Capture `shiftKey` at drag start.
  - New **"Align all to grid"** command (command-palette, beside the overlay toggle)
    that snaps every **non-locked** tile — tidies the operator's existing tiles.
  - Decouple semantics: `userPlaced`/`locked` is now set **only** by Shift-drag
    (explicit "keep here"), not by every drag.
  - **CHECK FIRST (flag back if conflict):** confirm `Shift`+drag isn't already bound
    (multi-select / shift-delete on cables — the diff shows group-drag + shift-delete
    paths). If it collides, use `Alt` and note it; don't silently double-bind.
- **Machine proof:** a unit test asserts: normal drag-end snaps the tile to grid;
  Shift drag-end leaves it unsnapped + `userPlaced=true`; "Align all" snaps every
  non-locked tile and leaves locked tiles untouched; deterministic.
- **Product proof:** drop a tile → it snaps to grid; Shift+drag → it stays exactly
  where dropped; "Align all" tidies the existing terminal tiles onto the grid.
- **Regression:** `canvas-grid.test`, `canvas-state.test`, `tile-interactions`-adjacent
  shell tests, `bun run build` — all green. Pure renderer; no Kernel/schema.
- **Failure signals:** a normal drop no longer snaps; Shift-drag still snaps (override
  broken); "Align all" moves Shift-locked tiles; any Kernel write.
- **Handoff (Codex):** Branch quantflow-v4. Read SURFACE_LADDER § guards + this S1.1
  only. Invert the S1 snap default to snap-on-drop; Shift = free+locked; add "Align
  all". Verify Shift isn't already bound before using it. Machine test + operator
  proof. Commit locally; Claude re-runs + audits, then this closes S1's product proof.

### S1.2 + S0.2 — product-proof fixes (2026-06-22)

Operator product proof of S1.1/S0.1 surfaced two issues — both small, both downstream
of earlier scoping (not Codex defects). One combined work order.

**S1.2 — pin semantics (fixes "Aligned 0 tiles"):**
- **Root cause:** the *original* S1 (`07f70fb`) marked **every** dragged tile
  `userPlaced=true`; those flags persisted in saved canvas state. S1.1's
  `alignTilesToGrid` correctly skips `userPlaced`/`locked` → skips them all →
  "Aligned 0 tiles." The S1.1 spec ("Align all snaps only unlocked tiles") is the
  cause; and there is no un-pin gesture.
- **Model fix — pins protect from AUTOMATIC (S3) layout only, never from an explicit
  operator action:**
  - **"Align all to grid"** → clear `userPlaced` + snap **every** tile (explicit
    command overrides pins). Toast reports the aligned count.
  - **Plain drag** → clear `userPlaced` + snap (this *is* the un-pin gesture; also
    fixes a stale-pinned tile failing to snap on a normal drag).
  - **Shift-drag** → unchanged: set `userPlaced` + free placement.
- **Files:** `canvas-grid.js` (`alignTilesToGrid` force-aligns: clear lock then snap),
  `tile-interactions.js` (`finalizeGridPlacement` normal path clears `userPlaced`
  before snap).
- **Machine proof:** test asserts Align-all aligns a `userPlaced` tile (clears pin +
  snaps); plain drag clears pin + snaps; Shift-drag sets pin + no snap.

**S0.2 — Watchtower event breadth (fixes "No Kernel events"):**
- **Root cause:** `isWatchtowerKernelEventKind` (`operational-event-log.js`) excludes
  `tile.*`/`connection.*`, so spawning a terminal tile (`tile.created`) shows nothing;
  and a bare terminal is not Kernel *task* work, so no task/artifact events fire.
- **Fix:** include **structural** `tile.created`/`tile.removed`/`tile.status_updated`
  + `connection.created`/`connection.deleted` in the filter; **exclude**
  `tile.moved`/`tile.resized` (mechanical noise). Spawning/closing a tile now shows live.
- **Honest scope note (tell the operator):** the *rich* events (task lifecycle,
  artifacts, checkpoints) require running real Kernel work (Run Workflow → Hermes /
  Conductor atom); live status *on tiles* lands at S2. S0.2 only makes the pipe
  visibly alive with an action available today.
- **Files:** `operational-event-log.js` (`isWatchtowerKernelEventKind`).
- **Machine proof:** `tile.created` + `connection.created` are kernel-event kinds;
  `tile.moved` is not.

**Regression:** `canvas-grid.test`, `tile-interactions.test`, `canvas-state.test`,
`watchtower-view.test`, `operational-event-log.test`, `bun run build` — all green.
Pure renderer; no Kernel/schema. **Failure signals:** Align-all still skips pinned
tiles; plain drag doesn't un-pin; `tile.moved` floods Watchtower; any Kernel write.
**Handoff (Codex):** Branch quantflow-v4. Read SURFACE_LADDER § guards + this fix only.
Make pins protect from automatic layout ONLY (Align-all + plain drag override + un-pin);
broaden the Watchtower kernel-event filter to structural tile/connection events (not
move/resize). Machine tests + operator proof. Commit locally; Claude re-runs + audits.

### S1.3 — Tidy re-pack + dock button (fixes "Align does nothing visible")

Operator product proof of S1.2 surfaced the real gap: **snapping to the 8px baseline
moves tiles ≤4px — visually nothing**, and `alignTilesToGrid` reports "Aligned 0"
when tiles are already within 8px of a line. The 8px baseline is correct as the
*vertical rhythm*, but **tiles need to align to COLUMNS** (pitch = `columnWidth` 80 +
`gutter` 24 = **104px**), not the baseline. **Operator decision: "Align All" should
re-pack tiles into a tidy grid** (not just square them up), and it needs a **visible
dock button** (no Ctrl+K).

- **Builds:**
  - **`repackTilesToGrid(tiles, { viewport, tokens, locks })`** in `canvas-grid.js`:
    a deterministic **flow pack** — order tiles (stable: by current y then x, or
    zIndex), place left→right at **column-pitch** x positions starting from
    `margin`, wrap to a new row when the row would exceed the viewport width; row y
    advances by the row's max tile height + gutter; every placed rect snapped to the
    grid tokens. **No overlaps.** Clears soft `userPlaced`; **skips hard `locked`**
    (and `options.locks`) tiles, packing around them. Returns `{ tidied, skipped }`.
  - Wire the **"Align All To Grid"** command **and** a new **visible dock button**
    (near `+ Add` at the top of the dock, matching its style — the operator pointed
    there) to `repackTilesToGrid`. Keep the Ctrl+K command too.
  - **Informative toast:** `Tidied N tiles` / `No tiles to tidy` / note skipped-locked
    count — never a bare ambiguous "Aligned 0".
  - Leave **snap-on-drop** as the fine 8px quantize (gentle); re-pack is the explicit
    coarse tidy. (`alignTilesToGrid` square-up util may stay internal or be removed —
    Codex's call; the button/command use re-pack.)
- **Machine proof:** test asserts `repackTilesToGrid` yields **non-overlapping**,
  grid-snapped, **deterministic** positions for a given tile set + viewport; clears
  `userPlaced`; skips hard `locked`; toast counts match.
- **Product proof:** click the **dock button** → tiles flow into a clean,
  non-overlapping grid; toast says "Tidied N tiles".
- **Regression:** `canvas-grid.test`, `tile-interactions.test`, `canvas-state.test`,
  shell suite, `bun run build` — green. Pure renderer; no Kernel.
- **Failure signals:** re-pack overlaps tiles; non-deterministic placement; moves
  hard-`locked` tiles; button missing or not wired to re-pack; ambiguous "Aligned 0"
  toast persists.
- **Handoff (Codex):** Branch quantflow-v4. Read SURFACE_LADDER § guards + this S1.3
  only. Add `repackTilesToGrid` (deterministic flow pack, column-pitch, no overlap,
  skips hard-locked, clears soft pins) + a visible dock button near `+ Add` + an
  informative toast; wire both the button and the Ctrl+K command to it. Machine test +
  operator proof. Commit locally; Claude re-runs + audits.

### S0.1 — Watchtower → live Kernel event log

- **Why:** Watchtower renders the **retired envoy/herdr relay** feed (`ENVOY.SPACE.*`,
  `HERDR.BOOTSTRAP`, `ENVOY.TASK.*` — "10d ago", "0 relay events") — dead since Envoy
  was demoted to a Kernel mirror (R3c). S0 wired it to *refresh on* Kernel events and
  killed the 2s poll, but its **content** is still the relay snapshot. Operator
  decision: **repoint it to the live Kernel event stream.** Bonus: this becomes S0's
  **visible product-proof surface** (watch task/artifact/checkpoint events live)
  *before* S2's tile badges exist.
- **Builds:**
  - Feed the Watchtower **events** tab from the live Kernel event stream
    (`kernelApi.onEvent`) — a bounded **in-memory ring buffer** of recent events
    (kind · correlationId/taskId/workflowId · summary · time). **Ephemeral only** —
    no persisted store (F1/F8). Reuse `operational-event-log.js` if it already models
    a Kernel-event timeline.
  - Render the S0 kinds: `task.*`, `artifact.created`, `verification_*`,
    `checkpoint.awaiting-selection`, `human_decision`, `evaluation.created`,
    `worker.*`, `workflow.*`.
  - **Demote the dead relay surfaces:** the relay-specific tabs/filters
    (`WATCHTOWER_RELAY_ERROR_FILTERS`, queues/throughput, relay-derived agents) are
    envoy-legacy — hide or clearly mark them; do not present stale relay data as live.
- **Machine proof:** a unit test feeds synthetic Kernel events through the buffer and
  asserts the timeline renders them in order, bounded to the ring size, and writes
  **no** persisted rows.
- **Product proof:** with DevTools closed, trigger Kernel activity (spawn/run a task);
  Watchtower shows the **live** Kernel events streaming in (not the 10-day-old relay
  feed) — this is the visible S0 proof.
- **Regression:** `watchtower-view.test.ts` updated, shell tests + `bun run build`
  green. No Kernel/schema change.
- **Failure signals:** a persisted events store is added; stale relay data still shown
  as live; any Kernel write from the renderer.
- **Handoff (Codex):** Branch quantflow-v4. Read SURFACE_LADDER § guards + this S0.1
  only. Repoint Watchtower's events feed from the retired envoy/herdr relay snapshot
  to a bounded in-memory buffer of live `kernelApi.onEvent` Kernel events; demote the
  dead relay tabs. Ephemeral only — no persisted store. Machine test + operator live
  proof. Commit locally; Claude re-runs + audits, then this gives S0 its visible proof.

## Parked (not in this ladder)

### Visual Manifest Projection Layer — PARKED (fixed-dashboard-first)

Source: `QuantFlow Vault/S9 Rung.md`. The pattern (agents emit a *constrained
declarative manifest* selecting QF-owned components; QF validates + renders;
manifest is an artifact `kind=visual_manifest`; every edit is a proposal) is a
genuine fit — it is the Kernel rule applied to UI ("flexible flow, governed
surfaces"). Dashboards would use the same S1 grid tokens.

**But it is not necessary for the legibility mission** — S0–S6 deliver legibility
with *fixed* projections. Visual Manifest is curation/presentation polish, and
its strongest driver is the investor demo, not a capability gap.

**When promoted, invert the doc's build order:** build a **fixed, template-owned
dashboard first** (the optional seed noted in S5 / R6 — "Scout/Research/Deep render
a known summary view"), with no agent, no manifest, no validation engine. That
captures ~90% of the value (including the demo). Add the **agent-authored manifest
layer only if/when** dogfooding produces run outputs heterogeneous enough that fixed
per-template dashboards visibly fall short. That heterogeneity is the trigger that
makes the engine necessary rather than speculative premature abstraction.

This is **Axis 2** (agent authors *read-only dashboards*), distinct from **Axis 1**
(structural canvas control — already partly exists via MCP tile/cable tools, made
safe + visible in S3 + S6). It is *not* "the agent controls the canvas."

### Legend taxonomy cleanup → R8.5 follow-on

Split the legend into Runs / Tiles / Layers / Backends; role+backend separation so
the operator picks "Agent Tile · role = Analyst · backend = Eve" rather than
"Hermes Researcher vs Eve Researcher". Daily-use polish, not a v4-proof rung — it
composes with the R8.5 `roles/*.json` registry + Settings→Agents pane already in
flight, so it belongs to R8.5, not this ladder.

### Braintrust / external trace vendor — PARKED

Per operator: focus on Kernel truth + local solutions. Local eval-score badges
land in S5 (no vendor). Revisit an external trace store after the core reflection
layer ships. As written ("task→span, worker→span, verification→score") it implies
a *second observability store* + new dependency — constitutionally fine only as a
strictly read-only badge over existing eval rows, which is what S5 already does
locally.
