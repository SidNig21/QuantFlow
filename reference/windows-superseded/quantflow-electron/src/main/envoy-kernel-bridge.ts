/**
 * R3c-b — Envoy→Kernel bridge.
 *
 * Kernel decides; Envoy mirrors. Every task mutation routes through Kernel
 * commands first; the runtime-state `envoy_tasks` row is a display/export mirror
 * keyed by the Kernel task id (task_id ≡ kernel.tasks.id).
 */

import { dispatchKernelCommand } from "../../../src/kernel/commands/index";
import { getKernelDb } from "../../../src/kernel/database";
import { queryTaskGet } from "../../../src/kernel/tasks/index";
import type { TaskStatus } from "../../../src/kernel/schema/types";
import {
  getEnvoyTask,
  insertEnvoyTask,
  patchEnvoyTaskClaim,
  updateEnvoyTask,
} from "./runtime-state/envoy-repo";
import type { EnvoyTaskRow, EnvoyTaskStatus } from "./runtime-state/types";

const REQUESTED_BY = "envoy-bridge";

export function dispatchEnvoyKernel(
  type: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  return dispatchKernelCommand(type, payload, REQUESTED_BY);
}

export function kernelStatusToEnvoy(
  status: TaskStatus,
  hasTargetTile: boolean,
): EnvoyTaskStatus {
  switch (status) {
    case "open":
      return hasTargetTile ? "ready" : "inbox";
    case "claimed":
      return "claimed";
    case "working":
      return "working";
    case "submitted":
    case "verifying":
      return "review";
    case "complete":
      return "done";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return "inbox";
  }
}

export function getKernelTask(taskId: string) {
  return queryTaskGet(getKernelDb(), taskId);
}

/** Ensure a Kernel tile exists so claim can resolve ownerWorkerId from tileId. */
export async function ensureKernelTile(tileId: string): Promise<void> {
  const db = getKernelDb();
  const row = db.prepare("SELECT id FROM tiles WHERE id = ?").get(tileId) as
    | { id: string }
    | undefined;
  if (row) return;
  const result = await dispatchEnvoyKernel("kernel.tile.create", {
    id: tileId,
    displayName: tileId,
    tileKind: "worker",
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  });
  if (!result.ok) {
    throw new Error(result.error ?? `kernel.tile.create failed for ${tileId}`);
  }
}

export interface MirrorContext {
  canvasId: string;
  envoySpaceId: string;
  sourceTileId: string;
  targetTileId?: string | null;
  connectionId?: string | null;
  envoyTaskId?: string | null;
  title?: string;
  instruction?: string;
  acceptanceCriteria?: string[];
}

export function syncMirrorFromKernel(
  kernelTaskId: string,
  ctx: MirrorContext,
  extra?: {
    claimedBy?: string | null;
    claimedAt?: number | null;
    resultSummary?: string | null;
    artifactPaths?: string[];
  },
): EnvoyTaskRow {
  const kernel = getKernelTask(kernelTaskId);
  if (!kernel) {
    throw new Error(`Kernel task not found: ${kernelTaskId}`);
  }

  const envoyStatus = kernelStatusToEnvoy(
    kernel.status,
    Boolean(ctx.targetTileId),
  );
  const existing = getEnvoyTask(kernelTaskId);

  if (!existing) {
    const row = insertEnvoyTask({
      taskId: kernelTaskId,
      envoyTaskId: ctx.envoyTaskId ?? null,
      canvasId: ctx.canvasId,
      envoySpaceId: ctx.envoySpaceId,
      sourceTileId: ctx.sourceTileId,
      targetTileId: ctx.targetTileId ?? null,
      connectionId: ctx.connectionId ?? null,
      correlationId: kernel.correlationId,
      title: ctx.title ?? kernel.title,
      instruction: ctx.instruction ?? kernel.objective,
      acceptanceCriteria: ctx.acceptanceCriteria ?? [],
      status: envoyStatus,
    });
    if (extra?.claimedBy) {
      return patchEnvoyTaskClaim(row.task_id, extra.claimedBy, extra.claimedAt ?? Date.now()) ?? row;
    }
    return row;
  }

  const updated =
    updateEnvoyTask(kernelTaskId, {
      status: envoyStatus,
      resultSummary:
        extra?.resultSummary !== undefined
          ? extra.resultSummary
          : existing.result_summary,
      artifactPaths: extra?.artifactPaths,
    }) ?? existing;

  if (extra?.claimedBy) {
    return patchEnvoyTaskClaim(updated.task_id, extra.claimedBy, extra.claimedAt ?? Date.now()) ?? updated;
  }
  return updated;
}

/** Refresh mirror status from Kernel for an existing envoy row (read-path sync). */
export function refreshMirrorStatus(taskId: string): EnvoyTaskRow | null {
  const mirror = getEnvoyTask(taskId);
  const kernel = getKernelTask(taskId);
  if (!mirror || !kernel) return mirror;
  const status = kernelStatusToEnvoy(
    kernel.status,
    Boolean(mirror.target_tile_id),
  );
  return updateEnvoyTask(taskId, { status }) ?? mirror;
}
