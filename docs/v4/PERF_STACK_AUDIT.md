# QuantFlow Performance Stack Audit

**Date:** 2026-06-23  
**Branch:** `quantflow-v4`  
**Method:** Thermo-nuclear performance architecture review + operator GPT session synthesis (structural, not micro-optimization)  
**Scope:** Full runtime stack — operator UI → Electron IPC → Kernel → Conductor → Harness → SDK → storage/receipt → canvas projection  
**Status:** Audit only — no runtime code changes

**Sources:** Code review (`quantflow-v4`), thermo-nuclear subagent pass, operator GPT chat (`QuantFlow Vault/GPT Chat.md`), `PRODUCT.md`, `BUILD_PLAN_V4.md`, `KERNEL_CONSTITUTION.md`, `VISUAL_COMPONENT_INVENTORY.md`.

**Product principle (from operator session):** QuantFlow should feel instant even when work takes time — the canvas updates on **phase transitions**, streams proof as layers progress, and makes the stack **visible per tile** (not just “Running…”).

---

## A. Executive Summary

QuantFlow’s constitutional model is sound: **Kernel owns truth; Canvas projects it.** In practice, the shipped stack still carries **four overlapping persistence layers** (in-memory `canvas-state.js`, JSON `canvas-state.json`, Kernel `kernel.db`, runtime `runtime.db`), **a monolithic shell orchestrator** (`renderer.js` ~3.5k LOC), **command audit double-writes on every Kernel mutation**, and **event handlers that re-query full Kernel snapshots on broad lifecycle ticks**. The product can feel sluggish even when workers/models are idle because the UI path does too much synchronous reconciliation work per Kernel event.

The biggest wins are architectural: **instrument first**, **incremental projection (not snapshot polling)**, **collapse duplicate truth stores**, **milestone receipts only**, **separate high-frequency PTY streams from canvas paths** — not React memoization or CSS tweaks.

**Verdict:** Do not approve perf work that micro-optimizes SQLite or PTY while dual-state + snapshot-refetch architecture remains. The v3 Kernel design is sound; performance debt lives in the **v2 collab shell** still projecting via full snapshot polling instead of trusting event payloads.

### Top 10 likely performance bottlenecks

| # | Bottleneck | Layer | Primary evidence |
|---|------------|-------|------------------|
| 1 | **Broad kernel-event → full projection refetch** — `refreshWorkflowProjection()` runs `kernel.workflow.region_list` + `kernel.canvas.snapshot` on ~15 event kinds with no debounce | UI + IPC | `renderer.js` L1513–1529, L3671–3690 |
| 2 | **Quadruple persistence** — in-memory + JSON + `kernel.db` + `runtime.db`; tile/session/connection truth in all four | UI + Kernel + Storage | `canvas-state.js`, `canvas-persistence.ts`, `runtime-state/database.ts` |
| 3 | **Command audit double-write** — every `dispatchKernelCommand` = INSERT + UPDATE on `commands` before handler | Kernel | `src/kernel/commands/index.ts` |
| 4 | **Synchronous event fan-out chain** — one `emitKernelEvent` → State Card SQL + IPC broadcast + renderer handler + optional Watchtower full rebuild | Kernel + UI | `events/index.ts`, `watchers/index.ts`, `renderer.js` |
| 5 | **`renderer.js` god-file** (~3,497 LOC) — tiles, cables, watchtower, conductor, kernel events, webviews | UI | `VISUAL_COMPONENT_INVENTORY.md` |
| 6 | **Sequential multi-tile commit + startup waterfall** — N `kernel.tile.move` awaits; window blocked on sidecar + Herdr + 20+ IPC registrars | IPC + Electron | `tile-manager.js` L201–211; `index.ts` bootstrap |
| 7 | **MCP 3-hop local path** — stdio → TCP `:9811` → JSON-RPC → `dispatchKernelCommand` (+ command audit); WSL adds Windows-node proxy | SDK + IPC | `tools/quantflow-mcp/server.js`, `json-rpc-server.ts` |
| 8 | **Herdr status → Kernel command per ping** — each status = `kernel.worker.status_update` + `syncTileList()` + `herdrList()` IPC | UI + Harness | `renderer.js` L3585–3599 |
| 9 | **Watchtower full DOM rebuild** when visible — `innerHTML` + 2 main-process IPC calls per qualifying kernel event | UI | `renderer.js` L2533–2587 |
| 10 | **Conductor aggregate read + approval scan** — full context each step; `hasPendingApproval` may scan up to 500 receipts | Conductor | `conductor/index.ts`; `conductor-ipc.ts` |

