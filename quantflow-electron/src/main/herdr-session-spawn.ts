import { callHerdrSocket } from "./herdr-socket-bridge";
import { buildHerdrDisplayTarget } from "./pty-spawn-params";

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
}

export type HerdrRpc = <T = Record<string, unknown>>(
  method: string,
  params?: Record<string, unknown>,
) => Promise<T>;

export function shouldSpawnRoleViaHerdr(role: {
  id?: string;
} | null | undefined): boolean {
  return role?.id === "hermes";
}

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
  paneSplitResult: unknown,
  paneId: string,
): string {
  const candidates = [
    stringAt(paneSplitResult, ["terminal_id"]),
    stringAt(paneSplitResult, ["terminalId"]),
    stringAt(paneSplitResult, ["terminal", "id"]),
    stringAt(paneSplitResult, ["pane", "terminal_id"]),
    stringAt(paneSplitResult, ["pane", "terminalId"]),
  ];
  return candidates.find(Boolean) ?? paneId;
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

  const herdrPaneId = extractHerdrPaneId(
    workspaceCreateResult,
    paneSplitResult,
  );
  if (!herdrPaneId) {
    throw new Error("herdr spawn did not return a pane id");
  }

  const commandTemplate = request.commandTemplate?.trim();
  const startupPrompt = request.startupPrompt?.trim();
  if (commandTemplate) {
    await rpc("pane.send_text", {
      pane_id: herdrPaneId,
      text: commandTemplate,
    });
    await rpc("pane.send_keys", {
      pane_id: herdrPaneId,
      keys: ["Enter"],
    });
    if (startupPrompt) {
      await rpc("pane.send_text", {
        pane_id: herdrPaneId,
        text: startupPrompt,
      });
      await rpc("pane.send_keys", {
        pane_id: herdrPaneId,
        keys: ["Enter"],
      });
    }
  }

  const herdrWorkspaceId = extractHerdrWorkspaceId(workspaceCreateResult);
  if (!herdrWorkspaceId) {
    throw new Error("herdr spawn did not return a workspace id");
  }

  const herdrTerminalId = extractHerdrTerminalId(
    paneSplitResult,
    herdrPaneId,
  );
  return {
    runtimeTarget: "herdr-wsl",
    herdrAgentName,
    herdrWorkspaceId,
    herdrPaneId,
    herdrTerminalId,
    terminalTarget: buildHerdrDisplayTarget(herdrTerminalId),
    workspaceCreateResult: asRecord(workspaceCreateResult) ?? {},
    paneSplitResult: asRecord(paneSplitResult) ?? {},
  };
}
