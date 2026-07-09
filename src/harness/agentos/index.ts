/**
 * AgentOS harness — external-runtime evidence feed (Stage F2 fence + P5 adapter).
 *
 * Sim-first: depends on injected AgentOsTransport (localhost JSON-RPC seam the WSL
 * host will implement). Reports facts via ReceiptDraft only; never writes Kernel
 * state or calls emitKernelEvent. When transport is unreachable, operations fail
 * with `agentos-harness unavailable` — they do not block app boot.
 */
import { createHash } from 'node:crypto';
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
import type { ApprovalGate } from './approval-gate';
import { createSimApprovalGate } from './approval-gate';
import type { AgentOsPermissionRequest, AgentOsTransport } from './transport';
import { formatAgentOsUnavailable } from './error-messages';
import {
  createAcpTranslatorState,
  translateAgentReply,
  translateApprovalGranted,
  translateApprovalRequested,
  translateSessionUpdate,
  translateTurnComplete,
  type AcpTranslatorState,
} from './translator';

export const agentosHarness: HarnessDescriptor = {
  kind: 'agentos',
  description: 'AgentOS harness-of-record adapter (WSL sidecar host, injected transport)',
  configSchema: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'number', default: 7430 },
    software: { type: 'string', default: 'pi' },
  },
};

export interface AgentOsHarnessOptions {
  transport: AgentOsTransport;
  workspace?: string;
  software?: string;
  approvalGate?: ApprovalGate;
  fs?: {
    readFile?(path: string): Uint8Array | string;
  };
}

interface AgentOsState {
  agentosSessionId: string | null;
  status: 'idle' | 'working' | 'done' | 'stopped';
  workspace: string;
  taskId: string | null;
  workflowId: string | null;
  translator: AcpTranslatorState;
  pendingReceipts: ReceiptDraft[];
  collectedIndices: Set<number>;
  artifactPath: string | null;
  artifactVmPath: string | null;
  artifactLoaded: boolean;
  turnComplete: boolean;
  unsubscribers: Array<() => void>;
}

