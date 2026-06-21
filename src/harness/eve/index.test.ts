import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createEveHarness } from './index';

describe('eve-harness', () => {
  test('opens a session, sends instruction, and translates workspace artifact into a receipt draft', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const artifactBody = 'eve result';
    const workspace = resolve(process.cwd(), 'eve-workspace');
    const artifactPath = join(workspace, 'out', 'proof.md');
    const harness = createEveHarness({
      baseUrl: 'http://127.0.0.1:3000',
      workspace,
      fetch: async (url, init) => {
        calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
        if (url.endsWith('/eve/v1/session/s1/stream')) {
          return {
            ok: true,
            text: async () => [
              JSON.stringify({ type: 'message.completed', data: { path: '/wrong/tool/path.md', message: 'ARTIFACT_PATH:out/proof.md' } }),
              JSON.stringify({ type: 'session.waiting', data: {} }),
            ].join('\n'),
          };
        }
        if (url.endsWith('/eve/v1/session')) {
          return { ok: true, json: async () => ({ sessionId: 's1', continuationToken: 'tok1' }) };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, sessionId: 's1', continuationToken: 'tok2' }),
        };
      },
      fs: {
        existsSync: (path) => path === artifactPath,
        readFileSync: () => artifactBody,
      },
    });

    const handle = await harness.spawn({ tileId: 'tile1', workflowId: 'wf1', activationPrompt: 'hello' });
    await harness.send(handle, { text: 'Do work', taskId: 'task1', workflowId: 'wf1' });
    const drafts = await harness.collectReceipts(handle);

    expect(calls.map((c) => c.url)).toEqual([
      'http://127.0.0.1:3000/eve/v1/session',
      'http://127.0.0.1:3000/eve/v1/session/s1',
      'http://127.0.0.1:3000/eve/v1/session/s1/stream',
    ]);
    expect(handle.eveSessionId).toBe('s1');
    expect(calls[1]?.body?.continuationToken).toBe('tok1');
    expect((await harness.readState(handle)).status).toBe('complete');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.artifactFilePath).toBe(artifactPath);
    expect(drafts[0]?.contentHash).toBe(createHash('sha256').update(artifactBody).digest('hex'));
    expect(drafts[0]?.metadata?.['eveSessionId']).toBe('s1');
    expect(await harness.collectReceipts(handle)).toEqual([]);
  });

  test('throws when Eve declares an artifact path but the file is absent', async () => {
    const workspace = resolve(process.cwd(), 'eve-workspace');
    const harness = createEveHarness({
      baseUrl: 'http://127.0.0.1:3000',
      workspace,
      fetch: async (url) => {
        if (url.endsWith('/eve/v1/session/s1/stream')) {
          return {
            ok: true,
            text: async () => JSON.stringify({
              type: 'message.completed',
              data: { message: 'ARTIFACT_PATH:out/missing.md' },
            }),
          };
        }
        if (url.endsWith('/eve/v1/session')) {
          return { ok: true, json: async () => ({ sessionId: 's1', continuationToken: 'tok1' }) };
        }
        return { ok: true, json: async () => ({ ok: true, sessionId: 's1', continuationToken: 'tok2' }) };
      },
      fs: {
        existsSync: () => false,
        readFileSync: () => {
          throw new Error('readFileSync should not be called for a missing artifact');
        },
      },
    });

    const handle = await harness.spawn({ tileId: 'tile1', workflowId: 'wf1', activationPrompt: 'hello' });
    await harness.send(handle, { text: 'Do work', taskId: 'task1', workflowId: 'wf1' });

    await expect(harness.collectReceipts(handle)).rejects.toThrow('eve-harness artifact missing');
  });
});
