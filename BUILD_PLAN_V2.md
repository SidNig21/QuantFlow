# QuantFlow v2 Build Plan

This is the single working file for QuantFlow v2.

Read `CONCEPT.md` first for the product definition. After that, work from this file only.

The archived 7-layer charters in `reference/archive/quantflow-v2-layer-charters/` are reference material, not an execution path. They are mapped below so useful thinking is not lost, but they do not control scope.

## Current Truth

Branch: `quantflow-v2`

Date: 2026-06-12

**Shipped (spine):** Gate 2 spawn/PTY, Gate 3 `events.subscribe`, herdr socket retirement, Envoy task bus MVP, Obsidian mirror, Run Workflow → Hermes activation, relay token + herdr bootstrap.

**Shipped (2026-06-12 session — commit before handoff):**

- Canvas perf: single-transform tile layer, rAF-coalesced viewport, pattern grid (Figma/tldraw render model).
- Relay breadcrumb ownership: dying instance no longer deletes live `relay-token` / `socket-path` (root cause of mid-run `ECONNREFUSED` on dev restart).
- Cable SVG: `[hidden]` enforced on cable-layer (false red `!` badges were a render bug, not Envoy failures).
- Agent QA: `TESTING.md`, opt-in `QUANTFLOW_DEBUG_PORT` for `agent-browser` CDP.
- PTY close: no confirm dialog for idle tiles (claim-aware confirm deferred to product-polish slice).

**Trial result 2026-06-11:** Hermes claim/Envoy OK. Codex spawned but no worker context on spawn. Handoff via `terminal_write` only. Relay flaky mid-run — **likely breadcrumb wipe (fixed); WSL-path proof still required on re-trial.**

**Trial result 2026-06-12 (Session 0): PASS.** Full autonomous loop on canvas (`corr-phase6-mqakzoyx`): operator parent task → Hermes claim → Hermes `qf_task_create` child → Codex worker spawned with workflow context → Codex `qf_task_claim` → `qf_task_complete` → Hermes read receipts and completed parent. No `terminal_write` handoff. 14 receipts on one correlation_id; chain mirrored to Obsidian task-board. WSL proof: `qf_task_list` from WSL MCP OK (direct TCP 9811 refused from WSL2 — windows-node-proxy fallback is the working path). `smoke:envoy-task` green. Observed glitches: (1) Hermes's first Codex spawn died with `pty:create` error 267 (invalid cwd, Windows ERROR_DIRECTORY) — visible only on the tile face, not in receipts; Hermes failed the mis-targeted child and retried successfully. (2) `smoke:phase6` client had a hard-coded 20s RPC timeout — too short for `canvas.roleSpawn` and busy-relay `envoy.taskCreate`; raised to 60s default / 180s for roleSpawn.

**Active gap:** worker spawn ≠ worker activation. **Closed 2026-06-12** — Codex claimed via MCP from spawn context alone.

**Current slice:** `delegation-phase-6`

**Pass when:** Hermes `qf_task_create` → Codex claims via MCP, no `terminal_write` handoff, receipt chain visible in Envoy.

**Not current:** legend cleanup, full redesign, RL infra, DuckDB/SkillOpt/trajectory moat (see Build Path).

Earlier gates (reference): Gate 1 ping (`f72c0b4`), v1 relay retirement (`6961506`), spawn unify (`de9c497`), docs collapse (`147cabb`).

## Build Path

Ordered execution after 2026-06-12 findings. **One slice at a time.** Do not skip ahead without operator approval.

