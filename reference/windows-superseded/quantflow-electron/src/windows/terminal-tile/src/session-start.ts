export interface TerminalTileLaunchParams {
  existingSessionId?: string;
  isRestored: boolean;
  isPending: boolean;
  cwd?: string;
  target?: string;
  tileId?: string;
}

/**
 * AgentOS actors are fresh runs, not restart-resumed terminals. Reconnecting a
 * stale actor after QuantFlow exits silently creates a replacement run and can
 * leave the restore path churning. Leave the old tile visibly ended instead;
 * the operator starts a new actor from the Dock when they want one.
 */
export function shouldEndRestoredAgentOsRun(params: TerminalTileLaunchParams): boolean {
  return params.isRestored
    && Boolean(params.existingSessionId)
    && params.target?.startsWith("agentos:") === true;
}

export function parseTerminalTileLaunchParams(
  search: string,
): TerminalTileLaunchParams {
  const params = new URLSearchParams(search);
  return {
    existingSessionId: params.get("sessionId") || undefined,
    isRestored: params.get("restored") === "1",
    isPending: params.get("pending") === "1",
    cwd: params.get("cwd") || undefined,
    target: params.get("target") || undefined,
    tileId: params.get("tileId") || undefined,
  };
}
