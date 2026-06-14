/**
 * Kernel Worker Commands — v3 Goal 6A.
 *
 * The Kernel is the spawn/status authority for workers. The shell role-spawn and
 * herdr status paths call these instead of owning runtime identity directly:
 *
 *   kernel.worker.spawn         — establish identity (role/harness/model), status='spawning'
 *   kernel.worker.status_update — set status + runtime ids (herdr_pane_id/envoy_space_id)
 *   kernel.worker.stop          — mark stopped (runtime teardown happens in the shell)
 *
 * See docs/v3/WORKER_RECONCILIATION.md. The actual runtime start/stop stays in
 * the Electron runtime; the Kernel authorizes identity first and records ids.
 */

import type { KernelDB } from '../database';
import type { CommandResult } from './types';
import type { WorkerInstanceStatus } from '../schema/types';
import { emitKernelEvent } from '../events/index';
import {
  spawnWorkerForTile,
  updateWorkerInstance,
  resolveWorkerId,
  type SpawnWorkerArgs,
} from '../worker-instances/index';
import { resolveHarnessKind } from '../../harness/registry';

export function handleWorkerCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.worker.spawn': return workerSpawn(db, payload);
    case 'kernel.worker.status_update': return workerStatusUpdate(db, payload);
    case 'kernel.worker.stop': return workerStop(db, payload);
    default: return { ok: false, error: `Unhandled worker command: ${type}` };
  }
}

function workerSpawn(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const tileId = payload['tileId'] as string | undefined;
  if (!tileId) return { ok: false, error: 'worker.spawn: tileId required' };
  try {
    const harnessKind = (payload['harnessKind'] as SpawnWorkerArgs['harnessKind'])
      ?? resolveHarnessKind(payload['runtimeTarget'] as string | null | undefined);
    const workerId = spawnWorkerForTile(db, {
      tileId,
      roleName: (payload['roleName'] as string | null) ?? null,
      harnessKind,
      modelProvider: (payload['modelProvider'] as string | null) ?? null,
      modelName: (payload['modelName'] as string | null) ?? null,
    });
    if (!workerId) return { ok: false, error: `worker.spawn: tile not found: ${tileId}` };
    emitKernelEvent({
      kind: 'worker.spawned',
      tileId,
      workflowId: payload['workflowId'] as string | undefined,
      data: { workerId, harnessKind, status: 'spawning' },
    });
    return { ok: true, id: workerId, data: { status: 'spawning' } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function workerStatusUpdate(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const workerId = resolveWorkerId(db, {
    workerId: payload['workerId'] as string | undefined,
    tileId: payload['tileId'] as string | undefined,
  });
  if (!workerId) return { ok: false, error: 'worker.status_update: worker not found (need workerId or tileId)' };
  try {
    const result = updateWorkerInstance(db, workerId, {
      status: payload['status'] as WorkerInstanceStatus | undefined,
      herdrPaneId: payload['herdrPaneId'] as string | null | undefined,
      envoySpaceId: payload['envoySpaceId'] as string | null | undefined,
    });
    if (!result) return { ok: false, error: `worker.status_update: worker not found: ${workerId}` };
    emitKernelEvent({
      kind: 'worker.status_updated',
      tileId: result.tileId ?? undefined,
      workflowId: result.workflowId ?? undefined,
      data: { workerId, status: payload['status'] ?? null },
    });
    return { ok: true, id: workerId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function workerStop(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const workerId = resolveWorkerId(db, {
    workerId: payload['workerId'] as string | undefined,
    tileId: payload['tileId'] as string | undefined,
  });
  if (!workerId) return { ok: false, error: 'worker.stop: worker not found (need workerId or tileId)' };
  try {
    const result = updateWorkerInstance(db, workerId, { status: 'stopped' });
    if (!result) return { ok: false, error: `worker.stop: worker not found: ${workerId}` };
    emitKernelEvent({
      kind: 'worker.stopped',
      tileId: result.tileId ?? undefined,
      workflowId: result.workflowId ?? undefined,
      data: { workerId },
    });
    return { ok: true, id: workerId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
