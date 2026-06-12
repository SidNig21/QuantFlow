import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { windowsPathToWslPath } from "@collab/shared/path-utils";
import { getEnvoyTaskService, type EnvoyTaskService } from "./envoy-task-service";
import type { HerdrRpc } from "./herdr-session-spawn";
import { callHerdrSocket } from "./herdr-socket-bridge";
import {
  waitForWorkflowAgentPrompt,
  WORKFLOW_AGENT_PROMPT_TIMEOUT_MS,
  WORKFLOW_PROMPT_SETTLE_MS,
} from "./workflow-agent-ready";
import { appendEvent } from "./runtime-state/events-repo";
import { readVaultConfig } from "./vault-config";

const DEFAULT_VAULT_PATH = "C:\\Users\\rybow\\Obsidian\\Cursor Collab";
const DEFAULT_REPO_ROOT = "C:\\Users\\rybow\\QuantFlow";

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

/** Brief settle after spawn before launching the agent command. */
export const WORKFLOW_PANE_READY_DELAY_MS = 800;

export function shellQuoteSingle(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Print the skill file in scrollback with one line — multiline heredocs break
 * because pane.send_text delivers newlines as Enter keypresses.
 */
export function buildSkillCatCommand(skillPath: string): string {
  const wslPath = windowsPathToWslPath(skillPath);
  if (!wslPath) {
    throw new Error(`Cannot convert skill path to WSL: ${skillPath}`);
  }
  return `cat ${shellQuoteSingle(wslPath)}`;
}

export function resolveSkillWslPath(skillPath: string): string {
  const wslPath = windowsPathToWslPath(skillPath);
  if (!wslPath) {
    throw new Error(`Cannot convert skill path to WSL: ${skillPath}`);
  }
  return wslPath;
}

export function buildWorkflowActivationLine(params: {
  correlationId: string;
  taskId: string;
  skillPath: string;
  canvasId?: string;
  envoySpaceId?: string;
  claimingTileId?: string;
}): string {
  const skillRef = resolveSkillWslPath(params.skillPath);
  return [
    "Read the Envoy inbox and claim your task via qf_task_list / qf_task_claim.",
    params.canvasId ? `canvas_id=${params.canvasId}` : "",
    params.envoySpaceId ? `envoy_space_id=${params.envoySpaceId}` : "",
    `correlation_id=${params.correlationId}`,
    `task_id=${params.taskId}`,
    params.claimingTileId ? `claiming_tile_id=${params.claimingTileId}` : "",
    `Read the canvas skill file: ${skillRef}`,
    "Begin orchestrating.",
  ].filter(Boolean).join(" ");
}

export function buildCodexWorkerPrompt(params: {
  taskId: string;
  correlationId: string;
  skillPath: string;
  canvasId?: string;
  envoySpaceId?: string;
  claimingTileId?: string;
}): string {
  const skillRef = resolveSkillWslPath(params.skillPath);
  return [
    "You are a QuantFlow Codex worker tile.",
    "Do not wait for terminal instructions and do not rely on terminal_write.",
    "Use the QuantFlow MCP tools now.",
    "First call qf_envoy_space_status.",
    "Then call qf_task_list and qf_task_claim for the exact task below.",
    `task_id=${params.taskId}`,
    `correlation_id=${params.correlationId}`,
    params.canvasId ? `canvas_id=${params.canvasId}` : "",
    params.envoySpaceId ? `envoy_space_id=${params.envoySpaceId}` : "",
    params.claimingTileId ? `claiming_tile_id=${params.claimingTileId}` : "",
    `Read the canvas skill file: ${skillRef}`,
    "Post progress with qf_task_update and finish with qf_task_complete.",
  ].filter(Boolean).join(" ");
}

function resolveRepoRoot(): string {
  const candidates = [
    process.env["QUANTFLOW_REPO_ROOT"],
    DEFAULT_REPO_ROOT,
    resolve(process.cwd(), ".."),
    process.cwd(),
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    const serverPath = join(candidate, "tools", "quantflow-mcp", "server.js");
    if (existsSync(serverPath)) return candidate;
  }
  return DEFAULT_REPO_ROOT;
}

function readConfiguredCodexCliPath(): string | null {
  const envPath = process.env["CODEX_CLI_PATH"]?.trim();
  if (envPath && existsSync(envPath)) return envPath;

  const configPath = join(homedir(), ".codex", "config.toml");
  try {
    const config = readFileSync(configPath, "utf-8");
    const match = /\bCODEX_CLI_PATH\s*=\s*['"]([^'"]+)['"]/.exec(config);
    const configuredPath = match?.[1]?.trim();
    if (configuredPath && existsSync(configuredPath)) return configuredPath;
  } catch {
    // Fall back to the command template.
  }
  return null;
}

function resolveCodexCommand(command: string): string {
  const baseCommand = command.trim() || "codex";
  if (!/^codex(?:\s|$)/.test(baseCommand)) return baseCommand;

  const configuredPath = readConfiguredCodexCliPath();
  if (!configuredPath) return baseCommand;

  const wslPath = windowsPathToWslPath(configuredPath);
  return wslPath ? shellQuoteSingle(wslPath) : shellQuoteSingle(configuredPath);
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function buildCodexMcpConfigArgs(repoRoot: string): string {
  const serverPath = join(repoRoot, "tools", "quantflow-mcp", "server.js");
  const mcpArgs = [
    `mcp_servers.quantflow.command="cmd.exe"`,
    `mcp_servers.quantflow.args=["/d","/c","node","${escapeTomlString(serverPath)}"]`,
  ];
  return mcpArgs.map((arg) => `-c ${shellQuoteSingle(arg)}`).join(" ");
}

export function buildCodexWorkerCommand(params: {
  command: string;
  taskId: string;
  correlationId: string;
  skillPath: string;
  canvasId?: string;
  envoySpaceId?: string;
  claimingTileId?: string;
}): string {
  const repoRoot = resolveRepoRoot();
  const baseCommand = resolveCodexCommand(params.command);
  const prompt = buildCodexWorkerPrompt(params);
  return [
    baseCommand,
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "-C",
    shellQuoteSingle(repoRoot),
    buildCodexMcpConfigArgs(repoRoot),
    shellQuoteSingle(prompt),
  ].join(" ");
}

async function sendPaneLine(
  rpc: HerdrRpc,
  paneId: string,
  text: string,
): Promise<void> {
  const line = text.trim();
  if (!line) return;
  await rpc("pane.send_text", { pane_id: paneId, text: line });
  await rpc("pane.send_keys", { pane_id: paneId, keys: ["Enter"] });
}

async function waitForHerdrPaneReady(
  rpc: HerdrRpc,
  paneId: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await rpc("pane.get", { pane_id: paneId });
      return;
    } catch {
      await delay(200);
    }
  }
  throw new Error(`herdr pane ${paneId} not ready after ${timeoutMs}ms`);
}

