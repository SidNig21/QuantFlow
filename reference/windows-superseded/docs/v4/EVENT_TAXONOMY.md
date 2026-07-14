# Event taxonomy (frozen — B4)

**Status:** FROZEN v4 event taxonomy (chunk B4). Renaming or removing a `kind` string is a **contract change** — update `src/kernel/events/taxonomy.ts`, this table, and pass `bun qa/run.ts taxonomy-sync`.

Authoritative code: `KERNEL_EVENT_KINDS` in `src/kernel/events/taxonomy.ts`. Payload shape: `KernelEventPayload` in `src/kernel/events/index.ts`.

| kind | emitter site | meaning | projection consumer |
| --- | --- | --- | --- |
| `artifact.created` | `src/kernel/receipts/index.ts:~317` | Durable artifact row inserted and linked receipt posted | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `checkpoint.awaiting-selection` | `src/main/conductor/conductor-loop.ts:~317` | Conductor checkpoint paused for operator candidate selection | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `conductor.focus_requested` | `src/main/conductor/conductor-tools-readonly.ts:~74` | Conductor tool asks UI to focus a set of tiles | conductor panel refresh (`conductor.*` prefix) |
| `conductor.plan_posted` | `src/kernel/conductor/index.ts:~149` | Conductor planning receipt appended | `renderer.js` `refreshWorkflowProjection`; conductor panel refresh |
| `connection.created` | `src/kernel/commands/connection-commands.ts:~54` | New canvas connection row inserted | `renderer.js` incremental `addConnection` + `refreshWorkflowProjection`; watchtower log |
| `connection.deleted` | `src/kernel/commands/connection-commands.ts:~140` | Connection row removed | `renderer.js` incremental `removeConnection` + `refreshWorkflowProjection`; watchtower log |
| `connection.updated` | `src/kernel/commands/connection-commands.ts:~121` | Connection semantic type or label changed | `renderer.js` `refreshWorkflowProjection` |
| `evaluation.created` | `src/kernel/evals/index.ts:~170` | Evaluation dimension rows persisted | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `human_decision` | `src/kernel/receipts/index.ts:~112` | Human-decision receipt posted (companion to `receipt.posted`) | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `receipt.posted` | `src/kernel/receipts/index.ts:~105` | Append-only receipt written | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `state_card.updated` | `src/kernel/state-cards/index.ts:~110` | Kernel State Card summary upserted | `renderer.js` `tileManager.refreshFlippedStateCard`; conductor panel refresh |
| `task.blocked` | `src/kernel/tasks/index.ts:~768` (`emitTaskEvent`) | Task transitioned to blocked | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.claimed` | `src/kernel/tasks/index.ts:~412` (`emitTaskEvent`) | Task claimed by a worker | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.completed` | `src/kernel/tasks/index.ts:~620,~747` (`emitTaskEvent`) | Task reached complete (verified or legacy path) | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.created` | `src/kernel/tasks/index.ts:~308` (`emitTaskEvent`); `quantflow-electron/scripts/smoke-perf-trace.ts:~142` | New task row inserted | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.failed` | `src/kernel/tasks/index.ts:~790` (`emitTaskEvent`) | Task transitioned to failed | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.recovered` | `src/kernel/tasks/index.ts:~829` (`emitTaskEvent`) | Task reopened from blocked/failed | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.started` | `src/kernel/tasks/index.ts:~433` (`emitTaskEvent`) | Task moved to working | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.submitted` | `src/kernel/tasks/index.ts:~476` (`emitTaskEvent`) | Task work submitted for verification | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.verification_failed` | `src/kernel/tasks/index.ts:~689` (`emitTaskEvent`) | Verification rejected; task returned to working | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.verification_passed` | `src/kernel/tasks/index.ts:~593` (`emitTaskEvent`) | Verification succeeded (pre-complete gate) | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `task.verifying` | `src/kernel/tasks/index.ts:~542,~652` (`emitTaskEvent`) | Task entered verifying state | `renderer.js` `refreshWorkflowProjection`; watchtower log; conductor panel refresh |
| `tile.created` | `src/kernel/commands/tile-commands.ts:~63` | New tile row inserted | `renderer.js` partial reconcile + `refreshWorkflowProjection`; watchtower log |
| `tile.moved` | `src/kernel/commands/tile-commands.ts:~82` | Tile position updated | `renderer.js` incremental reposition + `refreshWorkflowProjection` |
| `tile.removed` | `src/kernel/commands/tile-commands.ts:~172` | Tile row deleted | `renderer.js` `closeCanvasTile` + `refreshWorkflowProjection`; watchtower log |
| `tile.renamed` | `src/kernel/commands/tile-commands.ts:~112` | Tile display name updated | `renderer.js` `refreshWorkflowProjection` |
| `tile.resized` | `src/kernel/commands/tile-commands.ts:~96` | Tile dimensions updated | `renderer.js` incremental reposition + `refreshWorkflowProjection` |
| `tile.status_updated` | `src/kernel/commands/tile-commands.ts:~128` | Tile status field updated | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `worker.spawned` | `src/kernel/commands/worker-commands.ts:~81` | Worker instance created for a tile | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `worker.status_updated` | `src/kernel/commands/worker-commands.ts:~117` | Worker lifecycle/auth fields updated | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `worker.stopped` | `src/kernel/commands/worker-commands.ts:~138` | Worker marked stopped | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `workflow.created` | `src/kernel/commands/workflow-commands.ts:~73` | New workflow row inserted | `renderer.js` `refreshWorkflowProjection`; watchtower log |
| `workflow.updated` | `src/kernel/commands/workflow-commands.ts:~116` | Workflow fields updated | `renderer.js` `refreshWorkflowProjection`; watchtower log |