| Order | Slice | Goal | Unblocks |
| --- | --- | --- | --- |
| **1** | `delegation-phase-6` | Spawn activation + phase-6 trial pass | Autonomous Hermes → Codex delegation |
| **2** | `spawn-ux` | Optimistic tile + lifecycle status from existing events | Perceived speed at spawn |
| **3** | `orchestration-snappiness` | Persistent relay socket; batch/queue Envoy CLI behind long-lived worker | Orchestration latency |
| **4** | `mission-rehydration` | `qf_mission_brief` MCP tool; stale-claim reaper | Multi-session / long-horizon Hermes |
| **5** | `product-polish` | Failure toasts, tile status badges, claim-aware close, first-run checks | Shippable feel (not phase-6 pass) |
| **6** | `envoy-evidence-2` | Dumb-tile watcher receipts, vault pins, cable → receipt proof | Full evidence loop |
| — | **Moat (parked)** | DuckDB `qf_query`, SkillOpt, trajectory JSONL, Jesse→Pi-Calculator, Obsidian Bases, `parent_task_id` trees | Differentiation after spine proves |

**Naming model (all slices):** `correlation_id` = internal task chain (opaque). `herdrPaneId` / `tileId` = stable addresses for tools. Title bar = friendly `displayName` (e.g. `Codex`, `Codex (2)`). Agents: `quantflow_tile_list` → use returned ids, never type display names from memory. Fold spawn-time naming into slice 1 where small.

**Phase-6 trial checklist (include WSL proof):**

1. Start QuantFlow on Windows; confirm `~/.quantflow/relay-token` and `socket-path` exist.
2. From WSL, Hermes MCP (or relay client): one cheap call (`qf_task_list`).
3. Restart Electron dev instance while WSL client config unchanged.
4. Retry same call from WSL without re-reading breadcrumbs — must not `ECONNREFUSED`.
5. Run delegation trial: Hermes `qf_task_create` → Codex `qf_task_claim` via MCP → `qf_task_complete` → receipts + Obsidian mirror.
6. `bun run smoke:envoy-task` still passes.

## Current Slice

### delegation-phase-6

Goal: prove autonomous delegation — Hermes creates a child task in Envoy, Codex claims and completes via MCP, without the operator or Hermes pasting into Codex’s terminal.

Do this now:

- [x] **Spawn activation (code):** `workflowTaskId` / `workflowCorrelationId` / `workflowEnvoySpaceId` already wire MCP → `canvas.roleSpawn` → `herdr:spawn-role` → `postLaunchPrompt` or Codex worker command (`ipc-herdr-spawn.ts`). Canvas skill documents the delegation order.
- [x] **Tile naming:** auto `displayName` at spawn (role + counter); `displayName` / `tileId` / `herdrPaneId` in `quantflow_tile_list`.
- [x] Hermes uses `qf_task_create` with `sourceTileId`, `targetTileId`, parent `correlation_id`, and full instruction.
- [x] Codex discovers and claims the child task via `qf_task_list` / `qf_task_claim` (MCP), not markdown and not `terminal_write`.
- [x] Codex completes with `qf_task_complete`; receipts share one `correlation_id`.
- [x] Hermes reads proof via `qf_task_list` / `qf_receipt_list` or Envoy mirror — not terminal echo as success signal.

Pass when:

- One canvas trial (checklist above, including WSL breadcrumb proof).
- No `terminal_write` handoff required for the worker to start work.
- `bun run smoke:envoy-task` still passes.

Known landmines:

- WSL Hermes MCP → Windows relay: was intermittent `ECONNREFUSED` — breadcrumb fix landed; **verify on WSL re-trial**.
- UNC cwd on `rpc-once.js` from WSL may still bite; prefer Windows-side MCP for QA if needed.
- Codex TUI: `terminal_write` may compose without submitting; verify with tile read.
- `quantflow_role_spawn` with a bad/WSL-path `cwd` → tile shows `pty:create` error 267 (invalid directory) but no receipt/event records it — diagnose visually on the tile face until product-polish lands spawn-failure surfacing. Spawning agents should pass a Windows cwd or omit it.

Task bus reference:

