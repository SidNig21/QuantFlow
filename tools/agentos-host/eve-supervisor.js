import { spawn as defaultSpawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT_BASE = 3010;
const DEFAULT_PORT_RANGE = 900;
const DEFAULT_HEALTH_TIMEOUT_MS = 90_000;

const running = new Map();

function stableHash(value) {
  let hash = 2166136261;
  for (const ch of String(value)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function actorKeyId({ workspaceId, tileId, actorKey } = {}) {
  if (Array.isArray(actorKey)) return JSON.stringify(actorKey);
  return JSON.stringify([String(workspaceId ?? ""), String(tileId ?? "")]);
}

function resolveQuantflowEveRoot() {
  const override = (process.env.QUANTFLOW_EVE_ROOT ?? "").trim();
  if (override) return override;
  return fileURLToPath(new URL("../../../quantflow-eve", import.meta.url));
}

function portForKey(keyId, attempt = 0, {
  portBase = Number(process.env.EVE_PORT_BASE ?? DEFAULT_PORT_BASE),
  portRange = Number(process.env.EVE_PORT_RANGE ?? DEFAULT_PORT_RANGE),
} = {}) {
  const range = Number.isFinite(portRange) && portRange > 0 ? Math.floor(portRange) : DEFAULT_PORT_RANGE;
  const base = Number.isFinite(portBase) && portBase > 0 ? Math.floor(portBase) : DEFAULT_PORT_BASE;
  return base + ((stableHash(keyId) + attempt) % range);
}

function makeBaseUrl(port) {
  return `http://127.0.0.1:${port}`;
}

function credentialEnv(opencodeKey) {
  const key = String(opencodeKey ?? "").trim();
  if (!key) return {};
  return {
    OPENCODE_API_KEY: key,
    OPENCODE_GO_API_KEY: key,
    OPENCODE_ZEN_API_KEY: key,
  };
}

function isPortCollision(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;
  return /EADDRINUSE|address already in use|listen/i.test(text);
}

function spawnEve({ eveRoot, port, env, spawnImpl = defaultSpawn } = {}) {
  const child = spawnImpl(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev"],
    {
      cwd: eveRoot,
      env: {
        ...process.env,
        ...env,
        PORT: String(port),
        EVE_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return child;
}

async function waitForHealth(baseUrl, {
  fetchImpl = globalThis.fetch,
  timeoutMs = Number(process.env.EVE_HEALTH_TIMEOUT_MS ?? DEFAULT_HEALTH_TIMEOUT_MS),
  intervalMs = 250,
  child,
} = {}) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    if (child?.exitCode !== undefined && child.exitCode !== null) {
      const error = new Error(`Eve exited before health check passed (code ${child.exitCode})`);
      error.code = child.exitCode;
      throw error;
    }
    try {
      const response = await fetchImpl(`${baseUrl}/eve/v1/health`, {
        signal: AbortSignal.timeout(Math.min(2000, timeoutMs)),
      });
      if (response.ok) return { coldBootMs: Date.now() - start };
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error?.cause?.message ?? error?.message ?? String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Eve did not become healthy at ${baseUrl} within ${timeoutMs}ms: ${lastError}`);
}

async function ensureEveForActorKey(address, options = {}) {
  const keyId = actorKeyId(address);
  const existing = running.get(keyId);
  if (existing) return existing.ready;

  const ready = (async () => {
    const maxAttempts = options.maxAttempts ?? 10;
    const eveRoot = options.eveRoot ?? resolveQuantflowEveRoot();
    const env = credentialEnv(options.opencodeKey);
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const port = portForKey(keyId, attempt, options);
      const baseUrl = makeBaseUrl(port);
      const child = spawnEve({
        eveRoot,
        port,
        env,
        spawnImpl: options.spawnImpl,
      });
      let stderrTail = "";
      child.stderr?.on?.("data", (chunk) => {
        stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-2000);
      });
      try {
        const { coldBootMs } = await waitForHealth(baseUrl, {
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
          intervalMs: options.intervalMs,
          child,
        });
        const entry = { keyId, baseUrl, port, child, coldBootMs, eveRoot };
        running.set(keyId, { ready: Promise.resolve(entry), entry });
        console.error(`[eve-supervisor] key=${keyId} baseUrl=${baseUrl} cold_boot_ms=${coldBootMs}`);
        return entry;
      } catch (error) {
        lastError = error;
        if (child.exitCode === null || child.exitCode === undefined) {
          child.kill?.();
        }
        if (!isPortCollision(error) && !isPortCollision({ message: stderrTail })) {
          throw new Error(`Eve failed for actor ${keyId} on ${baseUrl}: ${error.message}; stderr=${stderrTail}`);
        }
      }
    }
    throw new Error(`Eve could not allocate a port for actor ${keyId}: ${lastError?.message ?? "unknown error"}`);
  })();
  running.set(keyId, { ready, entry: null });
  try {
    return await ready;
  } catch (error) {
    running.delete(keyId);
    throw error;
  }
}

async function stopEveForActorKey(address) {
  const keyId = actorKeyId(address);
  const record = running.get(keyId);
  running.delete(keyId);
  if (!record) return;
  try {
    const entry = record.entry ?? await record.ready;
    if (entry?.child?.exitCode === null || entry?.child?.exitCode === undefined) {
      entry.child.kill?.();
    }
  } catch {
    // Best effort cleanup.
  }
}

async function stopAllEve() {
  await Promise.all([...running.keys()].map((keyId) => stopEveForActorKey({ actorKey: JSON.parse(keyId) })));
}

function _resetEveSupervisorForTests() {
  running.clear();
}

export {
  _resetEveSupervisorForTests,
  actorKeyId,
  ensureEveForActorKey,
  portForKey,
  resolveQuantflowEveRoot,
  stableHash,
  stopAllEve,
  stopEveForActorKey,
};
