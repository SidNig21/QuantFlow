import { spawn as defaultSpawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT_BASE = 3010;
const DEFAULT_PORT_RANGE = 900;
const DEFAULT_HEALTH_TIMEOUT_MS = 90_000;

const running = new Map();

// Warm pool (size 1): one Eve instance boots ahead of demand so a new tile
// adopts it instantly instead of paying the ~30s cold boot. Each warm
// generation gets a nonce key so its port hash never collides with the
// still-listening instance a previous generation was adopted into.
let warmRecord = null; // { keyId, ready, entry, startedAt }
let warmGeneration = 0;

function warmPoolEnabled() {
  return (process.env.EVE_WARM_POOL ?? "1") !== "0";
}

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

function getKeyIdForPort(port) {
  const requested = Number(port);
  if (!Number.isFinite(requested)) return null;
  for (const [keyId, record] of running) {
    if (record?.entry?.port === requested) return keyId;
  }
  return null;
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
  // `eve start` (production server, requires a prior `eve build`): unlike
  // `eve dev` it has no single-instance dev lock, so the warm pool and
  // multi-spawn can run concurrent Eves from one workspace. Each instance
  // gets its own workflow-world data dir to avoid journal races.
  const child = spawnImpl(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "start"],
    {
      cwd: eveRoot,
      env: {
        ...process.env,
        ...env,
        PORT: String(port),
        EVE_PORT: String(port),
        QF_HOST_URL: `http://127.0.0.1:${process.env.AGENTOS_HOST_PORT ?? process.env.QF_AGENTOS_PORT ?? 7430}`,
        WORKFLOW_LOCAL_DATA_DIR: `/tmp/eve-workflow-data-${port}`,
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

async function bootEve(keyId, options = {}) {
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
      return { keyId, baseUrl, port, child, coldBootMs, eveRoot };
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
}

function prewarmEve(options = {}) {
  if (!warmPoolEnabled()) return null;
  if (warmRecord) return warmRecord.ready;
  warmGeneration += 1;
  const keyId = `__warm__:${warmGeneration}`;
  const startedAt = Date.now();
  const record = { keyId, entry: null, startedAt, options };
  record.ready = (async () => {
    const entry = await bootEve(keyId, options);
    record.entry = entry;
    console.error(`[eve-supervisor] warm instance ready key=${keyId} baseUrl=${entry.baseUrl} cold_boot_ms=${entry.coldBootMs}`);
    return entry;
  })();
  record.ready.catch(() => {
    if (warmRecord === record) warmRecord = null;
  });
  warmRecord = record;
  return record.ready;
}

async function adoptWarmEve(keyId) {
  const record = warmRecord;
  if (!record) return null;
  warmRecord = null;
  const adoptStartedAt = Date.now();
  try {
    const warmEntry = await record.ready;
    const warmWaitMs = Date.now() - adoptStartedAt;
    const entry = { ...warmEntry, keyId, adopted: true };
    console.error(`[eve-supervisor] key=${keyId} adopted warm instance warm_wait_ms=${warmWaitMs}`);
    // Replace the pool for the next spawn, mirroring the adopted boot config.
    prewarmEve(record.options);
    return entry;
  } catch {
    // Warm boot failed — caller falls back to the cold path.
    return null;
  }
}

async function ensureEveForActorKey(address, options = {}) {
  const keyId = actorKeyId(address);
  const existing = running.get(keyId);
  if (existing) return existing.ready;

  const ready = (async () => {
    if (warmPoolEnabled()) {
      const adopted = await adoptWarmEve(keyId);
      if (adopted) {
        running.set(keyId, { ready: Promise.resolve(adopted), entry: adopted });
        return adopted;
      }
    }
    const entry = await bootEve(keyId, options);
    running.set(keyId, { ready: Promise.resolve(entry), entry });
    console.error(`[eve-supervisor] key=${keyId} baseUrl=${entry.baseUrl} cold_boot_ms=${entry.coldBootMs}`);
    return entry;
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

async function stopWarmEve() {
  const record = warmRecord;
  warmRecord = null;
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
  await Promise.all([
    stopWarmEve(),
    ...[...running.keys()].map((keyId) => stopEveForActorKey({ actorKey: JSON.parse(keyId) })),
  ]);
}

function _resetEveSupervisorForTests() {
  running.clear();
  warmRecord = null;
  warmGeneration = 0;
}

export {
  _resetEveSupervisorForTests,
  actorKeyId,
  ensureEveForActorKey,
  getKeyIdForPort,
  portForKey,
  prewarmEve,
  resolveQuantflowEveRoot,
  stableHash,
  stopAllEve,
  stopEveForActorKey,
  stopWarmEve,
};
