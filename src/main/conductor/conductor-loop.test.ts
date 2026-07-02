import { describe, expect, test } from 'bun:test';
import { createConductorLoop, evaluateRunBudget } from './conductor-loop';
import type { ConductorContext } from '../../kernel/conductor/index';
import type { WorkflowProjection } from '../../kernel/workflows/index';

function context(patch: Partial<ConductorContext> = {}): ConductorContext {
  return {
    workflow: null,
    tiles: [],
    stateCards: [],
    tasks: [],
    recentReceipts: [],
    ...patch,
  };
}

function workflowProjection(budget: Record<string, unknown>, patch: Partial<WorkflowProjection> = {}): WorkflowProjection {
  return {
    workflowId: 'wf1',
    objective: 'o',
    status: 'active',
    mode: 'sim',
    budget,
    checkpointState: null,
    startedAt: 1_000,
    endedAt: null,
    taskIds: [],
    artifactIds: [],
    receiptIds: [],
    ...patch,
  };
}

describe('conductor-loop R4 budget enforcement', () => {
  test('evaluateRunBudget covers worker, tool-call, checkpoint, wallclock, spend, and retry budgets', () => {
    expect(evaluateRunBudget(
      context({ tiles: [{ id: 'w1', displayName: 'W1', tileKind: 'worker', status: 'active' }] }),
      workflowProjection({ max_workers: 0 }),
      2_000,
    )?.key).toBe('max_workers');

    expect(evaluateRunBudget(
      context({ recentReceipts: [{ id: 'r1', type: 'planning', taskId: null, workflowId: 'wf1', workerId: null, tileId: null, summary: '', artifactRefs: [], parentReceiptId: null, correlationId: null, createdAt: 1, metadata: { phase: 'executed' } }] }),
      workflowProjection({ max_tool_calls: 1 }),
      2_000,
    )?.key).toBe('max_tool_calls');

    expect(evaluateRunBudget(context(), workflowProjection({ requires_checkpoint: true }), 2_000)?.key).toBe('requires_checkpoint');
    expect(evaluateRunBudget(context(), workflowProjection({ max_wallclock_ms: 500 }), 2_000)?.key).toBe('max_wallclock');
    expect(evaluateRunBudget(
      context({ recentReceipts: [{ id: 'r1', type: 'planning', taskId: null, workflowId: 'wf1', workerId: null, tileId: null, summary: '', artifactRefs: [], parentReceiptId: null, correlationId: null, createdAt: 1, metadata: { spendUsd: 2 } }] }),
      workflowProjection({ max_spend: 1 }),
      2_000,
    )?.key).toBe('max_spend');
    expect(evaluateRunBudget(
      context({ recentReceipts: [{ id: 'r1', type: 'verification_failed', taskId: 't1', workflowId: 'wf1', workerId: null, tileId: null, summary: '', artifactRefs: [], parentReceiptId: null, correlationId: null, createdAt: 1, metadata: {} }] }),
      workflowProjection({ max_retries: 0 }),
      2_000,
    )?.key).toBe('max_retries');
  });

  test('step pauses the run before proposing when budget is breached', async () => {
    const phases: string[] = [];
    const pauses: string[] = [];
    const loop = createConductorLoop({
      readContext: () => context({
        recentReceipts: [{ id: 'r1', type: 'planning', taskId: null, workflowId: 'wf1', workerId: null, tileId: null, summary: '', artifactRefs: [], parentReceiptId: null, correlationId: null, createdAt: 1, metadata: { phase: 'executed' } }],
      }),
      readWorkflowProjection: () => workflowProjection({ max_tool_calls: 1 }),
      suspendWorkflow: (_workflowId, reason) => {
        pauses.push(reason);
        return { ok: true };
      },
      propose: () => ({ kind: 'action', action: 'create_task', args: {}, risk: 'low', rationale: 'should not run' }),
      runAction: async () => ({ ok: true }),
      hasPendingApproval: () => false,
      postDecision: ({ phase }) => {
        phases.push(phase);
        return { ok: true };
      },
    });

    const result = await loop.step({ workflowId: 'wf1' });
    expect(result.status).toBe('budget_exceeded');
    expect(result.canContinue).toBe(false);
    expect(phases).toEqual(['budget_exceeded']);
    expect(pauses[0]).toContain('tool-call budget exhausted');
  });
});
