/**
 * Native-TUI agent adapter — one integration mode for canvas chat agents.
 * Server-classified tiles (Eve dev servers) are not chat targets over PTY.
 */

export type AgentIntegrationMode = "native-tui" | "server";

export type AgentSubmitMode = "enter" | "paste-enter";

export interface AgentAdapter {
  integrationMode: AgentIntegrationMode;
  /** CLI to run for native-tui agents (e.g. "claude", "codex"). */
  launch?: string;
  /** Fold startup prompt into launch command — eliminates startup race. */
  promptArg?: (prompt: string) => string;
  readySignal?: RegExp;
  settleMs?: number;
  maxWaitMs?: number;
  submit?: AgentSubmitMode;
}

export const DEFAULT_AGENT_SETTLE_MS = 800;
export const DEFAULT_AGENT_MAX_WAIT_MS = 20_000;

export const CLAUDE_NATIVE_TUI_ADAPTER: AgentAdapter = {
  integrationMode: "native-tui",
  launch: "claude",
  promptArg: (prompt) => `claude ${JSON.stringify(prompt)}`,
  submit: "paste-enter",
  settleMs: DEFAULT_AGENT_SETTLE_MS,
  maxWaitMs: DEFAULT_AGENT_MAX_WAIT_MS,
};

export const CODEX_NATIVE_TUI_ADAPTER: AgentAdapter = {
  integrationMode: "native-tui",
  launch: "codex",
  submit: "paste-enter",
  settleMs: DEFAULT_AGENT_SETTLE_MS,
  maxWaitMs: DEFAULT_AGENT_MAX_WAIT_MS,
};

export const SERVER_AGENT_ADAPTER: AgentAdapter = {
  integrationMode: "server",
};

// Role→adapter resolution lives in dock-actors.ts (`getAgentAdapterForRole`),
// sourced from each actor's own `agentAdapter` field — the single source of
// truth. The previous hardcoded ADAPTER_BY_ROLE_ID map here was a second copy
// that could silently drift from the roster, so it was deleted.

export function isNativeTuiAdapter(
  adapter: AgentAdapter | null | undefined,
): adapter is AgentAdapter & { integrationMode: "native-tui"; launch: string } {
  return adapter?.integrationMode === "native-tui"
    && Boolean(adapter.launch?.trim());
}

export function isServerClassifiedAdapter(
  adapter: AgentAdapter | null | undefined,
): boolean {
  return adapter?.integrationMode === "server";
}

export function resolveRoleLaunchFields(
  adapter: AgentAdapter | null | undefined,
  startupPrompt?: string,
  commandTemplate?: string,
): { commandTemplate?: string; startupPrompt?: string } {
  if (isServerClassifiedAdapter(adapter)) {
    return {
      commandTemplate,
      startupPrompt: undefined,
    };
  }
  if (!isNativeTuiAdapter(adapter)) {
    return { commandTemplate, startupPrompt };
  }
  const launch = adapter.launch.trim();
  const prompt = startupPrompt?.trim();
  if (prompt && adapter.promptArg) {
    return {
      commandTemplate: adapter.promptArg(prompt),
      startupPrompt: undefined,
    };
  }
  return {
    commandTemplate: commandTemplate?.trim() || launch,
    startupPrompt: prompt || undefined,
  };
}
