# QuantFlow Envoy Task Bus

Status: Envoy task bus MVP implementation slice.

Envoy is the durable task bus for agent delegation. QuantFlow mirrors task state in SQLite for fast canvas queries, claim locking, receipts, and runtime-event correlation. Obsidian is a live read dashboard mirrored from Envoy by Electron main (not a second lock).

## Ownership

- Envoy owns proof and space-level task messages.
- QuantFlow main owns credentials, CLI calls, claim locking, and runtime events.
- Agents use MCP tools through the QuantFlow relay on `127.0.0.1:9811`.
- Cables declare allowed delegation targets through `connection_id`.
- Obsidian is not the task lock manager.
- One mirror process in Electron main writes vault markdown; agents and scripts post to Envoy only.

## State Model

Task states:

```text
inbox -> ready -> claimed -> working -> review -> done
                                  -> blocked
                                  -> failed
```

QuantFlow creates `ready` tasks when a target tile is supplied and `inbox` tasks when no target tile is supplied.

Every task carries:

```text
task_id
envoy_task_id
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
result_summary
receipt_ids
artifact_paths
created_at
updated_at
```

## Runtime Files

Core implementation:

- `quantflow-electron/src/main/envoy-service.ts`
- `quantflow-electron/src/main/envoy-listener.ts`
- `quantflow-electron/src/main/envoy-task-service.ts`
- `quantflow-electron/src/main/ipc-envoy.ts`
- `quantflow-electron/src/main/obsidian-envoy-mirror.ts`
- `quantflow-electron/src/main/envoy-spawn-lifecycle.ts`
- `quantflow-electron/src/main/herdr-envoy-wrap.ts`
- `quantflow-electron/scripts/envoy-run.sh`
- `quantflow-electron/src/main/runtime-state/envoy-repo.ts`
- `quantflow-electron/src/main/runtime-state/migrations/006-envoy-task-bus.sql`

Agent tool surface:

- `tools/quantflow-mcp/tool-definitions.js`

Proof:

- `quantflow-electron/scripts/envoy-task-smoke.ts`

## JSON-RPC Methods

These are available through the QuantFlow relay:

```text
envoy.spaceStatus
envoy.taskList
envoy.taskCreate
envoy.taskClaim
envoy.taskUpdate
envoy.taskComplete
envoy.taskBlock
envoy.taskFail
envoy.receiptList
envoy.watch
```

## MCP Tools

Agents use these tools:

```text
qf_envoy_space_status
qf_task_list
qf_task_create
qf_task_claim
qf_task_update
qf_task_complete
qf_task_block
qf_task_fail
qf_receipt_list
qf_envoy_watch
```

Example agent flow:

```text
qf_task_create
  canvasId=main
  sourceTileId=hermes
  targetTileId=codex
  connectionId=conn-hermes-codex
  title="Fix failing test"
  instruction="Run the targeted test and patch the failure."
  acceptanceCriteriaJson="[\"test passes\",\"no unrelated changes\"]"

qf_task_claim
  taskId=<task_id>
  claimingTileId=codex
  agentName=Codex

qf_task_update
  taskId=<task_id>
  summary="Reproduced the failure and found the bad assertion."

qf_task_complete
  taskId=<task_id>
  resultSummary="Patched the assertion and verified the target test."
  artifactPathsJson="[\"C:\\Users\\rybow\\QuantFlow\\...\"]"
```

## Proof Command

From `C:\Users\rybow\QuantFlow\quantflow-electron`:

```powershell
bun run smoke:envoy-task
```

The script prints a JSON proof artifact with:

```text
task_id
envoy_task_id
envoy_space_id
connection_id
correlation_id
second_claim_rejected
final_status
receipt_ids
event_kinds
```

The smoke uses the real Envoy CLI boundary and a test runtime database.

## Obsidian Live Mirror

Vault path comes from `vault-config.json` (default: `Obsidian/QuantFlow`).

Mirror directory:

```text
Projects/QuantFlow/Envoy/
  task-board.md   # envoy task list (poll ~2s)
  history.md      # envoy history (poll ~2s)
  live.md         # envoy listen packets (append)
```

