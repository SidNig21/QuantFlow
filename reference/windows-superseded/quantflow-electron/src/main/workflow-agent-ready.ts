import { setTimeout as delay } from "node:timers/promises";

/** Max wait while polling pane scrollback for an interactive agent prompt. */
export const WORKFLOW_AGENT_PROMPT_TIMEOUT_MS = 120000;
/** Poll interval while waiting for the agent prompt. */
export const WORKFLOW_AGENT_PROMPT_POLL_MS = 400;
/** Brief settle after the prompt appears before sending text. */
export const WORKFLOW_PROMPT_SETTLE_MS = 300;

export type WorkflowPaneRpc = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

export function extractPaneReadText(readResult: unknown): string {
  if (!readResult || typeof readResult !== "object") {
    return typeof readResult === "string" ? readResult : "";
  }
  const record = readResult as Record<string, unknown>;
  const read = record.read;
  if (read && typeof read === "object") {
    const nested = read as Record<string, unknown>;
    if (typeof nested.text === "string") return nested.text;
  }
  if (typeof record.text === "string") return record.text;
  return "";
}

export function isHermesPromptReady(paneText: string): boolean {
  return paneText.includes("Welcome to Hermes Agent")
    || paneText.includes("Type your message or /help")
    || paneText.includes("❯");
}

export function isAgentPromptReady(paneText: string, command = "hermes"): boolean {
  const trimmed = command.trim().toLowerCase();
  const cmdToken = trimmed.split(/\s+/)[0] ?? "hermes";
  if (cmdToken === "hermes") return isHermesPromptReady(paneText);
  return paneText.toLowerCase().includes(cmdToken) && paneText.length > 160;
}

/**
 * Poll herdr pane.read until the agent shows an interactive prompt (no fixed
 * boot delay). Hermes prints "Welcome to Hermes Agent" before the ❯ prompt.
 */
export async function waitForWorkflowAgentPrompt(
  rpc: WorkflowPaneRpc,
  paneId: string,
  command = "hermes",
  options: {
    timeoutMs?: number;
    pollMs?: number;
    settleMs?: number;
  } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? WORKFLOW_AGENT_PROMPT_TIMEOUT_MS;
  const pollMs = options.pollMs ?? WORKFLOW_AGENT_PROMPT_POLL_MS;
  const settleMs = options.settleMs ?? WORKFLOW_PROMPT_SETTLE_MS;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const readResult = await rpc("pane.read", {
        pane_id: paneId,
        source: "visible",
        lines: 50,
        raw: false,
      });
      const text = extractPaneReadText(readResult);
      if (text && isAgentPromptReady(text, command)) {
        if (settleMs > 0) await delay(settleMs);
        return;
      }
    } catch {
      // pane.read may fail while the PTY is still attaching
    }
    await delay(pollMs);
  }

  throw new Error(
    `Agent prompt not ready in pane ${paneId} after ${timeoutMs}ms (${command})`,
  );
}
