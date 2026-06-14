# QuantFlow Simplified Plan

Status: operator working plan  
Created: 2026-06-08  
Updated: 2026-06-12  
Repo source of truth: `C:\Users\rybow\QuantFlow\CONCEPT.md` then `C:\Users\rybow\QuantFlow\BUILD_PLAN_V2.md`  
Vault pairing: `C:\Users\rybow\QuantFlow\VAULT.md` and vault `QuantFlow Goal Sessions.md`

This note exists to keep QuantFlow focused on the one thing that matters first:

> Agents must be able to delegate a task to another agent, end to end, without the operator manually carrying the work between them.

Everything else waits until that spine is stable.

## The Simple Product

QuantFlow is a canvas where persistent agent terminals can see each other, declare relationships with cables, route task work through a durable bus, and leave proof that the task happened.

The operator watches the board and intervenes when needed. The agents do the handoff.

## The One Proof Loop

The first real win is not a perfect platform. It is one boring, repeatable delegation loop:

```text
Hermes receives or notices work
-> Hermes sees Codex is available
-> Hermes creates a task in Envoy
-> Codex claims the task
-> Codex performs the work
-> Codex posts result and receipt
-> Hermes reads the proof
-> Obsidian shows the task state and receipt
-> QuantFlow shows the agent/cable state
```

That is the north star. If a change does not help prove this loop, it is probably not current work.

## Mandatory Tools

Keep the mandatory tool stack small:

| Tool | Job |
| --- | --- |
| herdr | Persistent WSL agent sessions that survive and reconnect. |
| PTY attach | Real terminal display and input for herdr panes. |
| QuantFlow canvas | Tiles, cables, visual state, and operator control. No process truth. |
| MCP on `127.0.0.1:9811` | Agent access to canvas tools and state. |
| Canvas context injection | Spawned agents know their tile, canvas, cables, available tools, and rules. |
| Envoy | Durable task bus, claims, receipts, evidence, and proof. |
| Obsidian | Human-readable operator board and durable notes. Not the lock manager. |

## Hard Architecture Rules

- `CONCEPT.md` and `BUILD_PLAN_V2.md` are the repo authorities.
- This note is an operator simplification guide, not a replacement repo authority.
- One coding slice at a time.
- Envoy is the source of truth for task state.
- Obsidian mirrors Envoy and lets the operator create tasks, but agents do not use markdown files as the lock manager.
- Cables declare allowed task flow and operator intent. Cables are not the durable message transport.
- MCP remains the agent-to-tool surface.
- Dumb tiles do not receive Envoy credentials. Watchers or main-process services post on their behalf.
- No A2A, Agent Cards, HTTP delegation, custom string relay revival, or pane-read display path.

## Current Truth (2026-06-12)

Branch: `quantflow-v2`

**Foundation shipped:** Gate 2 spawn/PTY, Gate 3 `events.subscribe`, herdr socket retirement, Envoy task bus MVP, Obsidian mirror, Run Workflow → Hermes activation, relay token + herdr bootstrap.

**Session shipped (uncommitted):** canvas perf transform layer, relay breadcrumb ownership fix, cable SVG `[hidden]` fix, agent QA (`TESTING.md`, CDP port), idle PTY close without nag, spawn `displayName` + MCP tile fields.

**Trial 2026-06-11:** Hermes claim/Envoy OK. Codex spawned without worker context; handoff via `terminal_write`. Relay flaky mid-run — likely breadcrumb wipe (fixed in code; WSL re-trial required).

**Active gap:** worker spawn ≠ worker activation at the *trial* level — spawn activation code is wired; phase-6 canvas trial not yet passed.

**Current slice:** `delegation-phase-6`

**Pass when:** Hermes `qf_task_create` → Codex claims via MCP → `qf_task_complete` → receipt chain in Envoy/Obsidian; no `terminal_write` handoff; WSL breadcrumb proof on Electron restart.

## Build Path (honest priority stack)

One slice at a time. Full checkboxes live in `BUILD_PLAN_V2.md`.

| Order | Slice | Why now |
| --- | --- | --- |
| **1** | `delegation-phase-6` | Prove Hermes → Codex without operator paste — the north star |
| **2** | `spawn-ux` | Optimistic tile + lifecycle strings — friction from real spawn waits |
| **3** | `orchestration-snappiness` | Persistent relay socket + Envoy worker — kills per-call 30s tax |
| **4** | `mission-rehydration` | `qf_mission_brief` + stale-claim reaper — long-horizon Hermes |
| **5** | `product-polish` | Toasts, status badges, claim-aware close, first-run screen |
| **6** | `envoy-evidence-2` | Dumb-tile watcher receipts, vault pins, cable → receipt proof |
| — | **Moat (parked)** | DuckDB `qf_query`, SkillOpt, trajectories, Jesse, Obsidian Bases, task trees |

