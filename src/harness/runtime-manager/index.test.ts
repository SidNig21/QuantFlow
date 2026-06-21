import { describe, expect, test } from 'bun:test';
import { createRuntimeManager, type RuntimeWorkerSnapshot } from './index';

interface Call {
  type: string;
  payload: Record<string, unknown>;
  requestedBy?: string;
}

function makeDeps(workers: RuntimeWorkerSnapshot[]) {
  const calls: Call[] = [];
  const stopped: string[] = [];
  const started: Record<string, unknown>[] = [];
  return {
    calls,
    stopped,
    started,
    deps: {
      now: () => 10_000,
      staleAfterMs: 1_000,
      readWorker: (workerId: string) => workers.find((w) => w.id === workerId) ?? null,
      readWorkers: () => workers,
      stopRuntime: (worker: RuntimeWorkerSnapshot) => { stopped.push(worker.id); },
      startRuntime: (input: Record<string, unknown>) => {
        started.push(input);
        return {
          workerId: 'w-restarted',
          tileId: input.tileId as string,
          kind: 'mock' as const,
          herdrPaneId: 'pane-new',
          envoySpaceId: 'space-new',
        };
      },
      dispatchKernel: (type: string, payload: Record<string, unknown>, requestedBy?: string) => {
        calls.push({ type, payload, requestedBy });
        return { ok: true, id: payload.workerId as string | undefined };
      },
    },
  };
}

const baseWorker: RuntimeWorkerSnapshot = {
  id: 'w1',
  tileId: 'tile1',
  workflowId: 'wf1',
  status: 'assigned',
  assignedTaskId: 'task1',
  lastSeen: 8_000,
};

describe('runtime-manager', () => {
  test('markStale and recoverAssignedTask mutate only through Kernel commands', async () => {
    const env = makeDeps([baseWorker]);
    const manager = createRuntimeManager(env.deps);

    expect((await manager.markStale('w1')).ok).toBe(true);
    expect((await manager.recoverAssignedTask('w1')).ok).toBe(true);

    expect(env.calls.map((c) => c.type)).toEqual([
      'kernel.worker.status_update',
      'kernel.task.recover',
    ]);
    expect(env.calls[0]!.payload).toMatchObject({ workerId: 'w1', status: 'stale', lastSeen: 10_000 });
    expect(env.calls[1]!.payload).toMatchObject({ taskId: 'task1' });
    expect(env.calls.every((c) => c.requestedBy === 'runtime-manager')).toBe(true);
  });

  test('sweepStaleWorkers marks stale workers and recovers their assigned task', async () => {
    const env = makeDeps([
      baseWorker,
      { ...baseWorker, id: 'fresh', assignedTaskId: 'fresh-task', lastSeen: 9_500 },
      { ...baseWorker, id: 'stopped', status: 'stopped', assignedTaskId: 'done-task', lastSeen: 1 },
    ]);
    const manager = createRuntimeManager(env.deps);

    const swept = await manager.sweepStaleWorkers();
    expect(swept).toEqual([{ workerId: 'w1', recoveredTaskId: 'task1', result: { ok: true, id: undefined } }]);
    expect(env.calls.map((c) => c.type)).toEqual([
      'kernel.worker.status_update',
      'kernel.task.recover',
    ]);
  });

  test('cancel stops the runtime then asks Kernel to stop the worker', async () => {
    const env = makeDeps([baseWorker]);
    const manager = createRuntimeManager(env.deps);

    expect((await manager.cancelWorker('w1')).ok).toBe(true);
    expect(env.stopped).toEqual(['w1']);
    expect(env.calls.at(-1)).toMatchObject({
      type: 'kernel.worker.stop',
      payload: { workerId: 'w1' },
      requestedBy: 'runtime-manager',
    });
  });

  test('restart cancels, starts through injected runtime seam, then refreshes Kernel runtime ids', async () => {
    const env = makeDeps([baseWorker]);
    const manager = createRuntimeManager(env.deps);

    expect((await manager.restartWorker('w1', { harnessKind: 'mock' })).ok).toBe(true);
    expect(env.stopped).toEqual(['w1']);
    expect(env.started).toEqual([{ harnessKind: 'mock', tileId: 'tile1', workflowId: 'wf1' }]);
    expect(env.calls.map((c) => c.type)).toEqual([
      'kernel.worker.stop',
      'kernel.worker.status_update',
    ]);
    expect(env.calls.at(-1)?.payload).toMatchObject({
      workerId: 'w-restarted',
      tileId: 'tile1',
      status: 'active',
      herdrPaneId: 'pane-new',
      envoySpaceId: 'space-new',
      lastSeen: 10_000,
    });
  });
});
