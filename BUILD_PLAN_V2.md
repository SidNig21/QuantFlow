# QuantFlow v2 Build Plan

This is the single working file for QuantFlow v2.

Read `CONCEPT.md` first for the product definition. After that, work from this file only.

The archived 7-layer charters in `reference/archive/quantflow-v2-layer-charters/` are reference material, not an execution path. They are mapped below so useful thinking is not lost, but they do not control scope.

## Current Truth

Branch: `quantflow-v2`

Date: 2026-06-11

**Shipped:** Gate 2 spawn/PTY, Gate 3 `events.subscribe` (code done), herdr socket retirement, Envoy task bus MVP, Obsidian mirror, Run Workflow button activating Hermes, relay token + herdr bootstrap.

**Trial result 2026-06-11:** Hermes claim/Envoy OK. Codex spawned but no worker context on spawn. Handoff via `terminal_write` only. Relay/WSL proxy flaky mid-run.

**Active gap:** worker spawn ≠ worker activation.

**Current slice:** `delegation-phase-6`

**Pass when:** Hermes `qf_task_create` → Codex claims via MCP, no `terminal_write` handoff, receipt chain visible in Envoy.

**Not current:** legend cleanup, redesign, RL, Watchtower redesign.

Earlier gates (reference): Gate 1 ping (`f72c0b4`), v1 relay retirement (`6961506`), spawn unify (`de9c497`), docs collapse (`147cabb`).

## Current Slice

### delegation-phase-6

Goal: prove autonomous delegation — Hermes creates a child task in Envoy, Codex claims and completes via MCP, without the operator or Hermes pasting into Codex’s terminal.

Do this now:

- [ ] Hermes uses `qf_task_create` with `sourceTileId`, `targetTileId`, parent `correlation_id`, and full instruction.
- [ ] Codex discovers and claims the child task via `qf_task_list` / `qf_task_claim` (MCP), not markdown and not `terminal_write`.
- [ ] Codex completes with `qf_task_complete`; receipts share one `correlation_id`.
- [ ] Hermes reads proof via `qf_task_list` / `qf_receipt_list` or Envoy mirror — not terminal echo as success signal.

Pass when:

- One canvas trial: Run Workflow or operator task → Hermes orchestrates → Codex claims via MCP → complete → receipt chain visible in Envoy and Obsidian mirror.
- No `terminal_write` handoff required for the worker to start work.
- `bun run smoke:envoy-task` still passes.

Known landmines (trial 2026-06-11):

- WSL Hermes MCP → Windows relay: intermittent `ECONNREFUSED` and UNC cwd on `rpc-once.js`.
- `quantflow_role_spawn` does not wire worker activation; only Run Workflow wires Hermes `postLaunchPrompt`.
- Codex TUI: `terminal_write` may compose without submitting; verify with tile read.

Still open after phase 6 passes:

- [ ] Let watchers post receipts for dumb tiles. Dumb tiles do not receive Envoy credentials.
- [ ] Wire Obsidian vault context pins and handoff paths to Envoy evidence.
- [ ] Prove one cable action creates one receipt visible in Watchtower or a vault note.

Task bus reference:

- `bun run smoke:envoy-task` — automated Envoy task loop proof.
- Agent tools: `qf_envoy_space_status`, `qf_task_list`, `qf_task_create`, `qf_task_claim`, `qf_task_update`, `qf_task_complete`, `qf_task_block`, `qf_task_fail`, `qf_receipt_list`, `qf_envoy_watch`.
- See `ENVOY.md` for the task state model and example tool calls.
- Canvas tile playbook: vault `Projects/QuantFlow/QUANTFLOW_CANVAS_SKILL.md`.

## Completed Slices

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
- Watchtower evolution.
- Full V2 visual redesign implementation.
- Memory/context tile type.
- External QA loop.
- Factory Droid.
- Tennis vision.
- RL infra.

## Rejected

Do not implement:

- A2A.
- Agent Cards.
- HTTP agent delegation.
- Custom string relay cluster.
- `pane.read` as display.
- Direct `herdr-client.sock` to xterm.
- Direct `envoy-stub` calls.
- Parallel GoalBuddy layer execution.
- Vault `Projects/QuantFlow/Build Plan.md` and `Start Here.md` as execution source.
- New build-plan layers unless the operator explicitly asks.

## Archived 7-Layer Map

The old layer charters are useful as a memory palace, not as a plan.

| Archived layer | New status |
| --- | --- |
| Layer 1, Visual Canvas | Mostly audit/reference. Visual implementation waits until backend gates stabilize. |
| Layer 2, Process Runtime Herdr | Done for current spine (`events.subscribe`, socket retirement). Reference for future herdr work. |
| Layer 3, Communication A2A + MCP | A2A is rejected. MCP on port 9811 stays. Correlation/runtime-state ideas may survive without A2A. |
| Layer 4, Shared Memory Envoy | Future `envoy-obsidian` reference. Remove A2A dependency from interpretation. |
| Layer 5, Legend Palette + Templates | Not current. Later: role config, templates, Commence cleanup. |
| Layer 6, Watchtower | Later. It should consume herdr events and Envoy receipts after those exist. |
| Layer 7, External QA Loop | Later. Useful for testing strategy, not current app scope. |

## Operator Checklist Before Any Coding Session

1. Confirm branch is `quantflow-v2`.
2. Read `CONCEPT.md`.
3. Read this file.
4. Confirm the current slice.
5. If the requested work is not in the current slice, ask before coding.
6. Commit before handoff.

## Agent Handoff

Use this block for coding agents:

```text
Branch quantflow-v2.
Read CONCEPT.md, then BUILD_PLAN_V2.md.
BUILD_PLAN_V2.md is the only execution plan.
Vault Projects/QuantFlow/Build Plan.md and Start Here.md are ARCHIVED — do not execute.
Current slice: delegation-phase-6.
Pass when: Hermes qf_task_create → Codex claims via MCP, no terminal_write handoff,
  receipt chain visible in Envoy.
Active gap: worker spawn ≠ worker activation.
Do not execute archived layer charters or reference/archive/ as a plan.
No A2A. No string relay revival. pane.read display is rejected.
One executor at a time. Commit before handoff.
```
