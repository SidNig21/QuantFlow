import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "./paths";
import { buildDockRoles } from "./dock-actors";

let rolesDir = join(QUANTFLOW_DIR, "roles");

export function _setRolesDir(dir: string): void {
  rolesDir = dir;
}

export type RoleRuntimeTarget = "herdr-wsl" | "windows-pty" | "agentos";

export type AgentOsSoftware = "pi" | "opencode" | "claude-code" | "codex";

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  commandTemplate?: string;
  commandAvailable?: boolean;
  /** Absolute working directory for the spawn (e.g. an Eve package folder). */
  cwd?: string;
  cwdPolicy?: "workspace" | "home" | "inherit";
  defaultShell?: "auto" | "powershell" | "wsl" | "shell";
  runtimeTarget?: RoleRuntimeTarget;
  /** AgentOS software when runtimeTarget is agentos (V2 legend transport). */
  agentosSoftware?: AgentOsSoftware;
  /** Optional boot instruction for AgentOS terminal actors. */
  agentosInstruction?: string;
  /** V3 fallback when AgentOS transport is unavailable. */
  legacyRuntimeTarget?: RoleRuntimeTarget;
  startupPrompt?: string;
  systemPrompt?: string;
  statusParser?: RoleStatusParser;
  /** Envoy profile for lifecycle messages in the canvas space. */
  envoyProfile?: string;
  /** When true, legend commandTemplate runs through envoy-run.sh (one-shot workers). */
  envoyWrapCommand?: boolean;
  /** R8 legend registry — config only, not Kernel truth. */
  showInLegend?: boolean;
  legendType?: string;
  harnessKind?: "eve-harness" | "local-shell" | "herdr-shell" | "agentos";
  endpoint?: string;
  modelHint?: string;
}

export function requiresHerdrSpawn(
  role: Pick<Role, "runtimeTarget"> | null | undefined,
): boolean {
  return role?.runtimeTarget === "herdr-wsl";
}

export interface RoleStatusParser {
  waiting?: string[];
  blocked?: string[];
}

const BUILT_IN_ROLES: Role[] = [
  ...buildDockRoles(),
  {
    id: "shell",
    name: "Shell",
    description: "General-purpose terminal for project commands",
    color: "#64748b",
    icon: "terminal",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "windows-pty",
  },
  {
    id: "claude-reviewer",
    name: "Claude Reviewer",
    description: "Review and risk-check agent (AgentOS claude-code)",
    color: "#22c55e",
    icon: "search-check",
    commandTemplate: "claude",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    harnessKind: "herdr-shell",
    agentosSoftware: "claude-code",
    legacyRuntimeTarget: "agentos",
    startupPrompt: "Act as the reviewer. Focus on defects, risks, and missing tests.",
    statusParser: {
      waiting: ["do you want", "proceed?", "continue?", "yes/no"],
      blocked: ["error:", "failed:", "exception", "traceback"],
    },
    envoyProfile: "claude-reviewer",
    envoyWrapCommand: false,
  },
  {
    // TODO(S3): stays on herdr-wsl — the @agentos-software/opencode ACP
    // adapter hardcodes an Anthropic catalog and ignores provider config
    // (verified 2026-07-03); host rejects "opencode" sessions explicitly.
    // Re-evaluate when upstream fixes provider routing.
    id: "opencode",
    name: "OpenCode",
    description: "OpenCode agent terminal",
    color: "#a855f7",
    icon: "blocks",
    commandTemplate: "opencode",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    startupPrompt: "Open this workspace and wait for orchestration instructions.",
    statusParser: {
      waiting: ["approval required", "confirm", "continue?"],
      blocked: ["error:", "failed:", "panic"],
    },
    envoyProfile: "opencode-agent",
    envoyWrapCommand: false,
  },
  {
    id: "coder",
    name: "Coder",
    description: "Writes and debugs code",
    color: "#6366f1",
  },
  {
    id: "python",
    name: "Python script",
    description: "One-shot script",
    color: "#6366f1",
    icon: "code",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    startupPrompt: "Open a Python worker shell and wait for a script command.",
    envoyProfile: "python-script",
    envoyWrapCommand: true,
  },
  {
    id: "puffer",
    name: "PufferLib worker",
    description: "RL training · dumb",
    color: "#f59e0b",
    icon: "zap",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    startupPrompt: "Open a PufferLib worker shell. Do not start training until Commence.",
    envoyProfile: "puffer-script",
    envoyWrapCommand: true,
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description: "Reviews code and gives feedback",
    color: "#10b981",
  },
  {
    id: "planner",
    name: "Planner",
    description: "Plans tasks and breaks down work",
    color: "#f59e0b",
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Researches topics and synthesizes information",
    color: "#8b5cf6",
  },
  {
    id: "writer",
    name: "Writer",
    description: "Writes documentation and content",
    color: "#ec4899",
  },
];

export function getRoleCommandName(role: Pick<Role, "commandTemplate">): string | null {
  const template = role.commandTemplate?.trim();
  if (!template) return null;
  const match = template.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function commandExistsInWsl(command: string): boolean {
  if (process.platform !== "win32") return false;
  try {
    execFileSync(
      "wsl.exe",
      ["-e", "bash", "-i", "-c", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`],
      {
        stdio: "ignore",
        timeout: 10000,
        windowsHide: true,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export function commandExists(command: string): boolean {
  try {
    execFileSync(
      process.platform === "win32" ? "where.exe" : "which",
      [command],
      {
        encoding: "utf8",
        stdio: "ignore",
        timeout: 5000,
        windowsHide: true,
      },
    );
    return true;
  } catch {
    return commandExistsInWsl(command);
  }
}

export function withRoleDiagnostics(role: Role): Role {
  const command = getRoleCommandName(role);
  if (!command) return role;
  return {
    ...role,
    commandAvailable: commandExists(command),
  };
}

export async function listRoles(): Promise<Role[]> {
  try {
    await mkdir(rolesDir, { recursive: true });
    const files = await readdir(rolesDir);
    const roleMap = new Map<string, Role>(
      BUILT_IN_ROLES.map((r) => [r.id, r]),
    );
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(rolesDir, file), "utf-8");
        const parsed: Role = JSON.parse(raw);
        if (parsed.id && parsed.name && parsed.color) {
          roleMap.set(parsed.id, parsed);
        }
      } catch { /* skip invalid */ }
    }
    return [...roleMap.values()].map(withRoleDiagnostics);
  } catch {
    return [...BUILT_IN_ROLES].map(withRoleDiagnostics);
  }
}

export async function getRole(id: string): Promise<Role | null> {
  const resolvedId = id === "claude-worker" ? "claude" : id;
  const roles = await listRoles();
  const role = roles.find((r) => r.id === resolvedId) ?? null;
  if (role && id === "claude-worker" && resolvedId === "claude") {
    return { ...role, id: "claude-worker", envoyProfile: "claude-worker" };
  }
  return role;
}
