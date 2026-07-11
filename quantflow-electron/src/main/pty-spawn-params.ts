import type { ResolvedTerminalTarget } from "./terminal-target";

export interface SidecarSessionCreateParams {
  command: string;
  args: string[];
  shell: string;
  displayName: string;
  target: string;
  cwd: string;
  cwdHostPath: string;
  cwdGuestPath?: string;
  cols: number;
  rows: number;
  env: Record<string, string>;
}

const HERDR_DISPLAY_TARGET_PREFIX = "herdr-wsl:";
const AGENTOS_DISPLAY_TARGET_PREFIX = "agentos:";
const AGENTOS_DISPLAY_TARGET_V2_PREFIX = "agentos:v2:";

export interface AgentOsAttachTarget {
  tileId: string;
  workspaceId?: string;
}

export function buildAgentOsDisplayTarget(
  tileId: string,
  workspaceId?: string,
): string {
  const normalizedWorkspaceId = workspaceId?.trim();
  if (normalizedWorkspaceId) {
    return `${AGENTOS_DISPLAY_TARGET_V2_PREFIX}${encodeURIComponent(normalizedWorkspaceId)}:${encodeURIComponent(tileId)}`;
  }
  return `${AGENTOS_DISPLAY_TARGET_PREFIX}${encodeURIComponent(tileId)}`;
}

export function parseAgentOsAttachTarget(
  target: unknown,
): AgentOsAttachTarget | null {
  if (typeof target !== "string") return null;
  if (!target.startsWith(AGENTOS_DISPLAY_TARGET_PREFIX)) return null;

  if (target.startsWith(AGENTOS_DISPLAY_TARGET_V2_PREFIX)) {
    const encoded = target.slice(AGENTOS_DISPLAY_TARGET_V2_PREFIX.length);
    const separator = encoded.indexOf(":");
    if (separator <= 0 || separator === encoded.length - 1) return null;
    if (encoded.indexOf(":", separator + 1) !== -1) return null;
    try {
      const workspaceId = decodeURIComponent(encoded.slice(0, separator)).trim();
      const tileId = decodeURIComponent(encoded.slice(separator + 1)).trim();
      return workspaceId && tileId ? { workspaceId, tileId } : null;
    } catch {
      return null;
    }
  }

  const encoded = target.slice(AGENTOS_DISPLAY_TARGET_PREFIX.length);
  if (!encoded) return null;
  try {
    const tileId = decodeURIComponent(encoded).trim();
    return tileId ? { tileId } : null;
  } catch {
    return null;
  }
}

export function buildHerdrDisplayTarget(terminalId: string): string {
  return `${HERDR_DISPLAY_TARGET_PREFIX}${encodeURIComponent(terminalId)}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function parseHerdrAttachTarget(
  target: unknown,
): { terminalId: string } | null {
  if (typeof target !== "string") return null;
  if (!target.startsWith(HERDR_DISPLAY_TARGET_PREFIX)) return null;
  const encoded = target.slice(HERDR_DISPLAY_TARGET_PREFIX.length);
  if (!encoded) return null;
  try {
    const terminalId = decodeURIComponent(encoded).trim();
    return terminalId ? { terminalId } : null;
  } catch {
    return null;
  }
}

function withOptionalFields<T extends object>(
  base: T,
  fields: Record<string, unknown>,
): T {
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      Object.assign(base, { [key]: value });
    }
  }
  return base;
}

export function buildSidecarSessionCreateParams(
  resolvedTarget: ResolvedTerminalTarget,
  cols: number,
  rows: number,
  env: Record<string, string>,
): SidecarSessionCreateParams {
  return withOptionalFields({
    command: resolvedTarget.command,
    args: resolvedTarget.args,
    shell: resolvedTarget.command,
    displayName: resolvedTarget.displayName,
    target: resolvedTarget.target,
    cwd: resolvedTarget.cwd,
    cwdHostPath: resolvedTarget.cwdHostPath,
    cols,
    rows,
    env,
  }, {
    cwdGuestPath: resolvedTarget.cwdGuestPath,
  });
}

export function buildHerdrAttachSessionCreateParams(
  terminalId: string,
  cwd: string,
  cols: number,
  rows: number,
  env: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): SidecarSessionCreateParams {
  const isWindows = platform === "win32";
  const attachCommand = [
    "exec",
    "herdr",
    "terminal",
    "attach",
    shellQuote(terminalId),
  ].join(" ");
  return {
    command: isWindows ? "wsl.exe" : "bash",
    args: isWindows
      ? ["-e", "bash", "-lc", attachCommand]
      : ["-lc", attachCommand],
    shell: isWindows ? "wsl.exe" : "bash",
    displayName: "herdr terminal attach",
    target: buildHerdrDisplayTarget(terminalId),
    cwd,
    cwdHostPath: cwd,
    cols,
    rows,
    env,
  };
}