Also watch (measure before optimizing): per-tile webviews (memory), sync artifact verify on large files (`artifacts/verify.ts`), SQLite single-writer under multi-worker receipt storms (v4 territory map), context envelope size growth.

### Top 10 structural complexity bottlenecks

| # | Complexity debt | Symptom |
|---|-----------------|---------|
| 1 | **Monolith shell** (`renderer.js` 3497L, `tile-manager.js` 1095L, `canvas-rpc.js` 1031L, `pty.ts` 1091L) | Render frequency hard to reason about; fixes don’t stick |
| 2 | **Parallel event buses** — Kernel events, runtime-state `events-repo`, renderer operational/kernel logs | Cannot answer “where did time go?” |
| 3 | **Dual SQLite + JSON** — Kernel DB + runtime DB + canvas JSON + in-memory | Reconciliation tax on every mutation |
| 4 | **IPC surface explosion** — 20+ registrars in `ipc.ts` | Duplicated routing (`shell:forward`, `canvas:rpc`, `kernel:*`) |
| 5 | **Dual renderer tracks** — thin `src/renderer/` TS vs live `quantflow-electron/.../shell/src/` JS | Architecture split |
| 6 | **Incomplete external tile reconciliation** — Kernel `tile.created` cannot rebuild webview tiles | `renderer.js` L3633–3639 |
| 7 | **Phase vocabulary split** — Conductor `LoopPhase`, task FSM, worker status, `ptyStatus` strings | UI branches on ad-hoc enums |
| 8 | **Mode 1 vs Mode 2 spawn confusion** — legend terminal summon ≠ Conductor background automation | Mixed benchmarks hide real slowness (`docs/v4/SPAWN_MODEL.md`) |
| 9 | **MCP tool surface** (~969 LOC) without unified adapter timing | External calls lack spans |
| 10 | **Sequential Conductor loop by design** — one approved action/step | Correct for safety; DAG eligible-set exists but caller must dispatch |

### Top 5 “code judo” opportunities

1. **Incremental projection router** — Replace blanket `refreshWorkflowProjection()` with event-kind dispatch; debounce 50ms. Delete ~80% of snapshot IPC on hot paths.
2. **Single hydration source** — Boot from `kernel.canvas.snapshot` + tile extension table; demote `canvas-state.json` to cache/export only.
3. **Batch command IPC** — `kernel:command-batch` for multi-tile drag and MCP bulk ops; one transaction, one event burst.
4. **PTY/log side-channel** — Terminal bytes stay in terminal webview; forbid stdout/status from triggering `updateCables`, `syncTileList`, or Kernel queries.
5. **Split `renderer.js`** — Extract `event-router`, `projection`, `watchtower-host` (<800 LOC each); coalesced rAF queue in projection module.

Secondary judo: MCP in-process fast path when local (`QUANTFLOW_MCP_INPROC=1`); parallel sidecar/Herdr after first paint; collapse MCP relay for same-machine Hermes.

---

## B. QuantFlow Runtime Stack Map

