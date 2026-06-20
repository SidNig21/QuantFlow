/**
 * Kernel Task RPC surface — v3 (Goal 3).
 *
 * Exposes the authoritative Kernel task lifecycle and receipt chain over the
 * app's JSON-RPC server so external adapters (MCP) and future native callers
 * can drive verified task completion.
 *
 * The MCP gate tools qf_task_submit / qf_task_verify / qf_task_reject route to
 * kernel.taskSubmit / kernel.taskVerify / kernel.taskReject here. Every method
 * goes through dispatchKernelCommand, so the Kernel — not MCP — owns truth and
 * enforces the submitted → verifying → complete gate.
 *
 * `registerMethod` is injected (not imported) so this Kernel-side module never
 * depends on the Electron app package; the app passes its own registrar.
 */

import { dispatchKernelCommand } from '../../kernel/commands/index';
import {
  queryTaskList,
  queryTaskGet,
  queryReceiptList,
  queryStateCardList,
  queryStateCardGet,
  queryWorkerList,
  queryWorkerGet,
} from '../../kernel/queries/index';
import type { TaskStatus } from '../../kernel/schema/types';

type RpcParams = Record<string, unknown> | undefined;

export type RegisterMethod = (
  method: string,
  handler: (params: unknown) => unknown | Promise<unknown>,
  meta?: { description?: string; params?: Record<string, string> },
) => void;

const REQUESTED_BY = 'mcp';

function asRecord(params: RpcParams): Record<string, unknown> {
  return (params as Record<string, unknown>) ?? {};
}

/**
 * Register the Kernel task + receipt RPC methods. Call this from the Electron
 * main process after the Kernel DB is initialized, passing the app's
 * registerMethod from json-rpc-server.
 */
