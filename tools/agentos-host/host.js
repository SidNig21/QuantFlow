/**
 * QuantFlow AgentOS host — WSL-only sidecar.
 * Exposes localhost HTTP + SSE matching src/harness/agentos/transport.ts.
 * Credentials read from inherited env at session create; never logged.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { agentOS, defineSoftware, nodeModulesMount, setup } from "@rivet-dev/agentos";
import { createClient } from "@rivet-dev/agentos/client";
import { toolKit, hostTool } from "@rivet-dev/agentos-core";
import pi from "@agentos-software/pi";
import opencode from "@agentos-software/opencode";
import claudeCode from "@agentos-software/claude-code";
import { z } from "zod";
import { ensureEveForActorKey, getKeyIdForPort, prewarmEve, stopAllEve, stopEveForActorKey } from "./eve-supervisor.js";
import { buildQuantflowTileInstructions } from "./quantflow-instructions.js";

const HOST = process.env.AGENTOS_HOST_BIND ?? "0.0.0.0";
const PORT = Number.parseInt(process.env.AGENTOS_HOST_PORT ?? "7430", 10);
const RIVET_ACTOR_PORT = Number.parseInt(
  process.env.AGENTOS_RIVET_ACTOR_PORT ?? String(PORT + 1),
  10,
);
const RIVET_ENGINE_PORT = Number.parseInt(
  process.env.AGENTOS_RIVET_ENGINE_PORT ?? String(PORT + 2),
  10,
);
const RIVET_ENDPOINT = `http://127.0.0.1:${RIVET_ENGINE_PORT}`;
const RIVET_START_TIMEOUT_MS = Number.parseInt(
  process.env.AGENTOS_RIVET_START_TIMEOUT_MS ?? "90000",
  10,
);
const RIVET_ENVOY_KEY = process.env.AGENTOS_RIVET_ENVOY_KEY?.trim() || randomUUID();
const EVE_PORT_BASE = Number.parseInt(process.env.EVE_PORT_BASE ?? "3010", 10);
const EVE_PORT_RANGE = Number.parseInt(process.env.EVE_PORT_RANGE ?? "900", 10);
const AGENTOS_JS_CPU_TIME_LIMIT_MS = Number.parseInt(
  process.env.AGENTOS_JS_CPU_TIME_LIMIT_MS ?? "600000",
  10,
);
const PERMISSION_TIMEOUT_MS = 120_000;

function resolveQuantflowEvePackagePath() {
  const override = (process.env.QUANTFLOW_EVE_AGENTOS_PKG ?? "").trim();
  if (override) return override;
  return fileURLToPath(new URL("../../../quantflow-eve/agentos/dist/package.aospkg", import.meta.url));
}

const quantflowEve = defineSoftware({ packagePath: resolveQuantflowEvePackagePath() });

function eveLoopbackExemptPorts() {
  const base = Number.isFinite(EVE_PORT_BASE) ? EVE_PORT_BASE : 3010;
  const range = Number.isFinite(EVE_PORT_RANGE) ? EVE_PORT_RANGE : 900;
  const safeStart = Math.max(0, Math.min(65535, base));
  const safeCount = Math.max(0, Math.min(range, 65536 - safeStart));
  return Array.from({ length: safeCount }, (_, index) => safeStart + index);
}

// @rivet-dev/agentos@0.2.7 accepts serializable software + native mounts here.
// Its native actor schema rejects JS toolKits, so the preserved toolkit/cable
// definitions below stay deliberately deferred instead of being silently
// presented as active. ACP permission events still cross the actor connection.
const agentOsActor = agentOS({
  software: [pi, opencode, claudeCode, quantflowEve],
  // Eve itself runs in WSL on deterministic per-actor ports. The guest ACP
  // adapter reaches it through EVE_BASE_URL, so mark that known range as an
  // intentional loopback bridge.
  loopbackExemptPorts: eveLoopbackExemptPorts(),
  // Thin ACP adapters may wait on slow live model streams. Keep the VM-side
  // relay bounded, but above normal Eve turn latency; the adapter itself
  // coalesces updates so this is a safety margin, not a license to spam.
  limits: {
    jsRuntime: {
      cpuTimeLimitMs: AGENTOS_JS_CPU_TIME_LIMIT_MS,
      wallClockLimitMs: AGENTOS_JS_CPU_TIME_LIMIT_MS,
    },
  },
  // claude-code's ACP adapter resolves its package through /root/node_modules;
  // mount the host's own node_modules read-only (S3 compat-gate finding).
  mounts: [nodeModulesMount(new URL("./node_modules", import.meta.url).pathname)],
  // AgentOs.create() supplied this effective allow-all VM policy by default.
  // The native actor is deny-by-default, so carry that behavior forward
  // explicitly or packaged agents cannot read session env/reach providers.
  permissions: {
    fs: "allow",
    network: "allow",
    childProcess: "allow",
    process: "allow",
    env: "allow",
    binding: "allow",
  },
});

const actorRegistry = setup({
  use: { agentos: agentOsActor },
  runtime: "native",
  startEngine: true,
  engineHost: "127.0.0.1",
  enginePort: RIVET_ENGINE_PORT,
  httpHost: "127.0.0.1",
  httpPort: RIVET_ACTOR_PORT,
  noWelcome: true,
  logging: { level: "warn" },
  // Keep process identity separate from the durable compound actor key.
  envoy: { poolName: "default", version: 1, envoyKey: RIVET_ENVOY_KEY },
  shutdown: { disableSignalHandlers: true },
});

const actorClient = createClient({
  endpoint: RIVET_ENDPOINT,
  namespace: "default",
  poolName: "default",
  encoding: "bare",
  disableMetadataLookup: true,
});

let actorRuntimeStarted = false;
let actorRuntimeDisposed = false;
let actorRuntimeStartPromise = null;

/**
 * @typedef {{ workspaceId: string, tileId: string, actorKey: [string, string], keyId: string }} ActorAddress
 */

