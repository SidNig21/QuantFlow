import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  startAgentOsHost,
  stopAgentOsHost,
  windowsPathToWslPath,
} from './host-lifecycle';

describe('agentos-host-lifecycle', () => {
  test('windowsPathToWslPath converts drive paths', () => {
    expect(windowsPathToWslPath('C:\\Users\\rybow\\QuantFlow')).toBe('/mnt/c/Users/rybow/QuantFlow');
  });

  test('start polls health and stop disposes', async () => {
    let killed = false;
    const spawnCalls: Array<{ command: string; args: string[] }> = [];

    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/health') return Response.json({ ok: true });
        if (url.pathname === '/dispose' && req.method === 'POST') return Response.json({ ok: true });
        return new Response('not found', { status: 404 });
      },
    });

    const handle = await startAgentOsHost({
      repoRoot: join(process.cwd()),
      host: '127.0.0.1',
      port: server.port!,
      healthTimeoutMs: 5_000,
      pollIntervalMs: 50,
      spawn: (command, args) => {
        spawnCalls.push({ command, args });
        return { pid: 4242, kill() { killed = true; } };
      },
    });

    expect(handle.port).toBe(server.port);
    expect(spawnCalls[0]?.command).toBe('wsl.exe');
    expect(spawnCalls[0]?.args[0]).toBe('-e');
    expect(spawnCalls[0]?.args.join(' ')).toContain('agentos-host');

    await stopAgentOsHost(handle);
    expect(killed).toBe(true);

    server.stop(true);
  });
});
