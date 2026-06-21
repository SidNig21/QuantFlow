import {
  getEnvoyTask,
  insertEnvoyReceipt,
  listEnvoyReceipts,
  listEnvoyTasks,
} from "./runtime-state/envoy-repo";
import type {
  EnvoyReceiptFilter,
  EnvoyReceiptRow,
  EnvoyTaskFilter,
  EnvoyTaskRow,
  EnvoyTaskStatus,
} from "./runtime-state/types";
import { getConnection } from "./runtime-state/connections-repo";
import { appendEvent, listEvents } from "./runtime-state/events-repo";
import {
  EnvoyService,
  getEnvoyService,
  newCorrelationId,
} from "./envoy-service";
import { ensureEnvoyListener } from "./envoy-listener";
import {
  dispatchEnvoyKernel,
  ensureKernelTile,
  getKernelTask,
  refreshMirrorStatus,
  syncMirrorFromKernel,
  type MirrorContext,
} from "./envoy-kernel-bridge";

export interface EnvoyTaskServiceOptions {
  envoy?: EnvoyService;
  startListener?: boolean;
}

export interface CreateEnvoyTaskInput {
  canvasId: string;
  sourceTileId: string;
  targetTileId?: string | null;
  connectionId?: string | null;
  correlationId?: string | null;
  title: string;
  instruction: string;
  acceptanceCriteria?: string[];
  operatorOverride?: boolean;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function publicTask(row: EnvoyTaskRow): Record<string, unknown> {
  return {
    ...row,
    acceptance_criteria: parseJsonArray(row.acceptance_criteria),
    receipt_ids: parseJsonArray(row.receipt_ids),
    artifact_paths: parseJsonArray(row.artifact_paths),
  };
}

function publicReceipt(row: EnvoyReceiptRow): Record<string, unknown> {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return { ...row, payload };
}

function envoyStatusFor(status: EnvoyTaskStatus): "assigned" | "in_progress" | "completed" | "blocked" | null {
  if (status === "claimed") return "assigned";
  if (status === "working" || status === "review") return "in_progress";
  if (status === "done") return "completed";
  if (status === "blocked" || status === "failed") return "blocked";
  return null;
}

function mirrorContextFromRow(row: EnvoyTaskRow): MirrorContext {
  return {
    canvasId: row.canvas_id,
    envoySpaceId: row.envoy_space_id,
    sourceTileId: row.source_tile_id,
    targetTileId: row.target_tile_id,
    connectionId: row.connection_id,
    envoyTaskId: row.envoy_task_id,
    title: row.title,
    instruction: row.instruction,
    acceptanceCriteria: parseJsonArray(row.acceptance_criteria),
  };
}

export class EnvoyTaskService {
  private readonly envoy: EnvoyService;
  private readonly startListener: boolean;

  constructor(options: EnvoyTaskServiceOptions = {}) {
    this.envoy = options.envoy ?? getEnvoyService();
    this.startListener = options.startListener ?? true;
  }

  async spaceStatus(canvasId?: string): Promise<unknown> {
    return this.envoy.spaceStatus(canvasId);
  }