/**
 * @typedef {{
 *   subscribers: Set<import('node:http').ServerResponse>,
 *   software: string,
 *   workspaceId: string,
 *   tileId: string,
 *   actorKey: [string, string],
 *   keyId: string,
 *   actorId: string,
 * }} HostSession
 */

/** @type {Map<string, HostSession>} */
const sessions = new Map();

/** @type {Map<string, { sessionId: string, keyId: string }>} */
const terminals = new Map();

/**
 * @type {Map<string, Promise<{
 *   address: ActorAddress,
 *   actorId: string,
 *   connection: any,
 *   unsubs: Array<() => void>,
 *   lifecycle: { state: string, reason?: string },
 * }>>}
 */
const actorConnections = new Map();

/**
 * @type {Map<string, { sessionId: string, kind: 'toolkit' | 'acp', resolve: (approved: boolean) => void, timer: NodeJS.Timeout }>}
 */
const pendingPermissions = new Map();

/** @type {string | null} */
let activePromptSessionId = null;

/** @type {string | null} */
let lastAddressedSessionId = null;

/** @type {Map<string, string>} AgentOS sessionId → canvas tileId */
const sessionToTile = new Map();
/** @type {Map<string, string>} canvas tileId → AgentOS sessionId */
const tileToSession = new Map();
/** @type {Map<string, { tileAId: string, tileBId: string }>} synced from Electron Kernel cables */
const hostConnectionGraph = new Map();

function registerHostTileSession(tileId, sessionId) {
  const tile = String(tileId ?? "").trim();
  const session = String(sessionId ?? "").trim();
  if (!tile || !session) return;
  sessionToTile.set(session, tile);
  tileToSession.set(tile, session);
}

