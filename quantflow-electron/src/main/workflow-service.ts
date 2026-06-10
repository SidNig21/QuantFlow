import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getEnvoyTaskService, type EnvoyTaskService } from "./envoy-task-service";
import { appendEvent } from "./runtime-state/events-repo";
import { readVaultConfig } from "./vault-config";

const DEFAULT_VAULT_PATH = "C:\\Users\\rybow\\Obsidian\\Cursor Collab";

export const CANVAS_SKILL_RELATIVE_PATH = join(
  "Projects",
  "QuantFlow",
  "QUANTFLOW_CANVAS_SKILL.md",
);

/** Keep one pane.send_text payload comfortably under herdr's text limit. */
export const CANVAS_SKILL_MAX_CHARS = 6000;

export interface CanvasSkill {
  path: string;
  text: string;
  truncated: boolean;
}

export function truncateCanvasSkill(
  raw: string,
  maxChars: number = CANVAS_SKILL_MAX_CHARS,
): { text: string; truncated: boolean } {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  const marker = "\n[... truncated — read the full skill file in the vault ...]";
  return {
    text: text.slice(0, maxChars - marker.length) + marker,
    truncated: true,
  };
}

export async function resolveCanvasSkillPath(
  vaultPathOverride?: string,
): Promise<string> {
  const vaultPath = vaultPathOverride?.trim()
    || (await readVaultConfig()).vaultPath?.trim()
    || DEFAULT_VAULT_PATH;
  return join(vaultPath, CANVAS_SKILL_RELATIVE_PATH);
}

export async function readCanvasSkill(options: {
  vaultPath?: string;
  maxChars?: number;
} = {}): Promise<CanvasSkill> {
  const path = await resolveCanvasSkillPath(options.vaultPath);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`QUANTFLOW_CANVAS_SKILL.md is not readable at ${path}: ${reason}`);
  }
  const { text, truncated } = truncateCanvasSkill(raw, options.maxChars);
  if (!text) {
    throw new Error(`QUANTFLOW_CANVAS_SKILL.md is empty at ${path}`);
  }
  return { path, text, truncated };
}

/** Pseudo tile id for tasks the operator creates from the Run Workflow modal. */
export const WORKFLOW_SOURCE_TILE_ID = "operator";

const WORKFLOW_TITLE_MAX_CHARS = 80;

export function workflowTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n", 1)[0].trim();
  if (firstLine.length <= WORKFLOW_TITLE_MAX_CHARS) return firstLine;
  return `${firstLine.slice(0, WORKFLOW_TITLE_MAX_CHARS - 3)}...`;
}

export interface WorkflowSubmitInput {
  canvasId?: string;
  prompt: string;
}

export interface WorkflowTaskResult {
  taskId: string;
  envoyTaskId: string;
  envoySpaceId: string;
  correlationId: string;
  canvasId: string;
  title: string;
}

/**
 * Create the durable Envoy task for an operator prompt. Runs before any
 * spawn so the intent survives even if Hermes never comes up.
 */
export async function createWorkflowTask(
  input: WorkflowSubmitInput,
  service: Pick<EnvoyTaskService, "createTask"> = getEnvoyTaskService(),
): Promise<WorkflowTaskResult> {
  const prompt = String(input?.prompt ?? "").trim();
  if (!prompt) {
    throw new Error("workflow:submit requires a non-empty prompt");
  }
  const canvasId = String(input?.canvasId ?? "").trim() || "main";
  const title = workflowTitleFromPrompt(prompt);

  const created = await service.createTask({
    canvasId,
    sourceTileId: WORKFLOW_SOURCE_TILE_ID,
    targetTileId: null,
    connectionId: null,
    title,
    instruction: prompt,
    operatorOverride: true,
  });
  const task = created.task as Record<string, unknown>;
  const result: WorkflowTaskResult = {
    taskId: String(task.task_id),
    envoyTaskId: String(task.envoy_task_id),
    envoySpaceId: String(task.envoy_space_id),
    correlationId: String(task.correlation_id),
    canvasId,
    title,
  };

  appendEvent({
    kind: "workflow.task.created",
    taskId: result.taskId,
    tileId: WORKFLOW_SOURCE_TILE_ID,
    correlationId: result.correlationId,
    data: {
      title,
      canvas_id: canvasId,
      envoy_space_id: result.envoySpaceId,
    },
  });
  return result;
}