  async createTask(input: CreateEnvoyTaskInput): Promise<Record<string, unknown>> {
    this.validateCable(input);
    const space = await this.envoy.ensureEnvoySpace({ canvasId: input.canvasId });
    if (this.startListener && space.envoy_space_id) {
      ensureEnvoyListener(space.envoy_space_id);
    }
    if (!space.envoy_space_id) {
      throw new Error(`Envoy space is not ready for canvas ${input.canvasId}`);
    }

    const correlationId = input.correlationId?.trim() || newCorrelationId();

    // Kernel decides — create authoritative task first (R3c-b).
    const kernelCreated = await dispatchEnvoyKernel("kernel.task.create", {
      title: input.title,
      objective: input.instruction,
      correlationId,
      metadata: {
        canvasId: input.canvasId,
        sourceTileId: input.sourceTileId,
        targetTileId: input.targetTileId ?? null,
        connectionId: input.connectionId ?? null,
        acceptanceCriteria: input.acceptanceCriteria ?? [],
      },
    });
    if (!kernelCreated.ok || !kernelCreated.id) {
      throw new Error(kernelCreated.error ?? "kernel.task.create failed");
    }
    const kernelTaskId = kernelCreated.id;

    const body = JSON.stringify({
      schema: "quantflow.envoy_task.v1",
      canvas_id: input.canvasId,
      source_tile_id: input.sourceTileId,
      target_tile_id: input.targetTileId ?? null,
      connection_id: input.connectionId ?? null,
      correlation_id: correlationId,
      task_id: kernelTaskId,
      title: input.title,
      instruction: input.instruction,
      acceptance_criteria: input.acceptanceCriteria ?? [],
    });
    const post = await this.envoy.postTask({ envoySpaceId: space.envoy_space_id, body });

    const mirrorCtx: MirrorContext = {
      canvasId: input.canvasId,
      envoySpaceId: space.envoy_space_id,
      sourceTileId: input.sourceTileId,
      targetTileId: input.targetTileId ?? null,
      connectionId: input.connectionId ?? null,
      envoyTaskId: post.envoyMessageId,
      title: input.title,
      instruction: input.instruction,
      acceptanceCriteria: input.acceptanceCriteria ?? [],
    };
    const task = syncMirrorFromKernel(kernelTaskId, mirrorCtx);
    const receipt = this.recordReceipt(task, {
      kind: "create",
      actorTileId: input.sourceTileId,
      envoyMessageId: post.envoyMessageId,
      payload: { body, raw: post.raw, kernel_task_id: kernelTaskId },
    });
    this.recordEvent("envoy.task.create", task, receipt);
    return {
      task: publicTask(getEnvoyTask(task.task_id) ?? task),
      receipt: publicReceipt(receipt),
    };
  }

  listTasks(filter: EnvoyTaskFilter = {}): Record<string, unknown> {
    const tasks = listEnvoyTasks(filter).map((row) => {
      const refreshed = refreshMirrorStatus(row.task_id) ?? row;
      return publicTask(refreshed);
    });
    return { tasks };
  }

  async claimTask(input: {
    taskId: string;
    claimingTileId: string;
    agentName?: string | null;
  }): Promise<Record<string, unknown>> {
    const mirror = this.requireTask(input.taskId);
    const claimedBy = input.agentName ?? input.claimingTileId;

    const kernel = getKernelTask(input.taskId);
    if (!kernel) {
      throw new Error(`Kernel task not found for envoy task ${input.taskId}`);
    }
    if (kernel.status !== "open" && kernel.status !== "claimed") {
      throw new Error(`Task ${input.taskId} is already claimed or unavailable`);
    }

    await ensureKernelTile(input.claimingTileId);
    const claim = await dispatchEnvoyKernel("kernel.task.claim", {
      taskId: input.taskId,
      tileId: input.claimingTileId,
    });
    if (!claim.ok) {
      throw new Error(claim.error ?? `Task ${input.taskId} is already claimed or unavailable`);
    }
    const start = await dispatchEnvoyKernel("kernel.task.start", { taskId: input.taskId });
    if (!start.ok) {
      throw new Error(start.error ?? "kernel.task.start failed");
    }

    const updated = syncMirrorFromKernel(input.taskId, mirrorContextFromRow(mirror), {
      claimedBy,
      claimedAt: Date.now(),
    });
    await this.syncEnvoyStatus(updated, "claimed");
    const receipt = this.recordReceipt(updated, {
      kind: "claim",
      actorTileId: input.claimingTileId,
      agentName: input.agentName ?? null,
      payload: { claimed_by: claimedBy },
    });
    this.recordEvent("envoy.task.claim", updated, receipt);
    return {
      task: publicTask(getEnvoyTask(updated.task_id) ?? updated),
      receipt: publicReceipt(receipt),
    };
  }

