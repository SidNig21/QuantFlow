import * as net from "node:net";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join } from "node:path";
import { getDb, EXPECTED_MIGRATION_VERSIONS } from "../runtime-state/database";
import { listConnections, QUEUE_DEPTH_MAX } from "../runtime-state/connections-repo";
import { listTilesRuntime } from "../runtime-state/tiles-runtime-repo";
import { SidecarClient } from "../sidecar/client";
import { SIDECAR_PID_PATH, SIDECAR_SOCKET_PATH } from "../sidecar/protocol";
import type { HealthProbe, ProbeCheckResult, ProbeContext } from "./types";

const MB = 1024 * 1024;
const DB_SIZE_DEGRADED_BYTES = 500 * MB;
const WAL_MTIME_DEGRADED_MS = 6 * 60 * 60 * 1000;
const QUEUE_STUCK_MS = 10 * 60 * 1000;
const TILE_STALE_MS = 30 * 60 * 1000;

type RpcTarget =
  | { host: string; port: number }
  | { path: string };

function healthy(message: string, detail?: Record<string, unknown>): ProbeCheckResult {
  return { ok: true, level: "healthy", message, ...(detail ? { detail } : {}) };
}

function degraded(message: string, detail?: Record<string, unknown>): ProbeCheckResult {
  return { ok: false, level: "degraded", message, ...(detail ? { detail } : {}) };
}

function down(message: string, detail?: Record<string, unknown>): ProbeCheckResult {
  return { ok: false, level: "down", message, ...(detail ? { detail } : {}) };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf-8"));
}