Started when a legend spawn ensures the canvas Envoy space. Stopped on app shutdown.

## Legend Spawn Wiring

Roles carry `envoyProfile` and optional `envoyWrapCommand`.

- Agents (Hermes, Codex, Claude, OpenCode): main posts `spawn.started` via Envoy; agent uses MCP for tasks.
- One-shot workers (python, puffer): `commandTemplate` runs through `scripts/envoy-run.sh` in WSL, which posts started/complete/fail with exit code.

```bash
ENVOY_SPACE=<canvas_space_id> ENVOY_PROFILE=<profile> ./envoy-run.sh <command>
```

## v3 Kernel Task Lifecycle (Goal 3) — Verified Completion

v3 promotes the Kernel to the sole authority for task state. The Kernel task
state machine enforces verified completion: a worker submits a result, and the
system verifies it. This is the constitutional path (`KERNEL_CONSTITUTION.md`,
`docs/v3/AUTHORITY_RULES.md`).

### Canonical state machine

```text
open → claimed → working → submitted → verifying → complete

working → blocked → working
working / submitted / verifying → failed
submitted / verifying → working      (verification rejected)
claimed (stale) → open               (reclaimable after 5 min)
```

The hard rule: a task may not go `working → complete`. Completion requires the
`submitted → verifying` gate **and** a `verification_passed` receipt. A worker
may not verify its own task (self-verification is refused unless an operator
override is supplied).

### Kernel commands (authoritative)

```text
kernel.task.create   kernel.task.claim   kernel.task.start
kernel.task.submit   kernel.task.verify  kernel.task.reject
kernel.task.complete kernel.task.block   kernel.task.fail
kernel.receipt.post  kernel.artifact.create
```

Receipt chain (append-only, one per transition):

```text
task_created → task_claimed → task_started → task_submitted
→ artifact_created → verification_started → verification_passed → task_completed
```

`kernel.task.reject` / `verify verdict=fail` posts `verification_failed` and
returns the task to `working`.

### JSON-RPC methods (relay)

```text
kernel.taskCreate  kernel.taskClaim   kernel.taskStart
kernel.taskSubmit  kernel.taskVerify  kernel.taskReject
kernel.taskComplete kernel.taskBlock  kernel.taskFail
kernel.taskList    kernel.taskGet     kernel.receiptList
kernel.receiptPost kernel.artifactCreate
```

Registered by `src/main/ipc/task-ipc.ts` (`registerKernelTaskRpc`).

### MCP gate tools (Goal 3 additions)

```text
qf_task_submit   → kernel.taskSubmit   (working → submitted)
qf_task_verify   → kernel.taskVerify   (pass: completes; fail: returns to working)
qf_task_reject   → kernel.taskReject   (verification_failed → working)
```

### Proof

From `quantflow-electron`:

```powershell
bun run smoke:kernel-task
```

Drives the full lifecycle against the canonical schema in memory and asserts the
receipt chain, the no-self-complete gate, the self-verification guard, the
reject path, and the legacy bypass.

### Legacy compatibility path

The existing Envoy task bus (`inbox → ready → claimed → working → review → done`)
and its MCP tools (`qf_task_create/claim/update/complete/block/fail`,
`qf_receipt_list`, `qf_envoy_watch`) are **unchanged** and remain the documented
legacy compatibility path. Phase-6 delegation and `smoke:envoy-task` continue to
run against the Envoy bus.

Within the Kernel state machine itself, `kernel.task.complete` accepts an
explicit `legacy: true` flag that allows completion without the verification
gate. Such completions are tagged on the `task_completed` receipt
(`metadata.legacy = true`, `bypassedVerification = true`) so verified and legacy
completions stay distinguishable in the evidence chain. The legacy bypass is a
temporary compatibility affordance to be retired in a later goal.

## Out Of Scope

- Live Hermes to Codex tile proof (Phase 6).
- Watchtower redesign.
- A2A or Agent Cards.
- Custom string relay revival.
- Pane-read display.
