/**
 * Eve harness — external-runtime evidence feed (Stage F2 fence).
 *
 * HTTP translator for local quantflow-eve. Reports facts via ReceiptDraft only;
 * never writes Kernel state or calls emitKernelEvent. Callers post drafts through
 * Kernel commands. When Eve is unreachable, operations fail fast with explicit
 * errors — they do not block app boot or corrupt Kernel truth.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type {
  HarnessDescriptor,
  PartialStateCard,
  ReceiptDraft,
  SpawnWorkerInput,
  WorkerHandle,
  WorkerHarness,
  WorkerMessage,
} from '../types';

export const eveHarness: HarnessDescriptor = {
  kind: 'eve-harness',
  description: 'Minimal HTTP translator for the local quantflow-eve worker',
  configSchema: {
    baseUrl: { type: 'string', default: 'http://127.0.0.1:3000' },
    workspace: { type: 'string' },
  },
};

type EveResponse = {
  ok?: boolean;
  status?: number;
  body?: ReadableStream<Uint8Array> | null;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

type EveFetch = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<EveResponse>;

export interface EveHarnessOptions {
  baseUrl?: string;
  workspace?: string;
  streamTimeoutMs?: number;
  fetch?: EveFetch;
  fs?: {
    existsSync?(path: string): boolean;
    readFileSync(path: string): Uint8Array | string;
  };
}

interface EveState {
  eveSessionId: string | null;
  continuationToken: string | null;
  status: 'idle' | 'working' | 'done' | 'stopped';
  workspace: string;
  artifactPath: string | null;
  collected: boolean;
  turnComplete: boolean;
}

export function createEveHarness(options: EveHarnessOptions = {}): WorkerHarness {
  const baseUrl = stripTrailingSlash(options.baseUrl ?? process.env.QF_EVE_BASE_URL ?? 'http://127.0.0.1:3000');
  const workspace = resolve(options.workspace ?? process.env.QF_EVE_WORKSPACE ?? process.cwd());
  const streamTimeoutMs = options.streamTimeoutMs ?? 60_000;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const io = options.fs ?? { existsSync, readFileSync };
  const states = new Map<string, EveState>();

  async function postJson(path: string, payload: Record<string, unknown>): Promise<unknown> {
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseResponse(res);
    } catch (error) {
      throw new Error(formatEveUnavailable(error));
    }
  }

  function stateFor(handle: WorkerHandle, fallbackWorkspace = workspace): EveState {
    let state = states.get(handle.workerId);
    if (!state) {
      state = {
        eveSessionId: handle.eveSessionId ?? null,
        continuationToken: null,
        status: handle.eveSessionId ? 'working' : 'idle',
        workspace: resolve(handle.workspacePath ?? fallbackWorkspace),
        artifactPath: null,
        collected: false,
        turnComplete: false,
      };
      states.set(handle.workerId, state);
    }
    return state;
  }

  return {
    kind: 'eve-harness',

    async spawn(input: SpawnWorkerInput): Promise<WorkerHandle> {
      const tileId = input.tileId ?? 'eve-pending';
      const handle: WorkerHandle = {
        workerId: input.roleId ?? `eve-worker-${tileId}`,
        tileId,
        kind: 'eve-harness',
        eveSessionId: null,
        workspacePath: resolve(input.cwd ?? workspace),
      };
      states.set(handle.workerId, {
        eveSessionId: null,
        continuationToken: null,
        status: 'idle',
        workspace: handle.workspacePath,
        artifactPath: null,
        collected: false,
        turnComplete: false,
      });
      return handle;
    },

    async send(handle: WorkerHandle, message: WorkerMessage): Promise<void> {
      const state = stateFor(handle, message.artifactRoot ?? workspace);
      const body = state.eveSessionId
        ? await postJson(`/eve/v1/session/${state.eveSessionId}`, {
          message: message.text,
          continuationToken: state.continuationToken,
          taskId: message.taskId ?? null,
          workflowId: message.workflowId ?? null,
        })
        : await postJson('/eve/v1/session', {
          message: message.text,
          cwd: message.artifactRoot ?? handle.workspacePath ?? state.workspace,
          taskId: message.taskId ?? null,
          workflowId: message.workflowId ?? null,
        });
      state.eveSessionId = extractSessionId(body) ?? state.eveSessionId;
      if (!state.eveSessionId) throw new Error('eve-harness send: missing sessionId from Eve response');
      state.continuationToken = extractContinuationToken(body) ?? state.continuationToken;
      handle.eveSessionId = state.eveSessionId;
      state.artifactPath = resolveArtifactPath(state.workspace, extractArtifactPath(body)) ?? state.artifactPath;
      state.turnComplete = false;
      state.status = 'working';
      state.status = state.artifactPath ? 'done' : state.status;
    },

    async readState(handle: WorkerHandle): Promise<PartialStateCard> {
      const state = stateFor(handle);
      if (state.status === 'working' && !state.turnComplete) await refreshFromStream(state);
      return {
        status: state.status === 'done' ? 'complete' : state.status === 'stopped' ? 'stopped' : 'active',
        lastMeaningfulUpdate: state.eveSessionId ?? null,
      };
    },

    async collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]> {
      const state = stateFor(handle);
      if (!state.artifactPath && !state.turnComplete) await refreshFromStream(state);
      if (state.collected || !state.artifactPath) return [];
      if (io.existsSync && !io.existsSync(state.artifactPath)) {
        throw new Error(`eve-harness artifact missing: ${state.artifactPath}`);
      }
      const raw = io.readFileSync(state.artifactPath);
      const bytes = typeof raw === 'string' ? Buffer.from(raw) : Buffer.from(raw);
      const contentHash = createHash('sha256').update(bytes).digest('hex');
      state.collected = true;
      return [{
        type: 'task_submitted',
        summary: `eve artifact from session ${state.eveSessionId ?? 'unknown'}`,
        artifactFilePath: state.artifactPath,
        artifactKind: 'file',
        contentHash,
        mediaType: 'text/plain',
        sizeBytes: bytes.length,
        metadata: {
          harnessKind: 'eve-harness',
          eveSessionId: state.eveSessionId ?? null,
          workspace: state.workspace,
        },
      }];
    },

    async stop(handle: WorkerHandle): Promise<void> {
      stateFor(handle).status = 'stopped';
    },
  };

  async function refreshFromStream(state: EveState): Promise<void> {
    if (!state.eveSessionId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), streamTimeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}/eve/v1/session/${state.eveSessionId}/stream`, {
        method: 'GET',
        headers: { accept: 'application/x-ndjson' },
        signal: controller.signal,
      });
      if (res.ok === false) throw new Error(`Eve HTTP error: ${res.status ?? 'unknown'}`);
      if (res.body) {
        await readStreamUntilArtifact(state, res.body, streamTimeoutMs);
        return;
      }
      processStreamText(state, await parseText(res));
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`eve-harness stream timed out after ${streamTimeoutMs}ms`);
      throw new Error(formatEveUnavailable(error));
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readStreamUntilArtifact(
  state: EveState,
  body: ReadableStream<Uint8Array>,
  streamTimeoutMs: number,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + streamTimeoutMs;
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await readWithDeadline(reader, deadline);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      const boundarySeen = processStreamText(state, lines.join('\n'));
      if (state.status === 'done' || boundarySeen) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    if (buffer.trim()) processStreamText(state, buffer);
  } finally {
    reader.releaseLock();
  }
}

async function readWithDeadline(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deadline: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('eve-harness stream timed out');
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('eve-harness stream timed out')), remaining);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function processStreamText(state: EveState, text: string): boolean {
  let boundarySeen = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as unknown;
      state.artifactPath = resolveArtifactPath(state.workspace, extractArtifactPath(event)) ?? state.artifactPath;
      boundarySeen = isTurnBoundaryEvent(event) || boundarySeen;
      if (state.artifactPath && (boundarySeen || isArtifactEvent(event))) state.status = 'done';
    } catch {
      // Ignore malformed or partial stream lines.
    }
  }
  state.turnComplete = state.turnComplete || boundarySeen;
  return boundarySeen;
}

async function parseResponse(res: EveResponse): Promise<unknown> {
  if (res.ok === false) throw new Error(`Eve HTTP error: ${res.status ?? 'unknown'}`);
  if (res.json) {
    try {
      return await res.json();
    } catch {
      // Fall through to text.
    }
  }
  return res.text ? res.text() : {};
}

async function parseText(res: EveResponse): Promise<string> {
  if (res.ok === false) throw new Error(`Eve HTTP error: ${res.status ?? 'unknown'}`);
  return res.text ? res.text() : JSON.stringify(await parseResponse(res));
}

function extractSessionId(value: unknown): string | null {
  const found = findStringField(value, new Set(['sessionId', 'session_id', 'id']));
  return found?.trim() || null;
}

function extractContinuationToken(value: unknown): string | null {
  const found = findStringField(value, new Set(['continuationToken', 'continuation_token']));
  return found?.trim() || null;
}

function extractArtifactPath(value: unknown): string | null {
  if (typeof value === 'string') return parseArtifactPathMarker(value);
  const event = asRecord(value);
  if (!event) return null;
  const direct = stringProp(event, 'artifactPath') ?? stringProp(event, 'artifact_path');
  if (direct) return direct;
  if (event['type'] !== 'message.completed') return null;
  const data = asRecord(event['data']);
  return parseArtifactPathMarker(stringProp(data, 'message'));
}

function findStringField(value: unknown, names: Set<string>): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, names);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (names.has(key) && typeof child === 'string') return child;
    const found = findStringField(child, names);
    if (found) return found;
  }
  return null;
}

function parseArtifactPathMarker(text: string | null): string | null {
  return text?.match(/^ARTIFACT_PATH:\s*(.+)$/m)?.[1]?.trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringProp(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}

function resolveArtifactPath(workspace: string, path: string | null): string | null {
  if (!path) return null;
  if (path === '/workspace') return workspace;
  if (path.startsWith('/workspace/')) return resolve(workspace, path.slice('/workspace/'.length));
  return isAbsolute(path) ? resolve(path) : resolve(workspace, path);
}

function isArtifactEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const event = value as { type?: unknown };
  return event.type === 'message.completed'
    || event.type === 'result.completed'
    || event.type === 'session.completed';
}

function isTurnBoundaryEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const event = value as { type?: unknown };
  return event.type === 'turn.completed'
    || event.type === 'session.waiting'
    || event.type === 'session.completed';
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function formatEveUnavailable(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `eve-harness unavailable: ${detail}`;
}
