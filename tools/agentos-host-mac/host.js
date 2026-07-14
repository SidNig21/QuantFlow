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
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { agentOS, defineSoftware, setup } from "@rivet-dev/agentos";
import { createClient } from "@rivet-dev/agentos/client";
import pty from "node-pty";

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
  constructor(config) {
    this.config = config;
    this.state = "stopped";
    this.error = null;
    this.registry = null;
    this.client = null;
    this.tilePromptRails = new Map();
    this.actorConnections = new Map();
    this.terminalShells = new Map();
  }

  async start() {
    if (this.state === "ready") return;
    this.state = "starting"; this.error = null;
    try {
      await access(this.config.evePackagePath);
      const eveSoftware = defineSoftware({ packagePath: this.config.evePackagePath });
      const actor = agentOS({
        // Eve is the sole AgentOS agent adapter. Terminal rendering is a
        // native macOS PTY that sends turns back through this Eve session.
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
    const { handle, actorID } = await this.actorFor({ workspaceID, tileID });
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
    return this.enqueueTilePrompt(tileID, async () => {
      const { handle } = await this.actorFor({ workspaceID, tileID });
      const result = await handle.sendPrompt(sessionID, text);
      const textResult = typeof result?.text === "string" ? result.text : JSON.stringify(result);
      return { text: textResult, result };
    });
  }

  enqueueTilePrompt(tileID, operation) {
    const key = String(tileID ?? "").trim();
    if (!key) throw new Error("tileID is required for the prompt rail");
    const previous = this.tilePromptRails.get(key) ?? Promise.resolve();
    const queued = previous.then(operation, operation);
    this.tilePromptRails.set(key, queued.catch(() => {}));
    return queued;
  }

  actorKey({ workspaceID, tileID }) { return JSON.stringify([workspaceID, tileID]); }

  async actorFor({ workspaceID, tileID }) {
    const key = this.actorKey({ workspaceID, tileID });
    const handle = await this.client.agentos.getOrCreate([workspaceID, tileID]);
    const actorID = await handle.resolve();
    let pending = this.actorConnections.get(key);
    if (!pending) {
      pending = (async () => {
        const connection = handle.connect();
        const unsubs = [];
        unsubs.push(connection.on("shellData", (payload) => {
          const shellID = String(payload?.shellId ?? "");
          const terminal = this.terminalShells.get(shellID);
          if (!terminal || payload?.data == null) return;
          terminal.append(Buffer.from(payload.data).toString("utf8"));
        }));
        try {
          await connection.ready;
          return { handle, actorID, connection, unsubs };
        } catch (error) {
          for (const unsubscribe of unsubs) unsubscribe?.();
          await connection.dispose().catch(() => {});
          throw error;
        }
      })();
      this.actorConnections.set(key, pending);
      pending.catch(() => { if (this.actorConnections.get(key) === pending) this.actorConnections.delete(key); });
    }
    return pending;
  }

  terminalFor({ workspaceID, tileID, sessionID, shellID }) {
    const terminal = this.terminalShells.get(shellID);
    if (!terminal || terminal.workspaceID !== workspaceID || terminal.tileID !== tileID || terminal.sessionID !== sessionID) {
      throw new Error("terminal is not bound to this Eve tile session");
    }
    return terminal;
  }

  async openTerminal({ workspaceID, tileID, sessionID, cols = 80, rows = 24 }) {
    const { handle } = await this.actorFor({ workspaceID, tileID });
    const sessions = await handle.listPersistedSessions();
    if (!sessions.some((entry) => entry.sessionId === sessionID)) {
      throw new Error("Eve terminal requires a session bound to this tile's AgentOS actor");
    }
    const shellID = `pty-${randomUUID()}`;
    const terminal = {
      workspaceID,
      tileID,
      sessionID,
      shellID,
      buffer: "",
      start: 0,
      closed: false,
      append(data) {
        this.buffer += data;
        const maximum = 128 * 1024;
        if (this.buffer.length > maximum) {
          const drop = this.buffer.length - maximum;
          this.buffer = this.buffer.slice(drop);
          this.start += drop;
        }
      },
    };
    const bridge = fileURLToPath(new URL("./eve-terminal-bridge.mjs", import.meta.url));
    const terminalProcess = pty.spawn(process.execPath, [bridge], {
      name: "xterm-256color",
      cols: terminalDimension(cols, 80),
      rows: terminalDimension(rows, 24),
      cwd: this.config.eveRoot,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        QUANTFLOW_RUNTIME_URL: `http://${this.config.bind}:${this.config.port}`,
        QUANTFLOW_TERMINAL_WORKSPACE_ID: workspaceID,
        QUANTFLOW_TERMINAL_TILE_ID: tileID,
        QUANTFLOW_TERMINAL_SESSION_ID: sessionID,
      },
    });
    terminal.pty = terminalProcess;
    terminalProcess.onData((data) => terminal.append(data));
    terminalProcess.onExit(() => { terminal.closed = true; });
    this.terminalShells.set(shellID, terminal);
    return { shellID, cursor: terminal.start };
  }

  readTerminal({ workspaceID, tileID, sessionID, shellID, cursor = 0 }) {
    const terminal = this.terminalFor({ workspaceID, tileID, sessionID, shellID });
    const requested = Number.isInteger(cursor) ? cursor : terminal.start;
    const effectiveCursor = Math.max(terminal.start, Math.min(requested, terminal.start + terminal.buffer.length));
    return {
      shellID,
      start: terminal.start,
      cursor: terminal.start + terminal.buffer.length,
      data: terminal.buffer.slice(effectiveCursor - terminal.start),
      reset: requested < terminal.start,
      closed: terminal.closed,
    };
  }

  async writeTerminal({ workspaceID, tileID, sessionID, shellID, data }) {
    const terminal = this.terminalFor({ workspaceID, tileID, sessionID, shellID });
    terminal.pty.write(data);
  }

  async resizeTerminal({ workspaceID, tileID, sessionID, shellID, cols, rows }) {
    const terminal = this.terminalFor({ workspaceID, tileID, sessionID, shellID });
    terminal.pty.resize(terminalDimension(cols, 80), terminalDimension(rows, 24));
  }

  async exchangeEveCable({ from, to, text }) {
    if (!from || !to || from.tileID === to.tileID || from.sessionID === to.sessionID) {
      throw new Error("cable endpoints must be two distinct Eve tile sessions");
    }
    const relayText = [
      `Inbound session-scoped cable message from tile ${from.tileID}:`,
      text,
      "Reply directly and concisely to this peer message.",
    ].join("\n");
    const reply = await this.promptEveActorSession({ ...to, text: relayText });
    return { fromTileID: from.tileID, toTileID: to.tileID, text: reply.text };
  }
}

function terminalDimension(value, fallback) {
  const number = Number.parseInt(String(value), 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function cableEndpoint(value) {
  const source = value && typeof value === "object" ? value : {};
  const workspaceID = String(source.workspaceID ?? "").trim();
  const tileID = String(source.tileID ?? "").trim();
  const sessionID = String(source.sessionID ?? "").trim();
  if (!workspaceID || !tileID || !sessionID) throw new Error("cable endpoint requires workspaceID, tileID, and sessionID");
  return { workspaceID, tileID, sessionID };
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
      const terminalMatch = url.pathname.match(/^\/v1\/agentos\/eve-session\/([^/]+)\/terminal$/);
      const terminalActionMatch = url.pathname.match(/^\/v1\/agentos\/eve-session\/([^/]+)\/terminal\/([^/]+)\/(read|write|resize)$/);
      if (terminalActionMatch) {
        const sessionID = decodeURIComponent(terminalActionMatch[1]);
        const shellID = decodeURIComponent(terminalActionMatch[2]);
        const action = terminalActionMatch[3];
        const body = request.method === "GET" ? Object.fromEntries(url.searchParams) : await readJSON(request);
        const workspaceID = String(body.workspaceID ?? "").trim();
        const tileID = String(body.tileID ?? "").trim();
        if (!workspaceID || !tileID) return sendJSON(response, 400, { error: "workspaceID and tileID are required" });
        if (action === "read" && request.method === "GET") {
          const cursor = Number.parseInt(String(body.cursor ?? "0"), 10);
          return sendJSON(response, 200, runtime.agentos.readTerminal({ workspaceID, tileID, sessionID, shellID, cursor }));
        }
        if (action === "write" && request.method === "POST") {
          const data = String(body.data ?? "");
          if (!data) return sendJSON(response, 400, { error: "terminal data is required" });
          await runtime.agentos.writeTerminal({ workspaceID, tileID, sessionID, shellID, data });
          return sendJSON(response, 200, { ok: true });
        }
        if (action === "resize" && request.method === "POST") {
          await runtime.agentos.resizeTerminal({ workspaceID, tileID, sessionID, shellID, cols: body.cols, rows: body.rows });
          return sendJSON(response, 200, { ok: true });
        }
      }
      if (terminalMatch && request.method === "POST") {
        const sessionID = decodeURIComponent(terminalMatch[1]);
        const body = await readJSON(request);
        const workspaceID = String(body.workspaceID ?? "").trim();
        const tileID = String(body.tileID ?? "").trim();
        if (!workspaceID || !tileID) return sendJSON(response, 400, { error: "workspaceID and tileID are required" });
        const terminal = await runtime.agentos.openTerminal({ workspaceID, tileID, sessionID, cols: body.cols, rows: body.rows });
        return sendJSON(response, 201, terminal);
      }
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
      if (request.method === "POST" && url.pathname === "/v1/cables/exchange") {
        const body = await readJSON(request);
        const text = String(body.text ?? "").trim();
        if (!text) return sendJSON(response, 400, { error: "text is required" });
        const result = await runtime.agentos.exchangeEveCable({ from: cableEndpoint(body.from), to: cableEndpoint(body.to), text });
        return sendJSON(response, 200, { ok: true, ...result });
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