function shortTileSuffix(tileId) {
  const raw = String(tileId ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(/[\/:\s]+/).filter(Boolean);
  const segment = parts.at(-1) ?? raw;
  return segment.length > 5 ? segment.slice(-5) : segment;
}

function sessionRecordForTile(tileId) {
  const sessionId = tileToSession.get(String(tileId ?? "").trim());
  return sessionId ? sessions.get(sessionId) ?? null : null;
}

function labelForTile(tileId) {
  const tile = String(tileId ?? "").trim();
  const record = sessionRecordForTile(tile);
  if (!record?.software) return tile;
  const suffix = shortTileSuffix(tile);
  return suffix ? `${record.software}-${suffix}` : record.software;
}

function tileIdForKeyId(keyId) {
  const key = String(keyId ?? "").trim();
  if (!key) return null;
  for (const session of sessions.values()) {
    if (session.keyId === key) return session.tileId;
  }
  try {
    const actorKey = JSON.parse(key);
    if (Array.isArray(actorKey) && typeof actorKey[1] === "string" && actorKey[1].trim()) {
      return actorKey[1];
    }
  } catch {
    // Key ids are normally JSON actor keys; malformed values are unresolved.
  }
  return null;
}

function tileIdForPort(port) {
  const keyId = getKeyIdForPort(port);
  return keyId ? tileIdForKeyId(keyId) : null;
}

function cablePeersForTile(tileId) {
  const tile = String(tileId ?? "").trim();
  const peers = [];
  if (!tile) return peers;
  for (const [connectionId, conn] of hostConnectionGraph) {
    if (conn.tileAId !== tile && conn.tileBId !== tile) continue;
    const peerTileId = conn.tileAId === tile ? conn.tileBId : conn.tileAId;
    peers.push({
      connectionId,
      peerTileId,
      peerLabel: labelForTile(peerTileId),
      peerSoftware: sessionRecordForTile(peerTileId)?.software ?? null,
    });
  }
  return peers;
}

function syncHostConnectionGraph(connections) {
  hostConnectionGraph.clear();
  if (!Array.isArray(connections)) return;
  for (const conn of connections) {
    const id = String(conn?.id ?? "").trim();
    const tileAId = String(conn?.tileAId ?? "").trim();
    const tileBId = String(conn?.tileBId ?? "").trim();
    if (!id || !tileAId || !tileBId) continue;
    hostConnectionGraph.set(id, { tileAId, tileBId });
  }
}

function resolveOpencodeKey() {
  return (
    (process.env.OPENCODE_API_KEY
      ?? process.env.OPENCODE_GO_API_KEY
      ?? process.env.OPENCODE_ZEN_API_KEY
      ?? "")
      .trim()
  );
}

function resolveSoftwareAndEnv() {
  const opencodeKey = resolveOpencodeKey();
  if (opencodeKey) {
    // OpenCode via pi's custom-provider mechanism. The `opencode` AgentOS software
    // cannot be used: its bundled ACP adapter hardcodes an Anthropic catalog and
    // ignores OPENCODE_CONFIG_CONTENT for provider selection (verified 2026-07-03).
    // Default: OpenCode Go (zen/go/v1, glm-5.2). Override via AGENTOS_PROVIDER=zen
    // for legacy Zen free tier (big-pickle) or AGENTOS_MODEL for other Go models.
    const route = resolveOpencodePiRoute();
    return {
      software: "pi",
      env: { OPENCODE_API_KEY: opencodeKey },
      piVmFiles: buildOpencodePiFiles(route),
    };
  }
  const openrouterKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
  if (openrouterKey) {
    return {
      software: "pi",
      env: {
        OPENROUTER_API_KEY: openrouterKey,
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_API_KEY: openrouterKey,
      },
    };
  }
  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (anthropicKey) {
    return { software: "pi", env: { ANTHROPIC_API_KEY: anthropicKey } };
  }
  throw new Error(
    "No AgentOS credential in environment (OPENCODE_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY)",
  );
}

/** Error whose message is safe to return to the client as a 400. */
class SessionConfigError extends Error {}

/**
 * S3 — honor the software requested by the role/tile instead of forcing the
 * credential-order default onto every session. Named tiles get their real
 * identities; unavailable software is rejected EXPLICITLY (never silently pi).
 */
function resolveSessionConfig(requested) {
  const software = (requested ?? "").trim();
  if (!software || software === "pi") {
    return resolveSoftwareAndEnv();
  }
  if (software === "eve") {
    // Same alias family as the pi route (WSL profiles commonly export
    // OPENCODE_API_KEY); forwarded under the exact name quantflow-eve's
    // agent.ts reads inside the VM. U3.5 finding 2026-07-11.
    const opencodeKey = resolveOpencodeKey();
    if (opencodeKey) {
      return {
        software: "eve",
        env: {
          OPENCODE_API_KEY: opencodeKey,
          OPENCODE_GO_API_KEY: opencodeKey,
          OPENCODE_ZEN_API_KEY: opencodeKey,
        },
        opencodeKey,
      };
    }
    throw new SessionConfigError(
      "no Eve credential: set OPENCODE_API_KEY / OPENCODE_GO_API_KEY / OPENCODE_ZEN_API_KEY " +
        "in the AgentOS host environment",
    );
  }
  if (software === "claude" || software === "claude-code") {
    // First choice: the founder's own Claude subscription. `claude setup-token`
    // mints a long-lived OAuth token the CLI accepts headlessly — no API key,
    // no third-party billing.
    const oauthToken = (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").trim();
    if (oauthToken) {
      return { software: "claude", env: { CLAUDE_CODE_OAUTH_TOKEN: oauthToken } };
    }
    const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (anthropicKey) {
      return { software: "claude", env: { ANTHROPIC_API_KEY: anthropicKey } };
    }
    const zenKey = resolveOpencodeKey();
    if (zenKey) {
      // OpenCode Zen speaks the Anthropic protocol at /zen/v1/messages
      // (probed 2026-07-04: well-formed anthropic error envelope; the only
      // barrier was workspace credits). claude CLI appends /v1/messages.
      return {
        software: "claude",
        env: { ANTHROPIC_API_KEY: zenKey, ANTHROPIC_BASE_URL: "https://opencode.ai/zen" },
      };
    }
    throw new SessionConfigError(
      "no Claude credential: run `claude setup-token` in WSL and add CLAUDE_CODE_OAUTH_TOKEN to ~/.profile " +
        "(or set ANTHROPIC_API_KEY / OPENCODE_API_KEY in the host env)",
    );
  }
  if (software === "codex") {
    // A real codex agent exists upstream (repo main: examples/codex — codex is
    // a first-class createSession agent), but the pinned @agentos-software/codex
    // @0.3.1 is a stub (no agent block, verified 2026-07-04). Real seat is blocked
    // on a codex-agent version compatible with core 0.2.4 (T009). NEVER fall back
    // to pi — that impostor path is banned (roster policy 2026-07-05).
    throw new SessionConfigError(
      "codex agent not yet available: pinned @agentos-software/codex@0.3.1 is a stub; " +
        "needs a core-0.2.4-compatible codex-agent pin (T009). No pi fallback.",
    );
  }
  if (software === "opencode") {
    // Known upstream bug: bundled ACP adapter hardcodes an Anthropic catalog
    // and ignores provider config (verified 2026-07-03). Explicit rejection
    // beats a silently broken actor; role stays on herdr-wsl.
    throw new SessionConfigError(
      "opencode software adapter cannot route providers at 0.2.x — role stays on herdr-wsl",
    );
  }
  throw new SessionConfigError(`unknown software '${software}'`);
}

/**
 * BOOLEAN ONLY — /health credential report. Mirrors resolveSoftwareAndEnv's
 * order (OPENCODE_API_KEY/OPENCODE_GO_API_KEY/OPENCODE_ZEN_API_KEY → OPENROUTER_API_KEY →
 * ANTHROPIC_API_KEY) but never exposes which name matched, any value, or any
 * length. The Windows side is blind to WSL ~/.profile keys; this is its only
 * window, and it must stay a single boolean.
 */
function hostHasCredential() {
  return Boolean(
    (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").trim()
    || (process.env.OPENCODE_API_KEY ?? "").trim()
    || (process.env.OPENCODE_GO_API_KEY ?? "").trim()
    || (process.env.OPENCODE_ZEN_API_KEY ?? "").trim()
    || (process.env.OPENROUTER_API_KEY ?? "").trim()
    || (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  );
}

/** OpenCode Go/Zen pi route — AGENTOS_PROVIDER=zen keeps legacy Zen free tier. */
function resolveOpencodePiRoute() {
  const provider = (process.env.AGENTOS_PROVIDER ?? "go").trim().toLowerCase();
  if (provider === "zen") {
    const model = (process.env.AGENTOS_MODEL ?? "big-pickle").trim();
    return {
      providerId: "zen",
      baseUrl: "https://opencode.ai/zen/v1",
      model,
      label: "OpenCode Zen",
    };
  }
  const model = (process.env.AGENTOS_MODEL ?? "glm-5.2").trim();
  return {
    providerId: "go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    model,
    label: "OpenCode Go",
  };
}

/** pi config files written into the VM for OpenCode Go/Zen providers. */
function buildOpencodePiFiles(route) {
  const { providerId, baseUrl, model, label } = route;
  const modelsJson = JSON.stringify({
    providers: {
      [providerId]: {
        baseUrl,
        apiKey: "OPENCODE_API_KEY",
        api: "openai-completions",
        models: [
          { id: model, name: `${label} ${model}`, contextWindow: 128000, maxTokens: 8192 },
        ],
      },
    },
  });
  const settingsJson = JSON.stringify({ defaultProvider: providerId, defaultModel: model });
  const files = [];
  for (const home of ["/root", "/home/agentos"]) {
    files.push({ path: `${home}/.pi/agent/models.json`, content: modelsJson });
    files.push({ path: `${home}/.pi/agent/settings.json`, content: settingsJson });
  }
  return files;
}

function resolveActorAddress(body) {
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId.trim() : "";
  const tileId = typeof body?.tileId === "string" ? body.tileId.trim() : "";
  if (!workspaceId || !tileId) {
    throw new SessionConfigError("workspaceId and tileId required for AgentOS actor key");
  }
  /** @type {[string, string]} */
  const actorKey = [workspaceId, tileId];
  return { workspaceId, tileId, actorKey, keyId: JSON.stringify(actorKey) };
}

function addressFromSession(session) {
  return {
    workspaceId: session.workspaceId,
    tileId: session.tileId,
    actorKey: session.actorKey,
    keyId: session.keyId,
  };
}

async function waitForEnvoy() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < RIVET_START_TIMEOUT_MS) {
    try {
      const response = await fetch(`${RIVET_ENDPOINT}/envoys?namespace=default`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body.envoys) && body.envoys.length > 0) return;
        lastError = "no envoys registered";
      } else {
        lastError = `status ${response.status}`;
      }
    } catch (error) {
      lastError = error?.cause?.message ?? error?.message ?? String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`AgentOS envoy not ready within ${RIVET_START_TIMEOUT_MS}ms: ${lastError}`);
}

async function startActorRuntime() {
  if (actorRuntimeDisposed) {
    throw new Error("AgentOS actor runtime disposed");
  }
  if (actorRuntimeStarted) return;
  if (!actorRuntimeStartPromise) {
    actorRuntimeStartPromise = (async () => {
      actorRegistry.start();
      await waitForEnvoy();
      actorRuntimeStarted = true;
    })().catch((error) => {
      actorRuntimeStartPromise = null;
      throw error;
    });
  }
  await actorRuntimeStartPromise;
}

async function actorHandleFor(address) {
  await startActorRuntime();
  // This getOrCreate call is the durable delivery door. Sessions only retain
  // the compound key; no raw actor/session object is used as the address.
  return actorClient.agentos.getOrCreate(address.actorKey);
}

async function retryActorReady(operation) {
  const timeoutMs = Number.isFinite(RIVET_START_TIMEOUT_MS) && RIVET_START_TIMEOUT_MS > 0
    ? RIVET_START_TIMEOUT_MS
    : 90_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = new Error("AgentOS actor runtime did not become ready");
  while (Date.now() < deadline) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`AgentOS actor runtime not ready within ${timeoutMs}ms: ${lastError.message}`);
}

