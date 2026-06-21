import type { CommandResult } from '../../kernel/commands/types';
import type { WorkerInstanceStatus } from '../../kernel/schema/types';
import type { SpawnWorkerInput, WorkerHandle } from '../types';

export interface RuntimeWorkerSnapshot {
  id: string;
  tileId: string;
  workflowId: string | null;
  status: WorkerInstanceStatus;
  assignedTaskId: string | null;
  lastSeen: number | null;
}

export interface RuntimeManagerDeps {
  dispatchKernel(type: string, payload: Record<string, unknown>, requestedBy?: string): Promise<CommandResult> | CommandResult;
  readWorker(workerId: string): Promise<RuntimeWorkerSnapshot | null> | RuntimeWorkerSnapshot | null;
  readWorkers?(): Promise<RuntimeWorkerSnapshot[]> | RuntimeWorkerSnapshot[];
  stopRuntime?(worker: RuntimeWorkerSnapshot): Promise<void> | void;
  startRuntime?(input: SpawnWorkerInput): Promise<WorkerHandle> | WorkerHandle;
  now?(): number;
  staleAfterMs?: number;
}

export interface RuntimeManager {
  markStale(workerId: string, reason?: string): Promise<CommandResult>;
  recoverTask(taskId: string, reason?: string): Promise<CommandResult>;
  recoverAssignedTask(workerId: string, reason?: string): Promise<CommandResult>;
  cancelWorker(workerId: string, reason?: string): Promise<CommandResult>;
  restartWorker(workerId: string, input?: SpawnWorkerInput): Promise<CommandResult>;
  sweepStaleWorkers(): Promise<Array<{ workerId: string; recoveredTaskId: string | null; result: CommandResult }>>;
}

const DEFAULT_STALE_AFTER_MS = 60_000;
const LIVE_STATUSES = new Set<WorkerInstanceStatus>(['spawning', 'active', 'assigned', 'idle']);

function commandOk(id?: string | null, data: Record<string, unknown> = {}): CommandResult {
  return { ok: true, ...(id ? { id } : {}), data };
}

export function createRuntimeManager(deps: RuntimeManagerDeps): RuntimeManager {
  const now = deps.now ?? (() => Date.now());
  const staleAfterMs = deps.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  async function readWorkerOrError(workerId: string): Promise<RuntimeWorkerSnapshot | CommandResult> {
    const worker = await deps.readWorker(workerId);
    return worker ?? { ok: false, error: `runtime-manager: worker not found: ${workerId}` };
  }

  async function markStale(workerId: string, reason = 'worker heartbeat stale'): Promise<CommandResult> {
    return deps.dispatchKernel(
      'kernel.worker.status_update',
      { workerId, status: 'stale', lastSeen: now(), metadata: { reason } },
      'runtime-manager',
    );
  }

  async function recoverTask(taskId: string, reason = 'worker stale'): Promise<CommandResult> {
    return deps.dispatchKernel('kernel.task.recover', { taskId, reason }, 'runtime-manager');
  }

  return {
    markStale,

    recoverTask,

    async recoverAssignedTask(workerId: string, reason = 'worker stale'): Promise<CommandResult> {
      const worker = await readWorkerOrError(workerId);
      if ('ok' in worker && worker.ok === false) return worker;
      if (!worker.assignedTaskId) return commandOk(workerId, { recoveredTaskId: null });
      return recoverTask(worker.assignedTaskId, reason);
    },

    async cancelWorker(workerId: string, reason = 'operator cancel'): Promise<CommandResult> {
      const worker = await readWorkerOrError(workerId);
      if ('ok' in worker && worker.ok === false) return worker;
      await deps.stopRuntime?.(worker);
      return deps.dispatchKernel('kernel.worker.stop', { workerId, reason }, 'runtime-manager');
    },

    async restartWorker(workerId: string, input: SpawnWorkerInput = {}): Promise<CommandResult> {
      const worker = await readWorkerOrError(workerId);
      if ('ok' in worker && worker.ok === false) return worker;
      const stopped = await this.cancelWorker(workerId, 'worker restart');
      if (!stopped.ok) return stopped;
      if (!deps.startRuntime) {
        return { ok: false, error: 'runtime-manager: restart requires startRuntime' };
      }
      const handle = await deps.startRuntime({
        ...input,
        tileId: worker.tileId,
        workflowId: worker.workflowId,
      });
      return deps.dispatchKernel(
        'kernel.worker.status_update',
        {
          workerId: handle.workerId,
          tileId: handle.tileId,
          status: 'active',
          herdrPaneId: handle.herdrPaneId ?? null,
          envoySpaceId: handle.envoySpaceId ?? null,
          lastSeen: now(),
        },
        'runtime-manager',
      );
    },

    async sweepStaleWorkers(): Promise<Array<{ workerId: string; recoveredTaskId: string | null; result: CommandResult }>> {
      if (!deps.readWorkers) return [];
      const cutoff = now() - staleAfterMs;
      const workers = await deps.readWorkers();
      const results: Array<{ workerId: string; recoveredTaskId: string | null; result: CommandResult }> = [];
      for (const worker of workers) {
        if (!LIVE_STATUSES.has(worker.status)) continue;
        if (worker.lastSeen === null || worker.lastSeen >= cutoff) continue;
        const stale = await markStale(worker.id, 'worker heartbeat stale');
        if (!stale.ok) {
          results.push({ workerId: worker.id, recoveredTaskId: null, result: stale });
          continue;
        }
        if (!worker.assignedTaskId) {
          results.push({ workerId: worker.id, recoveredTaskId: null, result: stale });
          continue;
        }
        const recovered = await recoverTask(worker.assignedTaskId, 'worker heartbeat stale');
        results.push({ workerId: worker.id, recoveredTaskId: worker.assignedTaskId, result: recovered });
      }
      return results;
    },
  };
}
