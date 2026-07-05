import { describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { createHttpAgentOsTransport } from './http-transport';
import type { AgentOsPermissionRequest } from './transport';
import {
  getHostCredentialReport,
  recordHostCredentialReport,
} from './credential-order';

function sseBody(messages: unknown[]): Uint8Array {
  const text = messages.map((m) => `data: ${JSON.stringify(m)}\n\n`).join('');
  return new TextEncoder().encode(text);
}

describe('http-agentos-transport', () => {
  test('createSession, prompt, events, permission, readFile, dispose, health', async () => {
    let disposed = false;
    let permissionResolve: ((approved: boolean) => void) | null = null;
    const permissionWait = new Promise<boolean>((resolve) => {
      permissionResolve = resolve;
    });

    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/health') {
          return Response.json({ ok: !disposed });
        }
        if (url.pathname === '/session' && req.method === 'POST') {
          return Response.json({ sessionId: 'live-1', software: 'pi' });
        }
        if (url.pathname === '/session/live-1/prompt' && req.method === 'POST') {
          return Response.json({ ok: true });
        }
        if (url.pathname === '/session/live-1/events' && req.method === 'GET') {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(sseBody([
                { kind: 'session-event', event: { method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk' } } } },
                { kind: 'permission-request', requestId: 'perm-1', action: 'write file', source: 'toolkit' },
              ]));
              void permissionWait.then((approved) => {
                controller.enqueue(sseBody([
                  { kind: 'session-event', event: { method: 'session/update', params: { update: { sessionUpdate: 'turn_complete' } } } },
                ]));
                controller.close();
              });
              setTimeout(() => permissionResolve?.(true), 10);
            },
          });
          return new Response(stream, {
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        if (url.pathname === '/session/live-1/permission' && req.method === 'POST') {
          const body = await req.json() as { requestId: string; approved: boolean };
          expect(body.requestId).toBe('perm-1');
          expect(body.approved).toBe(true);
          return Response.json({ ok: true });
        }
        if (url.pathname === '/file') {
          return new Response('hello-artifact', {
            headers: { 'content-type': 'application/octet-stream' },
          });
        }
        if (url.pathname === '/dispose' && req.method === 'POST') {
          disposed = true;
          return Response.json({ ok: true });
        }
        return new Response('not found', { status: 404 });
      },
    }) as Server;

    const transport = createHttpAgentOsTransport({
      host: '127.0.0.1',
      port: server.port!,
    });

    expect((await transport.health()).ok).toBe(true);

    const created = await transport.createSession('pi');
    expect(created.sessionId).toBe('live-1');

    const events: unknown[] = [];
    const permissions: AgentOsPermissionRequest[] = [];
    transport.onSessionEvent('live-1', (event) => events.push(event));
    transport.onPermissionRequest('live-1', (request) => {
      permissions.push(request);
      void transport.respondPermission('live-1', request.requestId, true);
    });

    await transport.prompt('live-1', 'run task');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events.length).toBeGreaterThan(0);
    expect(permissions).toHaveLength(1);
    expect(permissions[0]?.requestId).toBe('perm-1');

    const file = await transport.readFile('/workspace/out.txt');
    expect(new TextDecoder().decode(file)).toBe('hello-artifact');

    await transport.dispose();
    expect((await transport.health()).ok).toBe(false);

    server.stop(true);
  });

  test('health returns false when host unreachable', async () => {
    const transport = createHttpAgentOsTransport({
      host: '127.0.0.1',
      port: 1,
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect((await transport.health()).ok).toBe(false);
  });

  test('health caches the host hasCredential report (boolean only)', async () => {
    let payload: Record<string, unknown> = { ok: true, hasCredential: true };
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/health') return Response.json(payload);
        return new Response('not found', { status: 404 });
      },
    }) as Server;

    const transport = createHttpAgentOsTransport({
      host: '127.0.0.1',
      port: server.port!,
    });

    recordHostCredentialReport(null);
    expect((await transport.health()).ok).toBe(true);
    expect(getHostCredentialReport()).toBe(true);

    payload = { ok: true, hasCredential: false };
    expect((await transport.health()).ok).toBe(true);
    expect(getHostCredentialReport()).toBe(false);

    // Unhealthy response leaves the cached report untouched.
    recordHostCredentialReport(true);
    payload = { ok: false };
    expect((await transport.health()).ok).toBe(false);
    expect(getHostCredentialReport()).toBe(true);

    server.stop(true);

    // Unreachable host leaves the cached report untouched.
    expect((await transport.health()).ok).toBe(false);
    expect(getHostCredentialReport()).toBe(true);

    recordHostCredentialReport(null);
  });
});