function sessionEventPayload(args) {
  const first = args[0];
  if (first && typeof first === "object" && "sessionId" in first) return first;
  return { sessionId: args[0], event: args[1] };
}

function permissionEventPayload(args) {
  const first = args[0];
  if (first && typeof first === "object" && "sessionId" in first) return first;
  return { sessionId: args[0], request: args[1] };
}

function shellEventPayload(args) {
  const first = args[0];
  if (first && typeof first === "object" && "shellId" in first) return first;
  return { shellId: args[0], data: args[1] };
}

function wireActorEvents(connection, lifecycle) {
  const unsubs = [];
  unsubs.push(connection.on("sessionEvent", (...args) => {
    const payload = sessionEventPayload(args);
    const sessionId = String(payload?.sessionId ?? "");
    if (sessionId) {
      broadcastSession(sessionId, { kind: "session-event", event: payload?.event });
    }
  }));
  unsubs.push(connection.on("permissionRequest", (...args) => {
    const payload = permissionEventPayload(args);
    const sessionId = String(payload?.sessionId ?? "");
    const request = payload?.request;
    const requestId = String(request?.permissionId ?? "");
    if (!sessionId || !requestId) return;
    emitPermissionRequest(sessionId, {
      requestId,
      action: request?.description ?? "acp permission",
      source: "acp",
      raw: request,
    });
    waitForPermission(sessionId, requestId, "acp").catch(async () => {
      try {
        const { handle } = await actorForSession(sessionId);
        await handle.respondPermission(sessionId, requestId, "reject");
      } catch {
        // Session may already be closed during actor teardown.
      }
    });
  }));
  unsubs.push(connection.on("shellData", (...args) => {
    const payload = shellEventPayload(args);
    const shellId = String(payload?.shellId ?? "");
    const terminal = terminals.get(shellId);
    if (!terminal || payload?.data == null) return;
    broadcastSession(terminal.sessionId, {
      kind: "terminal-data",
      shellId,
      data: Buffer.from(payload.data).toString("base64"),
    });
  }));
  unsubs.push(connection.on("vmBooted", () => {
    lifecycle.state = "booted";
    delete lifecycle.reason;
  }));
  unsubs.push(connection.on("vmShutdown", (payload) => {
    lifecycle.state = "shutdown";
    lifecycle.reason = String(payload?.reason ?? "unknown");
  }));
  return unsubs;
}

