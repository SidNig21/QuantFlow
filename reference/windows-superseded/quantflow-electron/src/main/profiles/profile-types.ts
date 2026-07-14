export const PROFILE_REGISTRY_VERSION = 1 as const;

export type ProfileKind = "terminal" | "agent" | "tool";

export type TerminalTarget = "auto" | "powershell" | "shell" | `wsl:${string}`;

export type AgentRuntime =
  | "codex-cli"
  | "claude-cli"
  | "cursor-agent-cli"
  | "custom";

export type ToolProfileKind =
  | "mcp-stdio"
  | "mcp-http"
  | "script"
  | "service";

export type ProfileEnvEntry =
  | {
    name: string;
    kind: "literal";
    value: string;
  }
  | {
    name: string;
    kind: "secret-ref";
    ref: string;
  }
  | {
    name: string;
    kind: "workspace-ref";
    ref: string;
  };

export interface ProfilePermissions {
  network: "inherit" | "allow" | "deny";
  filesystem: "read-only" | "workspace-write" | "vault-write";
  interactive: boolean;
}

export type VaultMemoryScope =
  | { mode: "all" }
  | { mode: "workspace" }
  | { mode: "paths"; paths: string[] }
  | { mode: "none" };

export interface ProfileCommand {
  command: string;
  args: string[];
  cwd?: string;
}

export interface BaseProfile {
  id: string;
  kind: ProfileKind;
  name: string;
  description?: string;
  tags: string[];
  workspaceScope: string;
  permissions: ProfilePermissions;
  env: ProfileEnvEntry[];
  vaultMemoryScope: VaultMemoryScope;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalProfile extends BaseProfile {
  kind: "terminal";
  target: TerminalTarget;
  shell?: ProfileCommand;
  startupInput?: string;
}

export interface AgentProfile extends BaseProfile {
  kind: "agent";
  runtime: AgentRuntime;
  command: ProfileCommand;
  capabilities: string[];
}

export interface ToolProfile extends BaseProfile {
  kind: "tool";
  toolKind: ToolProfileKind;
  command?: ProfileCommand;
  endpoint?: string;
}

export type Profile = TerminalProfile | AgentProfile | ToolProfile;

export interface ProfileRegistry {
  version: typeof PROFILE_REGISTRY_VERSION;
  profiles: Profile[];
}

export interface ProfileValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ProfileValidationResult =
  | { ok: true; profile: Profile }
  | { ok: false; issues: ProfileValidationIssue[] };

export type ProfileRegistryValidationResult =
  | { ok: true; registry: ProfileRegistry }
  | { ok: false; issues: ProfileValidationIssue[] };

export class ProfileValidationError extends Error {
  readonly issues: ProfileValidationIssue[];

  constructor(issues: ProfileValidationIssue[], message = "Invalid profile") {
    super(message);
    this.name = "ProfileValidationError";
    this.issues = issues;
  }
}

export const DEFAULT_PROFILE_PERMISSIONS: ProfilePermissions = {
  network: "inherit",
  filesystem: "workspace-write",
  interactive: true,
};

export const DEFAULT_VAULT_MEMORY_SCOPE: VaultMemoryScope = {
  mode: "workspace",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addIssue(
  issues: ProfileValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function requireString(
  value: unknown,
  path: string,
  issues: ProfileValidationIssue[],
  options?: { allowEmpty?: boolean },
): string {
  if (typeof value !== "string") {
    addIssue(issues, path, "expected_string", `${path} must be a string`);
    return "";
  }
  const trimmed = value.trim();
  if (!options?.allowEmpty && trimmed.length === 0) {
    addIssue(issues, path, "empty_string", `${path} cannot be empty`);
  }
  return trimmed;
}

function optionalString(
  value: unknown,
  path: string,
  issues: ProfileValidationIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    addIssue(issues, path, "expected_string", `${path} must be a string`);
    return undefined;
  }
  return value.trim();
}

function requireStringArray(
  value: unknown,
  path: string,
  issues: ProfileValidationIssue[],
): string[] {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "expected_array", `${path} must be an array`);
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      addIssue(
        issues,
        `${path}.${index}`,
        "expected_string",
        `${path}.${index} must be a string`,
      );
      return;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      addIssue(
        issues,
        `${path}.${index}`,
        "empty_string",
        `${path}.${index} cannot be empty`,
      );
      return;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  });
  return result;
}

