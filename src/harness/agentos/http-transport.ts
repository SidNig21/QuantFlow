/**
 * AgentOsTransport over localhost HTTP + SSE against the WSL agentos-host sidecar.
 */
import type { AgentOsPermissionRequest, AgentOsTransport } from './transport';
import { resolveAgentOsHostAddress } from './host-lifecycle';

export type AgentOsFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  body: ReadableStream<Uint8Array> | null;
}>;

export interface HttpAgentOsTransportOptions {
  host?: string;
  port?: number;
  fetch?: AgentOsFetch;
}

interface SseSessionState {
  eventHandlers: Array<(event: unknown) => void>;
  permissionHandlers: Array<(request: AgentOsPermissionRequest) => void | Promise<void>>;
  terminalHandlers: Map<string, Array<(data: Uint8Array) => void>>;
  streamAbort: AbortController | null;
  streamPromise: Promise<void> | null;
  streamReady: Promise<void> | null;
}

function defaultHost(): string {
  return process.env.QF_AGENTOS_HOST?.trim() || '127.0.0.1';
}

function defaultPort(): number {
  const raw = process.env.QF_AGENTOS_PORT ?? process.env.AGENTOS_HOST_PORT ?? '7430';
  return Number.parseInt(raw, 10);
}

function baseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

async function parseJsonResponse(res: Awaited<ReturnType<AgentOsFetch>>): Promise<unknown> {
  if (!res.ok) {
    const detail = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function createHttpAgentOsTransport(
  options: HttpAgentOsTransportOptions = {},
): AgentOsTransport {
  const port = options.port ?? defaultPort();
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  let hostPromise: Promise<string> | null = options.host
    ? Promise.resolve(options.host)
    : null;
  const sessions = new Map<string, SseSessionState>();
  const shellSessions = new Map<string, string>();
  let disposed = false;

  async function getHost(): Promise<string> {
    if (!hostPromise) {
      hostPromise = resolveAgentOsHostAddress({ port, fetch: fetchImpl });
    }
    return hostPromise;
  }

  async function rootUrl(): Promise<string> {
    return baseUrl(await getHost(), port);
  }

  function sessionState(sessionId: string): SseSessionState {
    let state = sessions.get(sessionId);
    if (!state) {
      state = {
        eventHandlers: [],
        permissionHandlers: [],
        terminalHandlers: new Map(),
        streamAbort: null,
        streamPromise: null,
        streamReady: null,
      };
      sessions.set(sessionId, state);
    }
    return state;
  }

  async function ensureEventStream(sessionId: string): Promise<void> {
    const state = sessionState(sessionId);
    if (state.streamReady) return state.streamReady;
    if (disposed) return;

    let resolveReady!: () => void;
    state.streamReady = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const abort = new AbortController();
    state.streamAbort = abort;
    state.streamPromise = (async () => {
      try {
        const res = await fetchImpl(`${await rootUrl()}/session/${encodeURIComponent(sessionId)}/events`, {
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: HTTP ${res.status}`);
        }
        resolveReady();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!disposed && !abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            for (const line of block.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              let parsed: unknown;
              try {
                parsed = JSON.parse(payload);
              } catch {
                continue;
              }
              dispatchSseMessage(sessionId, parsed);
            }
            boundary = buffer.indexOf('\n\n');
          }
        }
      } catch (error) {
        if (!abort.signal.aborted && !disposed) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`agentos event stream: ${detail}`);
        }
      } finally {
        state.streamAbort = null;
        state.streamPromise = null;
        state.streamReady = null;
      }
    })();

    return state.streamReady;
  }

  function dispatchSseMessage(sessionId: string, message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const kind = (message as { kind?: unknown }).kind;
    const state = sessionState(sessionId);

    if (kind === 'permission-request') {
      const request: AgentOsPermissionRequest = {
        requestId: String((message as { requestId?: unknown }).requestId ?? ''),
        action: String((message as { action?: unknown }).action ?? 'operator approval'),
        source: (message as { source?: unknown }).source === 'toolkit' ? 'toolkit' : 'acp',
        toolCallId: typeof (message as { toolCallId?: unknown }).toolCallId === 'string'
          ? (message as { toolCallId: string }).toolCallId
          : undefined,
        raw: (message as { raw?: unknown }).raw,
      };
      for (const handler of state.permissionHandlers) {
        void handler(request);
      }
      return;
    }

    if (kind === 'session-event') {
      const event = (message as { event?: unknown }).event;
      if (event === undefined) return;
      for (const handler of state.eventHandlers) {
        handler(event);
      }
      return;
    }

    if (kind === 'terminal-data') {
      const shellId = String((message as { shellId?: unknown }).shellId ?? '');
      const encoded = String((message as { data?: unknown }).data ?? '');
      if (!shellId || !encoded) return;
      const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
      for (const handler of state.terminalHandlers.get(shellId) ?? []) {
        handler(bytes);
      }
    }
  }

  return {
    async createSession(software, sessionOptions) {
      if (disposed) throw new Error('transport disposed');
      const res = await fetchImpl(`${await rootUrl()}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ software, env: sessionOptions?.env ?? {} }),
      });
      const body = await parseJsonResponse(res) as { sessionId?: string };
      if (!body.sessionId) throw new Error('createSession missing sessionId');
      return { sessionId: body.sessionId };
    },

    async prompt(sessionId, text) {
      if (disposed) throw new Error('transport disposed');
      await ensureEventStream(sessionId);
      const res = await fetchImpl(`${await rootUrl()}/session/${encodeURIComponent(sessionId)}/prompt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      await parseJsonResponse(res);
    },

    onSessionEvent(sessionId, handler) {
      const state = sessionState(sessionId);
      state.eventHandlers.push(handler);
      void ensureEventStream(sessionId);
      return () => {
        state.eventHandlers = state.eventHandlers.filter((h) => h !== handler);
      };
    },

    onPermissionRequest(sessionId, handler) {
      const state = sessionState(sessionId);
      state.permissionHandlers.push(handler);
      void ensureEventStream(sessionId);
      return () => {
        state.permissionHandlers = state.permissionHandlers.filter((h) => h !== handler);
      };
    },

    async respondPermission(sessionId, requestId, approved) {
      if (disposed) throw new Error('transport disposed');
      const res = await fetchImpl(`${await rootUrl()}/session/${encodeURIComponent(sessionId)}/permission`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, approved }),
      });
      await parseJsonResponse(res);
    },

    async readFile(path) {
      if (disposed) throw new Error('transport disposed');
      const res = await fetchImpl(`${await rootUrl()}/file?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const detail = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    },

    async dispose() {
      disposed = true;
      for (const state of sessions.values()) {
        state.streamAbort?.abort();
      }
      sessions.clear();
      try {
        const res = await fetchImpl(`${await rootUrl()}/dispose`, { method: 'POST' });
        if (!res.ok) await res.text();
      } catch {
        // Best-effort when host already stopped.
      }
    },

    async health() {
      try {
        const res = await fetchImpl(`${await rootUrl()}/health`);
        if (!res.ok) return { ok: false };
        const body = await res.json() as { ok?: boolean };
        return { ok: body.ok === true };
      } catch {
        return { ok: false };
      }
    },

    async openTerminal(sessionId, cols, rows) {
      if (disposed) throw new Error('transport disposed');
      await ensureEventStream(sessionId);
      const res = await fetchImpl(`${await rootUrl()}/session/${encodeURIComponent(sessionId)}/terminal/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      });
      const body = await parseJsonResponse(res) as { shellId?: string };
      if (!body.shellId) throw new Error('openTerminal missing shellId');
      shellSessions.set(body.shellId, sessionId);
      return { shellId: body.shellId };
    },

    async writeTerminal(shellId, data) {
      if (disposed) throw new Error('transport disposed');
      const sessionId = shellSessions.get(shellId);
      if (!sessionId) throw new Error(`unknown shell: ${shellId}`);
      const res = await fetchImpl(`${await rootUrl()}/session/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(shellId)}/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      await parseJsonResponse(res);
    },

    async resizeTerminal(shellId, cols, rows) {
      if (disposed) throw new Error('transport disposed');
      const sessionId = shellSessions.get(shellId);
      if (!sessionId) throw new Error(`unknown shell: ${shellId}`);
      const res = await fetchImpl(`${await rootUrl()}/session/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(shellId)}/resize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cols, rows }),
      });
      await parseJsonResponse(res);
    },

    onTerminalData(shellId, handler) {
      const sessionId = shellSessions.get(shellId) ?? 'default';
      const state = sessionState(sessionId);
      const list = state.terminalHandlers.get(shellId) ?? [];
      list.push(handler);
      state.terminalHandlers.set(shellId, list);
      return () => {
        const current = state.terminalHandlers.get(shellId) ?? [];
        state.terminalHandlers.set(shellId, current.filter((h) => h !== handler));
      };
    },

    async closeTerminal(shellId) {
      if (disposed) throw new Error('transport disposed');
      const sessionId = shellSessions.get(shellId);
      if (!sessionId) return;
      const res = await fetchImpl(`${await rootUrl()}/session/${encodeURIComponent(sessionId)}/terminal/${encodeURIComponent(shellId)}/close`, {
        method: 'POST',
      });
      await parseJsonResponse(res);
      shellSessions.delete(shellId);
    },
  };
}
