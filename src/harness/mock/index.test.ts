import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockHarness } from './index';

describe('mock harness', () => {
  test('records send, writes a real artifact, returns one draft, and does not duplicate receipts', async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-mock-harness-'));
    const harness = createMockHarness({ artifactRoot });
    const handle = await harness.spawn({ tileId: 'tile1', workflowId: 'wf1' });

    expect(handle.kind).toBe('mock');
    await harness.send(handle, {
      text: 'Do one thing',
      taskId: 'task1',
      workflowId: 'wf1',
      artifactRoot,
    });

    expect(harness.getRecordedSends()).toEqual([
      { workerId: 'mock-worker-tile1', text: 'Do one thing', taskId: 'task1' },
    ]);
    expect((await harness.readState(handle)).status).toBe('complete');

    const drafts = await harness.collectReceipts(handle);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.artifactFilePath).toBe(join(artifactRoot, 'task1-mock-artifact.txt'));
    expect(readFileSync(drafts[0]!.artifactFilePath!, 'utf-8')).toContain('Do one thing');
    expect(await harness.collectReceipts(handle)).toEqual([]);

    await harness.stop(handle);
    expect((await harness.readState(handle)).status).toBe('stopped');
  });
});
