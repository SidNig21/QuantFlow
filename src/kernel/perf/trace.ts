/**
 * PF0 local span log — ephemeral JSONL, gated by QUANTFLOW_TRACE=1.
 * Never a Kernel table. Flag off = pure no-op (single env check, no fs).
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type SpanLayer =
  | 'canvas'
  | 'ipc'
  | 'kernel'
  | 'conductor'
  | 'harness'
  | 'model'
  | 'sdk'
  | 'artifact'
  | 'receipt'
  | 'eve';

export type SpanStatus = 'started' | 'ok' | 'error' | 'cancelled' | 'timeout';

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

export interface SpanContext {
  run_id?: string | null;
  workflow_id?: string;
  tile_id?: string;
  task_id?: string;
  worker_id?: string;
  correlation_id?: string;
}

export interface SpanStartOptions extends SpanContext {
  layer: SpanLayer;
  name: string;
  phase?: string;
  payload_size_bytes?: number;
}

export interface CompletedSpanInput extends SpanStartOptions {
  started_at: number;
  duration_ms: number;
  status?: SpanStatus;
  error?: string;
}

let traceFlag: boolean | undefined;
const spanStack: string[] = [];
const harnessStreamBytes = new Map<string, { stdout: number; stderr: number }>();

export function resetTraceState(): void {
  traceFlag = undefined;
  spanStack.length = 0;
  harnessStreamBytes.clear();
}

export function isTraceEnabled(): boolean {
  if (traceFlag === undefined) {
    traceFlag = process.env.QUANTFLOW_TRACE === '1' || process.env.QF_PERF_TRACE === '1';
  }
  return traceFlag;
}

export function getPerfDir(): string {
  const override = process.env.QF_PERF_DIR?.trim();
  if (override) return override;
  const qfDir = process.env.QUANTFLOW_DIR?.trim() || join(homedir(), '.quantflow');
  return join(qfDir, 'perf');
}

function dateKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function parentSpanId(): string | undefined {
  return spanStack.length > 0 ? spanStack[spanStack.length - 1] : undefined;
}

function buildSpan(
  opts: SpanStartOptions,
  spanId: string,
  startedAt: number,
  status: SpanStatus,
  endedAt?: number,
  error?: string,
): Span {
  const ended = endedAt ?? startedAt;
  const duration = Math.max(0, ended - startedAt);
  return {
    run_id: opts.run_id ?? opts.workflow_id ?? null,
    ...(opts.workflow_id ? { workflow_id: opts.workflow_id } : {}),
    ...(opts.tile_id ? { tile_id: opts.tile_id } : {}),
    ...(opts.task_id ? { task_id: opts.task_id } : {}),
    ...(opts.worker_id ? { worker_id: opts.worker_id } : {}),
    ...(opts.correlation_id ? { correlation_id: opts.correlation_id } : {}),
    span_id: spanId,
    ...(parentSpanId() ? { parent_span_id: parentSpanId() } : {}),
    ...(opts.phase ? { phase: opts.phase } : {}),
    layer: opts.layer,
    name: opts.name,
    started_at: startedAt,
    ended_at: ended,
    duration_ms: duration,
    ...(opts.payload_size_bytes !== undefined ? { payload_size_bytes: opts.payload_size_bytes } : {}),
    status,
    ...(error ? { error } : {}),
  };
}

function writeSpan(span: Span): void {
  const dir = getPerfDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${dateKey(span.started_at)}.jsonl`);
  appendFileSync(path, `${JSON.stringify(span)}\n`, 'utf-8');
  maybeWriteSummary(dir, span);
}

function maybeWriteSummary(dir: string, latest: Span): void {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
    const lastFile = files[files.length - 1];
    if (!lastFile) return;
    const lines = readFileSync(join(dir, lastFile), 'utf-8').trim().split('\n').filter(Boolean);
    let longest = latest;
    for (const line of lines) {
      try {
        const span = JSON.parse(line) as Span;
        if ((span.duration_ms ?? 0) > (longest.duration_ms ?? 0)) longest = span;
      } catch {
        // skip malformed
      }
    }
    const summary = [
      '# QuantFlow perf summary',
      '',
      `Updated: ${new Date().toISOString()}`,
      '',
      `Longest span: ${longest.name} (${longest.layer}) — ${longest.duration_ms ?? 0}ms`,
      '',
    ].join('\n');
    writeFileSync(join(dir, 'latest-summary.md'), summary, 'utf-8');
  } catch {
    // summary is optional
  }
}

export function recordCompletedSpan(input: CompletedSpanInput): void {
  if (!isTraceEnabled()) return;
  const spanId = randomUUID();
  const status = input.status ?? 'ok';
  writeSpan(buildSpan(input, spanId, input.started_at, status, input.started_at + input.duration_ms, input.error));
}

export function recordRendererProjectionSpan(durationMs: number, ctx: SpanContext = {}): void {
  if (!isTraceEnabled()) return;
  const startedAt = Date.now() - durationMs;
  recordCompletedSpan({
    ...ctx,
    layer: 'canvas',
    name: 'renderer.projection.refresh',
    started_at: startedAt,
    duration_ms: durationMs,
    status: 'ok',
  });
}

export function traceSync<T>(opts: SpanStartOptions, fn: () => T): T {
  if (!isTraceEnabled()) return fn();
  const spanId = randomUUID();
  const startedAt = Date.now();
  spanStack.push(spanId);
  try {
    const result = fn();
    writeSpan(buildSpan(opts, spanId, startedAt, 'ok', Date.now()));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeSpan(buildSpan(opts, spanId, startedAt, 'error', Date.now(), message));
    throw err;
  } finally {
    spanStack.pop();
  }
}

export async function traceAsync<T>(opts: SpanStartOptions, fn: () => Promise<T>): Promise<T> {
  if (!isTraceEnabled()) return fn();
  const spanId = randomUUID();
  const startedAt = Date.now();
  spanStack.push(spanId);
  try {
    const result = await fn();
    writeSpan(buildSpan(opts, spanId, startedAt, 'ok', Date.now()));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeSpan(buildSpan(opts, spanId, startedAt, 'error', Date.now(), message));
    throw err;
  } finally {
    spanStack.pop();
  }
}

export type IpcInvokeHandler = (...args: unknown[]) => unknown | Promise<unknown>;

/** Timing proxy for ipcMain.handle — unit-testable without Electron. */
export function wrapIpcInvokeHandler(
  channel: string,
  handler: IpcInvokeHandler,
): IpcInvokeHandler {
  return async (...args: unknown[]) => traceAsync(
    {
      layer: 'ipc',
      name: 'ipc.invoke',
      phase: channel,
      payload_size_bytes: JSON.stringify(args).length,
    },
    () => Promise.resolve(handler(...args)),
  );
}