  async updateTaskProgress(input: {
    taskId: string;
    summary: string;
    actorTileId?: string | null;
    agentName?: string | null;
  }): Promise<Record<string, unknown>> {
    const mirror = this.requireTask(input.taskId);
    const kernel = getKernelTask(input.taskId);
    if (!kernel) {
      throw new Error(`Kernel task not found for envoy task ${input.taskId}`);
    }
    if (kernel.status === "claimed") {
      const start = await dispatchEnvoyKernel("kernel.task.start", { taskId: input.taskId });
      if (!start.ok) throw new Error(start.error ?? "kernel.task.start failed");
    }

    const updated = syncMirrorFromKernel(input.taskId, mirrorContextFromRow(mirror));
    await this.syncEnvoyStatus(updated, "working");
    const receipt = this.recordReceipt(updated, {
      kind: "progress",
      actorTileId: input.actorTileId ?? updated.target_tile_id,
      agentName: input.agentName ?? null,
      payload: { summary: input.summary },
    });
    this.recordEvent("envoy.task.progress", updated, receipt);
    return {
      task: publicTask(getEnvoyTask(updated.task_id) ?? updated),
      receipt: publicReceipt(receipt),
    };
  }

  async completeTask(input: {
    taskId: string;
    resultSummary: string;
    artifactPaths?: string[];
    actorTileId?: string | null;
    agentName?: string | null;
  }): Promise<Record<string, unknown>> {
    const mirror = this.requireTask(input.taskId);
    const kernel = getKernelTask(input.taskId);
    if (!kernel) {
      throw new Error(`Kernel task not found for envoy task ${input.taskId}`);
    }

    // Legacy Envoy complete → Kernel complete with documented bypass (Hermes/MCP compat).
    if (kernel.status === "working" || kernel.status === "claimed") {
      const complete = await dispatchEnvoyKernel("kernel.task.complete", {
        taskId: input.taskId,
        legacy: true,
        summary: input.resultSummary,
      });
      if (!complete.ok) {
        throw new Error(complete.error ?? "kernel.task.complete failed");
      }
    } else if (kernel.status !== "complete") {
      throw new Error(`Task ${input.taskId} cannot complete from status ${kernel.status}`);
    }

    const updated = syncMirrorFromKernel(input.taskId, mirrorContextFromRow(mirror), {
      resultSummary: input.resultSummary,
      artifactPaths: input.artifactPaths ?? [],
    });
    await this.syncEnvoyStatus(updated, "done");
    const receipt = this.recordReceipt(updated, {
      kind: "complete",
      actorTileId: input.actorTileId ?? updated.target_tile_id,
      agentName: input.agentName ?? null,
      payload: {
        result_summary: input.resultSummary,
        artifact_paths: input.artifactPaths ?? [],
      },
    });
    this.recordEvent("envoy.task.complete", updated, receipt);
    return {
      task: publicTask(getEnvoyTask(updated.task_id) ?? updated),
      receipt: publicReceipt(receipt),
    };
  }

  async blockTask(input: {
    taskId: string;
    reason: string;
    actorTileId?: string | null;
    agentName?: string | null;
  }): Promise<Record<string, unknown>> {
    const block = await dispatchEnvoyKernel("kernel.task.block", {
      taskId: input.taskId,
      reason: input.reason,
    });
    if (!block.ok) throw new Error(block.error ?? "kernel.task.block failed");
    return this.closeWithStatus("blocked", "envoy.task.block", input.taskId, {
      reason: input.reason,
      actorTileId: input.actorTileId,
      agentName: input.agentName,
    });
  }

  async failTask(input: {
    taskId: string;
    reason: string;
    actorTileId?: string | null;
    agentName?: string | null;
  }): Promise<Record<string, unknown>> {
    const fail = await dispatchEnvoyKernel("kernel.task.fail", {
      taskId: input.taskId,
      reason: input.reason,
    });
    if (!fail.ok) throw new Error(fail.error ?? "kernel.task.fail failed");
    return this.closeWithStatus("failed", "envoy.task.fail", input.taskId, {
      reason: input.reason,
      actorTileId: input.actorTileId,
      agentName: input.agentName,
    });
  }

  listReceipts(filter: EnvoyReceiptFilter = {}): Record<string, unknown> {
    return { receipts: listEnvoyReceipts(filter).map(publicReceipt) };
  }

  recentEvents(filter: { correlationId?: string; limit?: number } = {}): Record<string, unknown> {
    return {
      events: listEvents({
        correlationId: filter.correlationId,
        limit: filter.limit ?? 100,
      }).filter((event) => event.kind.startsWith("envoy.")),
    };
  }