export function createAgentOsHarness(options: AgentOsHarnessOptions): WorkerHarness {
  if (!options.transport) throw new Error('agentos harness requires injected transport');
  const transport = options.transport;
  const workspace = resolve(options.workspace ?? process.cwd());
  const software = options.software ?? 'pi';
  const approvalGate = options.approvalGate ?? createSimApprovalGate(50);
  const io = options.fs;
  const states = new Map<string, AgentOsState>();

  function formatUnavailable(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return formatAgentOsUnavailable(detail);
  }

  async function ensureHealthy(): Promise<void> {
    const health = await transport.health();
    if (!health.ok) {
      throw new Error(formatAgentOsUnavailable('agentos host health check failed'));
    }
  }

  function stateFor(handle: WorkerHandle, fallbackWorkspace = workspace): AgentOsState {
    let state = states.get(handle.workerId);
    if (!state) {
      state = {
        agentosSessionId: handle.agentosSessionId ?? null,
        status: handle.agentosSessionId ? 'working' : 'idle',
        workspace: resolve(handle.workspacePath ?? fallbackWorkspace),
        taskId: null,
        workflowId: null,
        translator: createAcpTranslatorState(),
        pendingReceipts: [],
        collectedIndices: new Set(),
        artifactPath: null,
        artifactVmPath: null,
        artifactLoaded: false,
        turnComplete: false,
        unsubscribers: [],
      };
      states.set(handle.workerId, state);
    }
    return state;
  }

  function translatorContext(state: AgentOsState): {
    taskId: string | null;
    workflowId: string | null;
    harnessKind: string;
  } {
    return {
      taskId: state.taskId,
      workflowId: state.workflowId,
      harnessKind: 'agentos',
    };
  }

  function queueDrafts(state: AgentOsState, drafts: ReceiptDraft[]): void {
    state.pendingReceipts.push(...drafts);
  }

  function resolveWorkspacePath(state: AgentOsState, path: string): string {
    if (path === '/workspace') return state.workspace;
    if (path.startsWith('/workspace/')) {
      return resolve(state.workspace, path.slice('/workspace/'.length));
    }
    return isAbsolute(path) ? resolve(path) : resolve(state.workspace, path);
  }

  async function handlePermissionRequest(
    state: AgentOsState,
    sessionId: string,
    request: AgentOsPermissionRequest,
  ): Promise<void> {
    const action = request.action ?? 'operator approval';
    const ctx = translatorContext(state);
    queueDrafts(state, [translateApprovalRequested(action, ctx, {
      requestId: request.requestId,
      source: request.source ?? 'acp',
      toolCallId: request.toolCallId ?? null,
    })]);

    const result = await approvalGate.request({
      requestId: request.requestId,
      action,
      source: request.source ?? 'acp',
      toolCallId: request.toolCallId ?? null,
    });

    queueDrafts(state, [translateApprovalGranted(action, result.blockedMs, ctx, {
      requestId: request.requestId,
      source: request.source ?? 'acp',
    })]);

    await transport.respondPermission(sessionId, request.requestId, result.approved);
  }

  function wireSession(sessionId: string, state: AgentOsState): void {
    for (const unsub of state.unsubscribers) unsub();
    state.unsubscribers = [];

    state.unsubscribers.push(transport.onSessionEvent(sessionId, (event) => {
      const drafts = translateSessionUpdate(event, state.translator, translatorContext(state));
      if (drafts.length > 0) queueDrafts(state, drafts);

      const vmPath = extractToolArtifactPath(event);
      if (vmPath) {
        state.artifactVmPath = vmPath;
        state.artifactPath = resolveWorkspacePath(state, vmPath);
      }
    }));

    state.unsubscribers.push(transport.onPermissionRequest(sessionId, async (request) => {
      await handlePermissionRequest(state, sessionId, request);
    }));
  }

  async function tryQueueArtifactReceipt(state: AgentOsState): Promise<void> {
    if (state.artifactLoaded || !state.artifactVmPath) return;
    try {
      const raw = io?.readFile && state.artifactPath
        ? io.readFile(state.artifactPath)
        : await transport.readFile(state.artifactVmPath);
      const bytes = typeof raw === 'string' ? Buffer.from(raw) : Buffer.from(raw);
      state.artifactLoaded = true;
      queueDrafts(state, [{
        type: 'task_submitted',
        summary: `agentos artifact from session ${state.agentosSessionId ?? 'unknown'}`,
        taskId: state.taskId,
        artifactFilePath: state.artifactPath ?? state.artifactVmPath,
        artifactKind: 'file',
        contentHash: createHash('sha256').update(bytes).digest('hex'),
        mediaType: 'text/plain',
        sizeBytes: bytes.length,
        metadata: {
          harnessKind: 'agentos',
          agentosSessionId: state.agentosSessionId,
          workspace: state.workspace,
          milestone: 'artifact.created',
        },
      }]);
      state.status = 'done';
    } catch {
      // Artifact may not be ready until a later collectReceipts call.
    }
  }

  return {
    kind: 'agentos',

    async spawn(input: SpawnWorkerInput): Promise<WorkerHandle> {
      const tileId = input.tileId ?? 'agentos-pending';
      const handle: WorkerHandle = {
        workerId: input.roleId ?? `agentos-worker-${tileId}`,
        tileId,
        kind: 'agentos',
        agentosSessionId: null,
        workspacePath: resolve(input.cwd ?? workspace),
      };
      states.set(handle.workerId, {
        agentosSessionId: null,
        status: 'idle',
        workspace: handle.workspacePath,
        taskId: null,
        workflowId: null,
        translator: createAcpTranslatorState(),
        pendingReceipts: [],
        collectedIndices: new Set(),
        artifactPath: null,
        artifactVmPath: null,
        artifactLoaded: false,
        turnComplete: false,
        unsubscribers: [],
      });
      return handle;
    },

    async send(handle: WorkerHandle, message: WorkerMessage): Promise<void> {
      const state = stateFor(handle, message.artifactRoot ?? workspace);
      state.taskId = message.taskId ?? state.taskId;
      state.workflowId = message.workflowId ?? state.workflowId;
      state.status = 'working';
      state.turnComplete = false;

      try {
        await ensureHealthy();
        if (!state.agentosSessionId) {
          const created = await transport.createSession(software, {});
          state.agentosSessionId = created.sessionId;
          handle.agentosSessionId = created.sessionId;
          wireSession(created.sessionId, state);
        }

        const promptText = message.appendNewline === false ? message.text : `${message.text}\n`;
        const reply = await transport.prompt(state.agentosSessionId, promptText);

        await tryQueueArtifactReceipt(state);
        queueDrafts(state, translateAgentReply(reply.text, translatorContext(state), reply.response));
        queueDrafts(state, translateTurnComplete(state.translator, translatorContext(state)));
        state.turnComplete = true;
        state.status = state.artifactPath ? 'done' : 'working';
      } catch (error) {
        throw new Error(formatUnavailable(error));
      }
    },

    async readState(handle: WorkerHandle): Promise<PartialStateCard> {
      const state = stateFor(handle);
      return {
        status: state.status === 'done'
          ? 'complete'
          : state.status === 'stopped'
            ? 'stopped'
            : 'active',
        lastMeaningfulUpdate: state.agentosSessionId,
        blocker: state.status === 'working' && !state.turnComplete ? 'awaiting-turn' : null,
      };
    },

    async collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]> {
      const state = stateFor(handle);
      const out: ReceiptDraft[] = [];

      if (!state.artifactLoaded && state.artifactVmPath && state.turnComplete) {
        await tryQueueArtifactReceipt(state);
      }

      for (let i = 0; i < state.pendingReceipts.length; i += 1) {
        if (state.collectedIndices.has(i)) continue;
        state.collectedIndices.add(i);
        out.push(state.pendingReceipts[i]!);
      }

      return out;
    },

    async stop(handle: WorkerHandle): Promise<void> {
      const state = stateFor(handle);
      state.status = 'stopped';
      for (const unsub of state.unsubscribers) unsub();
      state.unsubscribers = [];
      states.delete(handle.workerId);
    },
  };
}

function extractToolArtifactPath(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const params = (event as { params?: { update?: Record<string, unknown> } }).params;
  const update = params?.update;
  if (!update) return null;
  if (update['sessionUpdate'] !== 'tool_call' && update['sessionUpdate'] !== 'tool_call_update') {
    return null;
  }

  const locations = update['locations'];
  if (Array.isArray(locations) && locations.length > 0) {
    const first = locations[0];
    if (first && typeof first === 'object') {
      const path = (first as { path?: unknown }).path;
      if (typeof path === 'string') return path;
    }
  }

  const rawInput = update['rawInput'];
  if (rawInput && typeof rawInput === 'object') {
    const path = (rawInput as { path?: unknown }).path;
    if (typeof path === 'string') return path;
  }

  return null;
}