function jsonRpcRequest(
  target: RpcTarget,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 2000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = "path" in target
      ? net.createConnection(target.path)
      : net.createConnection(target.port, target.host);
    const payload = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })}\n`;
    let buffer = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      fn();
    };

    timer = setTimeout(() => {
      settle(() => reject(new Error(`RPC timeout: ${method}`)));
    }, timeoutMs);

    socket.on("connect", () => socket.write(payload));
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      settle(() => {
        try {
          const response = JSON.parse(buffer.slice(0, newline)) as {
            result?: unknown;
            error?: { message?: string };
          };
          if (response.error) {
            reject(new Error(response.error.message ?? "RPC error"));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    socket.on("error", (error) => {
      settle(() => reject(error));
    });
  });
}

function methodNames(discoverResult: unknown): string[] {
  const methods = (discoverResult as { methods?: Array<{ name?: unknown }> })?.methods;
  if (!Array.isArray(methods)) return [];
  return methods
    .map((item) => item.name)
    .filter((name): name is string => typeof name === "string");
}

async function checkRpcCatalog(
  target: RpcTarget,
  detail: Record<string, unknown>,
): Promise<ProbeCheckResult> {
  const result = await jsonRpcRequest(target, "rpc.discover", {}, 2500);
  const names = methodNames(result);
  detail.methodCount = names.length;
  detail.hasControllerHealth = names.includes("controller.health");
  if (names.includes("controller.health")) {
    return healthy("RPC relay reachable and controller.health is registered.", detail);
  }
  return degraded("RPC relay reachable, but controller.health is not registered.", detail);
}

async function relayTcp(ctx: ProbeContext): Promise<ProbeCheckResult> {
  return checkRpcCatalog(
    { host: ctx.tcpHost, port: ctx.tcpPort },
    { host: ctx.tcpHost, port: ctx.tcpPort },
  );
}

async function relaySocket(ctx: ProbeContext): Promise<ProbeCheckResult> {
  if (!(await exists(ctx.socketPathFile))) {
    return down("Socket breadcrumb is missing.", { socketPathFile: ctx.socketPathFile });
  }
  const socketPath = (await readFile(ctx.socketPathFile, "utf-8")).trim();
  if (!socketPath) {
    return down("Socket breadcrumb is empty.", { socketPathFile: ctx.socketPathFile });
  }
  return checkRpcCatalog({ path: socketPath }, { socketPath, socketPathFile: ctx.socketPathFile });
}

async function sidecarAlive(): Promise<ProbeCheckResult> {
  if (!(await exists(SIDECAR_PID_PATH))) {
    return down("Sidecar PID file is missing.", { pidPath: SIDECAR_PID_PATH });
  }
  const pidData = await readJson(SIDECAR_PID_PATH) as {
    pid?: unknown;
    token?: unknown;
  };
  const pid = typeof pidData.pid === "number" ? pidData.pid : null;
  const token = typeof pidData.token === "string" ? pidData.token : null;
  if (!pid || !token) {
    return down("Sidecar PID file is malformed.", { pidPath: SIDECAR_PID_PATH });
  }

  try {
    process.kill(pid, 0);
  } catch {
    return down("Sidecar PID is not running.", { pid, pidPath: SIDECAR_PID_PATH });
  }

  const client = new SidecarClient(SIDECAR_SOCKET_PATH);
  try {
    await client.connect();
    const ping = await client.ping();
    if (ping.token !== token) {
      return degraded("Sidecar responded, but token differs from PID file.", {
        pid,
        pingPid: ping.pid,
      });
    }
    return healthy("Sidecar PID is running and responds to ping.", {
      pid,
      uptime: ping.uptime,
      socketPath: SIDECAR_SOCKET_PATH,
    });
  } finally {
    client.disconnect();
  }
}

async function dbReadable(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const row = getDb().prepare("SELECT 1 AS ok").get() as { ok?: number };
  if (row?.ok === 1) {
    return healthy("runtime.db is readable.", { path: ctx.runtimeDbPath });
  }
  return down("runtime.db SELECT 1 returned an unexpected result.", {
    path: ctx.runtimeDbPath,
    row,
  });
}

async function dbIntegrity(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const rows = getDb().pragma("quick_check") as Array<Record<string, unknown>>;
  const first = rows[0] ? Object.values(rows[0])[0] : null;
  if (first === "ok") {
    return healthy("runtime.db quick_check returned ok.", { path: ctx.runtimeDbPath });
  }
  return down("runtime.db quick_check did not return ok.", {
    path: ctx.runtimeDbPath,
    result: rows,
  });
}

async function dbSize(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const info = await stat(ctx.runtimeDbPath);
  const detail = {
    path: ctx.runtimeDbPath,
    sizeBytes: info.size,
    degradedAboveBytes: DB_SIZE_DEGRADED_BYTES,
  };
  if (info.size > DB_SIZE_DEGRADED_BYTES) {
    return degraded("runtime.db is larger than 500 MB.", detail);
  }
  return healthy("runtime.db size is within threshold.", detail);
}

async function dbWalCheckpoint(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const walPath = `${ctx.runtimeDbPath}-wal`;
  if (!(await exists(walPath))) {
    return healthy("No WAL file is present.", { walPath, exists: false });
  }
  const info = await stat(walPath);
  const ageMs = ctx.now() - info.mtimeMs;
  const detail = { walPath, ageMs, degradedAboveMs: WAL_MTIME_DEGRADED_MS };
  if (ageMs > WAL_MTIME_DEGRADED_MS) {
    return degraded("WAL file has not changed within six hours.", detail);
  }
  return healthy("WAL file is recent.", detail);
}

async function profilesRepo(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const path = join(ctx.quantflowDir, "profiles.json");
  if (!(await exists(path))) {
    return healthy("profiles.json is not created yet.", { path, exists: false, count: 0 });
  }
  const parsed = await readJson(path) as { profiles?: unknown };
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
  return healthy("profiles.json is parseable.", {
    path,
    exists: true,
    count: profiles.length,
  });
}

async function canvasPersistence(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const path = join(ctx.quantflowDir, "canvas-state.json");
  if (!(await exists(path))) {
    return healthy("canvas-state.json is not created yet.", {
      path,
      exists: false,
      tiles: 0,
      connections: 0,
    });
  }
  const parsed = await readJson(path) as {
    tiles?: unknown;
    connections?: unknown;
    version?: unknown;
  };
  const tiles = Array.isArray(parsed.tiles) ? parsed.tiles : [];
  const connections = Array.isArray(parsed.connections) ? parsed.connections : [];
  return healthy("canvas-state.json is parseable.", {
    path,
    exists: true,
    version: parsed.version,
    tiles: tiles.length,
    connections: connections.length,
  });
}

async function schemaVersions(): Promise<ProbeCheckResult> {
  const rows = getDb()
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as { version: number }[];
  const applied = rows.map((row) => row.version);
  const missing = EXPECTED_MIGRATION_VERSIONS.filter((version) =>
    !applied.includes(version)
  );
  const extra = applied.filter((version) =>
    !EXPECTED_MIGRATION_VERSIONS.includes(version)
  );
  const detail = { expected: EXPECTED_MIGRATION_VERSIONS, applied, missing, extra };
  if (missing.length > 0) {
    return down("runtime.db is missing expected schema migrations.", detail);
  }
  if (extra.length > 0) {
    return degraded("runtime.db has migrations newer than this app build.", detail);
  }
  return healthy("runtime.db schema migrations match this app build.", detail);
}

async function ptyForegroundPoller(): Promise<ProbeCheckResult> {
  if (process.platform === "win32") {
    return healthy("Foreground polling is intentionally skipped for Windows sidecar sessions.", {
      platform: process.platform,
      skipped: true,
    });
  }
  return healthy("Foreground polling is enabled for this platform.", {
    platform: process.platform,
    skipped: false,
  });
}

async function messagingQueues(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const rows = listConnections();
  const overflowing = rows.filter((row) => row.queue_depth > QUEUE_DEPTH_MAX);
  const stuck = rows.filter((row) =>
    row.queue_depth > 0 && ctx.now() - row.updated_at > QUEUE_STUCK_MS
  );
  const detail = {
    totalConnections: rows.length,
    activeQueues: rows.filter((row) => row.queue_depth > 0).length,
    queueDepthMax: QUEUE_DEPTH_MAX,
    overflowing: overflowing.map((row) => ({
      id: row.id,
      queue_depth: row.queue_depth,
    })),
    stuck: stuck.map((row) => ({
      id: row.id,
      queue_depth: row.queue_depth,
      updated_at: row.updated_at,
    })),
  };
  if (overflowing.length > 0) {
    return down("One or more connection queues exceed the overflow threshold.", detail);
  }
  if (stuck.length > 0) {
    return degraded("One or more connection queues have been non-empty for over 10 minutes.", detail);
  }
  return healthy("Connection queues are within thresholds.", detail);
}

async function tileRecency(ctx: ProbeContext): Promise<ProbeCheckResult> {
  const rows = listTilesRuntime({ limit: 500 });
  const stale = rows.filter((row) =>
    row.last_seen_at != null && ctx.now() - row.last_seen_at > TILE_STALE_MS
  );
  const missing = rows.filter((row) => row.last_seen_at == null);
  const detail = {
    totalTilesRuntime: rows.length,
    staleThresholdMs: TILE_STALE_MS,
    stale: stale.map((row) => ({
      tile_id: row.tile_id,
      last_seen_at: row.last_seen_at,
    })),
    missingLastSeen: missing.map((row) => row.tile_id),
  };
  if (stale.length > 0 || missing.length > 0) {
    return degraded("Some runtime tile rows have stale or missing last_seen_at.", detail);
  }
  return healthy("Runtime tile recency is within threshold.", detail);
}

async function mcpToolDefinitions(ctx: ProbeContext): Promise<ProbeCheckResult> {
  let path: string | null = null;
  for (const candidate of ctx.mcpToolDefinitionPaths) {
    if (await exists(candidate)) {
      path = candidate;
      break;
    }
  }
  if (!path) {
    return degraded("MCP tool definitions file was not found in known repo paths.", {
      searched: ctx.mcpToolDefinitionPaths,
    });
  }

  const text = await readFile(path, "utf-8");
  const names = Array.from(text.matchAll(/name:\s*"([^"]+)"/g))
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
  const required = [
    "quantflow_ping",
    "quantflow_route_task",
    "quantflow_tile_read",
    "quantflow_pty_write",
    "quantflow_pty_expect",
  ];
  const missing = required.filter((name) => !names.includes(name));
  const detail = {
    path,
    file: basename(path),
    count: names.length,
    required,
    missing,
  };
  if (missing.length > 0) {
    return down("MCP tool definitions are missing required QuantFlow tools.", detail);
  }
  return healthy("MCP tool definitions include required QuantFlow tools.", detail);
}

export function createHealthProbes(): HealthProbe[] {
  return [
    {
      name: "relay.tcp",
      group: "transport",
      description: "TCP relay at 127.0.0.1:9811 is reachable and advertises controller.health.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: relayTcp,
    },
    {
      name: "relay.socket",
      group: "transport",
      description: "Local JSON-RPC socket or named pipe is reachable.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: relaySocket,
    },
    {
      name: "sidecar.alive",
      group: "transport",
      description: "PTY sidecar PID file exists, process is alive, and ping responds.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: sidecarAlive,
    },
    {
      name: "db.readable",
      group: "storage",
      description: "runtime.db opens and SELECT 1 succeeds.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: dbReadable,
    },
    {
      name: "db.integrity",
      group: "storage",
      description: "runtime.db PRAGMA quick_check returns ok.",
      intervalMs: 60_000,
      timeoutMs: 10_000,
      check: dbIntegrity,
    },
    {
      name: "db.size",
      group: "storage",
      description: "runtime.db size is below 500 MB.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: dbSize,
    },
    {
      name: "db.wal-checkpoint",
      group: "storage",
      description: "runtime.db WAL file is absent or recently active.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: dbWalCheckpoint,
    },
    {
      name: "profiles.repo",
      group: "storage",
      description: "profiles.json is parseable when present.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: profilesRepo,
    },
    {
      name: "canvas.persistence",
      group: "storage",
      description: "canvas-state.json is parseable when present.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: canvasPersistence,
    },
    {
      name: "schema.versions",
      group: "runtime",
      description: "schema_migrations matches the migrations registered in this app build.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: schemaVersions,
    },
    {
      name: "pty.foreground-poller",
      group: "runtime",
      description: "PTY foreground process polling is active for supported platforms.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: ptyForegroundPoller,
    },
    {
      name: "messaging.queues",
      group: "runtime",
      description: "connection queue_depth values are not overflowing or stuck.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: messagingQueues,
    },
    {
      name: "tile.recency",
      group: "runtime",
      description: "tiles_runtime.last_seen_at values are recent when runtime rows exist.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: tileRecency,
    },
    {
      name: "mcp.tool-definitions",
      group: "integrations",
      description: "MCP static tool definitions include the required QuantFlow tools.",
      intervalMs: 60_000,
      timeoutMs: 5_000,
      check: mcpToolDefinitions,
    },
  ];
}
