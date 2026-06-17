# Incoming Goals — v3 Backlog (intake, not authority)

A capture surface for candidate goals discovered while **using** QuantFlow during
the dogfooding phase. Items here are raw intake: ideas, gaps, papercuts, and
"this feels missing" notes.

**Nothing here is authorized work.** A candidate becomes real only when the
operator promotes it into `BUILD_PLAN_V3.md` as a numbered goal with full scope
and explicitly authorizes it (one goal at a time). Until then, do not implement
from this file.

See `docs/v3/STATUS.md` for current v3 state and `BUILD_PLAN_V3.md` for the
authoritative ladder (Goal 10 / cloud is the only parked rung).

## How to add an item

Keep entries short and evidence-based — what you actually hit, not a feature
wishlist. Use this shape:

```md
### <short title>
- **Problem / friction:** what felt missing or wrong while using the product
- **Evidence:** where you saw it (workflow, tile, command, receipt/eval id, screenshot)
- **Proposed scope:** rough idea of the change (1–3 bullets), if any
- **Layer(s):** kernel / renderer / conductor / harness / vault / evals / shell
- **Priority:** low / medium / high
- **Status:** captured | discussed | promoted to BUILD_PLAN_V3 (Goal N) | dropped
```

## Candidates

### Canvas layout diagnostics (deterministic, Kernel-data only)
- **Problem / friction:** the Kernel knows tile geometry, but an agent/operator can still miss *visual* problems — a tile hidden behind another (z-index), a blocked worker scrolled offscreen, a verification string with a missing/!visible endpoint, a workflow region too cluttered to read.
- **Evidence:** not yet observed in real use — captured from the SpatialClaw discussion (2026-06-16). **Confirm during dogfooding before promoting.**
- **Proposed scope (cheap, do this first if promoted):**
  - Pure geometry helpers over the existing `CanvasSnapshot` + workflow regions + viewport: `detectOverlaps`, `findOffscreenTiles(viewport)`, `tilesInRegion`, `connectionsMissingEndpoint`, `layoutScore`. No screenshot, no ML, no code sandbox.
  - Surface as a Conductor read-tool (`diagnose_canvas_layout`) and/or a `visual_diagnosis` receipt. Diagnose + propose only — never mutates; proposals route through Conductor → Kernel commands.
- **Layer(s):** kernel/queries (read), conductor (read-tool), maybe evals-style pure module
- **Priority:** medium (high value, low cost — but gated on real dogfooding evidence)
- **Status:** captured

### Canvas Perception Kernel — screenshot + code-reasoning loop (SpatialClaw-inspired, heavier)
- **Problem / friction:** the deterministic helpers above can't judge truly pixel-level questions (text unreadable at current zoom, a browser tile showing an error, strings visually crossing badly). SpatialClaw's lesson: give the agent a *composable* workspace (write code cell → inspect intermediate vars/images → revise) instead of one screenshot or rigid tool calls.
- **Evidence:** SpatialClaw (NVlabs) — https://spatialclaw.github.io/ , https://github.com/NVlabs/SpatialClaw. Reference for the **action-interface pattern only**, not the 3D/SAM3/Depth stack.
- **Proposed scope (deferred — separate, larger goal):**
  - New `canvas.captureViewport` RPC (PNG of current viewport / fit-to-workflow). Browser tiles already screenshot; the infinite canvas does not.
  - Persistent reasoning sandbox (TS `vm` or subprocess) preloaded with snapshot/regions/state-cards/viewport (+ optional screenshot) and the geometry helpers; agent composes/inspects/revises; returns a diagnosis/proposal.
  - Ship as a `canvas-perception` harness/plugin (diagnostic/verifier role) and/or MCP external tool — NOT the Conductor internal fast path.
- **Layer(s):** harness/plugin, kernel RPC (screenshot), conductor (consume proposals)
- **Priority:** low (real risk: agent-written code in a sandbox; only build if Phase-0 helpers prove insufficient)
- **Status:** captured — **do NOT install SpatialClaw as a dependency**; pattern-only. Aligns with Goal 7's parked Smart Grid / layout-verification ideas.
- **Hard rails (carry into any promotion):** screenshots are never source of truth; visual reasoning never mutates canvas/Kernel state; high-risk proposals still go through Conductor approval; no GPU/3D/segmentation stack for v3.

### Dogfooding findings — first live session (2026-06-16)

Validated live with the running app + QuantFlow MCP. **Positive:** MCP `role_spawn`
tiles register in the v3 Kernel — the embedded Conductor's "Generate plan" read
`2 tiles · 2 state cards`, so Goal 6A reconciliation holds even on the MCP spawn
path. Gaps found:

#### Live task delegation runs on v2 Envoy, not the v3 Kernel (HIGH)
- **Problem:** `qf_task_*` MCP tools and the live delegation flow create/track **Envoy** tasks; the v3 Kernel task lifecycle (Goals 3/5C/5D) is separate. The Conductor (reads Kernel) showed `0 tasks` while `qf_task_list` had ~18 Envoy tasks on other canvases. So external agents / the live flow do not exercise v3 task truth, gates, or receipts.
- **Evidence:** Conductor "Generate plan" = 0 tasks; `qf_task_list` all `envoy_task_id`/`envoy_space_id` on `Cursor Collab` + `phase6-*` canvases.
- **Proposed scope:** decide the bridge — either route the Envoy task ops through Kernel task commands, or expose Kernel tasks via MCP (`kernel.task.*` adapter), so one task authority drives the live app. Likely the next major build plan.
- **Layer(s):** kernel, mcp adapter, conductor — **Priority:** high — **Status:** captured

