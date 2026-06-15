# src/main/conductor — Agent Guide

The Conductor is the native in-process planner for QuantFlow v3.

## What This Subtree Owns

- Conductor loop (Goal 5D — built; see below).
- Native Kernel tool bindings used by the Conductor.
- Conductor prompt templates.
- Model provider abstraction (routes to Cloudflare AI Gateway, OpenRouter, direct API, local, etc.).
- Conductor tile data feed (what the canvas displays on the Conductor tile).

### Built (Goal 5A — read-only)

- `conductor-reader.ts` — embedded reader: gathers Kernel context via the read tools, runs the model provider, assembles the Conductor view; `runConductorPlan` appends one planning receipt (its only write).
- `conductor-tools-readonly.ts` — in-process native tool surface (read tools + `postPlanningReceipt` + `focusTile` nav + `requestHumanApproval`). No spawn/assign/verify/block tools exist until Goal 5C.
- `model-provider.ts` — `ConductorModelProvider` interface + deterministic, no-network `manualModelProvider`. Real MiniMax/OpenRouter providers plug in at Goal 5C+.
- `prompts/planning.ts` — planning prompt contract.
- `conductor-ipc.ts` — `conductor:read-view` / `conductor:run` / `conductor:action` / `conductor:loop-step` IPC to the renderer tile.

### Built (Goal 5D — approval-gated loop)

- `conductor-planner.ts` — `proposeNextAction(context)`: deterministic, no-memory
  policy → one `ActionProposal` (or pause). Flags high-risk actions
  (spawn_role/verify_task/reject_task/block_task) for approval; pauses on
  blockers/ambiguity.
- `conductor-loop.ts` — `createConductorLoop(deps).step({approve,proposalToken,override})`:
  read context → propose → approval gate → execute one action via the 5C/6
  seams → decision receipt → pause/continue. STATELESS (reads the Kernel each
  step; no hidden memory). Default is operator-advanced, not autonomous; only a
  low-risk success reports `canContinue`. High-risk approvals are bound to the
  exact proposal shown by a `proposalToken`; the latest Kernel planning receipt
  for that token must still be `awaiting-approval`, or the loop returns `stale`
  and runs no high-risk action. Approve/deny/pause/stale paths each post a
  planning receipt (metadata.phase) so every decision is provable.

### Built (Goal 5C — single-step operator-triggered actions)

- `conductor-actions.ts` — `createConductorActions(dispatch, deps)` exposing thin
  native bindings over Kernel authority: `create_task`/`assign_task`(claim+start)/
  `submit_task`/`verify_task`/`reject_task`/`block_task` → Kernel task commands;
  `connect_tiles` → `kernel.connection.create`; `spawn_role` → the injected
  approved shell role-spawn path (`canvas.roleSpawn` → `spawnRoleTileAt`), which
  starts the shipped runtime and is itself gated by `kernel.worker.spawn` (Goal
  6A) — the Conductor never starts a runtime nor marks a Kernel worker "spawning"
  with no runtime behind it. No raw `complete_task` — completion only via the
  verified `verify_task` path. `dispatch` and `deps.spawnRole` are injectable.
- The conductor panel exposes one-action-at-a-time buttons; Goal 5D adds a
  separate operator-advanced loop control with token-bound high-risk approval.

## Authority Rules

```text
Conductor plans only.
Conductor may call native Kernel tools.
Conductor may not own truth.
Conductor may not bypass task verification.
Conductor may not execute shell commands directly unless routed through a worker/harness.
```

## What This Subtree Must Not Do

- Store private authoritative state — task lists, tile snapshots — outside the Kernel.
- Complete tasks without verification evidence.
- Call MCP tools for internal QuantFlow coordination (use native Kernel tool bindings instead).
- Execute shell commands except through a WorkerInstance/Harness.
- Perform high-risk actions silently — surface them and request human approval.
- Become a second source of truth for workflow or task state.

## Native Tool Surface — Goal 5A (read-only, built)

```text
get_canvas_snapshot, get_workflow_snapshot, get_state_cards, get_task_list,
get_receipt_chain, post_receipt (planning only), focus_tile, request_human_approval
```

`post_receipt` is limited to `planning` receipts.

## Native Tool Surface — Goal 5C (single-step actions, built)

```text
create_task, assign_task, submit_task, verify_task, reject_task, block_task,
spawn_role, connect_tiles
```

Operator-triggered one at a time; thin bindings over Kernel authority (task
commands, `kernel.connection.create`) and the approved shell role-spawn path for
`spawn_role` (runtime start, gated by `kernel.worker.spawn`). No raw
`complete_task`; generic harness send/read/collectReceipts lives behind the Goal
6 `WorkerHarness` seam.

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. This file
6. Relevant conductor source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
