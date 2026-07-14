/**
 * Injectable Kernel access seam for canvas-persistence (D1).
 * Production default uses dispatchKernelCommand + query* helpers.
 * Tests/QA inject bun:sqlite-backed impl via setKernelDbForTesting + this seam.
 */

import { dispatchKernelCommand } from "../../../src/kernel/commands/index";
import {
  queryCanvasSettingsGet,
  queryTileExtensionGet,
  queryTileGet,
  queryTileList,
  type CanvasSettingsSnapshot,
  type TileExtensionSnapshot,
  type TileSnapshot,
} from "../../../src/kernel/queries/index";

export type CommandResult = { ok: boolean; error?: string; id?: string };

export interface CanvasKernelAccess {
  dispatchCommand(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<CommandResult>;
  queryTileList(): TileSnapshot[];
  queryTileGet(tileId: string): TileSnapshot | null;
  queryTileExtensionGet(tileId: string): TileExtensionSnapshot | null;
  queryCanvasSettingsGet(): CanvasSettingsSnapshot | null;
}

const defaultAccess: CanvasKernelAccess = {
  dispatchCommand(type, payload) {
    return dispatchKernelCommand(type, payload, "canvas-persistence");
  },
  queryTileList() {
    return queryTileList();
  },
  queryTileGet(tileId) {
    return queryTileGet(tileId);
  },
  queryTileExtensionGet(tileId) {
    return queryTileExtensionGet(tileId);
  },
  queryCanvasSettingsGet() {
    return queryCanvasSettingsGet();
  },
};

let accessOverride: CanvasKernelAccess | null = null;
let kernelReadCount = 0;
let jsonEphemeralReadCount = 0;

export function getCanvasKernelAccess(): CanvasKernelAccess {
  return accessOverride ?? defaultAccess;
}

export function setCanvasKernelAccessForTesting(
  access: CanvasKernelAccess | null,
): void {
  accessOverride = access;
}

export function noteKernelReadForTesting(): void {
  kernelReadCount++;
}

export function noteJsonEphemeralReadForTesting(): void {
  jsonEphemeralReadCount++;
}

export function _resetCanvasKernelAccessForTesting(): void {
  accessOverride = null;
  kernelReadCount = 0;
  jsonEphemeralReadCount = 0;
}

export function _getCanvasKernelAccessCountersForTesting(): {
  kernelReadCount: number;
  jsonEphemeralReadCount: number;
} {
  return { kernelReadCount, jsonEphemeralReadCount };
}
