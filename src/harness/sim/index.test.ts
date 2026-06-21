import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSimHarness } from './index';

describe('sim harness', () => {
  test('wraps mock success path and annotates the draft', async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-sim-'));
    const harness = createSimHarness({ artifactRoot, defaultScenario: 'reload-mid-run' });
    const handle = await harness.spawn({ tileId: 'tile1', harnessKind: 'mock' });

    await harness.send(handle, { text: 'do it', taskId: 'task1', artifactRoot });
    expect((await harness.readState(handle)).status).toBe('complete');
    const drafts = await harness.collectReceipts(handle);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.metadata?.simScenario).toBe('reload-mid-run');
    expect(drafts[0]!.artifactFilePath && existsSync(drafts[0]!.artifactFilePath)).toBe(true);
    expect(await harness.collectReceipts(handle)).toEqual([]);
    expect(harness.getRecordedSends()).toHaveLength(1);
  });

  test('catalog exposes bad artifact, missing artifact, timeout, and checkpoint states', async () => {
    const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-sim-'));
    const harness = createSimHarness({
      artifactRoot,
      scenarioByTaskId: {
        bad: 'bad-artifact',
        missing: 'downstream-missing-artifact',
        timeout: 'timeout',
        hitl: 'human-checkpoint',
      },
    });
    const handle = await harness.spawn({ tileId: 'tile1', harnessKind: 'mock' });

    await harness.send(handle, { text: 'bad', taskId: 'bad', artifactRoot });
    expect((await harness.collectReceipts(handle))[0]!.contentHash).toBe('sim-bad-sha256');

    await harness.send(handle, { text: 'missing', taskId: 'missing', artifactRoot });
    const missing = (await harness.collectReceipts(handle))[0]!;
    expect(missing.artifactFilePath && existsSync(missing.artifactFilePath)).toBe(false);

    await harness.send(handle, { text: 'timeout', taskId: 'timeout', artifactRoot });
    expect((await harness.readState(handle)).status).toBe('active');
    expect(await harness.collectReceipts(handle)).toEqual([]);

    await harness.send(handle, { text: 'hitl', taskId: 'hitl', artifactRoot });
    const state = await harness.readState(handle);
    expect(state.status).toBe('blocked');
    expect(state.blocker).toContain('human checkpoint');
  });
});
