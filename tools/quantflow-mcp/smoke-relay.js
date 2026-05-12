#!/usr/bin/env node
import net from "node:net";
import fs from "node:fs";
import os from "node:os";

const REQUIRED_RPC_METHODS = [
  "ping",
  "canvas.tileList",
  "canvas.tileCreate",
  "canvas.tileRemove",
  "canvas.tileMove",
  "canvas.tileResize",
  "canvas.tileFocus",
  "canvas.tileRename",
  "canvas.viewportGet",
  "canvas.viewportSet",
  "canvas.terminalWrite",
  "canvas.terminalRead",
  "canvas.connectionList",
  "canvas.connectionCreate",
  "canvas.connectionRemove",
  "relay.connectionSend",
  "role.list",
  "canvas.roleSpawn",
  "context.pinFile",
  "context.inject",
  "watchtower.snapshot",
  "relay.log",
  "app.notify",
];

function detectRelayHosts() {
  if (process.env.QUANTFLOW_RELAY_HOST) return [process.env.QUANTFLOW_RELAY_HOST];
  const hosts = ["127.0.0.1"];
  if (os.platform() !== "linux") return hosts;
  try {
    const resolv = fs.readFileSync("/etc/resolv.conf", "utf8");
    const match = /nameserver\s+([\d.]+)/.exec(resolv);
    if (match && !hosts.includes(match[1])) hosts.push(match[1]);
  } catch {
    // Fall through outside WSL.
  }
  return hosts;
}

const RELAY_HOSTS = detectRelayHosts();
const RELAY_PORT = Number.parseInt(process.env.QUANTFLOW_RELAY_PORT || "9811", 10);
let rpcId = 1;

function rpcAtHost(host, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: RELAY_PORT }, () => {
      socket.write(JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method,
        params,
      }) + "\n");
    });

    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Relay timeout at ${host}:${RELAY_PORT}`));
    }, 15000);

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) return;

      clearTimeout(timer);
      socket.end();
      try {
        const message = JSON.parse(buffer.slice(0, newlineIdx));
        if (message.error) {
          reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
      } catch (err) {
        reject(err);
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function rpc(method, params = {}) {
  const errors = [];
  for (const host of RELAY_HOSTS) {
    try {
      return await rpcAtHost(host, method, params);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(errors.join("; "));
}

async function requireMethods() {
  const discovered = await rpc("rpc.discover");
  const names = new Set((discovered?.methods || []).map((method) => method.name));
  const missing = REQUIRED_RPC_METHODS.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Missing required RPC methods: ${missing.join(", ")}`);
  }
}

async function createTile(title, x, y) {
  const created = await rpc("canvas.tileCreate", {
    tileType: "term",
    position: { x, y },
    size: { width: 520, height: 440 },
  });
  const tileId = created?.tileId;
  if (!tileId) throw new Error(`Tile create returned no tileId for ${title}`);
  await rpc("canvas.tileRename", { tileId, title });
  return tileId;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTerminalSession(tileId, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const listed = await rpc("canvas.tileList");
    const tile = listed?.tiles?.find((item) => item.id === tileId);
    if (tile?.ptySessionId) return tile;
    await wait(250);
  }
  throw new Error(`Tile ${tileId} did not get an active PTY session`);
}

async function runWorkflowSmoke() {
  const createdTiles = [];
  try {
    const hermes = await createTile("Hermes", 100, 100);
    const worker = await createTile("Worker", 680, 100);
    const shell = await createTile("Shell", 1260, 100);
    createdTiles.push(hermes, worker, shell);
    await Promise.all([
      waitForTerminalSession(hermes),
      waitForTerminalSession(worker),
      waitForTerminalSession(shell),
    ]);

    const hermesToWorker = await rpc("canvas.connectionCreate", {
      tileAId: hermes,
      tileBId: worker,
      label: "delegate",
    });
    await rpc("canvas.connectionCreate", {
      tileAId: worker,
      tileBId: shell,
      label: "shell",
    });

    const relay = await rpc("relay.connectionSend", {
      connectionId: hermesToWorker.id,
      fromTileId: hermes,
      text: "Smoke check: acknowledge this delegation and stay ready.",
    });
    if (!relay?.ok) {
      throw new Error(`Relay send failed: ${relay?.message || "unknown error"}`);
    }

    await wait(1000);
    const output = await rpc("canvas.terminalRead", {
      tileId: worker,
      lines: 400,
    });
    if (typeof output?.output !== "string") {
      throw new Error("Worker terminal read did not return output text");
    }

    return { hermes, worker, shell, relay };
  } finally {
    for (const tileId of createdTiles.reverse()) {
      try {
        await rpc("canvas.tileRemove", { tileId });
      } catch {
        // Best-effort cleanup for live smoke-created tiles.
      }
    }
  }
}

async function main() {
  const runWorkflow = process.argv.includes("--workflow");
  const ping = await rpc("ping");
  if (!ping?.pong) throw new Error("Relay ping did not return { pong: true }");

  await requireMethods();

  const result = {
    ok: true,
    relayCandidates: RELAY_HOSTS.map((host) => `${host}:${RELAY_PORT}`),
    requiredMethods: REQUIRED_RPC_METHODS.length,
  };

  if (runWorkflow) {
    result.workflow = await runWorkflowSmoke();
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
