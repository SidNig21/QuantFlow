# QuantFlow Envoy Task Bus

Status: Envoy task bus MVP implementation slice.

Envoy is the durable task bus for agent delegation. QuantFlow mirrors task state in SQLite for fast canvas queries, claim locking, receipts, and runtime-event correlation. Obsidian mirrors this later; it is not part of this slice.

## Ownership

- Envoy owns proof and space-level task messages.
- QuantFlow main owns credentials, CLI calls, claim locking, and runtime events.
- Agents use MCP tools through the QuantFlow relay on `127.0.0.1:9811`.
- Cables declare allowed delegation targets through `connection_id`.
- Obsidian is not the task lock manager.

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

## Out Of Scope

- Obsidian board mirror.
- Live Hermes to Codex tile proof.
- Watchtower redesign.
- A2A or Agent Cards.
- Custom string relay revival.
- Pane-read display.
