export interface TerminalTileLaunchParams {
  existingSessionId?: string;
  isRestored: boolean;
  cwd?: string;
  target?: string;
  tileId?: string;
}

export function parseTerminalTileLaunchParams(
  search: string,
): TerminalTileLaunchParams {
  const params = new URLSearchParams(search);
  return {
    existingSessionId: params.get("sessionId") || undefined,
    isRestored: params.get("restored") === "1",
    cwd: params.get("cwd") || undefined,
    target: params.get("target") || undefined,
    tileId: params.get("tileId") || undefined,
  };
}