**Naming:** `correlation_id` = internal chain. `tileId` / `herdrPaneId` = tool addresses. Title bar = `displayName`. Agents call `quantflow_tile_list` and use returned ids.

**Professional floor (done or in flight):** relay token + loopback bind, CI/typecheck — do not reopen unless audit finds regression.

**Friction log practice:** use the canvas; log annoyances; let usage rank slices after phase 6 — do not speculate past the Build Path without evidence.

## Execution Sequence (reference)

Phases 0–7 below are the operator narrative. **Slice order above wins** when they disagree.

### Phase 0: Scope Lock

Goal: prevent drift before more code lands.

Already established:

- `CONCEPT.md` defines what QuantFlow is.
- `BUILD_PLAN_V2.md` is the only repo execution plan.
- Archived 7-layer charters are reference only.
- Obsidian v1 build plans are not execution source for v2.

Agent instruction:

```text
Read CONCEPT.md, then BUILD_PLAN_V2.md.
Use this note only to understand the simplified agent-communication goal.
If the task is outside the current repo slice, ask before coding.
```

Pass when:

- Agents stop using old layer docs as active plans.
- Agents can state the current slice before editing files.

### Phase 1: Live Herdr State — SHIPPED

Goal: QuantFlow knows tile status from herdr events, not polling.

Why it matters:

Autonomous delegation needs truthful availability. Hermes cannot delegate to Codex if QuantFlow is guessing whether Codex is alive.

Likely files:

- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\herdr-socket-bridge.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\ipc-herdr.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\status-repo.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\events-repo.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\preload\shell.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\windows\shell\src\renderer.js`

Required work:

- Add a long-lived herdr `events.subscribe` stream in Electron main.
- Keep one-shot socket RPCs separate from streaming subscriptions.
- Normalize herdr events into QuantFlow runtime events.
- Send status updates to the shell renderer.
- Remove or disable the 5-second `herdrGetStatus` loop.
- Preserve native Windows PTY fallback.

Proof:

```text
Spawn a herdr-backed tile.
Trigger a status change.
Tile badge updates from socket event.
Renderer is not polling herdr:status every 5 seconds.
Windows-only PTY tile still works.
Herdr socket restart does not crash the app.
```

### Phase 2: Socket-Only Herdr Runtime — SHIPPED

Goal: remove the remaining legacy CLI bridge from active runtime paths.

Why it matters:

Delegation depends on stable session identity. Mixed socket and CLI ownership creates false state.

Likely files:

- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\herdr-bridge.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\herdr-socket-bridge.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\herdr-session-spawn.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\ipc-herdr.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\ipc-herdr-spawn.ts`

Required work:

- Port `herdr:available`, `herdr:list`, and `herdr:send` to socket.
- Decide whether `herdr:status` still exists after Phase 1.
- Keep `herdr:read` only as a debug path if needed.
- Delete or quarantine `herdr-bridge.ts` in a dedicated retirement commit.
- Fix Windows test harness issues around local Unix sockets vs WSL socket routing.

Proof:

```text
No active code imports herdr-bridge.ts.
WSL/herdr operations use socket APIs.
PTY attach remains the display path.
No pane-read polling becomes display.
```

### Phase 3: Agent Context Contract — mostly shipped; activation trial = slice 1

Goal: every spawned agent knows enough to participate in delegation.

Why it matters:

Agents cannot autonomously coordinate if they do not know who they are, where they are, what tools exist, and which cables define allowed work flow.

Likely files:

- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\context-service.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\canvas-rpc.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\tile-capabilities-repo.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\connections-repo.ts`
- `C:\Users\rybow\QuantFlow\tools\quantflow-mcp\tool-definitions.js`
- `C:\Users\rybow\QuantFlow\tools\quantflow-mcp\server.js`
- `C:\Users\rybow\QuantFlow\quantflow-electron\packages\collab-canvas-skill\skills\collab-canvas\SKILL.md`

Each agent boot context should include:

- `canvas_id`
- `tile_id`
- `agent_name`
- `runtime_target`
- `herdr_pane_id` when applicable
- visible cables connected to the tile
- allowed target tiles for delegation
- MCP endpoint and tool list
- Envoy space identity when Envoy is enabled
- rule: claim/update/complete tasks through Envoy, not markdown
- rule: ask operator only when blocked or outside scope

MCP tools needed before Envoy:

- list tiles
- inspect current tile
- list cables
- create/remove cable
- read canvas state
- write terminal input when allowed
- record context decision

MCP tools needed with Envoy:

- list tasks
- create task
- claim task
- update task
- complete task
- block task
- list receipts
- watch current Envoy space

Proof:

```text
Spawn Hermes and Codex.
Each agent can report its own tile id.
Each agent can list connected cables.
Each agent can see MCP tools.
Hermes can identify Codex as an allowed delegation target only when a cable exists.
```

### Phase 4: Envoy Task Bus MVP — SHIPPED

Goal: Envoy becomes the durable place where agent work is created, claimed, updated, completed, and proven.

Why it matters:

This is the actual communication spine. Envoy replaces fragile string-message relay behavior with structured task state and receipts.

Use archived Layer 4 as reference, but remove the old A2A dependency.

Likely files to add or touch:

- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\envoy-service.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\ipc-envoy.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\tasks-repo.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\events-repo.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\connections-repo.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\migrations\*.sql`
- `C:\Users\rybow\QuantFlow\tools\quantflow-mcp\tool-definitions.js`

Minimum Envoy task shape:

```text
task_id
canvas_id
envoy_space_id
source_tile_id
target_tile_id
connection_id
correlation_id
title
instruction
acceptance_criteria
status
claimed_by
created_at
updated_at
result_summary
receipt_ids
artifact_paths
```

Minimum task states:

```text
inbox -> ready -> claimed -> working -> review -> done
                                  -> blocked
                                  -> failed
```

Required work:

- Create or attach one Envoy space per canvas.
- Persist the active Envoy space identity.
- Add main-process Envoy listen/post service.
- Normalize Envoy packets into runtime events.
- Add claim semantics so two agents cannot own the same task at the same time.
- Add receipts for create, claim, update, complete, block, and fail.
- Keep Envoy credentials/config in main process or trusted tooling only.

Proof:

```text
Create one task in Envoy.
Codex claims it.
A second agent cannot claim the already-claimed task.
Codex posts progress.
Codex completes it.
Receipts exist for create, claim, progress, complete.
Runtime events share one correlation_id.
```

### Phase 5: Obsidian Operator Board

Goal: Obsidian shows the work clearly, without becoming the primary task lock.

Why it matters:

You need to see the whole board, add context, and review what happened. Agents need durable context. Envoy still owns task state.

Vault location:

```text
C:\Users\rybow\Obsidian\Cursor Collab\
```

Recommended board structure:

```text
Projects/QuantFlow/
  Board.md
  Envoy/
    Tasks/
      qf-task-*.md
    Receipts/
      qf-receipt-*.md
    Agents/
      hermes.md
      codex.md
    Canvases/
      main.md
```

Likely files to add or touch:

- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\obsidian-envoy-mirror.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\ipc-vault.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\context-service.ts`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\main\runtime-state\events-repo.ts`

Obsidian task note shape:

```markdown
---
task_id:
canvas_id:
envoy_space_id:
status:
priority:
source_tile_id:
target_tile_id:
connection_id:
correlation_id:
claimed_by:
updated_at:
---

# Task title

## Instruction

## Acceptance Criteria

## Progress

## Receipts

## Result
```

Required work:

- Mirror Envoy task updates into markdown notes.
- Mirror Envoy receipts into receipt notes or receipt sections.
- Generate a board note grouped by status.
- Let the operator create an inbox markdown task that can be imported into Envoy.
- Mark imported operator notes with the Envoy task id to avoid duplicates.

Proof:

```text
Operator creates one inbox note in Obsidian.
Importer creates one Envoy task.
Codex claims and completes the task through Envoy.
Obsidian note updates to done.
Receipt is visible in the note.
No agent needed to edit markdown to claim the task.
```

### Phase 6: Autonomous Delegation MVP — CURRENT (`delegation-phase-6`)

Goal: prove that one agent can delegate to another from start to finish.

Scenario:

```text
Hermes tile and Codex tile exist.
A cable exists from Hermes to Codex.
Hermes receives a small task.
Hermes creates an Envoy task targeted to Codex with the cable id.
Codex discovers eligible task through MCP/Envoy.
Codex claims the task.
Codex performs the requested work.
Codex posts result and receipt.
Hermes reads the result/proof.
Obsidian shows the chain.
QuantFlow shows live tile state.
```

