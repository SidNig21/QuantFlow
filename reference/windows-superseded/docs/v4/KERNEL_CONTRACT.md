# QuantFlow v4 Kernel Contract (frozen strangler surface)

**STATUS: Implemented-unverified**

The **frozen contract** for structure-freeze: every write door (`dispatchKernelCommand`), read door (in-process queries + IPC read RPCs + MCP read tools), and transition notification (`emitKernelEvent`) that the shell, Conductor, and external adapters may rely on. Vocabulary: [`GLOSSARY.md`](GLOSSARY.md). Mutation rules: [`docs/v3/AUTHORITY_RULES.md`](../v3/AUTHORITY_RULES.md). Row shapes: [`docs/v3/KERNEL_SCHEMA_V1.md`](../v3/KERNEL_SCHEMA_V1.md).

**Authority:** Kernel SQLite tables are truth. Events are **transition notifications** for projection refresh — not a second truth store (`START_HERE.md` §2). Receipts are append-only proof.

---

## Change policy

Kernel command, query, IPC read RPC, MCP read tool, and event **signatures change only by deliberate documented decision** (see `REBUILD_STRATEGY_AUDIT.md` §L rule 10 / `START_HERE.md` §8.10). Shell, canvas, or Conductor refactors **must not** silently alter this contract. Additive fields are allowed when documented here; renames require glossary + contract update and a tracked codemod chunk (A3+).

---

## Entry points (source of truth in code)

| Door | Function / module | Reference |
| --- | --- | --- |
| Commands (write) | `dispatchKernelCommand(type, payload, requestedBy?)` | `src/kernel/commands/index.ts` |
| In-process queries (read) | exports from `src/kernel/queries/index.ts` | re-exported per-domain modules |
| IPC read RPCs | `registerKernelReadHandlers()` | `quantflow-electron/src/main/ipc-kernel-reads.ts` |
| MCP read tools | `TOOL_DEFINITIONS` | `tools/quantflow-mcp/tool-definitions.js` |
| Events (notify) | `emitKernelEvent(payload)` | `src/kernel/events/index.ts` |

