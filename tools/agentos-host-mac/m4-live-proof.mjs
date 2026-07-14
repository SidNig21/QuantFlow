import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!(process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_ZEN_API_KEY ?? "").trim()) {
  throw new Error("OPENCODE_GO_API_KEY is required for the M4 live proof");
}

const directory = fileURLToPath(new URL(".", import.meta.url));
const baseURL = "http://127.0.0.1:7430";
try {
  const existing = await fetch(`${baseURL}/v1/health`, { signal: AbortSignal.timeout(500) });
  if (existing.ok) throw new Error("Stop an existing QuantFlow runtime before running the isolated M4 live proof.");
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Stop the existing")) throw error;
}

let childFailure = null;
let stderr = "";
const runtime = spawn(process.execPath, ["host.js"], { cwd: directory, stdio: ["ignore", "ignore", "pipe"] });
runtime.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
runtime.once("exit", (code, signal) => { childFailure = `runtime exited (${code ?? signal ?? "unknown"}): ${stderr.slice(-1_000)}`; });

async function waitForPromptable() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (childFailure) throw new Error(childFailure);
    try {
      const response = await fetch(`${baseURL}/v1/health`, { signal: AbortSignal.timeout(2_000) });
      const health = await response.json();
      if (health.ok && health.promptable) return health;
    } catch { /* sidecar is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("M4 runtime did not become promptable within 120 seconds");
}

try {
  await waitForPromptable();
  const tileID = `eve-m4-${crypto.randomUUID()}`;
  const started = performance.now();
  const attached = await fetch(`${baseURL}/v1/agentos/eve-session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceID: "m4-live-proof", tileID }),
  });
  const session = await attached.json();
  const attachMilliseconds = Math.round((performance.now() - started) * 10) / 10;
  assert.equal(attached.status, 201);
  assert.equal(session.promptable, true);
  assert.ok(attachMilliseconds <= 1_000, `warm attach took ${attachMilliseconds}ms`);

  const prompt = await fetch(`${baseURL}/v1/agentos/eve-session/${encodeURIComponent(session.sessionID)}/prompt`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceID: "m4-live-proof", tileID, text: "Reply with exactly PONG." }),
  });
  const answer = await prompt.json();
  assert.equal(prompt.status, 200);
  assert.equal(answer.text.trim(), "PONG");
  console.log(JSON.stringify({ proof: "M4 live Eve dock runtime passed", attachMilliseconds, response: answer.text.trim() }));
} finally {
  runtime.kill("SIGTERM");
}