```text
OPERATOR ACTION (click, drag, shortcut, Conductor approve, MCP tool)
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  L1 SHELL RENDERER (quantflow-electron/windows/shell/src/)      │
│  renderer.js (3497L) · tile-manager (1095L) · canvas-rpc (1031L)│
│  canvas-state.js · cables SVG · 8 embedded React webview surfaces │
│  src/renderer/ — thin TS wrappers, NOT the live shell path        │
└────────────────────────────┬──────────────────────────────────────┘
                             │ preload shell.ts: kernelApi + shellApi + conductorApi
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│  L2 ELECTRON MAIN (quantflow-electron/src/main/)                  │
│  ipc.ts → 20+ ipc-* modules · pty.ts (1091L) · json-rpc :9811   │
│  canvas-persistence.ts → canvas-state.json (legacy)               │
│  runtime-state/database.ts → runtime.db · herdr · sidecar · envoy │
└────────────────────────────┬──────────────────────────────────────┘
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│  L3 KERNEL (src/kernel/) — kernel.db (WAL)                        │
│  commands/index.ts (audit INSERT+UPDATE) · events · watchers    │
│  queries · receipts · artifacts · tasks FSM · state_cards       │
└────────────────────────────┬──────────────────────────────────────┘
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────────────────┐
│  L4 CONDUCTOR            │   │  L5 HARNESS (src/harness/)           │
│  conductor-loop · dag    │   │  local-shell · herdr-shell · eve     │
│  run-template-runner     │   │  harness-service (Electron-coupled)  │
└────────────┬────────────┘   └──────────────┬──────────────────────┘
             │                                ▼
             │                PTY/tmux · sidecar · Herdr/WSL · Eve pod
             ▼
┌─────────────────────────┐   ┌─────────────────────────────────────┐
│  L6 SDK / MCP            │   │  L7 STORAGE                          │
│  quantflow-mcp → :9811   │   │  kernel.db · runtime.db · artifacts  │
│  integrations.ts         │   │  canvas-state.json · vault mirror    │
└────────────┬────────────┘   └──────────────┬──────────────────────┘
             └────────────────┬───────────────┘
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  L8 OBSERVABILITY (partial)                                       │
│  launch-traces · herdr.bootstrap · runtime events-repo            │
│  No unified span model · no operator run timeline yet             │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              kernel:event → renderer → cables/regions/watchtower
              pty:data → terminal webview ONLY (target)
```

**Constitutional path (target):** `intent → Kernel command → Kernel write → Kernel event → renderer re-renders`

**Actual hot path (today):** `intent → local mutation → Kernel command (+ audit writes) → event → local mutation again → full snapshot queries → cable/region redraw → JSON save → webview sync`

**Production planes (operator framing):**

| Plane | Components |
|-------|------------|
| Operator | Canvas, tiles, cables, State Cards, panels |
| Control | Kernel, Conductor, event bus, permissions, SDK registry, run timeline |
| Execution | PTY/WSL, Python/Node, browser harness, Eve, external APIs |
| Storage | kernel.db, runtime.db, artifact files, vault mirror |
| Observability | spans, receipts, replay (to build) |

---

## C. Current Data / Event Flows

### 1. Spawn tile (Mode 1 — legend terminal summon)

```text
Legend / operator / MCP
 → tile-manager.createCanvasTile() [provisional canvas-state]
 → IPC kernel.tile.create → dispatchKernelCommand [audit INSERT+UPDATE]
 → INSERT tiles + emit tile.created → watcher + kernel:event
 → createTileDOM + webview/PTY/herdr spawn
 → saveCanvasImmediate → canvas-state.json + syncTileList
```

Measure **tile appear** and **harness ready** separately. Benchmark name: `legend.spawn`.

### 2. Drag / resize tile

```text
Provisional UI during drag (no IPC) → mouseup
 → sequential kernel.tile.move [/ resize] per tile
 → tile.moved/resized → repositionAllTiles + updateCables + refreshWorkflowProjection?
 → saveCanvasImmediate → JSON
```

N tiles = N IPC round trips + possible 2 snapshot queries per event.

### 3. Draw cable

```text
Local addConnection → kernel.connection.create
 → connection.created → updateCables (SVG incremental — good)
 → refreshWorkflowProjection (full snapshot for semantic types)
```

**Dual-write risk:** `canvas-persistence.ts` may still write connections to `runtime.db`.

### 4. Start terminal tile

```text
spawnTerminalWebview → pty.ts (tmux | sidecar | herdr)
 → pty:data → terminal webview (16ms batch on Win PowerShell only)
 → registerTerminalTileSession → onTerminalSessionCreated → save + syncTileList + updateCables
```

Cold: Herdr bootstrap, sidecar ensure, tmux discovery — stacked at startup and first tile.

### 5. Stream terminal logs

**Target path:** PTY → `pty:data` → terminal webview only.

**Leak path:** Herdr status → `kernel.worker.status_update` + `syncTileList` + `herdrList` + `updateCables`.

Rule: **high-frequency logs must not trigger high-frequency canvas state changes.**

### 6. Background task atom (Mode 2 — Conductor automation)

