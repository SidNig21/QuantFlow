import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSimApprovalGate } from './approval-gate';
import { createAgentOsHarness } from './index';
import { createSimTransport, simStepsFromFixtureEvents } from './sim-transport';
import type { AgentOsSessionOptions } from './transport';

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
    const baseTransport = createSimTransport({
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
    const createCalls: Array<{
      software: string;
      options: AgentOsSessionOptions | undefined;
    }> = [];
    const readCalls: Array<{ path: string; sessionId: string | undefined }> = [];
    const transport = {
      ...baseTransport,
      async createSession(software: string, options?: AgentOsSessionOptions) {
        createCalls.push({ software, options });
        return baseTransport.createSession();
      },
      async readFile(path: string, sessionId?: string) {
        readCalls.push({ path, sessionId });
        return baseTransport.readFile(path);
      },
    };
    const harness = createAgentOsHarness({ transport, workspace, approvalGate: gate });

    const handle = await harness.spawn({
      tileId: 'tile1',
      workspaceId: 'workspace-actor-key',
      workflowId: 'wf1',
    });
    await harness.send(handle, {
      text: 'Run governed task',
      taskId: 'task1',
      workflowId: 'wf1',
      artifactRoot: workspace,
    });

    const drafts = await harness.collectReceipts(handle);
    const milestones = drafts.map((d) => d.metadata?.['milestone'] ?? d.type);

    expect(handle.agentosSessionId).toBe('sim-session-1');
    expect(handle.workspaceId).toBe('workspace-actor-key');
    expect(createCalls).toEqual([{
      software: 'pi',
      options: {
        workspaceId: 'workspace-actor-key',
        tileId: 'tile1',
      },
    }]);
    expect(readCalls).toEqual([{
      path: artifactVmPath,
      sessionId: 'sim-session-1',
    }]);
    expect(gate.records).toHaveLength(1);
    expect(gate.records[0]?.blockedMs).toBeGreaterThan(0);
    expect(milestones[0]).toBe('session.start');
    expect(milestones).toContain('tool.started');
    expect(milestones).toContain('approval.requested');
    expect(milestones).toContain('approval.granted');
    expect(milestones).toContain('artifact.created');
    expect(milestones).toContain('agent.reply');
    expect(milestones[milestones.length - 1]).toBe('turn.complete');

    const replyDraft = drafts.find((d) => d.metadata?.['milestone'] === 'agent.reply');
    expect(replyDraft?.metadata?.['replySnippet']).toBe('sim prompt completed');

    const artifactDraft = drafts.find((d) => d.type === 'task_submitted');
    expect(artifactDraft?.contentHash).toBe(
      createHash('sha256').update(artifactBody).digest('hex'),
    );
    expect(transport.permissionResponses).toEqual([
      { sessionId: 'sim-session-1', requestId: 'perm-1', approved: true },
    ]);
  });

  test('stop tears down worker state without disposing the shared transport', async () => {
    const transport = createSimTransport({ steps: [] });
    let disposeCalls = 0;
    const trackingTransport = {
      ...transport,
      dispose: async () => {
        disposeCalls += 1;
        await transport.dispose();
      },
    };
    const harness = createAgentOsHarness({
      transport: trackingTransport,
      workspace: resolve(process.cwd(), 'agentos-stop'),
    });
    const handle = await harness.spawn({ tileId: 'tile-stop' });
    await harness.stop(handle);
    expect(disposeCalls).toBe(0);
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