export async function traceHarnessSpawn<T>(
  tileId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return traceAsync(
    { layer: 'harness', name: 'harness.spawn.started', tile_id: tileId },
    fn,
  );
}

export function ingestPtyStreamBytes(sessionId: string, data: Buffer | string): void {
  const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
  recordHarnessStreamBytes(sessionId, bytes, 'stdout');
}

/** Aggregate PTY stream bytes — milestones only, never one span per line. */
export function recordHarnessStreamBytes(
  sessionId: string,
  bytes: number,
  stream: 'stdout' | 'stderr',
): void {
  if (!isTraceEnabled() || bytes <= 0) return;
  const prev = harnessStreamBytes.get(sessionId) ?? { stdout: 0, stderr: 0 };
  prev[stream] += bytes;
  harnessStreamBytes.set(sessionId, prev);
}

export function getHarnessStreamBytes(sessionId: string): { stdout: number; stderr: number } {
  return harnessStreamBytes.get(sessionId) ?? { stdout: 0, stderr: 0 };
}

export function readSpanLinesFromDir(dir: string): Span[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const spans: Span[] = [];
  for (const file of files.sort()) {
    const content = readFileSync(join(dir, file), 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      spans.push(JSON.parse(line) as Span);
    }
  }
  return spans;
}

const SPAN_LAYERS = new Set<SpanLayer>([
  'canvas', 'ipc', 'kernel', 'conductor', 'harness', 'model', 'sdk', 'artifact', 'receipt', 'eve',
]);

const SPAN_STATUSES = new Set<SpanStatus>(['started', 'ok', 'error', 'cancelled', 'timeout']);

export function isValidSpan(value: unknown): value is Span {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.span_id === 'string'
    && typeof s.layer === 'string'
    && SPAN_LAYERS.has(s.layer as SpanLayer)
    && typeof s.name === 'string'
    && typeof s.started_at === 'number'
    && typeof s.status === 'string'
    && SPAN_STATUSES.has(s.status as SpanStatus)
    && (s.run_id === null || typeof s.run_id === 'string');
}