```text
Conductor assign → WorkerHarness.spawn/send
 → artifact create → structural verify (reads + hashes file — sync, size-sensitive)
 → artifact_created receipt → task complete after verification receipt
```

Benchmark name: `conductor.task_atom`. Eve path: same harness contract + span translator; Eve never writes Kernel directly.

### 7. Agent / model call

```text
conductor:loop-step → queryConductorContext (workflow + all tiles + state_cards + tasks + receipts)
 → manualModelProvider (offline today)
 → kernel.conductor.plan receipt → refreshWorkflowProjection
```

Future: `buildPlanningPrompt(JSON.stringify(context))` will serialize full context — instrument envelope bytes first.

### 8–10. SDK/tool, artifact, receipt, canvas update

- **MCP:** 3–4 hops minimum to `dispatchKernelCommand`; same audit overhead as UI.
- **Artifact:** Stored by ref in Kernel (good); verify path reads whole file synchronously.
- **Receipt:** Sync INSERT + immediate emit + watcher upsert; milestone-only rule: micro-events → spans/logs, not receipts.
- **Canvas update storm:** Any broad kernel event → `refreshWorkflowProjection()` → 2 IPC queries + full cable SVG — **dominant hot-path bug**.

---

## D. Performance Risk Table

| Layer | File / path | Symptom | Likely cause | How to measure | Optimization direction | Risk | Safe now? |
|-------|-------------|---------|--------------|----------------|------------------------|------|-----------|
| UI | `renderer.js` | UI stutter during runs | Snapshot refetch on ~15 event kinds | IPC/sec during receipt storm (B4) | Event-kind router + 50ms debounce | **High** | Yes (additive) |
| UI | `renderer.js` | Watchtower CPU | Full innerHTML rebuild per event | Events/sec visible vs hidden | Decouple from all kernel events | Med | Yes |
| UI | `tile-manager.js` | Multi-drag lag | Sequential `kernel.tile.move` | ms for N-tile commit (B3) | `kernel:command-batch` | Med | Yes |
| UI | `cable-renderer.js` | Cable jank | `updateCables` on every projection refresh | Frame time during pan | rAF coalesce; dirty flags | Med | After measure |
| UI | `flow-cube-watermark.js` | Idle CPU | Continuous rAF | Profile idle canvas | Pause when tiles > 0 | Low | Yes |
| UI | `webview-factory.js` | Memory with tiles | 1 webview per tile | Electron metrics | Lazy mount / pool | High | No (product) |
| Electron | `index.ts` | Slow cold start | Sequential boot waterfall | `launch-traces/` (B1) | Parallel sidecar+Herdr after first paint | **High** | Yes |
| Electron | `pty.ts` | Terminal flood | Unbatched tmux/herdr | Bytes/sec vs main CPU (B7) | Extend 16ms batch pattern | Med | After measure |
| Electron | `ipc.ts` | Untraceable latency | 20+ registrars | Wrap `ipcMain.handle` | Central timing middleware | Low | Yes |
| Kernel | `commands/index.ts` | Write amplification | Audit INSERT+UPDATE per command | writes/command | Batch or sample high-freq ops | Med | Needs flag |
| Kernel | `events/index.ts` + `watchers/` | Main-thread stalls | Sync fan-out chain | Handler duration | Async queue; coalesce per tile | Med | Yes |
| Kernel | `queries/index.ts` | Snapshot cost | Full table reads | EXPLAIN; row counts | Delta queries; indexes | Med | Yes |
| Kernel | `artifacts/verify.ts` | Verify blocks completion | Sync read+hash whole file | Latency by file size | Async/worker verify for large files | Med | Instrument first |
| Kernel | `receipts/index.ts` | Receipt storms | Sync INSERT + emit each | Receipts/sec in Conductor loop | Milestone receipts only | Med | No (authority) |
| Conductor | `conductor/index.ts` | Slow steps | Full aggregate read | Context bytes; query ms (B5) | Scoped reads by phase | Med | Yes |
| Conductor | `conductor-ipc.ts` | Slow approval | Scan up to 500 receipts | Receipts scanned/step | Index on proposal token | Med | Yes |
| Harness | `herdr-runtime.ts` | Slow first terminal | Cold bootstrap | bootstrap `duration_ms` | Warm/lazy Herdr | High | Yes |
| SDK | `quantflow-mcp/server.js` | Tool latency | TCP relay + audit | p99 local round-trip (B6) | In-process bypass | Med | Yes |
| Storage | JSON + runtime.db | Divergence + double I/O | Four persistence layers | bytes written/session | Kernel-only hydration | **High** | Phased |
| Storage | SQLite | Write contention | Single-writer | receipt p95 at 1/5/10 workers | Milestone receipts; batch | Med | Measure first |
| Flow | `context/envelope.ts` | Conductor bloat | Envelope/token growth | envelope bytes + token estimate | Instrument before densification | Med | Yes |
| Observability | (missing) | “Where did time go?” | No span model | — | Section E | **High** | Yes |

