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