Minimum test task:

```text
Create or update a tiny markdown file with a requested sentence, then report the changed file path and proof receipt.
```

Acceptance criteria:

- Hermes does not paste the task manually into Codex.
- Codex does not claim work by editing Obsidian markdown.
- Envoy stores the task state and receipts.
- Obsidian mirrors the final status.
- Cables constrain delegation target selection.
- The task has one `correlation_id` from creation to completion.
- Failure and blocked states are visible if Codex cannot complete the task.

Proof artifact:

```text
task_id:
connection_id:
correlation_id:
envoy_space_id:
source_tile:
target_tile:
receipt_ids:
obsidian_task_note:
result_file_or_artifact:
```

### Phase 7: Watchtower and Visual Proof — slice 6 (`envoy-evidence-2`) + polish

Goal: make the proof readable inside QuantFlow after the underlying task loop works.

Do not start full Watchtower evolution before Phase 6 passes.

Likely files:

- `C:\Users\rybow\QuantFlow\quantflow-electron\src\windows\shell\src\watchtower-view.js`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\windows\shell\src\cable-inspector.js`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\windows\shell\src\tile-renderer.js`
- `C:\Users\rybow\QuantFlow\quantflow-electron\src\windows\shell\src\shell.css`

Required work:

- Show herdr state events.
- Show Envoy task events.
- Show receipt chain by `correlation_id`.
- Show selected cable history.
- Show blocked/failed states clearly.

Proof:

```text
One Hermes -> Codex delegated task appears as a single correlation chain.
The chain includes create, claim, working/progress, complete, and receipt.
```

## What Is Frozen

Freeze these until the autonomous delegation MVP passes:

- Full visual redesign implementation.
- Watchtower redesign beyond proof visibility.
- RL templates.
- Factory Droid.
- External QA loop.
- Cross-machine Envoy.
- Multi-agent routing beyond one Hermes -> one Codex path.
- Memory/context tile type.
- Advanced legend cleanup.
- Any new architecture docs or layer charters.

## What Is Rejected

Do not bring these back:

- A2A.
- Agent Cards.
- HTTP agent delegation.
- Custom string relay cluster.
- `pane.read` as display.
- Direct herdr socket to xterm.
- Direct `envoy-stub` as final behavior.
- Obsidian markdown as the task lock manager.
- Parallel GoalBuddy layer execution.

## Agent Handoff Prompt

Use this when handing the next implementation slice to an agent:

```text
You are working in C:\Users\rybow\QuantFlow on branch quantflow-v2.

Read CONCEPT.md first.
Read BUILD_PLAN_V2.md second.
Use C:\Users\rybow\Obsidian\Cursor Collab\QuantFlow Simplified Plan.md only as the operator simplification guide.

Current slice: delegation-phase-6 (see Build Path in BUILD_PLAN_V2.md).
Do not skip to spawn-ux, snappiness, or moat until phase 6 passes.

Long-term proof:
Hermes creates a task for Codex through Envoy, Codex claims and completes it, Hermes reads the proof, Obsidian mirrors the board, and QuantFlow shows the live state.

Rules:
- Envoy owns task state.
- Obsidian mirrors task state and operator context.
- Cables declare allowed work flow.
- MCP is the agent tool surface.
- No A2A.
- No custom string relay revival.
- No pane-read display.
- One coding slice at a time.
```

## Operator Checklist

Before starting a coding session:

1. Confirm branch `quantflow-v2`.
2. Confirm worktree state.
3. Read `CONCEPT.md`.
4. Read `BUILD_PLAN_V2.md`.
5. Read Build Path order in this note or BUILD_PLAN_V2.md.
6. Confirm current slice is `delegation-phase-6` unless operator changed it.
7. Name the pass proof before coding.
8. Reject work outside the active slice unless intentionally changing scope.

Before accepting a handoff:

1. Check exactly which files changed.
2. Check whether the change matches the active phase.
3. Check whether tests or manual proof match the phase proof.
4. Check that no rejected path was reintroduced.
5. Check that Obsidian did not become a second build plan.

## The Short Version

Build the spine:

```text
stable herdr agents
-> truthful live status
-> clear agent context
-> Envoy task bus
-> Obsidian board mirror
-> Hermes delegates to Codex
-> Codex completes
-> proof is visible
```

Then, and only then, add the larger platform features.
