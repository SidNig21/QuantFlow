/**
 * QuantFlow's native macOS runtime boundary.
 *
 * This is deliberately not a port of the Windows compatibility host. It owns
 * only process readiness, a single local Eve server, and the AgentOS actor
 * address used by the Eve dock. Kernel state remains in Swift SQLite.
 */
import http from "node:http";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { agentOS, defineSoftware, setup } from "@rivet-dev/agentos";
import { createClient } from "@rivet-dev/agentos/client";

const moduleDirectory = fileURLToPath(new URL(".", import.meta.url));

export function runtimeConfig(env = process.env) {
  const port = Number.parseInt(env.QUANTFLOW_RUNTIME_PORT ?? "7430", 10);
  const evePort = Number.parseInt(env.QUANTFLOW_EVE_PORT ?? "7435", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("QUANTFLOW_RUNTIME_PORT must be a TCP port");
  if (!Number.isInteger(evePort) || evePort < 1 || evePort > 65535 || evePort === port) throw new Error("QUANTFLOW_EVE_PORT must be a distinct TCP port");
  const eveRoot = (env.QUANTFLOW_EVE_ROOT ?? fileURLToPath(new URL("../../../quantflow-eve", import.meta.url))).trim();
  return {
    bind: "127.0.0.1",
    port,
    evePort,
    actorPort: Number.parseInt(env.QUANTFLOW_RIVET_ACTOR_PORT ?? String(port + 1), 10),
    enginePort: Number.parseInt(env.QUANTFLOW_RIVET_ENGINE_PORT ?? String(port + 2), 10),
    eveRoot,
    eveCliPath: `${eveRoot}/node_modules/eve/bin/eve.js`,
    // `agentos-toolchain pack` emits both a plain inspection tarball and the
    // executable AgentOS package. Native AgentOS accepts the latter only.
    evePackagePath: `${eveRoot}/agentos/dist/package.aospkg`,
    eveBaseURL: `http://127.0.0.1:${evePort}`,
  };
}

function credentialConfigured(env = process.env) {
  return Boolean(String(env.OPENCODE_GO_API_KEY ?? env.OPENCODE_API_KEY ?? env.OPENCODE_ZEN_API_KEY ?? "").trim());
}

function sendJSON(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJSON(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const source = Buffer.concat(chunks).toString("utf8").trim();
  if (!source) return {};
  try { return JSON.parse(source); } catch { throw new Error("Request body must be JSON"); }
}

async function waitFor(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not listening";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

class EveServer {
  constructor(config) { this.config = config; this.process = null; this.state = "stopped"; this.error = null; }

  async start() {
    if (this.state === "ready") return;
    this.state = "starting"; this.error = null;
    await Promise.all([access(this.config.eveCliPath), access(`${this.config.eveRoot}/.output/server/index.mjs`)]);
    this.process = spawn(process.execPath, [this.config.eveCliPath, "start", "--host", "127.0.0.1", "--port", String(this.config.evePort)], {
      cwd: this.config.eveRoot,
      env: { ...process.env, PORT: String(this.config.evePort) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.process.once("error", (error) => { this.state = "failed"; this.error = error.message; });
    this.process.once("exit", (code, signal) => {
      if (this.state !== "stopped") { this.state = "failed"; this.error = `Eve exited (${code ?? signal ?? "unknown"})`; }
    });
    try {
      await waitFor(`${this.config.eveBaseURL}/eve/v1/health`);
      this.state = "ready";
    } catch (error) {
      this.state = "failed"; this.error = error instanceof Error ? error.message : String(error);
      this.process.kill();
      throw error;
    }
  }

  stop() { this.state = "stopped"; this.process?.kill("SIGTERM"); this.process = null; }
}

class AgentOSRuntime {
  constructor(config) { this.config = config; this.state = "stopped"; this.error = null; this.registry = null; this.client = null; }

  async start() {
    if (this.state === "ready") return;
    this.state = "starting"; this.error = null;
    try {
      await access(this.config.evePackagePath);
      const eveSoftware = defineSoftware({ packagePath: this.config.evePackagePath });
      const actor = agentOS({
        // Eve's ACP adapter is the sole software in this actor. Disabling the
        // default shell bundle avoids resolving unrelated packaged command
        // software at attach time; M3 has no terminal rail.
        defaultSoftware: false,
        software: [eveSoftware],
        loopbackExemptPorts: [this.config.evePort],
        permissions: { fs: "allow", network: "allow", childProcess: "allow", process: "allow", env: "allow", binding: "allow" },
      });
      this.registry = setup({
        use: { agentos: actor }, runtime: "native", startEngine: true,
        engineHost: "127.0.0.1", enginePort: this.config.enginePort,
        httpHost: "127.0.0.1", httpPort: this.config.actorPort,
        noWelcome: true, logging: { level: "warn" }, shutdown: { disableSignalHandlers: true },
      });
      this.client = createClient({ endpoint: `http://127.0.0.1:${this.config.enginePort}`, namespace: "default", poolName: "default", encoding: "bare", disableMetadataLookup: true });
      this.registry.start();
      await waitForEnvoy(this.config.enginePort);
      this.state = "ready";
    } catch (error) {
      this.state = "failed"; this.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async createEveActorSession({ workspaceID, tileID }) {
    if (this.state !== "ready") throw new Error(this.error ?? "AgentOS runtime is not ready");
    const handle = await this.client.agentos.getOrCreate([workspaceID, tileID]);
    const actorID = await handle.resolve();
    const opencodeKey = String(process.env.OPENCODE_GO_API_KEY ?? process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_ZEN_API_KEY ?? "").trim();
    const sessionID = await handle.createSession("eve", {
      env: { EVE_BASE_URL: this.config.eveBaseURL, ...(opencodeKey ? { OPENCODE_GO_API_KEY: opencodeKey } : {}) },
      additionalInstructions: `You are the Eve worker for QuantFlow tile ${tileID}. Kernel state is owned by the native Mac app.`,
    });
    return { actorID, sessionID };
  }

  async promptEveActorSession({ workspaceID, tileID, sessionID, text }) {
    if (this.state !== "ready") throw new Error(this.error ?? "AgentOS runtime is not ready");
    if (!credentialConfigured()) throw new Error("OPENCODE_GO_API_KEY is required before Eve can accept a prompt");
    const handle = await this.client.agentos.getOrCreate([workspaceID, tileID]);
    const result = await handle.sendPrompt(sessionID, text);
    const textResult = typeof result?.text === "string" ? result.text : JSON.stringify(result);
    return { text: textResult, result };
  }
}

async function waitForEnvoy(enginePort, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no envoy registered";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${enginePort}/envoys?namespace=default`, { signal: AbortSignal.timeout(2_000) });
      const body = response.ok ? await response.json() : null;
      if (Array.isArray(body?.envoys) && body.envoys.length > 0) return;
      lastError = response.ok ? "no envoy registered" : `HTTP ${response.status}`;
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`AgentOS envoy was not ready: ${lastError}`);
}

export async function startRuntime(config = runtimeConfig()) {
  const eve = new EveServer(config);
  const agentos = new AgentOSRuntime(config);
  await Promise.allSettled([eve.start(), agentos.start()]);
  return { eve, agentos, config };
}

export function makeHealth(runtime) {
  const promptable = runtime.eve.state === "ready" && runtime.agentos.state === "ready" && credentialConfigured();
  return {
    ok: runtime.eve.state === "ready" && runtime.agentos.state === "ready",
    state: promptable ? "promptable" : "not_promptable",
    promptable,
    credentialConfigured: credentialConfigured(),
    eve: { state: runtime.eve.state, error: runtime.eve.error },
    agentos: { state: runtime.agentos.state, error: runtime.agentos.error },
  };
}

export function makeServer(runtime) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${runtime.config.bind}:${runtime.config.port}`);
    try {
      if (request.method === "GET" && url.pathname === "/v1/health") return sendJSON(response, 200, makeHealth(runtime));
      if (request.method === "POST" && url.pathname === "/v1/eve/probe-session") {
        if (runtime.eve.state !== "ready") return sendJSON(response, 503, { error: "Eve is not ready" });
        const body = await readJSON(request);
        const message = String(body.message ?? "QuantFlow runtime probe.").trim();
        if (!message) return sendJSON(response, 400, { error: "message is required" });
        const startedAt = performance.now();
        const upstream = await fetch(`${runtime.config.eveBaseURL}/eve/v1/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
        const payload = await upstream.json();
        return sendJSON(response, upstream.status, { ...payload, acceptedInMilliseconds: Math.round((performance.now() - startedAt) * 10) / 10 });
      }
      if (request.method === "POST" && url.pathname === "/v1/agentos/eve-session") {
        const body = await readJSON(request);
        const workspaceID = String(body.workspaceID ?? "").trim();
        const tileID = String(body.tileID ?? "").trim();
        if (!workspaceID || !tileID) return sendJSON(response, 400, { error: "workspaceID and tileID are required" });
        const session = await runtime.agentos.createEveActorSession({ workspaceID, tileID });
        return sendJSON(response, 201, { ...session, workspaceID, tileID, promptable: credentialConfigured() });
      }
      const promptMatch = url.pathname.match(/^\/v1\/agentos\/eve-session\/([^/]+)\/prompt$/);
      if (request.method === "POST" && promptMatch) {
        if (!credentialConfigured()) return sendJSON(response, 409, { error: "OPENCODE_GO_API_KEY is required before Eve can accept a prompt" });
        const body = await readJSON(request);
        const workspaceID = String(body.workspaceID ?? "").trim();
        const tileID = String(body.tileID ?? "").trim();
        const text = String(body.text ?? "").trim();
        if (!workspaceID || !tileID || !text) return sendJSON(response, 400, { error: "workspaceID, tileID, and text are required" });
        const sessionID = decodeURIComponent(promptMatch[1]);
        const responseBody = await runtime.agentos.promptEveActorSession({ workspaceID, tileID, sessionID, text });
        return sendJSON(response, 200, { ok: true, ...responseBody });
      }
      return sendJSON(response, 404, { error: "not found" });
    } catch (error) {
      return sendJSON(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = runtimeConfig();
  const runtime = await startRuntime(config);
  const server = makeServer(runtime);
  server.listen(config.port, config.bind, () => console.log(`QuantFlow Mac runtime listening on http://${config.bind}:${config.port}`));
  const stop = () => { server.close(); runtime.eve.stop(); process.exit(0); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