function isIsoDate(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function requireIsoDate(
  value: unknown,
  path: string,
  issues: ProfileValidationIssue[],
): string {
  const date = requireString(value, path, issues);
  if (date && !isIsoDate(date)) {
    addIssue(
      issues,
      path,
      "expected_iso_date",
      `${path} must be an ISO timestamp`,
    );
  }
  return date;
}

function parsePermissions(
  value: unknown,
  issues: ProfileValidationIssue[],
): ProfilePermissions {
  if (!isRecord(value)) {
    addIssue(
      issues,
      "permissions",
      "expected_object",
      "permissions must be an object",
    );
    return { ...DEFAULT_PROFILE_PERMISSIONS };
  }

  const network = value.network;
  const filesystem = value.filesystem;
  const interactive = value.interactive;

  if (network !== "inherit" && network !== "allow" && network !== "deny") {
    addIssue(
      issues,
      "permissions.network",
      "invalid_value",
      "permissions.network must be inherit, allow, or deny",
    );
  }
  if (
    filesystem !== "read-only" &&
    filesystem !== "workspace-write" &&
    filesystem !== "vault-write"
  ) {
    addIssue(
      issues,
      "permissions.filesystem",
      "invalid_value",
      "permissions.filesystem must be read-only, workspace-write, or vault-write",
    );
  }
  if (typeof interactive !== "boolean") {
    addIssue(
      issues,
      "permissions.interactive",
      "expected_boolean",
      "permissions.interactive must be a boolean",
    );
  }

  return {
    network: network === "allow" || network === "deny" ? network : "inherit",
    filesystem: filesystem === "read-only" || filesystem === "vault-write"
      ? filesystem
      : "workspace-write",
    interactive: typeof interactive === "boolean" ? interactive : true,
  };
}

function isEnvName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function parseEnv(
  value: unknown,
  issues: ProfileValidationIssue[],
): ProfileEnvEntry[] {
  if (!Array.isArray(value)) {
    addIssue(issues, "env", "expected_array", "env must be an array");
    return [];
  }

  return value.flatMap((item, index) => {
    const path = `env.${index}`;
    if (!isRecord(item)) {
      addIssue(issues, path, "expected_object", `${path} must be an object`);
      return [];
    }

    const name = requireString(item.name, `${path}.name`, issues);
    if (name && !isEnvName(name)) {
      addIssue(
        issues,
        `${path}.name`,
        "invalid_env_name",
        `${path}.name must be a valid environment variable name`,
      );
    }
    if (
      item.kind !== "literal" &&
      item.kind !== "secret-ref" &&
      item.kind !== "workspace-ref"
    ) {
      addIssue(
        issues,
        `${path}.kind`,
        "invalid_value",
        `${path}.kind must be literal, secret-ref, or workspace-ref`,
      );
      return [];
    }

    if (item.kind === "literal") {
      if (typeof item.value !== "string") {
        addIssue(
          issues,
          `${path}.value`,
          "expected_string",
          `${path}.value must be a string`,
        );
        return [];
      }
      return [{ name, kind: "literal", value: item.value }];
    }

    const ref = requireString(item.ref, `${path}.ref`, issues);
    if (item.kind === "secret-ref") {
      return [{ name, kind: "secret-ref", ref }];
    }
    return [{ name, kind: "workspace-ref", ref }];
  });
}

function parseVaultMemoryScope(
  value: unknown,
  issues: ProfileValidationIssue[],
): VaultMemoryScope {
  if (!isRecord(value)) {
    addIssue(
      issues,
      "vaultMemoryScope",
      "expected_object",
      "vaultMemoryScope must be an object",
    );
    return { ...DEFAULT_VAULT_MEMORY_SCOPE };
  }

  if (
    value.mode !== "all" &&
    value.mode !== "workspace" &&
    value.mode !== "paths" &&
    value.mode !== "none"
  ) {
    addIssue(
      issues,
      "vaultMemoryScope.mode",
      "invalid_value",
      "vaultMemoryScope.mode must be all, workspace, paths, or none",
    );
    return { ...DEFAULT_VAULT_MEMORY_SCOPE };
  }

  if (value.mode !== "paths") {
    return { mode: value.mode };
  }

  const paths = requireStringArray(
    value.paths,
    "vaultMemoryScope.paths",
    issues,
  );
  if (paths.length === 0) {
    addIssue(
      issues,
      "vaultMemoryScope.paths",
      "empty_array",
      "vaultMemoryScope.paths must include at least one path",
    );
  }
  return { mode: "paths", paths };
}

function parseCommand(
  value: unknown,
  path: string,
  issues: ProfileValidationIssue[],
): ProfileCommand {
  if (!isRecord(value)) {
    addIssue(issues, path, "expected_object", `${path} must be an object`);
    return { command: "", args: [] };
  }
  const command = requireString(value.command, `${path}.command`, issues);
  const args = requireStringArray(value.args, `${path}.args`, issues);
  const cwd = optionalString(value.cwd, `${path}.cwd`, issues);
  const parsed: ProfileCommand = { command, args };
  if (cwd !== undefined) parsed.cwd = cwd;
  return parsed;
}

function isProfileKind(value: unknown): value is ProfileKind {
  return value === "terminal" || value === "agent" || value === "tool";
}

function isTerminalTarget(value: unknown): value is TerminalTarget {
  if (value === "auto" || value === "powershell" || value === "shell") {
    return true;
  }
  return typeof value === "string" &&
    value.startsWith("wsl:") &&
    value.slice(4).trim().length > 0;
}

function isAgentRuntime(value: unknown): value is AgentRuntime {
  return value === "codex-cli" ||
    value === "claude-cli" ||
    value === "cursor-agent-cli" ||
    value === "custom";
}

function isToolProfileKind(value: unknown): value is ToolProfileKind {
  return value === "mcp-stdio" ||
    value === "mcp-http" ||
    value === "script" ||
    value === "service";
}

function parseBaseProfile(
  record: Record<string, unknown>,
  kind: ProfileKind,
  issues: ProfileValidationIssue[],
): Omit<BaseProfile, "kind"> {
  const id = requireString(record.id, "id", issues);
  const name = requireString(record.name, "name", issues);
  const description = optionalString(record.description, "description", issues);
  const tags = requireStringArray(record.tags, "tags", issues);
  const workspaceScope = requireString(
    record.workspaceScope,
    "workspaceScope",
    issues,
  );
  const permissions = parsePermissions(record.permissions, issues);
  const env = parseEnv(record.env, issues);
  const vaultMemoryScope = parseVaultMemoryScope(
    record.vaultMemoryScope,
    issues,
  );
  const createdAt = requireIsoDate(record.createdAt, "createdAt", issues);
  const updatedAt = requireIsoDate(record.updatedAt, "updatedAt", issues);

  if (id && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) {
    addIssue(
      issues,
      "id",
      "invalid_id",
      "id may contain letters, numbers, dots, underscores, colons, and hyphens",
    );
  }

  const base: Omit<BaseProfile, "kind"> = {
    id,
    name,
    tags,
    workspaceScope,
    permissions,
    env,
    vaultMemoryScope,
    createdAt,
    updatedAt,
  };
  if (description !== undefined) base.description = description;

  if (kind === "terminal" && permissions.interactive === false) {
    addIssue(
      issues,
      "permissions.interactive",
      "invalid_terminal_permission",
      "terminal profiles must be interactive",
    );
  }

  return base;
}

function parseTerminalProfile(
  record: Record<string, unknown>,
  base: Omit<BaseProfile, "kind">,
  issues: ProfileValidationIssue[],
): TerminalProfile {
  if (!isTerminalTarget(record.target)) {
    addIssue(
      issues,
      "target",
      "invalid_value",
      "terminal target must be auto, powershell, shell, or wsl:<distro>",
    );
  }
  const profile: TerminalProfile = {
    ...base,
    kind: "terminal",
    target: isTerminalTarget(record.target) ? record.target : "auto",
  };
  if (record.shell !== undefined) {
    profile.shell = parseCommand(record.shell, "shell", issues);
  }
  const startupInput = optionalString(
    record.startupInput,
    "startupInput",
    issues,
  );
  if (startupInput !== undefined) profile.startupInput = startupInput;
  return profile;
}

function parseAgentProfile(
  record: Record<string, unknown>,
  base: Omit<BaseProfile, "kind">,
  issues: ProfileValidationIssue[],
): AgentProfile {
  if (!isAgentRuntime(record.runtime)) {
    addIssue(
      issues,
      "runtime",
      "invalid_value",
      "agent runtime must be codex-cli, claude-cli, cursor-agent-cli, or custom",
    );
  }
  return {
    ...base,
    kind: "agent",
    runtime: isAgentRuntime(record.runtime) ? record.runtime : "custom",
    command: parseCommand(record.command, "command", issues),
    capabilities: requireStringArray(
      record.capabilities,
      "capabilities",
      issues,
    ),
  };
}

function parseToolProfile(
  record: Record<string, unknown>,
  base: Omit<BaseProfile, "kind">,
  issues: ProfileValidationIssue[],
): ToolProfile {
  if (!isToolProfileKind(record.toolKind)) {
    addIssue(
      issues,
      "toolKind",
      "invalid_value",
      "toolKind must be mcp-stdio, mcp-http, script, or service",
    );
  }

  const toolKind = isToolProfileKind(record.toolKind)
    ? record.toolKind
    : "script";
  const profile: ToolProfile = {
    ...base,
    kind: "tool",
    toolKind,
  };

  if (record.command !== undefined) {
    profile.command = parseCommand(record.command, "command", issues);
  } else if (toolKind !== "mcp-http") {
    addIssue(
      issues,
      "command",
      "expected_object",
      "command is required for non-HTTP tool profiles",
    );
  }

  const endpoint = optionalString(record.endpoint, "endpoint", issues);
  if (endpoint !== undefined) profile.endpoint = endpoint;
  if (toolKind === "mcp-http" && !endpoint) {
    addIssue(
      issues,
      "endpoint",
      "empty_string",
      "endpoint is required for mcp-http tool profiles",
    );
  }

  return profile;
}

export function parseProfile(input: unknown): Profile {
  const issues: ProfileValidationIssue[] = [];
  if (!isRecord(input)) {
    throw new ProfileValidationError([
      {
        path: "",
        code: "expected_object",
        message: "profile must be an object",
      },
    ]);
  }

  if (!isProfileKind(input.kind)) {
    addIssue(
      issues,
      "kind",
      "invalid_value",
      "kind must be terminal, agent, or tool",
    );
  }
  const kind: ProfileKind = isProfileKind(input.kind) ? input.kind : "terminal";
  const base = parseBaseProfile(input, kind, issues);
  const profile = kind === "terminal"
    ? parseTerminalProfile(input, base, issues)
    : kind === "agent"
      ? parseAgentProfile(input, base, issues)
      : parseToolProfile(input, base, issues);

  if (issues.length > 0) {
    throw new ProfileValidationError(issues);
  }
  return profile;
}

export function validateProfile(input: unknown): ProfileValidationResult {
  try {
    return { ok: true, profile: parseProfile(input) };
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return { ok: false, issues: error.issues };
    }
    throw error;
  }
}

