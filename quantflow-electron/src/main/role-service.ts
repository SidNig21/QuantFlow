import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { QUANTFLOW_DIR } from "./paths";

let rolesDir = join(QUANTFLOW_DIR, "roles");

export function _setRolesDir(dir: string): void {
  rolesDir = dir;
}

export type RoleRuntimeTarget = "herdr-wsl" | "windows-pty";

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  commandTemplate?: string;
  commandAvailable?: boolean;
  cwdPolicy?: "workspace" | "home" | "inherit";
  defaultShell?: "auto" | "powershell" | "wsl" | "shell";
  runtimeTarget?: RoleRuntimeTarget;
  startupPrompt?: string;
  systemPrompt?: string;
  statusParser?: RoleStatusParser;
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
  {
    id: "hermes",
    name: "Hermes",
    description: "Sync · gossip rooms",
    color: "#06b6d4",
    icon: "send",
    commandTemplate: "hermes",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    systemPrompt: "Act as Hermes, the run orchestrator for this QuantFlow canvas.",
  },
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
    id: "codex",
    name: "Codex CLI",
    description: "Local Codex agent",
    color: "#38bdf8",
    icon: "bot",
    commandTemplate: "codex",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    startupPrompt: "Review the current task context and wait for instructions.",
    statusParser: {
      waiting: ["approval required", "continue?", "waiting for", "confirm"],
      blocked: ["error:", "failed:", "panic", "traceback"],
    },
  },
  {
    id: "claude-worker",
    name: "Claude Code",
    description: "Implementation agent",
    color: "#f97316",
    icon: "hammer",
    commandTemplate: "claude",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    startupPrompt: "Act as the implementation worker for this workspace.",
    statusParser: {
      waiting: ["do you want", "proceed?", "continue?", "yes/no"],
      blocked: ["error:", "failed:", "exception", "traceback"],
    },
  },
  {
    id: "claude-reviewer",
    name: "Claude Reviewer",
    description: "Claude Code review and risk-check agent",
    color: "#22c55e",
    icon: "search-check",
    commandTemplate: "claude",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    runtimeTarget: "herdr-wsl",
    startupPrompt: "Act as the reviewer. Focus on defects, risks, and missing tests.",
    statusParser: {
      waiting: ["do you want", "proceed?", "continue?", "yes/no"],
      blocked: ["error:", "failed:", "exception", "traceback"],
    },
  },
  {
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

function commandExists(command: string): boolean {
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
  const roles = await listRoles();
  return roles.find((r) => r.id === id) ?? null;
}