export function registerKernelTaskRpc(registerMethod: RegisterMethod): void {
  const command = (commandType: string) => (params: unknown) =>
    dispatchKernelCommand(commandType, asRecord(params as RpcParams), REQUESTED_BY);

  registerMethod('kernel.taskCreate', command('kernel.task.create'), {
    description: 'Create a Kernel task (v3 verified lifecycle)',
    params: {
      title: 'Task title',
      objective: 'Task objective',
      workflowId: '(optional) workflow id',
      correlationId: '(optional) correlation id; defaults to task id',
      ownerWorkerId: '(optional) owner worker instance id',
    },
  });

  registerMethod('kernel.taskClaim', command('kernel.task.claim'), {
    description: 'Claim a Kernel task (open → claimed). Stale claims are reclaimable.',
    params: {
      taskId: 'Task id',
      ownerWorkerId: '(optional) claiming worker id',
      tileId: '(optional) tile to claim for; ensures/derives its default worker so the task surfaces on that tile\'s State Card',
    },
  });

  registerMethod('kernel.taskStart', command('kernel.task.start'), {
    description: 'Start work on a Kernel task (claimed/blocked → working)',
    params: { taskId: 'Task id', summary: '(optional) note' },
  });

  registerMethod('kernel.taskSubmit', command('kernel.task.submit'), {
    description: 'Submit a result for verification (working → submitted)',
    params: {
      taskId: 'Task id',
      summary: '(optional) result summary',
      artifactId: '(optional) single artifact id',
      artifactRefs: 'array of artifact ids (required unless artifactId is supplied)',
      attemptId: '(optional) stable logical attempt id recorded on receipt metadata',
    },
  });

  registerMethod('kernel.taskVerify', command('kernel.task.verify'), {
    description:
      'Verify a submitted task. verdict "pass" completes it (verification_passed + task_completed); "fail" returns it to working.',
    params: {
      taskId: 'Task id',
      verdict: '(optional) "pass" (default) or "fail"',
      verifierWorkerId: '(optional) verifier worker id; must differ from owner',
      summary: '(optional) verdict note',
      artifactRoot: '(optional) allowed artifact root override; otherwise workflow.vault_path then QUANTFLOW_DIR/artifacts',
      attemptId: '(optional) stable logical attempt id recorded on receipt metadata',
      operatorOverride: '(optional) bypass self-verification guard',
    },
  });

  registerMethod('kernel.taskReject', command('kernel.task.reject'), {
    description: 'Reject a submitted/verifying task (verification_failed → working)',
    params: {
      taskId: 'Task id',
      reason: '(optional) rejection reason',
      verifierWorkerId: '(optional) verifier worker id; must differ from owner',
      operatorOverride: '(optional) bypass self-verification guard',
    },
  });

  registerMethod('kernel.taskComplete', command('kernel.task.complete'), {
    description:
      'Complete a Kernel task. Requires verifying status + verification_passed receipt, unless legacy:true (documented compatibility bypass).',
    params: {
      taskId: 'Task id',
      legacy: '(optional) true to bypass verification (legacy compatibility)',
      summary: '(optional) completion note',
    },
  });

  registerMethod('kernel.taskBlock', command('kernel.task.block'), {
    description: 'Block a Kernel task (working → blocked)',
    params: { taskId: 'Task id', reason: '(optional) block reason' },
  });

  registerMethod('kernel.taskFail', command('kernel.task.fail'), {
    description: 'Fail a Kernel task (working/submitted/verifying/blocked → failed)',
    params: { taskId: 'Task id', reason: '(optional) failure reason' },
  });

  registerMethod('kernel.receiptPost', command('kernel.receipt.post'), {
    description: 'Append a receipt to the chain',
    params: { type: 'Receipt type', taskId: '(optional) task id', summary: '(optional)' },
  });

  registerMethod('kernel.artifactCreate', command('kernel.artifact.create'), {
    description: 'Record an artifact and post its artifact_created receipt',
    params: { kind: 'Artifact kind', taskId: '(optional) task id', uri: '(optional)' },
  });

  registerMethod(
    'kernel.taskList',
    (params: unknown) => {
      const p = asRecord(params as RpcParams);
      return queryTaskList({
        workflowId: p['workflowId'] as string | undefined,
        status: p['status'] as TaskStatus | undefined,
        limit: p['limit'] as number | undefined,
      });
    },
    { description: 'List Kernel tasks', params: { workflowId: '(optional)', status: '(optional)' } },
  );

  registerMethod(
    'kernel.taskGet',
    (params: unknown) => queryTaskGet(asRecord(params as RpcParams)['taskId'] as string),
    { description: 'Get a Kernel task by id', params: { taskId: 'Task id' } },
  );

  registerMethod(
    'kernel.receiptList',
    (params: unknown) => {
      const p = asRecord(params as RpcParams);
      return queryReceiptList({
        taskId: p['taskId'] as string | undefined,
        correlationId: p['correlationId'] as string | undefined,
        workflowId: p['workflowId'] as string | undefined,
        limit: p['limit'] as number | undefined,
      });
    },
    {
      description: 'Inspect the Kernel receipt chain for a task, correlation id, or workflow',
      params: {
        taskId: '(optional) task id',
        correlationId: '(optional) correlation id',
        workflowId: '(optional) workflow id',
      },
    },
  );

  // State Cards (Goal 4): Kernel-owned current reality per tile.
  registerMethod('kernel.stateCardUpdate', command('kernel.state_card.update'), {
    description: 'Upsert a tile State Card (patch fields)',
    params: { tileId: 'Tile id', status: '(optional)', currentTaskId: '(optional)' },
  });

  registerMethod(
    'kernel.stateCardList',
    (params: unknown) =>
      queryStateCardList({ workflowId: asRecord(params as RpcParams)['workflowId'] as string | undefined }),
    { description: 'List tile State Cards', params: { workflowId: '(optional) workflow id' } },
  );

  registerMethod(
    'kernel.stateCardGet',
    (params: unknown) => queryStateCardGet(asRecord(params as RpcParams)['tileId'] as string),
    { description: 'Get a tile State Card', params: { tileId: 'Tile id' } },
  );

  // Worker lifecycle (Goal 6A): Kernel-authoritative worker identity + status.
  registerMethod('kernel.workerSpawn', command('kernel.worker.spawn'), {
    description: 'Establish Kernel worker identity for a tile (role/harness/model, status=spawning)',
    params: { tileId: 'Tile id', roleName: '(optional)', harnessKind: '(optional) local-shell|herdr-shell', runtimeTarget: '(optional)' },
  });
  registerMethod('kernel.workerStatusUpdate', command('kernel.worker.status_update'), {
    description: 'Update worker status + runtime ids (herdr_pane_id / envoy_space_id)',
    params: { tileId: '(or workerId)', status: 'spawning|active|idle|stopped|error', herdrPaneId: '(optional)', envoySpaceId: '(optional)' },
  });
  registerMethod('kernel.workerStop', command('kernel.worker.stop'), {
    description: 'Mark a worker stopped (runtime teardown happens in the shell)',
    params: { tileId: '(or workerId)' },
  });
  registerMethod(
    'kernel.workerList',
    (params: unknown) => queryWorkerList({ workflowId: asRecord(params as RpcParams)['workflowId'] as string | undefined }),
    { description: 'List Kernel worker instances', params: { workflowId: '(optional)' } },
  );
  registerMethod(
    'kernel.workerGet',
    (params: unknown) => queryWorkerGet(asRecord(params as RpcParams)['workerId'] as string),
    { description: 'Get a Kernel worker instance', params: { workerId: 'Worker id' } },
  );
}
