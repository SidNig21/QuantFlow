import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { getTerminalTarget } from "./config";
import { resolveTerminalTarget } from "./terminal-target";
import { listRoles, getRoleCommandName, type Role } from "./role-service";

export interface RuntimeDiagnostic {
  id: string;
  severity: "warn" | "error";
  title: string;
  message: string;
  actionLabel: string;
  action: "copy" | "settings";
  fixCommand?: string;
}

export function commandExists(command: string): boolean {
  if (!command) return false;
  if (isAbsolute(command)) return existsSync(command);
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
    return false;
  }
}

export function buildRuntimeDiagnostics({
  bunAvailable,
  shellCommand,
  shellAvailable,
  roles,
}: {
  bunAvailable: boolean;
  shellCommand: string;
  shellAvailable: boolean;
  roles: Role[];
}): RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];

  if (!bunAvailable) {
    diagnostics.push({
      id: "missing-bun",
      severity: "warn",
      title: "Bun is not on PATH",
      message: "Some development and role launch flows expect bun to be available from this shell.",
      action: "copy",
      actionLabel: "Copy install command",
      fixCommand: "powershell -c \"irm bun.sh/install.ps1 | iex\"",
    });
  }

  if (!shellAvailable) {
    diagnostics.push({
      id: "missing-shell",
      severity: "error",
      title: "Default shell is not launchable",
      message: `QuantFlow resolved the default terminal command to "${shellCommand}", but it was not found.`,
      action: "settings",
      actionLabel: "Open settings",
    });
  }

  for (const role of roles) {
    const command = getRoleCommandName(role);
    if (!command || role.commandAvailable !== false) continue;
    diagnostics.push({
      id: `missing-role-command:${role.id}`,
      severity: "warn",
      title: `${role.name} command is missing`,
      message: `The role command "${command}" is not available on PATH.`,
      action: "copy",
      actionLabel: "Copy check command",
      fixCommand: process.platform === "win32"
        ? `where.exe ${command}`
        : `which ${command}`,
    });
  }

  return diagnostics;
}

export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostic[]> {
  const resolved = resolveTerminalTarget(getTerminalTarget());
  const roles = await listRoles();
  return buildRuntimeDiagnostics({
    bunAvailable: commandExists("bun"),
    shellCommand: resolved.command,
    shellAvailable: commandExists(resolved.command),
    roles,
  });
}