- `bun run smoke:envoy-task` — automated Envoy task loop proof.
- `bun run smoke:phase6` (from `tools/quantflow-mcp`) — scripted spawn + task chain smoke.
- Agent tools: `qf_envoy_space_status`, `qf_task_list`, `qf_task_create`, `qf_task_claim`, `qf_task_update`, `qf_task_complete`, `qf_task_block`, `qf_task_fail`, `qf_receipt_list`, `qf_envoy_watch`.
- See `ENVOY.md` for the task state model and example tool calls.
- Canvas tile playbook: vault `Projects/QuantFlow/QUANTFLOW_CANVAS_SKILL.md`.
- Agent QA: repo `TESTING.md` (`agent-browser` + MCP relay).

## Next Slices (after phase 6 passes)

### spawn-ux

- [ ] Render tile optimistically on spawn click.
- [ ] Status line from existing lifecycle events (`envoy-spawn-lifecycle`, Gate 3): Spawning pane → Connecting herdr → Envoy space → Ready.

### orchestration-snappiness

- [ ] Persistent MCP relay socket (reduce per-call TCP + `rpc-once.js` spawn tax).
- [ ] Envoy CLI: single long-lived worker or batched calls (30s WSL shell per op is the perceived “forever”).

### mission-rehydration

- [ ] `qf_mission_brief` MCP tool: open tasks, recent receipts, blocked items, last decisions for one `correlation_id` or canvas.
- [ ] Stale-claim reaper: claimed task with no receipt activity for N minutes → release to `ready` + Watchtower event.

### product-polish

- [ ] Visible toasts/banners on relay down, Envoy timeout, spawn failure (retry affordance).
- [ ] Tile status badges from Gate 3 pane state (running / working / blocked / dead).
- [ ] Close confirm only when tile holds active Envoy claim (idle tiles close instantly).
- [ ] Crash recovery: layout persist + reattach to surviving herdr panes on relaunch.
- [ ] Empty canvas + first-run dependency screen (herdr, WSL, Envoy, vault path).
- [ ] Docs/UI: consistent `herdr` spelling (grep and fix).

### envoy-evidence-2

- [ ] Let watchers post receipts for dumb tiles (no Envoy credentials on tile).
- [ ] Wire Obsidian vault context pins and handoff paths to Envoy evidence.
- [ ] Prove one cable action creates one receipt visible in Watchtower or vault note.

## Completed Slices

### canvas-perf (2026-06-12)

- [x] Single-transform `#tile-layer`, rAF-coalesced pan/zoom, pattern grid, throttled status/edge chrome.

### relay-breadcrumb-ownership (2026-06-12)

- [x] `stopJsonRpcServer` deletes breadcrumbs only when this instance still owns the file contents.

### agent-qa-layer (2026-06-12)

- [x] `TESTING.md`, `QUANTFLOW_DEBUG_PORT` for CDP QA.

### cable-svg-hidden (2026-06-12)

- [x] `#cable-layer [hidden] { display: none }` — error/glow/flow badges respect relay state.

### Gate 3: Live tile state from herdr socket events

- [x] Long-lived `events.subscribe`, normalization, renderer push, status persistence, tests.
- [x] Removed 5s `herdrGetStatus` polling loop from renderer.

### retirement-herdr-cli

- [x] Socket-only herdr ops; `herdr-bridge.ts` retired; `herdr:read` debug-only.

### envoy-obsidian (5a + 5b)

- [x] Envoy space per canvas, listen/post bridge, task CRUD + claim locking, MCP tools, `ENVOY.md`.
- [x] Obsidian live mirror, `envoyProfile` on roles, spawn lifecycle posts.

## Not Current

These are not current work:

- Legend palette cleanup.
- RL template isolation and Commence workflow.
- Watchtower full redesign (stale-claim reaper is slice 4, not full redesign).
- Full V2 visual redesign implementation.
- Memory/context tile type.
- External QA loop / Factory Droid (local `agent-browser` QA is done; cloud loops later).
- Tennis vision.
- RL infra / GRPO training pipeline.
- **Moat (parked):** DuckDB `qf_query`, SkillOpt on canvas skill, trajectory JSONL watcher factory, Jesse indicators in Pi-Calculator, Obsidian Bases per-task board, `parent_task_id` task trees (RAO pattern).