### Monolith register (>800 LOC)

| LOC | Path | Role |
|------:|------|------|
| 3497 | `quantflow-electron/.../renderer.js` | Shell bootstrap, events, watchtower, conductor chrome |
| 3612 | `quantflow-electron/.../shell.css` | Styles (maintenance, not hot path) |
| 1095 | `quantflow-electron/.../tile-manager.js` | Tile CRUD, drag commit, persistence |
| 1091 | `quantflow-electron/src/main/pty.ts` | tmux + sidecar + herdr PTY |
| 1031 | `quantflow-electron/.../canvas-rpc.js` | MCP/canvas RPC handlers |
| 969 | `tools/quantflow-mcp/tool-definitions.js` | MCP tool schemas |
| 885 | `quantflow-electron/src/main/index.ts` | App bootstrap |
| 862 | `quantflow-electron/.../watchtower-view.js` | Watchtower rendering |
| 845 | `src/kernel/tasks/index.ts` | Task lifecycle commands |
| 653 | `src/main/conductor/run-template-runner.ts` | R6 run templates |

---

## E. Instrumentation Plan

Introduce a **local span log** before SaaS tracing. Gate with `QUANTFLOW_TRACE=1` (or `QF_PERF_TRACE=1`); output to `~/.quantflow/perf/{date}.jsonl` + optional `latest-summary.md`.

**Rule:** Terminal lines are stream data; spans are milestones. Do not span every stdout line.

### Event taxonomy

| Event | Emit where |
|-------|------------|
| `run.started` | Workflow/run template start |
| `kernel.state.created` | `initKernelDb` |
| `kernel.command` / `kernel.query` | dispatch / handle start/end |
| `kernel.event.fanout` | `emitKernelEvent` (kind, watcher_ms, ipc_ms) |
| `conductor.plan.started` / `conductor.context.query` | loop-step / readContext |
| `model.call.started` / `completed` | `model-provider.ts` (future) |
| `sdk.call.started` / `completed` | MCP + `integrations.ts` |
| `mcp.rpc` | json-rpc handler (method, hops, duration_ms) |
| `harness.spawn.started` / `ready` / `exited` | pty, herdr, harness registry |
| `harness.stdout` / `stderr` | pty (sampled bytes only) |
| `eve.session.started` / `first_event` / `completed` | Eve translator |
| `artifact.create` / `artifact.verify` | receipts module |
| `receipt.post` | `postReceipt` |
| `renderer.projection.refresh` | `refreshWorkflowProjection` trigger + query count |
| `renderer.event.handler` | onEvent callback duration |
| `canvas.tile.updated` / `canvas.cable.updated` | coalesced projection |
| `ipc.invoke` | ipcMain middleware |
| `startup.phase` | `recordLaunchPhase` (exists) |

### Span fields

```typescript
interface Span {
  run_id: string | null;       // workflow_id in v4
  workflow_id?: string;
  tile_id?: string;
  task_id?: string;
  worker_id?: string;
  correlation_id?: string;
  span_id: string;
  parent_span_id?: string;
  phase?: string;              // Section G
  layer: 'canvas' | 'ipc' | 'kernel' | 'conductor' | 'harness' | 'model' | 'sdk' | 'artifact' | 'receipt' | 'eve';
  name: string;
  started_at: number;
  ended_at?: number;
  duration_ms?: number;
  payload_size_bytes?: number;
  status: 'started' | 'ok' | 'error' | 'cancelled' | 'timeout';
  error?: string;
}
```