export interface WorkflowInjectInput {
  herdrPaneId: string;
  taskId: string;
  correlationId: string;
  /** Agent launch command; defaults to the Hermes role template. */
  command?: string;
  /** When true, spawn already ran the agent — inject context only. */
  agentAlreadyLaunched?: boolean;
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
 * After the Hermes tile spawns: launch agent (if needed), wait for boot, then
 * inject the activation line into the running agent session.
 */
export async function injectWorkflowContext(
  input: WorkflowInjectInput,
  rpc: HerdrRpc = callHerdrSocket,
  delays: {
    paneReady: number;
    promptTimeout: number;
    promptSettle: number;
  } = {
    paneReady: WORKFLOW_PANE_READY_DELAY_MS,
    promptTimeout: WORKFLOW_AGENT_PROMPT_TIMEOUT_MS,
    promptSettle: WORKFLOW_PROMPT_SETTLE_MS,
  },
): Promise<WorkflowInjectResult> {
  const herdrPaneId = String(input?.herdrPaneId ?? "").trim();
  const taskId = String(input?.taskId ?? "").trim();
  const correlationId = String(input?.correlationId ?? "").trim();
  if (!herdrPaneId || !taskId || !correlationId) {
    throw new Error("workflow:inject requires herdrPaneId, taskId, and correlationId");
  }

  const command = input.command?.trim() || "hermes";
  const agentAlreadyLaunched = Boolean(input.agentAlreadyLaunched);

  await waitForHerdrPaneReady(rpc, herdrPaneId);
  if (delays.paneReady > 0) await delay(delays.paneReady);

  if (!agentAlreadyLaunched) {
    await sendPaneLine(rpc, herdrPaneId, command);
  }

  await waitForWorkflowAgentPrompt(rpc, herdrPaneId, command, {
    timeoutMs: delays.promptTimeout,
    settleMs: delays.promptSettle,
  });

  const skill = await readCanvasSkill({ vaultPath: input.vaultPath });
  const activationLine = buildWorkflowActivationLine({
    correlationId,
    taskId,
    skillPath: skill.path,
  });
  await sendPaneLine(rpc, herdrPaneId, activationLine);
  appendEvent({
    kind: "workflow.context.injected",
    taskId,
    correlationId,
    data: {
      herdr_pane_id: herdrPaneId,
      skill_path: skill.path,
      skill_truncated: skill.truncated,
      agent_already_launched: agentAlreadyLaunched,
    },
  });
  appendEvent({
    kind: "workflow.activated",
    taskId,
    correlationId,
    data: {
      herdr_pane_id: herdrPaneId,
      command,
      agent_already_launched: agentAlreadyLaunched,
    },
  });

  return {
    skillPath: skill.path,
    skillTruncated: skill.truncated,
    command,
    activationLine,
  };
}
