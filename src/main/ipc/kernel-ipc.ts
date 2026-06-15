import { ipcMain } from 'electron';
import { initKernelDb, getKernelDb } from '../../kernel/database';
import { dispatchKernelCommand } from '../../kernel/commands/index';
import {
  queryCanvasSnapshot,
  queryTileGet,
  queryTileList,
  queryTaskList,
  queryTaskGet,
  queryReceiptList,
  queryStateCardList,
  queryStateCardGet,
  queryConductorContext,
  queryWorkflowSnapshot,
  queryWorkerList,
  queryWorkerGet,
  queryWorkflowRegion,
  queryWorkflowRegionList,
  queryEvaluationList,
  queryEvaluationGet,
} from '../../kernel/queries/index';
import { startStateCardWatcher } from '../../kernel/watchers/index';
import { seedHarnessRegistry } from '../../kernel/worker-instances/index';
import type { TaskStatus } from '../../kernel/schema/types';

export function registerKernelIpcHandlers(dataDir: string): void {
  initKernelDb(dataDir);
  // Seed the minimal harness + default model registry (Goal 6A).
  seedHarnessRegistry(getKernelDb());
  // Maintain Kernel-owned State Cards from task/receipt/tile/worker events.
  startStateCardWatcher(getKernelDb());

  ipcMain.handle(
    'kernel:command',
    async (_event, type: string, payload: Record<string, unknown>) => {
      return dispatchKernelCommand(type, payload ?? {});
    },
  );

  ipcMain.handle(
    'kernel:query',
    async (_event, type: string, params: Record<string, unknown> = {}) => {
      switch (type) {
        case 'kernel.canvas.snapshot':
          return queryCanvasSnapshot(params['workflowId'] as string | undefined);
        case 'kernel.tile.list':
          return queryTileList(params['workflowId'] as string | undefined);
        case 'kernel.tile.get':
          return queryTileGet(params['tileId'] as string);
        case 'kernel.task.list':
          return queryTaskList({
            workflowId: params['workflowId'] as string | undefined,
            status: params['status'] as TaskStatus | undefined,
            limit: params['limit'] as number | undefined,
          });
        case 'kernel.task.get':
          return queryTaskGet(params['taskId'] as string);
        case 'kernel.receipt.list':
          return queryReceiptList({
            taskId: params['taskId'] as string | undefined,
            correlationId: params['correlationId'] as string | undefined,
            workflowId: params['workflowId'] as string | undefined,
            limit: params['limit'] as number | undefined,
          });
        case 'kernel.state_card.list':
          return queryStateCardList({
            workflowId: params['workflowId'] as string | undefined,
          });
        case 'kernel.state_card.get':
          return queryStateCardGet(params['tileId'] as string);
        case 'kernel.conductor.context':
          return queryConductorContext({
            workflowId: params['workflowId'] as string | undefined,
            receiptLimit: params['receiptLimit'] as number | undefined,
          });
        case 'kernel.workflow.snapshot':
          return queryWorkflowSnapshot(params['workflowId'] as string);
        case 'kernel.workflow.region':
          return queryWorkflowRegion(params['workflowId'] as string);
        case 'kernel.workflow.region_list':
          return queryWorkflowRegionList();
        case 'kernel.eval.list':
          return queryEvaluationList({
            workflowId: params['workflowId'] as string | undefined,
            taskId: params['taskId'] as string | undefined,
            workerId: params['workerId'] as string | undefined,
            receiptId: params['receiptId'] as string | undefined,
            evalId: params['evalId'] as string | undefined,
          });
        case 'kernel.eval.get':
          return queryEvaluationGet(params['evalId'] as string);
        case 'kernel.worker.list':
          return queryWorkerList({ workflowId: params['workflowId'] as string | undefined });
        case 'kernel.worker.get':
          return queryWorkerGet(params['workerId'] as string);
        default:
          throw new Error(`Unknown kernel query: ${type}`);
      }
    },
  );
}
