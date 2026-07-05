/**
 * Local echo + line editing for AgentOS ACP prompt-mode actors (pi, claude-code, opencode).
 */
export interface AcpPromptLineEditor {
  handleInput(data: string): void;
}

export function createAcpPromptLineEditor(input: {
  onEcho: (text: string) => void;
  onSubmit: (line: string) => void | Promise<void>;
  onSubmitError?: () => void;
}): AcpPromptLineEditor {
  let buffer = "";

  return {
    handleInput(data: string) {
      for (const char of data) {
        if (char === "\r" || char === "\n") {
          const line = buffer.trim();
          buffer = "";
          input.onEcho("\r\n");
          if (line) {
            void Promise.resolve(input.onSubmit(line)).catch(() => {
              input.onSubmitError?.();
            });
          } else {
            input.onEcho("> ");
          }
          continue;
        }
        if (char === "\x7f" || char === "\b") {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            input.onEcho("\b \b");
          }
          continue;
        }
        if (char === "\x03") {
          buffer = "";
          input.onEcho("^C\r\n> ");
          continue;
        }
        if (char.charCodeAt(0) < 32 && char !== "\t") continue;
        buffer += char;
        input.onEcho(char);
      }
    },
  };
}

export function isAcpPromptSoftware(software: string): boolean {
  return software === "claude-code"
    || software === "claude"
    || software === "pi"
    || software === "opencode";
}

export function bootstrapAcpTerminalText(actorName: string): string {
  const label = actorName.trim() || "Agent";
  return `\r\n${label} ready — type a message and press Enter.\r\n> `;
}
