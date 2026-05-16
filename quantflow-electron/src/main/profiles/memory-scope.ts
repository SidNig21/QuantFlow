import { resolve } from "node:path";
import type { Profile, VaultMemoryScope } from "./profile-types";

export interface MemoryScopeRequest {
  action: string;
  requestedPath?: string;
  workspacePath?: string;
}

export interface MemoryScopeAllow {
  ok: true;
}

export interface MemoryScopeDeny {
  ok: false;
  error: "memory_scope_denied";
  profileId: string;
  profileName: string;
  action: string;
  scope: VaultMemoryScope;
  allowedScopes: string[];
  message: string;
  requestedPath?: string;
  workspacePath?: string;
}

export type MemoryScopeDecision = MemoryScopeAllow | MemoryScopeDeny;

function normalizeScopedPath(path: string): string {
  let normalized = path.trim().replace(/\\/g, "/");
  if (/^[A-Za-z]:(?:\/|$)/.test(normalized)) {
    normalized = `/${normalized[0]?.toLowerCase()}${normalized.slice(2)}`;
  } else if (/^\/mnt\/[A-Za-z](?:\/|$)/.test(normalized)) {
    normalized = `/${normalized[5]?.toLowerCase()}${normalized.slice(6)}`;
  } else if (!normalized.startsWith("/")) {
    normalized = resolve(normalized).replace(/\\/g, "/");
  }
  normalized = normalized.replace(/\/+/g, "/");
  if (normalized.length > 1) {
    normalized = normalized.replace(/\/$/, "");
  }
  return normalized.toLowerCase();
}

function isSameOrChild(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

function allowedScopesFor(scope: VaultMemoryScope, workspacePath?: string): string[] {
  if (scope.mode === "all") return ["vault:*"];
  if (scope.mode === "none") return [];
  if (scope.mode === "workspace") {
    return workspacePath ? [`workspace:${workspacePath}`] : ["workspace:<required>"];
  }
  return scope.paths.map((path) => `path:${path}`);
}

function deny(
  profile: Pick<Profile, "id" | "name" | "vaultMemoryScope">,
  request: MemoryScopeRequest,
  message: string,
): MemoryScopeDeny {
  const result: MemoryScopeDeny = {
    ok: false,
    error: "memory_scope_denied",
    profileId: profile.id,
    profileName: profile.name,
    action: request.action,
    scope: profile.vaultMemoryScope,
    allowedScopes: allowedScopesFor(
      profile.vaultMemoryScope,
      request.workspacePath,
    ),
    message,
  };
  if (request.requestedPath !== undefined) {
    result.requestedPath = request.requestedPath;
  }
  if (request.workspacePath !== undefined) {
    result.workspacePath = request.workspacePath;
  }
  return result;
}

export function isPathAllowedByVaultMemoryScope(
  scope: VaultMemoryScope,
  requestedPath: string,
  workspacePath?: string,
): boolean {
  if (scope.mode === "all") return true;
  if (scope.mode === "none") return false;

  const candidate = normalizeScopedPath(requestedPath);
  if (scope.mode === "workspace") {
    if (!workspacePath) return false;
    return isSameOrChild(normalizeScopedPath(workspacePath), candidate);
  }

  return scope.paths.some((allowedPath) =>
    isSameOrChild(normalizeScopedPath(allowedPath), candidate)
  );
}

export function checkVaultMemoryScope(
  profile: Pick<Profile, "id" | "name" | "vaultMemoryScope">,
  request: MemoryScopeRequest,
): MemoryScopeDecision {
  const scope = profile.vaultMemoryScope;
  if (scope.mode === "all") return { ok: true };
  if (scope.mode === "none") {
    return deny(
      profile,
      request,
      `Profile ${profile.name} is not allowed to access vault memory.`,
    );
  }
  if (!request.requestedPath) {
    return deny(
      profile,
      request,
      `Profile ${profile.name} must provide a path for ${request.action}.`,
    );
  }
  if (
    isPathAllowedByVaultMemoryScope(
      scope,
      request.requestedPath,
      request.workspacePath,
    )
  ) {
    return { ok: true };
  }
  return deny(
    profile,
    request,
    `Profile ${profile.name} cannot ${request.action} outside its vault memory scope.`,
  );
}