### Anchor points (instrumentation-only PR first)

1. `src/kernel/events/index.ts` — wrap `emitKernelEvent`
2. `src/kernel/commands/index.ts` — wrap `dispatchKernelCommand`
3. `src/kernel/receipts/index.ts` — wrap `postReceipt`, artifact create/verify
4. `quantflow-electron/src/main/ipc.ts` — timing proxy on `ipcMain.handle`
5. `src/main/conductor/conductor-loop.ts` — step spans
6. `quantflow-electron/src/main/pty.ts` — spawn + byte counters
7. `renderer.js` — `scheduleProjectionRefresh(reason)` with timing

Extend existing: `launch-traces.ts`, `herdr.bootstrap`, runtime-state `events-repo` — do not duplicate.

### Operator-facing output (after spans exist)

**Run timeline** per tile/run (State Card back or Watchtower tab):

```text
0ms      run.started
155ms    harness.spawn → 812ms harness.ready
940ms    sdk.hyperliquid.fetch_candles → 1.8s complete
2.1s     artifact.written → 2.2s receipt.written
Longest span: harness.spawn — 812ms
```

**Tile phase label** (product differentiator): “Running — waiting on Hyperliquid SDK” not just “Running”.

---

## F. Benchmark Plan

Store baselines in `qa/perf-baseline.json`. Record p50/p95 over 5 trials.

| ID | Benchmark | Question | Notes |
|----|-----------|----------|-------|
| B1 | App cold start | When is shell usable? | Use `launch-traces/` |
| B2 | Canvas hydrate (50 tiles) | Time to interactive | |
| B3 | Multi-tile drag commit (10 tiles) | mouseup → settled | Target <200ms after batch IPC |
| B4 | **Event storm** | 100 `receipt.posted` in 10s | **Target: 0 full snapshot refetches** |
| B5 | Conductor step (20 tasks, 200 receipts) | loop-step p95 | Target <100ms manual provider |
| B6 | MCP round-trip | `kernel.taskGet` p95 local | Target <50ms in-process |
| B7 | Terminal flood | `cat large.log` | No main-process stall |
| B8 | Cable pan (30 connections, 30s) | p95 frame time | Target <16ms |
| B9 | State card flip storm | IPC count per task event | 1 query per affected tile |
| B10 | Watchtower during storm | refresh p95 | Target <100ms coalesced |
| — | **legend.spawn** vs **conductor.task_atom** | Mode 1 vs Mode 2 | Separate names — do not mix |
| — | Artifact verify | Latency by file size | Before async offload |
| — | Context envelope | Bytes + token estimate | v4 hard problem |

**Do not mix** runtime-task benchmarks (R1 atom) with UI benchmarks (tile spawn, cable draw, FPS).

---

## G. Proposed Phase Model

Single projection enum for State Cards, tile chrome, and spans:

```text
idle | starting | preflight | planning | assigned | harness_spawning | harness_ready
| model_thinking | tool_calling | sdk_calling | harness_executing | streaming_output
| artifact_written | structural_verifying | receipt_written | awaiting_approval
| blocked | complete | failed | stale | cancelled
```

| Source today | Maps to |
|--------------|---------|
| Task FSM | `idle` / `harness_executing` / `blocked` / `complete` / `failed` |
| Worker status | `starting` / `harness_executing` / `idle` / `failed` |
| Conductor `LoopPhase` | `planning` / `awaiting_approval` / `blocked` |
| PTY strings | `harness_executing` / `starting` / `failed` |
| Verification gate | `structural_verifying` |
| Receipt types | `receipt_written` / `artifact_written` |

**Why it matters:** UI subscribes to **phase transitions**, not stdout bytes. Spans nest under phases. Operator sees where time goes without reading 10k terminal lines.

Phase is a **projection** from Kernel task/worker/receipt joins — not a second truth store.

---

## H. Architecture Recommendations (prioritized)

