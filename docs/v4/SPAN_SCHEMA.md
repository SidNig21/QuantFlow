# Span schema (PF0 — frozen B4)

**Status:** FROZEN PF0 span contract (chunk B4). Ephemeral JSONL only — never a Kernel table. Flag off = pure no-op.

## Span type

Source of truth: `Span` in `src/kernel/perf/trace.ts`.

```typescript
export interface Span {
  run_id: string | null;
  workflow_id?: string;
  tile_id?: string;
  task_id?: string;
  worker_id?: string;
  correlation_id?: string;
  span_id: string;
  parent_span_id?: string;
  phase?: string;
  layer: SpanLayer;
  name: string;
  started_at: number;
  ended_at?: number;
  duration_ms?: number;
  payload_size_bytes?: number;
  status: SpanStatus;
  error?: string;
}
```

Supporting types from the same module:

| Type | Values / meaning |
| --- | --- |
| `SpanLayer` | `'canvas' \| 'ipc' \| 'kernel' \| 'conductor' \| 'harness' \| 'model' \| 'sdk' \| 'artifact' \| 'receipt' \| 'eve'` — subsystem bucket for the span |
| `SpanStatus` | `'started' \| 'ok' \| 'error' \| 'cancelled' \| 'timeout'` — completion outcome |
| `run_id` | Defaults to `workflow_id` when set, else `null` — groups spans for one workflow run |
| `phase` | Optional sub-label (e.g. IPC channel name, receipt type, event kind) |
| `payload_size_bytes` | Optional serialized payload size at the anchor |
| `parent_span_id` | Nested span stack parent when anchors nest |

## Seven anchor points

Wrappers only at these sites (PF0). Each records a span when tracing is enabled.

| # | File | layer | name | phase / notes |
| --- | --- | --- | --- | --- |
| 1 | `src/kernel/events/index.ts` — `emitKernelEvent` | `kernel` | `kernel.event.fanout` | `phase` = event `kind` |
| 2 | `src/kernel/commands/index.ts` — `dispatchKernelCommand` | `kernel` | `kernel.command` | `phase` = command type string |
| 3 | `src/kernel/receipts/index.ts` — `postReceipt` | `receipt` | `receipt.post` | `phase` = receipt type |
| 4 | `src/kernel/artifacts/verify.ts` — `verifyTaskArtifacts` | `artifact` | `artifact.verify` | `payload_size_bytes` = artifact ref count |
| 5 | `src/main/conductor/conductor-loop.ts` — `step` | `conductor` | `conductor.plan.started` | nested `conductor.context.query` child span |
| 6 | `quantflow-electron/src/main/ipc.ts` — `wrapIpcInvokeHandler` / `registerTracedIpcHandler` | `ipc` | `ipc.invoke` | `phase` = IPC channel name |
| 7 | `quantflow-electron/src/windows/shell/src/renderer.js` — `refreshWorkflowProjection` | `canvas` | `renderer.projection.refresh` | via `shellApi.recordPerfSpan` → `ipc.ts` `perf:recordSpan` → `recordCompletedSpan` |

Additional harness anchor (PTY spawn path, not a separate PF0 anchor count):

| File | layer | name |
| --- | --- | --- |
| `quantflow-electron/src/main/pty.ts` — spawn via `traceHarnessSpawn` | `harness` | `harness.spawn.started` |

PTY stream bytes aggregate via `ingestPtyStreamBytes` / `recordHarnessStreamBytes` — milestones only, never one span per stdout line.

## JSONL location and flag rules

| Rule | Detail |
| --- | --- |
| Enable flag | `QUANTFLOW_TRACE=1` or legacy alias `QF_PERF_TRACE=1` (`isTraceEnabled()` in `trace.ts`) |
| Output directory | `{QUANTFLOW_DIR or ~/.quantflow}/perf/` unless overridden by `QF_PERF_DIR` |
| File naming | `{YYYY-MM-DD}.jsonl` — one JSON object per line (`writeSpan`) |
| Flag off | Single env check; no filesystem writes; wrappers return immediately |
| Summary sidecar | Optional `latest-summary.md` in the perf dir (longest span seen) |
| Not persisted | Spans are ephemeral observability — not Kernel truth, not replay input |

Also wrapped (same tracer, not counted in the seven anchors): `handleArtifactCommand` in `src/kernel/receipts/index.ts` uses `traceSync` with `layer: 'artifact'`, `name: 'artifact.create'`.
