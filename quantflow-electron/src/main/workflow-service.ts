import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getEnvoyTaskService, type EnvoyTaskService } from "./envoy-task-service";
import type { HerdrRpc } from "./herdr-session-spawn";
import { callHerdrSocket } from "./herdr-socket-bridge";
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

/** Matches ROLE_STARTUP_PROMPT_DELAY_MS in herdr-session-spawn. */
export const WORKFLOW_STARTUP_DELAY_MS = 1800;
/** Small pause so the skill block finishes echoing before the next line. */
export const WORKFLOW_SKILL_RENDER_DELAY_MS = 400;

const SKILL_HEREDOC_TAG = "QF_CANVAS_SKILL";

/**
 * Render the skill in the pane scrollback without bash executing it:
 * a quoted no-op heredoc echoes every line as typed and runs nothing.
 */
export function buildSkillDisplayCommand(skillText: string): string {
  const safe = skillText
    .split("\n")
    .filter((line) => line.trim() !== SKILL_HEREDOC_TAG)
    .join("\n");
  return `: <<'${SKILL_HEREDOC_TAG}'\n${safe}\n${SKILL_HEREDOC_TAG}`;
}

export function buildWorkflowActivationLine(params: {
  correlationId: string;
  taskId: string;
  skillPath: string;
}): string {
  return [
    "Read the Envoy inbox and claim your task via qf_task_list / qf_task_claim.",
    `correlation_id=${params.correlationId}`,
    `task_id=${params.taskId}`,
    `Canvas skill shown above; full file: ${params.skillPath}.`,
    "Begin orchestrating.",
  ].join(" ");
}

async function sendPaneLine(
  rpc: HerdrRpc,
  paneId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await rpc("pane.send_text", { pane_id: paneId, text: trimmed });
  await rpc("pane.send_keys", { pane_id: paneId, keys: ["Enter"] });
}

export interface WorkflowInjectInput {
  herdrPaneId: string;
  taskId: string;
  correlationId: string;
  /** Agent launch command; defaults to the Hermes role template. */
  command?: string;
  /** Test override for the vault location. */
  vaultPath?: string;
}

export interface WorkflowInjectResult {
  skillPath: string;
  skillTruncated: boolean;
  command: string;
  activationLine: string;
}

/**
 * CNVS-style ordered pane injection after the Hermes tile spawns:
 * skill preamble (displayed, not executed) → agent command → activation
 * line carrying the correlation and task ids.
 */
export async function injectWorkflowContext(
  input: WorkflowInjectInput,
  rpc: HerdrRpc = callHerdrSocket,
  delays: { render: number; startup: number } = {
    render: WORKFLOW_SKILL_RENDER_DELAY_MS,
    startup: WORKFLOW_STARTUP_DELAY_MS,
  },
): Promise<WorkflowInjectResult> {
  const herdrPaneId = String(input?.herdrPaneId ?? "").trim();
  const taskId = String(input?.taskId ?? "").trim();
  const correlationId = String(input?.correlationId ?? "").trim();
  if (!herdrPaneId || !taskId || !correlationId) {
    throw new Error("workflow:inject requires herdrPaneId, taskId, and correlationId");
  }

  const skill = await readCanvasSkill({ vaultPath: input.vaultPath });
  await sendPaneLine(rpc, herdrPaneId, buildSkillDisplayCommand(skill.text));
  appendEvent({
    kind: "workflow.context.injected",
    taskId,
    correlationId,
    data: {
      herdr_pane_id: herdrPaneId,
      skill_path: skill.path,
      skill_truncated: skill.truncated,
    },
  });

  if (delays.render > 0) await delay(delays.render);
  const command = input.command?.trim() || "hermes";
  await sendPaneLine(rpc, herdrPaneId, command);

  if (delays.startup > 0) await delay(delays.startup);
  const activationLine = buildWorkflowActivationLine({
    correlationId,
    taskId,
    skillPath: skill.path,
  });
  await sendPaneLine(rpc, herdrPaneId, activationLine);
  appendEvent({
    kind: "workflow.activated",
    taskId,
    correlationId,
    data: {
      herdr_pane_id: herdrPaneId,
      command,
    },
  });

  return {
    skillPath: skill.path,
    skillTruncated: skill.truncated,
    command,
    activationLine,
  };
}