| P | Recommendation |
|---|----------------|
| **P0** | Incremental projection router — replace snapshot polling; 50ms debounce |
| **P0** | Instrumentation wrappers only (`QUANTFLOW_TRACE=1`) — no behavior change |
| **P0** | Decompose `renderer.js` — no file >800 LOC |
| **P0** | `kernel:command-batch` for multi-tile ops |
| **P1** | Single canvas hydration — Kernel snapshot + `tile_extensions`; demote JSON |
| **P1** | Stop dual-write `runtime.db` connections; Kernel `connections` canonical |
| **P1** | Parallel startup — window after IPC register; sidecar+Herdr background |
| **P1** | MCP in-process fast path for local Hermes |
| **P1** | Milestone receipts only — Conductor micro-steps → spans not receipts |
| **P2** | Async/coalesced State Card watcher (16ms per tile) |
| **P2** | Conductor context tiers — hot: tasks+blockers; cold: full receipts on demand |
| **P2** | Command audit sampling for `tile.move`/`resize` |
| **P2** | Async artifact verify for large files |
| **P3** | Eve measured like any harness — same spans, no special case |
| **P3** | Remote/WebSocket — only after local path clean |

**Product (not perf-for-perf’s-sake):** Visible governed execution — operator trust comes from phase labels + run timeline + performance summary on completed runs (receipt metadata or derived projection).

---

## I. What Not to Optimize Yet

Until Section F baselines exist:

- SQLite pragma tuning (WAL + NORMAL already set in `database.ts`)
- PTY 16ms Windows batching (already implemented in `pty.ts`)
- Random React memoization in panel webviews
- Rewriting `renderer.js` **behavior** or `shell.css` / cable hit targets / drag-resize feel
- New state library (Redux/Zustand)
- WebSockets for local Kernel events
- SaaS distributed tracing before local JSONL spans
- Storing artifacts/logs in Kernel state or State Cards
- Parallelizing Conductor approval gate without operator authorization
- Optimizing Eve before local/mock path measured
- Vault OKF export, eval auto-trigger, manual model provider
- Tile phase chip UI (`MODEL|SDK|PTY`) — State Card phase string covers v1

Matches v4 anti-swamp rule: attach to the atom; no full-size build before measured atom works.

---

## J. Recommended Next Tasks

| # | Task | Effort | Proof |
|---|------|--------|-------|
| 1 | Instrumentation-only PR (`QUANTFLOW_TRACE=1` → JSONL) | S | Spans at anchor points §E |
| 2 | Count IPC during B4 receipt storm | S | Baseline in `qa/perf-baseline.json` |
| 3 | Event-kind router; drop snapshot for `receipt.posted`, `task.*` | M | B4: 0 snapshot calls |
| 4 | 50ms debounce on `refreshWorkflowProjection` | S | B4 latency drop |
| 5 | Measure R1 atom only (Mode 2) + UI benchmarks separately | M | B3, B5, legend.spawn |
| 6 | Run timeline projection (text/JSON, no full UI) | M | Longest-span summary per run |
| 7 | `kernel:command-batch` + multi-tile drag | M | B3 <200ms |
| 8 | Extract `renderer-event-router.js` | M | renderer <800L per module |
| 9 | Document tile extension schema for Kernel hydration | S | Unblocks JSON demotion |
| 10 | Parallel sidecar/Herdr after first paint | M | B1 launch trace improvement |

### Approval bar

- [ ] Answer **where does time go?** per run via span timeline
- [ ] Each bottleneck has a **named owning layer**
- [ ] Changes tagged: safe projection tweak vs authority migration
- [ ] Slow paths classified: architecture vs compute/network
- [ ] Baselines captured before optimization PRs

---

## Appendix: Layer Notes (condensed)

1. **UI** — DOM/SVG churn, not React rerenders; incremental cable SVG is good; invocation frequency is bad.
2. **Electron** — Large `canvasSaveState` payloads; serial drag IPC; PTY batching partial.
3. **Kernel** — Truth model good; audit double-write and sync watcher fan-out are hot-path costs.
4. **Conductor** — Sequential by design; aggregate reads and approval scan scale with workflow size.
5. **Harness** — Cold starts dominate first terminal; Eve = harness + spans.
6. **SDK** — MCP authority path correct; latency attribution missing.
7. **Storage** — Milestone receipts; artifacts by ref; four persistence layers is the main debt.
8. **Observability** — Partial pieces exist; unified span tree and operator timeline do not.

---

*Audit complete. No runtime code modified. Next step: operator approval of Task J.1 (instrumentation wrappers only).*