async function ensureActor(address) {
  const handle = await actorHandleFor(address);
  const actorId = await retryActorReady(() => handle.resolve());

  let connectionPromise = actorConnections.get(address.keyId);
  if (!connectionPromise) {
    connectionPromise = (async () => {
      // resolve() can succeed before a restarted envoy is registered. A harmless
      // action proves the actor is actually ready before any non-idempotent call.
      await retryActorReady(() => handle.listSoftware());
      const connection = handle.connect();
      const lifecycle = { state: "connecting" };
      const unsubs = wireActorEvents(connection, lifecycle);
      try {
        await connection.ready;
        lifecycle.state = "connected";
        return { address, actorId, connection, unsubs, lifecycle };
      } catch (error) {
        for (const unsub of unsubs) unsub();
        await connection.dispose().catch(() => {});
        throw error;
      }
    })();
    actorConnections.set(address.keyId, connectionPromise);
    connectionPromise.catch(() => {
      if (actorConnections.get(address.keyId) === connectionPromise) {
        actorConnections.delete(address.keyId);
      }
    });
  }

  const connection = await connectionPromise;
  return { handle, actorId, connection };
}

async function actorForSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);
  return ensureActor(addressFromSession(session));
}

async function disposeActorConnection(keyId) {
  const pending = actorConnections.get(keyId);
  actorConnections.delete(keyId);
  try {
    await stopEveForActorKey({ actorKey: JSON.parse(keyId) });
  } catch {
    // Best effort Path A Eve cleanup.
  }
  if (!pending) return;
  try {
    const entry = await pending;
    for (const unsub of entry.unsubs) unsub();
    await entry.connection.dispose();
  } catch {
    // Best effort during reload/dispose.
  }
}

async function promptSession(sessionId, text) {
  const { handle } = await actorForSession(sessionId);
  const previous = activePromptSessionId;
  activePromptSessionId = sessionId;
  lastAddressedSessionId = sessionId;
  try {
    return await handle.sendPrompt(sessionId, text);
  } finally {
    activePromptSessionId = previous;
  }
}

async function disposeActorRuntime() {
  await stopAllEve();

  for (const [shellId, terminal] of terminals) {
    const session = sessions.get(terminal.sessionId);
    if (!session) continue;
    try {
      await (await actorHandleFor(addressFromSession(session))).closeShell(shellId);
    } catch {
      // Best effort.
    }
  }
  terminals.clear();

  for (const [sessionId, session] of sessions) {
    try {
      await (await actorHandleFor(addressFromSession(session))).closeSession(sessionId);
    } catch {
      // Best effort; persisted transcript rows remain actor-owned.
    }
  }

  for (const keyId of [...actorConnections.keys()]) {
    await disposeActorConnection(keyId);
  }

  for (const [requestId, entry] of pendingPermissions) {
    clearTimeout(entry.timer);
    pendingPermissions.delete(requestId);
    entry.resolve(false);
  }

  sessions.clear();
  sessionToTile.clear();
  tileToSession.clear();
  hostConnectionGraph.clear();
  lastAddressedSessionId = null;
  actorRuntimeDisposed = true;
  actorRuntimeStartPromise = null;
  await actorClient.dispose().catch(() => {});
  // @rivet-dev/agentos@0.2.7 cannot gracefully drain a prompted actor: the
  // persisted session stays `running`, registry.shutdown() removes its envoy,
  // and the next incarnation is stranded in `no_envoys`. The lifecycle caller
  // terminates this host immediately after /dispose; letting process exit drop
  // the envoy lets Rivet Engine release the slot and re-address the same actor.
}

/**
 * S4 — agent-callable A2A: canvas cable = permission to message the peer tile.
 * Validates against the synced Kernel connection graph; never writes cables.
 */
