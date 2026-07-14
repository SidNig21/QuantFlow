import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const port = 7430;
const baseURL = `http://127.0.0.1:${port}`;
try {
  const existing = await fetch(`${baseURL}/v1/health`, { signal: AbortSignal.timeout(500) });
  if (existing.ok) throw new Error("Stop the existing QuantFlow runtime before running the isolated M3 proof.");
} catch (error) {
  if (error instanceof Error && error.message.startsWith("Stop the existing")) throw error;
}
let childFailure = null;
let stderr = "";
const runtime = spawn(process.execPath, ["host.js"], {
  cwd: directory,
  stdio: ["ignore", "ignore", "pipe"],
});
runtime.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
runtime.once("exit", (code, signal) => { childFailure = `runtime exited (${code ?? signal ?? "unknown"}): ${stderr.slice(-1_000)}`; });

async function waitForReady() {
  const deadline = Date.now() + 120_000;
  let lastError = "runtime did not listen";
  while (Date.now() < deadline) {
    if (childFailure) throw new Error(childFailure);
    try {
      const response = await fetch(`${baseURL}/v1/health`, { signal: AbortSignal.timeout(2_000) });
      const health = await response.json();
      if (health.ok) return health;
      lastError = JSON.stringify(health);
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`M3 runtime did not become ready: ${lastError}`);
}

try {
  const health = await waitForReady();
  assert.equal(health.promptable, false, "this credentialless proof must not claim promptability");

  const probe = await fetch(`${baseURL}/v1/eve/probe-session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "QuantFlow M3 repeatable timing probe." }),
  });
  const probeBody = await probe.json();
  assert.equal(probe.status, 202);
  assert.ok(probeBody.sessionId);
  assert.ok(probeBody.acceptedInMilliseconds < 100, `warm Eve session accepted in ${probeBody.acceptedInMilliseconds}ms`);

  const attached = await fetch(`${baseURL}/v1/agentos/eve-session`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceID: "m3-proof", tileID: "eve-tile-a" }),
  });
  const attachedBody = await attached.json();
  assert.equal(attached.status, 201);
  assert.ok(attachedBody.actorID);
  assert.ok(attachedBody.sessionID);
  assert.equal(attachedBody.promptable, false);

  console.log(JSON.stringify({
    proof: "M3 native runtime passed",
    eveAcceptedInMilliseconds: probeBody.acceptedInMilliseconds,
    actorID: attachedBody.actorID,
    agentSessionID: attachedBody.sessionID,
  }));
} finally {
  runtime.kill("SIGTERM");
}
