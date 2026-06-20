import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createEveHarness } from './index';

describe('eve-harness', () => {
  test('opens a session, sends instruction, and translates workspace artifact into a receipt draft', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const artifactBody = 'eve result';
    const workspace = resolve(process.cwd(), 'eve-workspace');
    const artifactPath = join(workspace, 'out', 'proof.md');
    const harness = createEveHarness({
      baseUrl: 'http://127.0.0.1:3000',
      workspace,
      fetch: async (url, init) => {
        calls.push({ url, body: JSON.parse(init?.body ?? '{}') });
        if (url.endsWith('/eve/v1/session')) {
          return { ok: true, json: async () => ({ sessionId: 's1' }) };
        }
        return {
          ok: true,
          json: async () => ({ sessionId: 's1', artifactPath: 'out/proof.md', state: 'done' }),
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
    ]);
    expect(handle.eveSessionId).toBe('s1');
    expect((await harness.readState(handle)).status).toBe('complete');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.artifactFilePath).toBe(artifactPath);
    expect(drafts[0]?.contentHash).toBe(createHash('sha256').update(artifactBody).digest('hex'));
    expect(drafts[0]?.metadata?.['eveSessionId']).toBe('s1');
    expect(await harness.collectReceipts(handle)).toEqual([]);
  });
});