  private requireTask(taskId: string): EnvoyTaskRow {
    const task = getEnvoyTask(taskId);
    if (!task) throw new Error(`Envoy task not found: ${taskId}`);
    return task;
  }

  private validateCable(input: CreateEnvoyTaskInput): void {
    if (input.operatorOverride) return;
    if (!input.connectionId) {
      throw new Error("connectionId is required unless operatorOverride is true");
    }
    if (!input.targetTileId) {
      throw new Error("targetTileId is required unless operatorOverride is true");
    }
    const connection = getConnection(input.connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${input.connectionId}`);
    }
    const endpoints = new Set([
      connection.tile_a_id,
      connection.tile_b_id,
      connection.from_tile_id,
      connection.to_tile_id,
    ].filter((value): value is string => Boolean(value)));
    if (!endpoints.has(input.sourceTileId) || !endpoints.has(input.targetTileId)) {
      throw new Error(
        `Connection ${input.connectionId} does not connect ${input.sourceTileId} to ${input.targetTileId}`,
      );
    }
  }

  private async syncEnvoyStatus(task: EnvoyTaskRow, status: EnvoyTaskStatus): Promise<void> {
    const envoyStatus = envoyStatusFor(status);
    if (!envoyStatus) return;
    try {
      await this.envoy.updateTaskStatus({
        envoySpaceId: task.envoy_space_id,
        envoyTaskId: task.envoy_task_id,
        status: envoyStatus,
      });
    } catch (err) {
      appendEvent({
        kind: "envoy.task.status_sync_error",
        taskId: task.task_id,
        correlationId: task.correlation_id,
        cableId: task.connection_id,
        level: "warn",
        data: {
          status,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private recordReceipt(
    task: EnvoyTaskRow,
    params: {
      kind: string;
      actorTileId?: string | null;
      agentName?: string | null;
      envoyMessageId?: string | null;
      payload?: Record<string, unknown>;
    },
  ): EnvoyReceiptRow {
    return insertEnvoyReceipt({
      taskId: task.task_id,
      canvasId: task.canvas_id,
      envoySpaceId: task.envoy_space_id,
      correlationId: task.correlation_id,
      connectionId: task.connection_id,
      kind: params.kind,
      actorTileId: params.actorTileId ?? null,
      agentName: params.agentName ?? null,
      envoyMessageId: params.envoyMessageId ?? null,
      payload: params.payload ?? {},
    });
  }

  private recordEvent(kind: string, task: EnvoyTaskRow, receipt: EnvoyReceiptRow): void {
    appendEvent({
      kind,
      taskId: task.task_id,
      tileId: receipt.actor_tile_id,
      correlationId: task.correlation_id,
      cableId: task.connection_id,
      data: {
        task_id: task.task_id,
        receipt_id: receipt.receipt_id,
        envoy_space_id: task.envoy_space_id,
        status: task.status,
      },
    });
  }

  private async closeWithStatus(
    status: "blocked" | "failed",
    eventKind: string,
    taskId: string,
    params: {
      reason: string;
      actorTileId?: string | null;
      agentName?: string | null;
    },
  ): Promise<Record<string, unknown>> {
    const mirror = this.requireTask(taskId);
    const updated = syncMirrorFromKernel(taskId, mirrorContextFromRow(mirror), {
      resultSummary: params.reason,
    });
    await this.syncEnvoyStatus(updated, status);
    const receipt = this.recordReceipt(updated, {
      kind: status,
      actorTileId: params.actorTileId ?? updated.target_tile_id,
      agentName: params.agentName ?? null,
      payload: { reason: params.reason },
    });
    this.recordEvent(eventKind, updated, receipt);
    return {
      task: publicTask(getEnvoyTask(updated.task_id) ?? updated),
      receipt: publicReceipt(receipt),
    };
  }
}

let defaultTaskService: EnvoyTaskService | null = null;

export function getEnvoyTaskService(): EnvoyTaskService {
  defaultTaskService ??= new EnvoyTaskService();
  return defaultTaskService;
}

export function resetEnvoyTaskServiceForTesting(): void {
  defaultTaskService = null;
}