## Rejected

Do not implement:

- A2A.
- Agent Cards.
- HTTP agent delegation (local HTTP control API deferred; `agent-browser` + MCP relay is the QA path).
- Custom string relay cluster.
- `pane.read` as display.
- Direct `herdr-client.sock` to xterm.
- Direct `envoy-stub` calls.
- Parallel GoalBuddy layer execution.
- Vault `Projects/QuantFlow/Build Plan.md` and `Start Here.md` as execution source.
- New build-plan layers unless the operator explicitly asks.
- Bundling `qf_mission_brief` implementation with phase-6 spawn patch (different pass criteria; keep PRs bisectable).

## Archived 7-Layer Map

The old layer charters are useful as a memory palace, not as a plan.

| Archived layer | New status |
| --- | --- |
| Layer 1, Visual Canvas | Perf transform layer done. Further visual polish → product-polish / not current redesign. |
| Layer 2, Process Runtime Herdr | Done for current spine (`events.subscribe`, socket retirement). Reference for future herdr work. |
| Layer 3, Communication A2A + MCP | A2A is rejected. MCP on port 9811 stays. Correlation/runtime-state ideas may survive without A2A. |
| Layer 4, Shared Memory Envoy | `envoy-obsidian` done; Bases per-task board parked in moat. |
| Layer 5, Legend Palette + Templates | Not current. Later: role config, templates, Commence cleanup. |
| Layer 6, Watchtower | Stale-claim reaper is slice 4. Full evolution not current. |
| Layer 7, External QA Loop | `TESTING.md` + agent-browser done locally. Cloud/tunnel QA later. |

## Vault pairing

Repo code and Obsidian vault are **two workspaces**; agents with both should use each for its role.

| Workspace | Root | Authority |
| --- | --- | --- |
| **Repo** | `C:\Users\rybow\QuantFlow` | This file + `CONCEPT.md` + `ENVOY.md` + `TESTING.md` |
| **Vault** | `C:\Users\rybow\Obsidian\Cursor Collab` | `QuantFlow Goal Sessions.md`, canvas skill, Envoy mirror, vision docs |

Full cross-map: repo `VAULT.md`. Vault archived: `Projects/QuantFlow/Build Plan.md`, `Start Here.md`.

## Operator Checklist Before Any Coding Session

1. Confirm branch is `quantflow-v2`.
2. Read `CONCEPT.md`.
3. Read this file — check **Build Path** order and **Current Slice**.
4. If using Claude Code goals, check vault `QuantFlow Goal Sessions.md` for session number.
5. If the requested work is not the current slice, ask before coding.
6. Commit before handoff.

## Agent Handoff

Use this block for coding agents:

```text
Branch quantflow-v2.
Read CONCEPT.md, then BUILD_PLAN_V2.md.
BUILD_PLAN_V2.md is the only execution plan.
Paired vault: C:\Users\rybow\Obsidian\Cursor Collab — see repo VAULT.md.
Vault ladder: QuantFlow Goal Sessions.md. Tile agents: Projects/QuantFlow/QUANTFLOW_CANVAS_SKILL.md.
Vault Build Plan.md and Start Here.md are ARCHIVED — do not execute.
Current slice: delegation-phase-6 (see Build Path — do not skip to moat or polish).
Pass when: spawn activation wired; Hermes qf_task_create → Codex claims via MCP;
  no terminal_write handoff; receipt chain in Envoy; WSL breadcrumb proof on re-trial.
Active gap: worker spawn ≠ worker activation.
Next after pass: spawn-ux → orchestration-snappiness → mission-rehydration → product-polish.
Moat (DuckDB, SkillOpt, trajectories): NOT CURRENT.
Agent QA: TESTING.md. Do not execute archived layer charters or reference/archive/ as a plan.
No A2A. No string relay revival. pane.read display is rejected.
One executor at a time. Commit before handoff.
```
