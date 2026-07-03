import { randomUUID } from 'node:crypto';
import { getKernelDb } from '../database';
import type { KernelCommandType } from '../schema/types';
import { handleTileCommand } from './tile-commands';
import { handleConnectionCommand } from './connection-commands';
import { handleWorkflowCommand } from './workflow-commands';
import { handleTaskCommand } from '../tasks/index';
import { handleReceiptCommand, handleArtifactCommand } from '../receipts/index';
import { handleStateCardCommand } from '../state-cards/index';
import { handleConductorCommand } from '../conductor/index';
import { handleWorkerCommand } from './worker-commands';
import { handleEvalCommand } from '../evals/index';
import { traceAsync } from '../perf/trace';
export type { CommandResult } from './types';

export async function dispatchKernelCommand(
  type: KernelCommandType | string,
  payload: Record<string, unknown>,
  requestedBy = 'renderer',
): Promise<import('./types').CommandResult> {
  return traceAsync(
    {
      layer: 'kernel',
      name: 'kernel.command',
      phase: String(type),
      workflow_id: typeof payload['workflowId'] === 'string' ? payload['workflowId'] : undefined,
      tile_id: typeof payload['tileId'] === 'string' ? payload['tileId'] : undefined,
      task_id: typeof payload['taskId'] === 'string' ? payload['taskId'] : undefined,
      worker_id: typeof payload['workerId'] === 'string' ? payload['workerId'] : undefined,
      correlation_id: typeof payload['correlationId'] === 'string' ? payload['correlationId'] : undefined,
      payload_size_bytes: JSON.stringify(payload).length,
    },
    () => dispatchKernelCommandInner(type, payload, requestedBy),
  );
}

async function dispatchKernelCommandInner(
  type: KernelCommandType | string,
  payload: Record<string, unknown>,
  requestedBy = 'renderer',
): Promise<import('./types').CommandResult> {
  const db = getKernelDb();
  const commandId = randomUUID();
  const now = Date.now();

  db.prepare(
    'INSERT INTO commands (id, command_type, requested_by, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(commandId, type, requestedBy, JSON.stringify(payload), 'pending', now);

  let result: import('./types').CommandResult;
  try {
    if ((type as string).startsWith('kernel.tile.')) {
      result = handleTileCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.connection.')) {
      result = handleConnectionCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.workflow.')) {
      result = handleWorkflowCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.task.')) {
      result = handleTaskCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.receipt.')) {
      result = handleReceiptCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.artifact.')) {
      result = handleArtifactCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.state_card.')) {
      result = handleStateCardCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.conductor.')) {
      result = handleConductorCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.worker.')) {
      result = handleWorkerCommand(db, type as string, payload);
    } else if ((type as string).startsWith('kernel.eval.')) {
      result = handleEvalCommand(db, type as string, payload);
    } else {
      result = { ok: false, error: `Unknown command type: ${type}` };
    }

    db.prepare(
      'UPDATE commands SET status = ?, result_json = ?, completed_at = ? WHERE id = ?',
    ).run(result.ok ? 'accepted' : 'rejected', JSON.stringify(result), Date.now(), commandId);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    db.prepare(
      'UPDATE commands SET status = ?, rejection_reason = ?, completed_at = ? WHERE id = ?',
    ).run('rejected', error, Date.now(), commandId);
    result = { ok: false, error };
  }

  return result;
}
