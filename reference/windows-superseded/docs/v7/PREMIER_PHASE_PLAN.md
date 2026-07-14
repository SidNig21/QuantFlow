# Premier phase — performance + polish (post–v7 Eve close-out)

**Status:** PARKED — do not start until founder says **"go on premier phase."**  
**Authority:** Founder diagnosis (2026-07-13). Complements `docs/v4/PERFORMANCE_LADDER.md` (PF rungs) with a v7-grounded, ponytail-sized sprint order.  
**Prerequisite:** v7 Eve integration closed (session tile, five gates green, U7 dock promotion).

---

## Diagnosis (one line)

Lag is **too much work per small change** — terminal bytes, receipts, and drags are still triggering full canvas refresh, extra IPC, and duplicate saves somewhere behind the v7 router you already have.

---

## Fix order (stop when it feels good)

### 1. Measure first — don't guess

Write `docs/v7/V7_PERFORMANCE_BASELINE.md` with:

- app-ready
- dock-click → shell
- drag FPS
- `kernel.canvas.snapshot` count during 100 receipts
- canvas redraw count during terminal flood
- IPC count per drag

**~2 hours.** Proves what's still broken; avoids rebuilding PF1 blindly.

### 2. PTY fence (biggest visible win)

Rule: **terminal output → that tile's webview only.** Zero `updateCables`, `syncTileList`, snapshot queries, or saves on `pty:data`. You already have `pty-canvas-fence` / E2 lint — **verify it's actually winning in the live shell**, not just on paper.

### 3. Prove snapshot polling is dead

`routeKernelEvent` + debounced projection should mean:

- `tile.moved` → move one tile + its cables
- `receipt.posted` → touch that tile's status only

**Grep callers** of `refreshWorkflowProjection`, `kernel.canvas.snapshot`, `updateCables`, `canvasSaveState` and delete or gate whatever still does "any event → rebuild everything."

### 4. Drag = local until drop

- `pointermove` → CSS transform only
- `pointerup` → **one** `kernel.tile.move` (batch if multi-select)
- No JSON/runtime.db write per pixel
- No sequential await-per-tile IPC

### 5. One rAF per burst

All visual deltas → `scheduleCanvasRender({ tileIds, connectionIds })` → single `requestAnimationFrame`. Redraw cables **attached to moved tiles only**.

### 6. Shell before runtime

Dock click → empty tile shell + "Starting…" **immediately**; WSL/AgentOS/Eve attach async. Warm pool helps later boot, not first paint.

### 7. Webviews — measure, don't rewrite

At ~10 tiles: lazy-mount webview, destroy on close, placeholder when off-screen. **Only** pool/suspend if baseline shows memory/CPU per tile is the bottleneck.

---

## Do **not** do yet

React memoization, new animation libs, CSS polish, cloud rewrite, full canvas rewrite — **skipped until baseline + fence + drag batch prove insufficient.**

---

## Smallest ponytail sprint (3 tasks)

```text
1. Baseline file (numbers, not opinions)
2. Grep + kill any path where PTY/receipt/drag triggers full snapshot or updateCables
3. Drag: local transform + one commit on release (+ batch IPC if multi-tile)
```

**Proof bar:** noisy terminal in tile A while dragging tile B stays smooth; 100 receipts → **0** full snapshot queries.

---

## Deferred (add when baseline says so)

Full PF ladder re-execution, Watchtower rewrite, webview pooling architecture — **add when** baseline shows webview count or idle CPU is the top stall after tasks 1–3 land.

## Also in premier phase (from v7 handoff, after perf fence)

- **T-PERF warm pool depth ≥2** — second Eve tile cold boot (~60s today)
- **Session survival across app restart** — broker registry persistence; reopen tile → same conversation
- **Tile rendering polish** — markdown, collapsible tool cards, streaming feel
- **Stop button** — abort running turn from tile
- **Relay wedge** — dev-port JSON-RPC EPIPE / Health-down (orthogonal to Eve but daily pain)

---

## Entry command (founder)

```text
go on premier phase — start with V7_PERFORMANCE_BASELINE.md per docs/v7/PREMIER_PHASE_PLAN.md
```
