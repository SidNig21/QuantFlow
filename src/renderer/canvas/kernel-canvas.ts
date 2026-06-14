// Canvas action wrappers that route through the Kernel command boundary.
// These are the v3-correct entry points for canvas mutations.
// The canvas shell window uses window.kernelApi (from preload) directly;
// this module is the typed surface for future TypeScript canvas code.

import {
  sendKernelCommand,
  onKernelEvent,
  type CommandResult,
  type KernelEventPayload,
} from '../state/kernel-client';

export interface SpawnTileParams {
  id: string;
  displayName?: string;
  tileKind?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  workflowId?: string;
}

export async function spawnTile(params: SpawnTileParams): Promise<string> {
  const result = await sendKernelCommand('kernel.tile.create', params as Record<string, unknown>);
  if (!result.ok) throw new Error(result.error ?? 'kernel.tile.create failed');
  return result.id ?? params.id;
}

export async function moveTile(id: string, x: number, y: number): Promise<void> {
  const result = await sendKernelCommand('kernel.tile.move', { id, x, y });
  if (!result.ok) throw new Error(result.error ?? 'kernel.tile.move failed');
}

export async function resizeTile(id: string, width: number, height: number): Promise<void> {
  const result = await sendKernelCommand('kernel.tile.resize', { id, width, height });
  if (!result.ok) throw new Error(result.error ?? 'kernel.tile.resize failed');
}

export async function connectTiles(
  tileAId: string,
  tileBId: string,
  label?: string,
): Promise<string> {
  const result = await sendKernelCommand('kernel.connection.create', { tileAId, tileBId, label });
  if (!result.ok) throw new Error(result.error ?? 'kernel.connection.create failed');
  return result.id ?? '';
}

export async function closeTile(id: string): Promise<void> {
  const result = await sendKernelCommand('kernel.tile.remove', { id });
  if (!result.ok) throw new Error(result.error ?? 'kernel.tile.remove failed');
}

export function subscribeKernelEvents(
  cb: (payload: KernelEventPayload) => void,
): () => void {
  return onKernelEvent(cb);
}

export type { CommandResult, KernelEventPayload };