Declared unions: `KernelCommandType`, `KernelQueryType` in `src/kernel/schema/types.ts` (lines 335–380). **Dispatch routes additional command strings** not yet in the union — listed under [Routed extensions](#routed-extensions-not-in-kernelcommandtype-yet).

---

## Frozen schema enums (A2)

### WorkflowStatus

**Frozen (glossary A1/A2):**

```text
'active' | 'suspended' | 'complete' | 'archived'
```

Mission-level suspend uses **`suspended`** — not `'paused'` (checkpoint pause is `checkpoint_state` only; see `GLOSSARY.md`).

**Compat (until data migration):** legacy SQLite rows may still store `'paused'`. Writers normalize `'paused'` → `'suspended'` on `kernel.workflow.update` (`workflow-commands.ts`). Readers normalize via `normalizeWorkflowStatus()` in `queryRun` (`workflows/index.ts`). A future additive migration may rewrite rows; not required for contract freeze.

### WorkflowProjection (type) + queryRun (function)

| Item | Frozen name | Code today | Notes |
| --- | --- | --- | --- |
| Projection query | **`queryRun(workflowId)`** | `queryRun` | **KEEP** function name |
| Return type | **`WorkflowProjection`** | `WorkflowRun` (alias exported) | Type rename completes in A3 |
| Id field | **`workflowId` only** | also exposes `runId` alias | `runId` removed in A3 |

Shape (references only — never copies task/artifact/receipt rows): `workflowId`, `objective`, `status`, `mode`, `budget`, `checkpointState`, `startedAt`, `endedAt`, `taskIds[]`, `artifactIds[]`, `receiptIds[]`. Source: `src/kernel/workflows/index.ts`.

---

## Commands (`KernelCommandType`)

All commands return `CommandResult`: `{ ok: true, id?, data? } | { ok: false, error: string }` (`src/kernel/commands/types.ts`). Payload keys are camelCase unless noted.

### Workflow — `src/kernel/commands/workflow-commands.ts`

| Command | Required payload | Optional payload |
| --- | --- | --- |
| `kernel.workflow.create` | `name` | `id`, `objective`, `status`, `activeCorrelationId`, `vaultPath`, `mode`, `budgetJson` / `budget` |
| `kernel.workflow.update` | `id` | `name`, `objective`, **`status`** (`suspended` or legacy `paused`→normalized), `mode`, `budgetJson` / `budget`, **`checkpointState`** |

Event: `workflow.created` \| `workflow.updated`.

### Tile — `src/kernel/commands/tile-commands.ts`

| Command | Required | Optional |
| --- | --- | --- |
| `kernel.tile.create` | — | `id`, `workflowId`, `displayName`, `tileKind`, `x`, `y`, `width`, `height`, `zIndex`, `status` |
| `kernel.tile.move` | `id`, `x`, `y` | — |
| `kernel.tile.resize` | `id`, `width`, `height` | — |
| `kernel.tile.rename` | `id`, `displayName` | — |
| `kernel.tile.status_update` | `id`, `status` | — |
| `kernel.tile.remove` | `id` | — |

Events: `tile.created`, `tile.moved`, `tile.resized`, `tile.renamed`, `tile.status_updated`, `tile.removed`.

### Connection — `src/kernel/commands/connection-commands.ts`

| Command | Required | Optional |
| --- | --- | --- |
| `kernel.connection.create` | `tileAId`, `tileBId` | `id`, `workflowId`, `fromTileId`, `toTileId`, `semanticType`, `label` |
| `kernel.connection.delete` | `id` | — |

Events: `connection.created`, `connection.deleted`. *(Handler also implements `kernel.connection.update` — see [Routed extensions](#routed-extensions-not-in-kernelcommandtype-yet).)*

### Worker — `src/kernel/commands/worker-commands.ts`

| Command | Required | Optional |
| --- | --- | --- |
| `kernel.worker.spawn` | `tileId` | `roleName`, `harnessKind`, `runtimeTarget`, `modelProvider`, `modelName`, `workflowId` |
| `kernel.worker.status_update` | `workerId` or `tileId` | `status`, `herdrPaneId`, `envoySpaceId`, `assignedTaskId`, `authStatus`, `lastSeen` |
| `kernel.worker.stop` | `workerId` or `tileId` | — |

Events: `worker.spawned`, `worker.status_updated`, `worker.stopped`.

### Task — `src/kernel/tasks/index.ts`

| Command | Required | Key optional fields |
| --- | --- | --- |
| `kernel.task.create` | `title`, `objective` | `id`, `workflowId`, `parentTaskId`, `correlationId`, worker ids, `priority`, `approvalLevel`, `metadata` |
| `kernel.task.depend` | `taskId`, `dependsOnTaskId` | `kind`: `'blocks'` \| `'context_from'` |
| `kernel.task.claim` | `taskId` | `workerId`, `tileId` |
| `kernel.task.start` | `taskId` | — |
| `kernel.task.submit` | `taskId` | `artifactId`, `artifactRefs[]`, `attemptId`, `summary` |
| `kernel.task.verify` | `taskId` | `artifactId`, `attemptId` |
| `kernel.task.complete` | `taskId` | legacy verify bypass flags |
| `kernel.task.block` | `taskId` | `reason` |
| `kernel.task.fail` | `taskId` | `reason` |
| `kernel.task.recover` | `taskId` | — |

Events: `task.created`, `task.claimed`, `task.started`, `task.submitted`, `task.verifying`, `task.verification_passed`, `task.verification_failed`, `task.completed`, `task.blocked`, `task.failed`, `task.recovered`.

### Receipt — `src/kernel/receipts/index.ts`

| Command | Required | Optional |
| --- | --- | --- |
| `kernel.receipt.post` | `type` (`ReceiptType`) | `taskId`, `workflowId`, `workerId`, `tileId`, `summary`, `artifactRefs[]`, `parentReceiptId`, `correlationId`, `metadata` |

Event: `receipt.posted`; additional `human_decision` event when `type === 'human_decision'`.

### Artifact — `src/kernel/receipts/index.ts`

| Command | Required | Optional |
| --- | --- | --- |
| `kernel.artifact.create` | `kind` | `workflowId`, `taskId`, `workerId`, `tileId`, `uri`, `summary`, `contentHash`, `mediaType`, `sizeBytes`, `derivedFrom[]`, `sourceRefs[]`, provenance fields, `metadata` |

Event: `artifact.created`.

### State card — `src/kernel/state-cards/index.ts`

| Command | Required | Optional |
| --- | --- | --- |
| `kernel.state_card.update` | `tileId` | `workerId`, `workflowId`, `currentTaskId`, `status`, `blocker`, `lastMeaningfulUpdate`, `nextAction`, `artifacts[]`, `lastReceiptId`, `cavemanSummary`, `metadata` |

Event: `state_card.updated`.

### Conductor — `src/kernel/conductor/index.ts`

| Command | Required | Optional |
| --- | --- | --- |
| `kernel.conductor.plan` | `summary` | `workflowId`, `taskId`, `tileId`, `correlationId`, `plan`, `reads`, `blockers`, `nextAction`, `toolCalls`, `requestApproval`, `phase`, `proposedAction`, `proposalToken` |

Event: `conductor.plan_posted`. *(Append-only `planning` receipt — Conductor's only Kernel write.)*

---

## Routed extensions (not in `KernelCommandType` yet)

Dispatched by `dispatchKernelCommand` today; **documented here**; union sync is follow-up (not A3 vocabulary sweep):

| Command | Handler | Notes |
| --- | --- | --- |
| `kernel.connection.update` | `connection-commands.ts` | `id` + optional semantic/label/status fields |
| `kernel.task.reject` | `tasks/index.ts` | Verification rejection path |
| `kernel.eval.create` | `evals/index.ts` | Non-authoritative eval rows; `evalType`, `dimensions[]` |

---

## In-process queries (`src/kernel/queries/index.ts`)

`KernelQueryType` union (schema) names snapshot-style queries; **implemented exports**:

| Export | Params | Returns | Source module |
| --- | --- | --- | --- |
| `queryCanvasSnapshot` | `workflowId?` | `{ tiles, connections }` | local |
| `queryTileList` | `workflowId?` | `TileSnapshot[]` | local |
| `queryTileGet` | `tileId` | `TileSnapshot \| null` | local |
| `queryTaskList` | `workflowId?`, `status?`, `limit?` | `TaskSnapshot[]` | `tasks/index.ts` |
| `queryTaskGet` | `taskId` | `TaskSnapshot \| null` | `tasks/index.ts` |
| `queryReceiptList` | `taskId?`, `workflowId?`, `correlationId?`, `limit?` | `ReceiptSnapshot[]` | `receipts/index.ts` |
| `queryArtifactList` | `workflowId?`, `taskId?` | `ArtifactSnapshot[]` | `receipts/index.ts` |
| `queryUpstreamArtifacts` | `taskId`, `{ includeSensitive? }` | `UpstreamArtifactSnapshot[]` | local (R2) |
| `queryStateCardList` | `workflowId?` | `StateCardSnapshot[]` | `state-cards/index.ts` |
| `queryStateCardGet` | `tileId` | `StateCardSnapshot \| null` | `state-cards/index.ts` |
| `queryConductorContext` | `workflowId?`, `receiptLimit?` | `ConductorContext` | `conductor/index.ts` |
| `queryWorkflowSnapshot` | `workflowId` | `WorkflowSnapshot \| null` | `conductor/index.ts` |
| `queryWorkerList` | `workflowId?` | `WorkerSnapshot[]` | `worker-instances/index.ts` |
| `queryWorkerGet` | `workerId` | `WorkerSnapshot \| null` | `worker-instances/index.ts` |
| **`queryRun`** | `workflowId` | **`WorkflowProjection \| null`** | `workflows/index.ts` |
| `queryWorkflowRegion` | `workflowId` | `WorkflowRegion \| null` | `workflows/index.ts` |
| `queryWorkflowRegionList` | — | `WorkflowRegion[]` | `workflows/index.ts` |
| `queryEvaluationList` | filters | `EvaluationRowSnapshot[]` | `evals/index.ts` |
| `queryEvaluationGet` | `evalId` | `EvaluationRowSnapshot[]` | `evals/index.ts` |

Legacy alias: `runGet` import name in `queries/index.ts` → maps to `queryRun` (removed in A3).

---

## IPC read RPCs (`registerKernelReadHandlers`)

Registered in `quantflow-electron/src/main/ipc-kernel-reads.ts`. **Strictly read-only** — no mutations. Conductor uses in-process queries, not these RPCs (F25).

| Frozen RPC | Implemented today | Params | Handler |
| --- | --- | --- | --- |
| `kernel.stateCardList` | same | `{ workflowId? }` | `queryStateCardList` |
| `kernel.workflowRegion` | same | `{ workflowId }` | `queryWorkflowRegion` |
| `kernel.workflowRegionList` | same | `{}` | `queryWorkflowRegionList` |
| **`kernel.workflowProjection`** | **`kernel.run`** (deprecated alias) | `{ workflowId }` | `queryRun` |
| `kernel.evalList` | same | `{ workflowId? }` | `queryEvaluationList` |

---

## MCP read tools (Kernel-facing)

From `tools/quantflow-mcp/tool-definitions.js` — read-only Kernel adapters only:

| Frozen tool | RPC | Implemented today |
| --- | --- | --- |
| `quantflow_kernel_state_cards` | `kernel.stateCardList` | same |
| `quantflow_kernel_workflow_region` | `kernel.workflowRegion` | same |
| `quantflow_kernel_workflow_regions` | `kernel.workflowRegionList` | same |
| **`quantflow_kernel_workflow_projection`** | **`kernel.workflowProjection`** | **`quantflow_kernel_run`** → `kernel.run` (deprecated alias) |
| `quantflow_kernel_evals` | `kernel.evalList` | same |

Orchestration MCP tools (`quantflow_orchestration_run_*`) are **legacy mirror** — Stage D retirement; **not** part of this Kernel contract.

---

## Events (`KernelEventPayload`)

Shape (`src/kernel/events/index.ts`):

```typescript
{
  kind: string;
  correlationId?: string;
  tileId?: string;
  workflowId?: string;
  taskId?: string;
  data?: unknown;
}
```

Delivery: in-process `EventEmitter` `'kernel-event'` + IPC `kernel:event` to subscribed `WebContents`. **Not persisted as authority** — watchers/projectors react to refresh.

### Emitted `kind` values (frozen set)

| kind | Typical source |
| --- | --- |
| `workflow.created`, `workflow.updated` | workflow commands |
| `tile.created`, `tile.moved`, `tile.resized`, `tile.renamed`, `tile.status_updated`, `tile.removed` | tile commands |
| `connection.created`, `connection.updated`, `connection.deleted` | connection commands |
| `worker.spawned`, `worker.status_updated`, `worker.stopped` | worker commands |
| `task.created`, `task.claimed`, `task.started`, `task.submitted`, `task.verifying`, `task.verification_passed`, `task.verification_failed`, `task.completed`, `task.blocked`, `task.failed`, `task.recovered` | task handlers |
| `receipt.posted`, **`human_decision`** | receipt post |
| `artifact.created` | artifact create |
| `state_card.updated` | state card update |
| `conductor.plan_posted` | conductor plan |
| `evaluation.created` | eval create |

Event taxonomy refinement (PF1/B4) may add span correlation; **kind strings above are the structure-freeze baseline**.

---

## A2 implementation status (code vs contract)

| A2 signature row | Contract target | Implemented in this chunk |
| --- | --- | --- |
| IPC `kernel.workflowProjection` | frozen | **Yes** — registered; `kernel.run` deprecated alias |
| MCP `quantflow_kernel_workflow_projection` | frozen | **Yes** — registered; `quantflow_kernel_run` deprecated alias |
| `WorkflowStatus` `'suspended'` | frozen | **Yes** — type + write/read normalization |
| `WorkflowProjection` type name | frozen | **Partial** — type alias exported; rename call sites deferred to **A3** |
| `queryRun()` name | KEEP | unchanged |
| `readRun`, loop `'paused'`, `WorkflowRun` at call sites | A3 | **Deferred** — documented in [`GLOSSARY.md`](GLOSSARY.md) rename map |

---

## Related docs

- [`GLOSSARY.md`](GLOSSARY.md) — vocabulary + A3 rename map (APPROVED)
- [`docs/v3/AUTHORITY_RULES.md`](../v3/AUTHORITY_RULES.md) — mutation invariants
- [`KERNEL_CONSTITUTION.md`](../../KERNEL_CONSTITUTION.md) — Kernel owns truth
