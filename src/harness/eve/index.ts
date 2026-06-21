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

type EveFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<EveResponse>;

export interface EveHarnessOptions {
  baseUrl?: string;
  workspace?: string;
  fetch?: EveFetch;
  fs?: {
    existsSync?(path: string): boolean;
    readFileSync(path: string): Uint8Array | string;
  };
}

interface EveState {
  sessionId: string;
  continuationToken: string | null;
  status: 'working' | 'done' | 'stopped';
  workspace: string;
  artifactPath: string | null;
  collected: boolean;
}

export function createEveHarness(options: EveHarnessOptions = {}): WorkerHarness {
  const baseUrl = stripTrailingSlash(options.baseUrl ?? process.env.QF_EVE_BASE_URL ?? 'http://127.0.0.1:3000');
  const workspace = resolve(options.workspace ?? process.env.QF_EVE_WORKSPACE ?? process.cwd());
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const io = options.fs ?? { existsSync, readFileSync };
  const states = new Map<string, EveState>();

  async function postJson(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseResponse(res);
  }

  function stateFor(handle: WorkerHandle): EveState {
    const state = states.get(handle.workerId);
    if (!state) throw new Error(`eve-harness has no state for worker: ${handle.workerId}`);
    return state;
  }

  return {
    kind: 'eve-harness',

    async spawn(input: SpawnWorkerInput): Promise<WorkerHandle> {
      const body = await postJson('/eve/v1/session', {
        message: input.activationPrompt ?? 'QuantFlow Eve session ready.',
        cwd: input.cwd ?? workspace,
        workflowId: input.workflowId ?? null,
      });
      const sessionId = extractSessionId(body);
      if (!sessionId) throw new Error('eve-harness spawn: missing sessionId from Eve response');
      const continuationToken = extractContinuationToken(body);
      const tileId = input.tileId ?? `eve-${sessionId}`;
      const handle: WorkerHandle = {
        workerId: `eve-worker-${sessionId}`,
        tileId,
        kind: 'eve-harness',
        eveSessionId: sessionId,
        workspacePath: workspace,
      };
      states.set(handle.workerId, {
        sessionId,
        continuationToken,
        status: 'working',
        workspace,
        artifactPath: resolveArtifactPath(workspace, extractArtifactPath(body)),
        collected: false,
      });
      return handle;
    },

    async send(handle: WorkerHandle, message: WorkerMessage): Promise<void> {
      const state = stateFor(handle);
      const body = await postJson(`/eve/v1/session/${state.sessionId}`, {
        message: message.text,
        continuationToken: state.continuationToken,
        taskId: message.taskId ?? null,
        workflowId: message.workflowId ?? null,
      });
      state.continuationToken = extractContinuationToken(body) ?? state.continuationToken;
      state.artifactPath = resolveArtifactPath(state.workspace, extractArtifactPath(body)) ?? state.artifactPath;
      state.status = state.artifactPath ? 'done' : state.status;
    },

    async readState(handle: WorkerHandle): Promise<PartialStateCard> {
      const state = stateFor(handle);
      if (state.status === 'working') await refreshFromStream(state);
      return {
        status: state.status === 'done' ? 'complete' : state.status === 'stopped' ? 'stopped' : 'active',
        lastMeaningfulUpdate: state.sessionId,
      };
    },

    async collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]> {
      const state = stateFor(handle);
      if (!state.artifactPath) await refreshFromStream(state);
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
        summary: `eve artifact from session ${state.sessionId}`,
        artifactFilePath: state.artifactPath,
        artifactKind: 'file',
        contentHash,
        mediaType: 'text/plain',
        sizeBytes: bytes.length,
        metadata: {
          harnessKind: 'eve-harness',
          eveSessionId: state.sessionId,
          workspace: state.workspace,
        },
      }];
    },

    async stop(handle: WorkerHandle): Promise<void> {
      stateFor(handle).status = 'stopped';
    },
  };

  async function refreshFromStream(state: EveState): Promise<void> {
    const res = await fetchImpl(`${baseUrl}/eve/v1/session/${state.sessionId}/stream`, {
      method: 'GET',
      headers: { accept: 'application/x-ndjson' },
    });
    if (res.ok === false) throw new Error(`Eve HTTP error: ${res.status ?? 'unknown'}`);
    if (res.body) {
      await readStreamUntilArtifact(state, res.body);
      return;
    }
    processStreamText(state, await parseText(res));
  }
}

async function readStreamUntilArtifact(state: EveState, body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      processStreamText(state, lines.join('\n'));
      if (state.status === 'done') {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    if (buffer.trim()) processStreamText(state, buffer);
  } finally {
    reader.releaseLock();
  }
}

function processStreamText(state: EveState, text: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as unknown;
      state.artifactPath = resolveArtifactPath(state.workspace, extractArtifactPath(event)) ?? state.artifactPath;
      if (isDoneEvent(event) && state.artifactPath) state.status = 'done';
    } catch {
      // Ignore malformed or partial stream lines.
    }
  }
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

function isDoneEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const event = value as { type?: unknown };
  return event.type === 'message.completed'
    || event.type === 'turn.completed'
    || event.type === 'session.waiting'
    || event.type === 'session.completed';
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
