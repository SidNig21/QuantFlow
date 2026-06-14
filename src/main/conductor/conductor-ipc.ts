/**
 * Conductor IPC — v3 Goal 5A.
 *
 * Bridges the renderer Conductor tile to the embedded main-process Conductor.
 *  - conductor:read-view  → read + assemble the view (no write).
 *  - conductor:run        → read + plan + append one planning receipt.
 *
 * Read-only contract: these are the only Conductor IPC channels in Goal 5A.
 * No spawn/assign/verify channels exist yet (Goal 6A/5C).
 */

import { ipcMain } from 'electron';
import { readConductorView, runConductorPlan } from './conductor-reader';

export function registerConductorIpc(): void {
  ipcMain.handle(
    'conductor:read-view',
    async (_event, params: { workflowId?: string } = {}) =>
      readConductorView(params?.workflowId),
  );

  ipcMain.handle(
    'conductor:run',
    async (_event, params: { workflowId?: string } = {}) =>
      runConductorPlan(params?.workflowId),
  );
}
