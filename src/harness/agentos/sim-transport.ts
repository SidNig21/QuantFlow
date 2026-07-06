/**
 * Deterministic SimTransport — replays scripted ACP session/update events with no
 * network, WSL, or API keys. Used by unit tests and qa/agentos-atom.
 */
import type { AgentOsPermissionRequest, AgentOsTransport } from './transport';

export interface SimTransportStep {
  kind: 'event' | 'permission' | 'prompt-resolve' | 'artifact';
  delayMs?: number;
  event?: unknown;
  permission?: AgentOsPermissionRequest;
  artifactPath?: string;
  artifactBody?: string;
}

export interface SimTransportOptions {
  sessionId?: string;
  steps?: SimTransportStep[];
  failHealth?: boolean;
  failCreate?: boolean;
  failPrompt?: boolean;
}

export function createSimTransport(options: SimTransportOptions = {}): AgentOsTransport & {
  readonly promptCalls: Array<{ sessionId: string; text: string }>;
  readonly permissionResponses: Array<{ sessionId: string; requestId: string; approved: boolean }>;
} {
  const baseSessionId = options.sessionId ?? 'sim-session-1';
  // Each createSession() call must yield a DISTINCT id so multiple tiles can
  // coexist (a2a-cable / orchestrator / actors-demo spawn 2+ sessions). The
  // first call keeps the base id for single-session callers/tests.
  let sessionCounter = 0;
  const sessionId = baseSessionId;
  const steps = [...(options.steps ?? [])];
  const promptCalls: Array<{ sessionId: string; text: string }> = [];
  const permissionResponses: Array<{ sessionId: string; requestId: string; approved: boolean }> = [];
  const eventHandlers = new Map<string, Array<(event: unknown) => void>>();
  const permissionHandlers = new Map<string, Array<(request: AgentOsPermissionRequest) => void>>();
  const artifacts = new Map<string, Uint8Array>();
  const terminalHandlers = new Map<string, Array<(data: Uint8Array) => void>>();
  const terminalInput = new Map<string, string>();
  const shellToSession = new Map<string, string>();
  let disposed = false;
  let replayPromise: Promise<void> | null = null;

  function getHandlers<T>(map: Map<string, Array<(arg: T) => void>>, id: string): Array<(arg: T) => void> {
    return map.get(id) ?? [];
  }

  async function replay(session: string): Promise<void> {
    for (const step of steps) {
      if (disposed) return;
      if (step.delayMs) await new Promise((resolve) => setTimeout(resolve, step.delayMs));
      if (step.kind === 'event' && step.event) {
        for (const handler of getHandlers(eventHandlers, session)) handler(step.event);
      }
      if (step.kind === 'permission' && step.permission) {
        for (const handler of getHandlers(permissionHandlers, session)) {
          await handler(step.permission);
        }
      }
      if (step.kind === 'artifact' && step.artifactPath) {
        artifacts.set(step.artifactPath, new TextEncoder().encode(step.artifactBody ?? ''));
      }
      if (step.kind === 'prompt-resolve') {
        return;
      }
    }
  }

  function emitTerminal(shellId: string, text: string): void {
    const bytes = new TextEncoder().encode(text);
    for (const handler of terminalHandlers.get(shellId) ?? []) handler(bytes);
  }

  return {
    promptCalls,
    permissionResponses,

    async createSession() {
      if (options.failCreate) throw new Error('ECONNREFUSED');
      if (options.failHealth) throw new Error('agentos host unavailable');
      sessionCounter += 1;
      const id = sessionCounter === 1 ? baseSessionId : `${baseSessionId}-${sessionCounter}`;
      return { sessionId: id };
    },

    async prompt(id, text) {
      if (options.failPrompt) throw new Error('ECONNREFUSED');
      promptCalls.push({ sessionId: id, text });
      replayPromise = replay(id);
      await replayPromise;
    },

    onSessionEvent(id, handler) {
      const list = eventHandlers.get(id) ?? [];
      list.push(handler);
      eventHandlers.set(id, list);
      return () => {
        const current = eventHandlers.get(id) ?? [];
        eventHandlers.set(id, current.filter((h) => h !== handler));
      };
    },

    onPermissionRequest(id, handler) {
      const list = permissionHandlers.get(id) ?? [];
      list.push(handler);
      permissionHandlers.set(id, list);
      return () => {
        const current = permissionHandlers.get(id) ?? [];
        permissionHandlers.set(id, current.filter((h) => h !== handler));
      };
    },

    async respondPermission(id, requestId, approved) {
      permissionResponses.push({ sessionId: id, requestId, approved });
    },

    async readFile(path) {
      const body = artifacts.get(path);
      if (!body) throw new Error(`sim artifact missing: ${path}`);
      return body;
    },

    async dispose() {
      disposed = true;
      if (replayPromise) await replayPromise.catch(() => {});
    },

    async health() {
      if (options.failHealth) return { ok: false };
      return { ok: true, hasCredential: true };
    },

    async openTerminal(id, _cols, _rows) {
      const shellId = `sim-shell-${id}`;
      shellToSession.set(shellId, id);
      terminalInput.set(shellId, '');
      queueMicrotask(() => {
        emitTerminal(shellId, '\r\nAgentOS actor ready (sim). Type a message and press Enter.\r\n> ');
      });
      return { shellId };
    },

    async writeTerminal(shellId, data) {
      const prior = terminalInput.get(shellId) ?? '';
      const next = prior + data;
      terminalInput.set(shellId, next);
      if (!next.includes('\r') && !next.includes('\n')) return;
      const line = next.replace(/[\r\n]+$/, '').trim();
      terminalInput.set(shellId, '');
      if (!line) {
        emitTerminal(shellId, '> ');
        return;
      }
      const session = shellToSession.get(shellId) ?? sessionId;
      await (async () => {
        if (options.failPrompt) throw new Error('ECONNREFUSED');
        promptCalls.push({ sessionId: session, text: line });
        replayPromise = replay(session);
        await replayPromise;
      })();
      emitTerminal(shellId, `\r\n[sim] received: ${line}\r\n> `);
    },

    async resizeTerminal(_shellId, _cols, _rows) {
      // no-op in sim
    },

    onTerminalData(shellId, handler) {
      const list = terminalHandlers.get(shellId) ?? [];
      list.push(handler);
      terminalHandlers.set(shellId, list);
      return () => {
        const current = terminalHandlers.get(shellId) ?? [];
        terminalHandlers.set(shellId, current.filter((h) => h !== handler));
      };
    },

    async closeTerminal(shellId) {
      terminalHandlers.delete(shellId);
      terminalInput.delete(shellId);
      shellToSession.delete(shellId);
    },
  };
}

/** Build sim steps from anonymized tier2 fixture lines (JSONL strings or objects). */
export function simStepsFromFixtureEvents(
  events: unknown[],
  opts: {
    permissionAtIndex?: number;
    permission?: AgentOsPermissionRequest;
    artifactPath?: string;
    artifactBody?: string;
  } = {},
): SimTransportStep[] {
  const steps: SimTransportStep[] = [];
  events.forEach((event, index) => {
    steps.push({ kind: 'event', event });
    if (opts.permissionAtIndex === index && opts.permission) {
      steps.push({ kind: 'permission', permission: opts.permission });
    }
  });
  if (opts.artifactPath) {
    steps.push({
      kind: 'artifact',
      artifactPath: opts.artifactPath,
      artifactBody: opts.artifactBody ?? 'bindings-approved-hello',
    });
  }
  steps.push({ kind: 'prompt-resolve' });
  return steps;
}