async function executeCableSend({ connectionId, fromTileId, text, fromSessionId }) {
  const connId = String(connectionId ?? "").trim();
  const msg = String(text ?? "").trim();
  let from = String(fromTileId ?? "").trim();
  if (!from && fromSessionId) {
    from = sessionToTile.get(fromSessionId) ?? "";
  }
  if (!connId) throw new Error("connectionId required");
  if (!from) throw new Error("fromTileId required (session has no tile binding)");
  if (!msg) throw new Error("text required");

  const conn = hostConnectionGraph.get(connId);
  if (!conn) throw new Error(`no canvas cable: ${connId}`);
  if (from !== conn.tileAId && from !== conn.tileBId) {
    throw new Error("fromTileId is not on this connection");
  }
  const targetTileId = from === conn.tileAId ? conn.tileBId : conn.tileAId;
  const targetSessionId = tileToSession.get(targetTileId);
  if (!targetSessionId) {
    throw new Error(`target tile has no AgentOS session: ${targetTileId}`);
  }

  const fromLabel = labelForTile(from);
  const delegated = `Message from cabled agent @${fromLabel} (canvas cable ${connId}): ${msg}`;
  let targetResult;
  try {
    targetResult = await promptSession(targetSessionId, delegated);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }

  let replyPayload =
    typeof targetResult?.text === "string" && targetResult.text.trim()
      ? targetResult.text.trim()
      : "";
  if (process.env.QF_AGENTOS_SIM === "1") {
    replyPayload = `ack: ${msg.slice(0, 120)}`;
  } else if (!replyPayload) {
    replyPayload = "(no reply text)";
  }

  return { ok: true, targetTileId, reply: replyPayload };
}

async function executeDelegateSend({ fromTileId, connectionId, goal }) {
  const tileId = String(fromTileId ?? "").trim();
  const fromSessionId = tileToSession.get(tileId);
  if (!fromSessionId) {
    throw new Error(`no AgentOS session for orchestrator tile ${tileId}`);
  }
  const prev = activePromptSessionId;
  activePromptSessionId = fromSessionId;
  try {
    return await executeCableSend({
      connectionId,
      fromTileId: tileId,
      text: goal,
      fromSessionId,
    });
  } finally {
    activePromptSessionId = prev;
  }
}

function buildCableKit() {
  return toolKit({
    name: "cable",
    description: "Send a message to an agent on the other end of a canvas cable.",
    tools: {
      send: hostTool({
        description:
          "Send text to the cabled peer. Requires an existing canvas cable (connection id).",
        inputSchema: z.object({
          connectionId: z.string(),
          text: z.string(),
        }),
        timeout: PERMISSION_TIMEOUT_MS * 2,
        execute: async ({ connectionId, text }) => {
          const fromSessionId = activePromptSessionId;
          if (!fromSessionId) {
            throw new Error("agentos-cable send outside active session prompt");
          }
          return executeCableSend({
            connectionId,
            fromTileId: null,
            text,
            fromSessionId,
          });
        },
      }),
    },
  });
}

/** S5 — Hermes orchestrator seat delegates via the same cable bridge. */
function buildDelegateKit() {
  return toolKit({
    name: "delegate",
    description: "Delegate work to a cabled legend actor tile.",
    tools: {
      send: hostTool({
        description: "Delegate a goal to the worker on the other end of a canvas cable.",
        inputSchema: z.object({
          connectionId: z.string(),
          goal: z.string(),
        }),
        timeout: PERMISSION_TIMEOUT_MS * 2,
        execute: async ({ connectionId, goal }) => {
          const fromSessionId = activePromptSessionId;
          if (!fromSessionId) {
            throw new Error("agentos-delegate send outside active session prompt");
          }
          return executeCableSend({
            connectionId,
            fromTileId: null,
            text: goal,
            fromSessionId,
          });
        },
      }),
    },
  });
}

function buildQuantflowKit() {
  return toolKit({
    name: "quantflow",
    description: "QuantFlow kernel bridge — receipt emit and operator approval.",
    tools: {
      "receipt-emit": hostTool({
        description: "Record a receipt milestone in the QuantFlow kernel.",
        inputSchema: z.object({
          kind: z.string(),
          detail: z.string(),
        }),
        execute: ({ kind, detail }) => ({ ok: true, kind, detail }),
      }),
      "approval-request": hostTool({
        description: "Ask the operator for approval before a sensitive action. Blocks until answered.",
        inputSchema: z.object({
          action: z.string(),
        }),
        timeout: PERMISSION_TIMEOUT_MS,
        execute: async ({ action }) => {
          const sessionId = activePromptSessionId;
          if (!sessionId) {
            throw new Error("approval-request outside active session prompt");
          }
          const requestId = randomUUID();
          emitPermissionRequest(sessionId, {
            requestId,
            action,
            source: "toolkit",
          });
          const approved = await waitForPermission(sessionId, requestId, "toolkit");
          return { approved, action };
        },
      }),
    },
  });
}

function waitForPermission(sessionId, requestId, kind) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPermissions.delete(requestId);
      reject(new Error(`permission timeout: ${requestId}`));
    }, PERMISSION_TIMEOUT_MS);
    pendingPermissions.set(requestId, { sessionId, kind, resolve, timer });
  });
}

async function fulfillPermission(sessionId, requestId, approved) {
  const entry = pendingPermissions.get(requestId);
  if (!entry || entry.sessionId !== sessionId) {
    return false;
  }
  clearTimeout(entry.timer);
  pendingPermissions.delete(requestId);
  if (entry.kind === "acp") {
    const { handle } = await actorForSession(sessionId);
    await handle.respondPermission(sessionId, requestId, approved ? "once" : "reject");
  }
  entry.resolve(approved);
  return true;
}

function emitSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastSession(sessionId, payload) {
  const session = sessions.get(sessionId);
  if (!session) return;
  for (const res of session.subscribers) {
    try {
      emitSse(res, payload);
    } catch {
      session.subscribers.delete(res);
    }
  }
}

function emitPermissionRequest(sessionId, request) {
  broadcastSession(sessionId, {
    kind: "permission-request",
    requestId: request.requestId,
    action: request.action,
    source: request.source ?? "acp",
    toolCallId: request.toolCallId ?? null,
    raw: request.raw ?? null,
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleRequest(req, res) {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/health") {
      // No credential required to answer; hasCredential is a boolean only.
      sendJson(res, 200, { ok: true, hasCredential: hostHasCredential() });
      return;
    }

    if (req.method === "POST" && path === "/dispose") {
      await disposeActorRuntime();
      res.once("finish", () => {
        server.close();
        setImmediate(() => process.exit(0));
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && path === "/file") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        sendJson(res, 400, { error: "path query required" });
        return;
      }
      let sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
      if (!sessionId && sessions.size === 1) {
        sessionId = sessions.keys().next().value ?? "";
      }
      if (!sessionId) {
        sendJson(res, 400, { error: "sessionId query required when actor is ambiguous" });
        return;
      }
      if (!sessions.has(sessionId)) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }
      const { handle } = await actorForSession(sessionId);
      const raw = await handle.readFile(filePath);
      const buf = Buffer.from(raw);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": buf.length,
      });
      res.end(buf);
      return;
    }

    if (req.method === "POST" && path === "/connections/sync") {
      const body = await readJsonBody(req);
      syncHostConnectionGraph(body?.connections);
      sendJson(res, 200, { ok: true, count: hostConnectionGraph.size });
      return;
    }

    if (req.method === "POST" && path === "/tile-registry") {
      const body = await readJsonBody(req);
      const tileId = typeof body?.tileId === "string" ? body.tileId : "";
      const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
      if (!tileId.trim() || !sessionId.trim()) {
        sendJson(res, 400, { error: "tileId and sessionId required" });
        return;
      }
      registerHostTileSession(tileId, sessionId);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && path === "/cable/peers") {
      const port = url.searchParams.get("port");
      let tileId = String(url.searchParams.get("tileId") ?? "").trim();
      if (port !== null && port.trim()) {
        tileId = tileIdForPort(port) ?? "";
        if (!tileId) {
          sendJson(res, 404, { error: "no actor for port" });
          return;
        }
      }
      if (!tileId) {
        sendJson(res, 400, { error: "port or tileId required" });
        return;
      }
      sendJson(res, 200, { tileId, peers: cablePeersForTile(tileId) });
      return;
    }

    if (req.method === "POST" && path === "/cable/send") {
      const body = await readJsonBody(req);
      let fromTileId = body?.fromTileId;
      if (!fromTileId && body?.fromPort !== undefined && body?.fromPort !== null) {
        fromTileId = tileIdForPort(body.fromPort);
        if (!fromTileId) {
          sendJson(res, 404, { ok: false, message: "no actor for port" });
          return;
        }
      }
      try {
        const result = await executeCableSend({
          connectionId: body?.connectionId,
          fromTileId,
          text: body?.text,
          fromSessionId: null,
        });
        sendJson(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 400, { ok: false, message });
      }
      return;
    }

    if (req.method === "POST" && path === "/delegate/send") {
      const body = await readJsonBody(req);
      try {
        const result = await executeDelegateSend({
          fromTileId: body?.fromTileId,
          connectionId: body?.connectionId,
          goal: body?.goal ?? body?.text,
        });
        sendJson(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 400, { ok: false, message });
      }
      return;
    }

    if (req.method === "POST" && path === "/session") {
      const body = await readJsonBody(req);
      let picked;
      let address;
      try {
        picked = resolveSessionConfig(body?.software);
        address = resolveActorAddress(body);
      } catch (err) {
        if (err instanceof SessionConfigError) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        throw err;
      }
      const { handle, actorId } = await ensureActor(address);
      if (picked.software === "eve") {
        try {
          const eve = await ensureEveForActorKey(address, {
            opencodeKey: picked.opencodeKey,
          });
          picked.env = {
            ...picked.env,
            EVE_BASE_URL: eve.baseUrl,
          };
        } catch (error) {
          sendJson(res, 500, {
            error: `eve supervisor failed: ${error?.message ?? error}`,
          });
          return;
        }
      }
      if (picked.piVmFiles) {
        for (const file of picked.piVmFiles) {
          try {
            const parent = file.path.slice(0, file.path.lastIndexOf("/"));
            if (!(await handle.exists(parent))) await handle.mkdir(parent);
            await handle.writeFile(file.path, file.content);
          } catch {
            // Best-effort pi config seeding.
          }
        }
      }
      const sessionId = await handle.createSession(picked.software, {
        env: picked.env,
        additionalInstructions: buildQuantflowTileInstructions({
          tileId: address.tileId,
          workspaceId: address.workspaceId,
          software: picked.software,
        }),
      });
      sessions.set(sessionId, {
        subscribers: new Set(),
        software: picked.software,
        workspaceId: address.workspaceId,
        tileId: address.tileId,
        actorKey: address.actorKey,
        keyId: address.keyId,
        actorId,
      });
      lastAddressedSessionId = sessionId;
      registerHostTileSession(address.tileId, sessionId);
      sendJson(res, 200, {
        sessionId,
        software: picked.software,
        workspaceId: address.workspaceId,
        tileId: address.tileId,
        actorKey: address.actorKey,
        actorId,
      });
      return;
    }

    const sessionMatch = path.match(
      /^\/session\/([^/]+)\/(prompt|permission|events|terminal|runtime)$/,
    );
    const terminalOpenMatch = path.match(/^\/session\/([^/]+)\/terminal\/open$/);
    const terminalShellMatch = path.match(/^\/session\/([^/]+)\/terminal\/([^/]+)\/(write|resize|close)$/);
    if (terminalShellMatch) {
      const sessionId = decodeURIComponent(terminalShellMatch[1]);
      const shellId = decodeURIComponent(terminalShellMatch[2]);
      const action = terminalShellMatch[3];
      if (!sessions.has(sessionId)) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }
      const { handle } = await actorForSession(sessionId);
      if (action === "write" && req.method === "POST") {
        const body = await readJsonBody(req);
        const data = typeof body.data === "string" ? body.data : "";
        await handle.writeShell(shellId, data);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (action === "resize" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cols = Number.parseInt(String(body.cols ?? "80"), 10);
        const rows = Number.parseInt(String(body.rows ?? "24"), 10);
        await handle.resizeShell(shellId, cols, rows);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (action === "close" && req.method === "POST") {
        terminals.delete(shellId);
        await handle.closeShell(shellId);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (terminalOpenMatch && req.method === "POST") {
      const sessionId = decodeURIComponent(terminalOpenMatch[1]);
      if (!sessions.has(sessionId)) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }
      const body = await readJsonBody(req);
      const cols = Number.parseInt(String(body.cols ?? "80"), 10);
      const rows = Number.parseInt(String(body.rows ?? "24"), 10);
      const session = sessions.get(sessionId);
      const { handle } = await actorForSession(sessionId);
      const { shellId } = await handle.openShell({ cols, rows });
      terminals.set(shellId, { sessionId, keyId: session.keyId });
      sendJson(res, 200, { shellId });
      return;
    }

    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1]);
      const action = sessionMatch[2];

      if (!sessions.has(sessionId)) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }

      if (action === "terminal" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cols = Number.parseInt(String(body.cols ?? "80"), 10);
        const rows = Number.parseInt(String(body.rows ?? "24"), 10);
        const session = sessions.get(sessionId);
        const { handle } = await actorForSession(sessionId);
        const { shellId } = await handle.openShell({ cols, rows });
        terminals.set(shellId, { sessionId, keyId: session.keyId });
        sendJson(res, 200, { shellId });
        return;
      }

      if (action === "runtime" && req.method === "GET") {
        const session = sessions.get(sessionId);
        const { handle, actorId } = await actorForSession(sessionId);
        const persistedSessions = await handle.listPersistedSessions();
        const persistedEvents = await handle.getSessionEvents(sessionId);
        const connection = await actorConnections.get(session.keyId);
        sendJson(res, 200, {
          sessionId,
          workspaceId: session.workspaceId,
          tileId: session.tileId,
          actorKey: session.actorKey,
          actorId,
          lifecycle: connection?.lifecycle ?? { state: "unknown" },
          persistedSessions,
          persistedEvents,
        });
        return;
      }

      if (action === "events" && req.method === "GET") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        const session = sessions.get(sessionId);
        session.subscribers.add(res);
        req.on("close", () => {
          session.subscribers.delete(res);
        });
        return;
      }

      if (action === "prompt" && req.method === "POST") {
        const body = await readJsonBody(req);
        const text = typeof body.text === "string" ? body.text : "";
        const result = await promptSession(sessionId, text);
        sendJson(res, 200, {
          ok: true,
          text: result?.text ?? "",
          response: result?.response ?? null,
        });
        return;
      }

      if (action === "permission" && req.method === "POST") {
        const body = await readJsonBody(req);
        const requestId = typeof body.requestId === "string" ? body.requestId : "";
        const approved = body.approved === true;
        if (!requestId) {
          sendJson(res, 400, { error: "requestId required" });
          return;
        }
        const ok = await fulfillPermission(sessionId, requestId, approved);
        sendJson(res, ok ? 200 : 404, { ok });
        return;
      }
    }

    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  }
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  });
});

if (process.env.AGENTOS_HOST_NO_LISTEN !== "1") {
  server.listen(PORT, HOST, () => {
    console.log(`agentos-host listening on http://${HOST}:${PORT}`);
    // Warm one Eve instance ahead of demand so the first tile spawn adopts
    // it instead of paying the ~30s cold boot. EVE_WARM_POOL=0 disables.
    const warmKey = resolveOpencodeKey();
    if (warmKey) {
      const warm = prewarmEve({ opencodeKey: warmKey });
      warm?.catch?.((error) => {
        console.error(`[host] eve warm boot failed (cold path remains): ${error?.message ?? error}`);
      });
    }
  });
}

export {
  SessionConfigError,
  hostHasCredential,
  resolveQuantflowEvePackagePath,
  resolveSessionConfig,
};