function profileIdentityKey(profile: Profile): string {
  return `${profile.workspaceScope.toLowerCase()}\u0000${profile.name.toLowerCase()}`;
}

export function parseProfileRegistry(input: unknown): ProfileRegistry {
  const issues: ProfileValidationIssue[] = [];
  if (!isRecord(input)) {
    throw new ProfileValidationError([
      {
        path: "",
        code: "expected_object",
        message: "profile registry must be an object",
      },
    ], "Invalid profile registry");
  }

  if (input.version !== PROFILE_REGISTRY_VERSION) {
    addIssue(
      issues,
      "version",
      "invalid_value",
      "profile registry version must be 1",
    );
  }
  if (!Array.isArray(input.profiles)) {
    addIssue(
      issues,
      "profiles",
      "expected_array",
      "profiles must be an array",
    );
  }

  const profiles: Profile[] = [];
  if (Array.isArray(input.profiles)) {
    input.profiles.forEach((entry, index) => {
      try {
        profiles.push(parseProfile(entry));
      } catch (error) {
        if (error instanceof ProfileValidationError) {
          for (const issue of error.issues) {
            issues.push({
              ...issue,
              path: issue.path ? `profiles.${index}.${issue.path}` : `profiles.${index}`,
            });
          }
          return;
        }
        throw error;
      }
    });
  }

  const ids = new Map<string, number>();
  const identities = new Map<string, number>();
  profiles.forEach((profile, index) => {
    const idIndex = ids.get(profile.id);
    if (idIndex !== undefined) {
      addIssue(
        issues,
        `profiles.${index}.id`,
        "duplicate_id",
        `profile id duplicates profiles.${idIndex}.id`,
      );
    }
    ids.set(profile.id, index);

    const identity = profileIdentityKey(profile);
    const identityIndex = identities.get(identity);
    if (identityIndex !== undefined) {
      addIssue(
        issues,
        `profiles.${index}.name`,
        "duplicate_name",
        `profile name duplicates profiles.${identityIndex}.name in the same workspace scope`,
      );
    }
    identities.set(identity, index);
  });

  if (issues.length > 0) {
    throw new ProfileValidationError(issues, "Invalid profile registry");
  }

  return {
    version: PROFILE_REGISTRY_VERSION,
    profiles,
  };
}

export function validateProfileRegistry(
  input: unknown,
): ProfileRegistryValidationResult {
  try {
    return { ok: true, registry: parseProfileRegistry(input) };
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return { ok: false, issues: error.issues };
    }
    throw error;
  }
}

export function createEmptyProfileRegistry(): ProfileRegistry {
  return {
    version: PROFILE_REGISTRY_VERSION,
    profiles: [],
  };
}

export function findDeferredEnvRefs(profile: Profile): ProfileEnvEntry[] {
  return profile.env.filter((entry) => entry.kind !== "literal");
}
