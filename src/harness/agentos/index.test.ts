import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSimApprovalGate } from './approval-gate';
import { createAgentOsHarness } from './index';
import { createSimTransport, simStepsFromFixtureEvents } from './sim-transport';

const FIXTURE = join(import.meta.dir, 'fixtures', 'tier2-events-trimmed.jsonl');

function loadFixtureEvents(): unknown[] {
  return readFileSync(FIXTURE, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

describe('agentos-harness', () => {
  test('replays fixture session and produces milestone receipt chain with approval blocking', async () => {
    const events = loadFixtureEvents();
    const workspace = resolve(process.cwd(), 'agentos-workspace');
    const artifactVmPath = '/workspace/tier2-result.txt';
    const artifactBody = 'bindings-approved-hello';
    const gate = createSimApprovalGate(60);
    const transport = createSimTransport({
      steps: simStepsFromFixtureEvents(events, {
        permissionAtIndex: 5,
        permission: {
          requestId: 'perm-1',
          action: 'write tier2 result file',
          source: 'acp',
        },
        artifactPath: artifactVmPath,
        artifactBody,
      }),
    });
    const harness = createAgentOsHarness({ transport, workspace, approvalGate: gate });

    const handle = await harness.spawn({ tileId: 'tile1', workflowId: 'wf1' });
    await harness.send(handle, {
      text: 'Run governed task',
      taskId: 'task1',
      workflowId: 'wf1',
      artifactRoot: workspace,
    });

    const drafts = await harness.collectReceipts(handle);
    const milestones = drafts.map((d) => d.metadata?.['milestone'] ?? d.type);

    expect(handle.agentosSessionId).toBe('sim-session-1');
    expect(gate.records).toHaveLength(1);
    expect(gate.records[0]?.blockedMs).toBeGreaterThan(0);
    expect(milestones[0]).toBe('session.start');
    expect(milestones).toContain('tool.started');
    expect(milestones).toContain('approval.requested');
    expect(milestones).toContain('approval.granted');
    expect(milestones).toContain('artifact.created');
    expect(milestones[milestones.length - 1]).toBe('turn.complete');

    const artifactDraft = drafts.find((d) => d.type === 'task_submitted');
    expect(artifactDraft?.contentHash).toBe(
      createHash('sha256').update(artifactBody).digest('hex'),
    );
    expect(transport.permissionResponses).toEqual([
      { sessionId: 'sim-session-1', requestId: 'perm-1', approved: true },
    ]);
  });

  test('fails fast with unavailable message when transport is unreachable', async () => {
    const transport = createSimTransport({ failPrompt: true });
    const harness = createAgentOsHarness({ transport, workspace: resolve(process.cwd(), 'agentos-down') });
    const handle = await harness.spawn({ tileId: 'tile-down', roleId: 'agentos-down' });
    await expect(
      harness.send(handle, { text: 'probe', taskId: 'task-down' }),
    // V0.3 taxonomy: all unavailable failures format as "AgentOS unavailable: …"
    // (pre-V0.3 threw a raw "agentos-harness unavailable:" prefix).
    ).rejects.toThrow(/AgentOS unavailable/);
  });
});
