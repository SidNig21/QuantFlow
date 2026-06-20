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
        taskId: message.taskId ?? null,
        workflowId: message.workflowId ?? null,
      });
      state.artifactPath = resolveArtifactPath(state.workspace, extractArtifactPath(body)) ?? state.artifactPath;
      state.status = state.artifactPath ? 'done' : state.status;
    },

    async readState(handle: WorkerHandle): Promise<PartialStateCard> {
      const state = stateFor(handle);
      return {
        status: state.status === 'done' ? 'complete' : state.status === 'stopped' ? 'stopped' : 'active',
        lastMeaningfulUpdate: state.sessionId,
      };
    },

    async collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]> {
      const state = stateFor(handle);
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

function extractSessionId(value: unknown): string | null {
  const found = findStringField(value, new Set(['sessionId', 'session_id', 'id']));
  return found?.trim() || null;
}

function extractArtifactPath(value: unknown): string | null {
  const direct = findStringField(value, new Set(['artifactPath', 'artifact_path', 'filePath', 'file_path', 'path', 'uri']));
  if (direct) return direct;
  if (typeof value === 'string') {
    const match = value.match(/ARTIFACT_PATH:\s*(.+)$/m);
    return match?.[1]?.trim() ?? null;
  }
  return null;
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

function resolveArtifactPath(workspace: string, path: string | null): string | null {
  if (!path) return null;
  return isAbsolute(path) ? resolve(path) : resolve(workspace, path);
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
