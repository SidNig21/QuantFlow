/**
 * Runs inside one native macOS PTY. It is intentionally small: line input is
 * delivered to the AgentOS-bound Eve session, and output returns to this PTY.
 * The bridge owns no workflow state and stores no transcript.
 */
import readline from "node:readline";

const baseURL = String(process.env.QUANTFLOW_RUNTIME_URL ?? "").trim();
const workspaceID = String(process.env.QUANTFLOW_TERMINAL_WORKSPACE_ID ?? "").trim();
const tileID = String(process.env.QUANTFLOW_TERMINAL_TILE_ID ?? "").trim();
const sessionID = String(process.env.QUANTFLOW_TERMINAL_SESSION_ID ?? "").trim();

if (!baseURL || !workspaceID || !tileID || !sessionID) {
  process.stderr.write("QuantFlow terminal bridge is missing its tile session identity.\n");
  process.exit(1);
}

const prompt = "qf:eve> ";
const lineReader = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

function writeBanner() {
  process.stdout.write("QuantFlow Eve terminal\r\n");
  process.stdout.write("AgentOS session attached · :help for terminal controls\r\n\r\n");
}

async function sendTurn(text) {
  const response = await fetch(`${baseURL}/v1/agentos/eve-session/${encodeURIComponent(sessionID)}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceID, tileID, text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.error ?? `runtime HTTP ${response.status}`));
  return String(payload.text ?? "");
}

writeBanner();
lineReader.setPrompt(prompt);
lineReader.prompt();
lineReader.on("line", async (line) => {
  const text = line.trim();
  if (!text) return lineReader.prompt();
  if (text === ":help") {
    process.stdout.write("Type a request and Enter to send it to Eve through AgentOS. :quit closes this tile.\r\n");
    return lineReader.prompt();
  }
  if (text === ":quit" || text === ":exit") {
    lineReader.close();
    return;
  }
  try {
    process.stdout.write("\r\n");
    const reply = await sendTurn(text);
    process.stdout.write(`${reply}\r\n`);
  } catch (error) {
    process.stdout.write(`[runtime] ${error instanceof Error ? error.message : String(error)}\r\n`);
  }
  lineReader.prompt();
});
lineReader.on("close", () => process.exit(0));
