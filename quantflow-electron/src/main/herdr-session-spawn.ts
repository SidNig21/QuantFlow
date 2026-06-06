import { setTimeout as delay } from "node:timers/promises";
import { callHerdrSocket } from "./herdr-socket-bridge";
import { buildHerdrDisplayTarget } from "./pty-spawn-params";

const ROLE_STARTUP_PROMPT_DELAY_MS = 1800;

export interface HerdrRoleSpawnRequest {
  tileId: string;
  roleId: string;
  roleName: string;
  cwd?: string;
  commandTemplate?: string;
  startupPrompt?: string;
  canvasId?: string;
  workspaceId?: string;
}

export interface HerdrRoleSpawnResult {
  runtimeTarget: "herdr-wsl";
  herdrAgentName: string;
  herdrWorkspaceId: string;
  herdrPaneId: string;
  herdrTerminalId: string;
  terminalTarget: string;
  workspaceCreateResult: Record<string, unknown>;
  paneSplitResult: Record<string, unknown>;
  paneGetResult: Record<string, unknown>;
}

export type HerdrRpc = <T = Record<string, unknown>>(
  method: string,
  params?: Record<string, unknown>,
) => Promise<T>;

function slugPart(value: string | undefined, fallback: string): string {
  const slug = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function buildHerdrAgentName(
  request: Pick<HerdrRoleSpawnRequest, "tileId" | "roleId" | "workspaceId" | "canvasId">,
): string {
  const workspace = slugPart(request.workspaceId ?? request.canvasId, "canvas");
  const role = slugPart(request.roleId, "role");
  const tile = slugPart(request.tileId, "tile");
  return `qf.${workspace}.${role}.${tile}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function stringAt(
  value: unknown,
  path: string[],
): string | null {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return null;
    current = record[key];
  }
  return typeof current === "string" && current.trim()
    ? current.trim()
    : null;
}

export function extractHerdrPaneId(
  workspaceCreateResult: unknown,
  paneSplitResult: unknown,
): string | null {
  const candidates = [
    stringAt(paneSplitResult, ["pane_id"]),
    stringAt(paneSplitResult, ["paneId"]),
    stringAt(paneSplitResult, ["id"]),
    stringAt(paneSplitResult, ["pane", "id"]),
    stringAt(paneSplitResult, ["pane", "pane_id"]),
    stringAt(workspaceCreateResult, ["root_pane", "pane_id"]),
    stringAt(workspaceCreateResult, ["rootPane", "paneId"]),
  ];
  return candidates.find(Boolean) ?? null;
}

export function extractHerdrWorkspaceId(
  workspaceCreateResult: unknown,
): string | null {
  const candidates = [
    stringAt(workspaceCreateResult, ["workspace_id"]),
    stringAt(workspaceCreateResult, ["workspaceId"]),
    stringAt(workspaceCreateResult, ["workspace", "workspace_id"]),
    stringAt(workspaceCreateResult, ["workspace", "workspaceId"]),
  ];
  return candidates.find(Boolean) ?? null;
}

export function extractHerdrTerminalId(
  paneResult: unknown,
): string | null {
  const candidates = [
    stringAt(paneResult, ["terminal_id"]),
    stringAt(paneResult, ["terminalId"]),
    stringAt(paneResult, ["terminal", "id"]),
    stringAt(paneResult, ["pane", "terminal_id"]),
    stringAt(paneResult, ["pane", "terminalId"]),
  ];
  return candidates.find(Boolean) ?? null;
}

async function sendHerdrPaneLine(
  rpc: HerdrRpc,
  paneId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await rpc("pane.send_text", { pane_id: paneId, text: trimmed });
  await rpc("pane.send_keys", { pane_id: paneId, keys: ["Enter"] });
}

export async function spawnHerdrRoleSession(
  request: HerdrRoleSpawnRequest,
  rpc: HerdrRpc = callHerdrSocket,
): Promise<HerdrRoleSpawnResult> {
  const herdrAgentName = buildHerdrAgentName(request);
  const workspaceCreateResult = await rpc("workspace.create", {
    label: herdrAgentName,
    cwd: request.cwd,
    no_focus: true,
  });

  const rootPaneId = extractHerdrPaneId(workspaceCreateResult, {});
  if (!rootPaneId) {
    throw new Error("herdr workspace create did not return a root pane id");
  }

  const paneSplitResult = await rpc("pane.split", {
    target_pane_id: rootPaneId,
    direction: "right",
    cwd: request.cwd,
    no_focus: true,
    tile_id: request.tileId,
  });

  const herdrPaneId = extractHerdrPaneId({}, paneSplitResult);
  if (!herdrPaneId) {
    throw new Error("herdr pane split did not return an agent pane id");
  }

  const paneGetResult = await rpc("pane.get", {
    pane_id: herdrPaneId,
  });
  const paneGetPaneId = extractHerdrPaneId({}, paneGetResult);
  if (paneGetPaneId && paneGetPaneId !== herdrPaneId) {
    throw new Error("herdr pane get returned a different pane id");
  }

  const herdrWorkspaceId = extractHerdrWorkspaceId(workspaceCreateResult);
  if (!herdrWorkspaceId) {
    throw new Error("herdr spawn did not return a workspace id");
  }

  const herdrTerminalId = extractHerdrTerminalId(paneGetResult);
  if (!herdrTerminalId) {
    throw new Error("herdr pane get did not return an agent terminal id");
  }

  const commandTemplate = request.commandTemplate?.trim() ?? "";
  const startupPrompt = request.startupPrompt?.trim() ?? "";

  if (commandTemplate) {
    await sendHerdrPaneLine(rpc, herdrPaneId, commandTemplate);
  }
  if (startupPrompt) {
    if (commandTemplate) {
      await delay(ROLE_STARTUP_PROMPT_DELAY_MS);
    }
    await sendHerdrPaneLine(rpc, herdrPaneId, startupPrompt);
  }

  return {
    runtimeTarget: "herdr-wsl",
    herdrAgentName,
    herdrWorkspaceId,
    herdrPaneId,
    herdrTerminalId,
    terminalTarget: buildHerdrDisplayTarget(herdrTerminalId),
    workspaceCreateResult: asRecord(workspaceCreateResult) ?? {},
    paneSplitResult: asRecord(paneSplitResult) ?? {},
    paneGetResult: asRecord(paneGetResult) ?? {},
  };
}
