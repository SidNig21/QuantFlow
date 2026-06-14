import { ipcMain } from 'electron';
import { initKernelDb } from '../../kernel/database';
import { dispatchKernelCommand } from '../../kernel/commands/index';
import { queryCanvasSnapshot, queryTileGet, queryTileList } from '../../kernel/queries/index';

export function registerKernelIpcHandlers(dataDir: string): void {
  initKernelDb(dataDir);

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
        default:
          throw new Error(`Unknown kernel query: ${type}`);
      }
    },
  );
}
