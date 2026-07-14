import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!(process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_ZEN_API_KEY ?? "").trim()) {
  throw new Error("OPENCODE_GO_API_KEY is required for the M5 live proof");
}

const directory = fileURLToPath(new URL(".", import.meta.url));
const baseURL = "http://127.0.0.1:7430";
try {
  const existing = await fetch(`${baseURL}/v1/health`, { signal: AbortSignal.timeout(500) });
  if (existing.ok) throw new Error("Stop an existing QuantFlow runtime before running the isolated M5 live proof.");
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Stop the existing")) throw error;
}

let childFailure = null;
let stderr = "";
const runtime = spawn(process.execPath, ["host.js"], { cwd: directory, stdio: ["ignore", "ignore", "pipe"] });
runtime.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
runtime.once("exit", (code, signal) => { childFailure = `runtime exited (${code ?? signal ?? "unknown"}): ${stderr.slice(-1_000)}`; });

async function fetchJSON(path, body) {
  const response = await fetch(`${baseURL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  assert.ok(response.ok, `${path} failed: ${JSON.stringify(payload)}`);
  return payload;
}

async function waitForPromptable() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (childFailure) throw new Error(childFailure);
    try {
      const response = await fetch(`${baseURL}/v1/health`, { signal: AbortSignal.timeout(2_000) });
      const health = await response.json();
      if (health.ok && health.promptable) return;
    } catch { /* sidecar is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("M5 runtime did not become promptable within 120 seconds");
}

try {
  await waitForPromptable();
  const workspaceID = "m5-live-proof";
  const tileAID = `eve-a-${crypto.randomUUID()}`;
  const tileBID = `eve-b-${crypto.randomUUID()}`;
  const [a, b] = await Promise.all([
    fetchJSON("/v1/agentos/eve-session", { workspaceID, tileID: tileAID }),
    fetchJSON("/v1/agentos/eve-session", { workspaceID, tileID: tileBID }),
  ]);
  const endpoint = (tileID, sessionID) => ({ workspaceID, tileID, sessionID });
  const aToB = await fetchJSON("/v1/cables/exchange", {
    from: endpoint(tileAID, a.sessionID), to: endpoint(tileBID, b.sessionID), text: "Reply with exactly B_ACK.",
  });
  const bToA = await fetchJSON("/v1/cables/exchange", {
    from: endpoint(tileBID, b.sessionID), to: endpoint(tileAID, a.sessionID), text: "Reply with exactly A_ACK.",
  });
  const marker = (value) => String(value ?? "").trim().replaceAll("**", "");
  assert.equal(marker(aToB.text), "B_ACK");
  assert.equal(marker(bToA.text), "A_ACK");
  console.log(JSON.stringify({ proof: "M5 session-scoped two-Eve cable passed", aToB: marker(aToB.text), bToA: marker(bToA.text) }));
} finally {
  runtime.kill("SIGTERM");
}
