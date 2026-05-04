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
