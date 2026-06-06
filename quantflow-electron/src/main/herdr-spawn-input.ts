import type { HerdrRoleSpawnRequest } from "./herdr-session-spawn";

function requiredString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`herdr:spawn-role requires ${field}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

export function normalizeHerdrSpawnInput(
  input: unknown,
): HerdrRoleSpawnRequest {
  const params = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  return {
    tileId: requiredString(params.tileId, "tileId"),
    roleId: requiredString(params.roleId, "roleId"),
    roleName: requiredString(params.roleName, "roleName"),
    cwd: optionalString(params.cwd),
    commandTemplate: optionalString(params.commandTemplate),
    startupPrompt: optionalString(params.startupPrompt),
    canvasId: optionalString(params.canvasId),
    workspaceId: optionalString(params.workspaceId),
  };
}