#### MCP surface exposes no v3 Kernel reads (MEDIUM-HIGH)
- **Problem:** MCP has no `kernel.canvas.snapshot` / `state_card` / `workflow.region` / `eval` read. An external agent can't see v3 truth via MCP — only Envoy + raw canvas/tile ops.
- **Proposed scope:** add read-only Kernel query tools to `tools/quantflow-mcp` (snapshot, state cards, regions, receipts, evals).
- **Layer(s):** mcp adapter, kernel/queries — **Priority:** medium-high — **Status:** captured

#### MCP cable create sets legacy kind, not v3 semantic_type (MEDIUM)
- **Problem:** `quantflow_cable_create` returns `"kind":"relay"` (v2), not a Goal 7 `semantic_type`. Semantic strings are only settable in the in-app cable inspector. So agents can't create delegation/verification/etc. strings via MCP.
- **Proposed scope:** add `semanticType` to `quantflow_cable_create` (+ an update tool) routing through `kernel.connection.create/update`.
- **Layer(s):** mcp adapter, kernel/connections — **Priority:** medium — **Status:** captured

#### herdr-wsl worker spawn fails with UNC cwd error (HIGH for real agents)
- **Problem:** spawning real Codex/Claude WSL workers fails — *"windows-node-proxy UNC current-directory error from WSL"* — blocking the intended "Conductor delegates to a real agent" path. Only `shell` (windows-pty) workers spawn reliably.
- **Evidence:** multiple past Envoy task `result_summary`s report the UNC roleSpawn failure; this session used `shell` to avoid it.
- **Proposed scope:** fix the WSL working-directory handling in the role-spawn/herdr path (normalize UNC → drive path, or set a valid cwd before launch).
- **Layer(s):** harness/herdr, main spawn path — **Priority:** high — **Status:** captured

### Dogfooding findings — session 2 (2026-06-17)

- **Electron `window.prompt()` is dead → operator inputs silently no-op (PARTIALLY FIXED).** Conductor Create task / Spawn worker did nothing because `window.prompt()` returns null in Electron. Fixed in `conductor-panel.js` with an inline input (`83b0c1d`). **Remaining:** the same dead pattern is still in `cable-inspector.js`, `cable-overlay.js`, and `tile-renderer.js` (cable label, tile excerpt). Scope: replace all remaining `prompt()` calls with the inline-input helper. Priority: medium. Status: partially fixed.
- **MCP-spawned tiles do not survive a window reload (MEDIUM).** Tiles created via `quantflow_role_spawn` (Coder/Verifier) vanished after Ctrl+R — they weren't in the persisted canvas state, so "Assign next" found no tile. Scope: persist MCP-spawned tiles into canvas state (or restore from Kernel on reload). Priority: medium.
- **Positive:** Conductor "Spawn worker" → `spawn_role` spawned a real herdr-wsl Hermes agent that came up `running`. So WSL agent spawn is NOT universally broken (revises the earlier UNC finding — that failure looks codex-spawn/intermittent specific, not all WSL). The blocker for *real autonomous work* is now agent-side: CLI auth (codex) + operator usage limits, not the spawn path.
- **Note:** proving the v3 Kernel task spine does not require a working agent — Create/Assign/Submit/Verify are operator-driven Kernel commands. Real-agent execution is a separate axis (auth + usage + herdr).

### Dogfooding findings — session 2 (cont.)

- **Misleading "Assign" message (LOW, quick fix).** Conductor "Assign next" shows *"Assign: need an open task and a tile"* even when the task is already assigned/working — because the handler only looks for an `open` task and reports the generic message when none is found. It reads as a failure. Fix: distinguish "no open task (current task already working — use Submit)" from "no worker tile". Confirmed live: receipts showed `task_created/claimed/started` (task was working) while the message implied assign failed. Layer: shell/conductor-panel. Priority: low.
- **New role request: Antigravity CLI (`agy`) transcriber (MEDIUM, operator-requested).** Add Antigravity (Gemini-backed, herdr-wsl) as a spawn-rail role. Purpose: transcribe YouTube/"alpha" videos into vault files that other agents then process. Scope: add a role definition (id `antigravity`, command `agy`/`antigravity`, runtimeTarget herdr-wsl, icon/color, startup prompt) to the role registry so it appears in the QF Dock spawn rail; optionally a vault output convention for transcripts. Layer: role registry/config (+ optional vault path). Priority: medium. Status: captured.

## Promotion checklist (when an item graduates)

1. Operator decides it's worth a goal.
2. Write it up in `BUILD_PLAN_V3.md` with Goal/Why/Repo scope/Out of
   scope/Acceptance/Failure signals (the standard goal shape).
3. Confirm it respects the Kernel Constitution (no new authority outside the
   Kernel; canvas stays a projector; evals/vault stay derived/mirror).
4. Mark the item here as `promoted to BUILD_PLAN_V3 (Goal N)`.
5. Authorize and build under the normal worker/verifier protocol.
