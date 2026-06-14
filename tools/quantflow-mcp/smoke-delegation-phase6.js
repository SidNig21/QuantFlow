#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { withRelayToken } from "./relay-token.js";

const REQUIRED_RPC_METHODS = [
  "ping",
  "rpc.discover",
  "role.get",
  "canvas.roleSpawn",
  "canvas.terminalRead",
  "envoy.taskCreate",
  "envoy.taskList",
  "envoy.receiptList",
  "envoy.watch",
];

const RELAY_PORT = Number.parseInt(process.env.QUANTFLOW_RELAY_PORT || "9811", 10);
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.QF_PHASE6_TIMEOUT_MS || "600000",
  10,
);
const POLL_MS = Number.parseInt(process.env.QF_PHASE6_POLL_MS || "5000", 10);
const VAULT_PATH = process.env.QF_VAULT_PATH || "C:\\Users\\rybow\\Obsidian\\Cursor Collab";
const TASK_BOARD = path.join(VAULT_PATH, "Projects", "QuantFlow", "Envoy", "task-board.md");

let rpcId = 1;

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function detectRelayHosts() {
  if (process.env.QUANTFLOW_RELAY_HOST) return [process.env.QUANTFLOW_RELAY_HOST];
  const hosts = ["127.0.0.1"];
  if (os.platform() !== "linux") return hosts;
  try {
    const resolv = fs.readFileSync("/etc/resolv.conf", "utf8");
    const match = /nameserver\s+([\d.]+)/.exec(resolv);
    if (match && !hosts.includes(match[1])) hosts.push(match[1]);
  } catch {
    // Loopback is still the primary path.
  }
  return hosts;
}

const RELAY_HOSTS = detectRelayHosts();

const RPC_TIMEOUT_MS = Number.parseInt(process.env.QF_PHASE6_RPC_TIMEOUT_MS || "60000", 10);
// canvas.roleSpawn waits for pane spawn + herdr attach and can exceed the default RPC timeout.
const SLOW_RPC_TIMEOUT_MS = Number.parseInt(process.env.QF_PHASE6_SLOW_RPC_TIMEOUT_MS || "180000", 10);
const SLOW_RPC_METHODS = new Set(["canvas.roleSpawn"]);

function rpcAtHost(host, method, params = {}) {
  const timeoutMs = SLOW_RPC_METHODS.has(method) ? SLOW_RPC_TIMEOUT_MS : RPC_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: RELAY_PORT }, () => {
      socket.write(JSON.stringify({
        jsonrpc: "2.0",
        id: rpcId++,
        method,
        params: withRelayToken(params),
      }) + "\n");
    });

    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Relay timeout at ${host}:${RELAY_PORT} after ${timeoutMs}ms (${method})`));
    }, timeoutMs);

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
      errors.push(`${host}:${RELAY_PORT} ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`QuantFlow relay unavailable: ${errors.join("; ")}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, timeoutMs, fn) {
  const started = Date.now();
  let lastValue;
  while (Date.now() - started < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await wait(POLL_MS);
  }
  const detail = lastValue ? ` Last value: ${JSON.stringify(lastValue)}` : "";
  throw new Error(`Timed out waiting for ${label}.${detail}`);
}

async function requireMethods() {
  const discovered = await rpc("rpc.discover");
  const names = new Set((discovered?.methods || []).map((method) => method.name));
  const missing = REQUIRED_RPC_METHODS.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(`Missing required RPC methods: ${missing.join(", ")}`);
  }
}

function publicTaskFields(task) {
  return {
    task_id: task?.task_id,
    status: task?.status,
    source_tile_id: task?.source_tile_id,
    target_tile_id: task?.target_tile_id,
    correlation_id: task?.correlation_id,
    envoy_space_id: task?.envoy_space_id,
    title: task?.title,
    claimed_by: task?.claimed_by,
    result_summary: task?.result_summary,
  };
}

async function readTileOutput(tileId) {
  try {
    const result = await rpc("canvas.terminalRead", { tileId, lines: 240 });
    return typeof result?.output === "string" ? result.output : "";
  } catch (err) {
    return `terminal read failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function readTaskBoardSnippet(correlationId) {
  try {
    const text = fs.readFileSync(TASK_BOARD, "utf8");
    const idx = text.indexOf(correlationId);
    if (idx === -1) return "";
    return text.slice(Math.max(0, idx - 800), Math.min(text.length, idx + 1600));
  } catch {
    return "";
  }
}

async function main() {
  const stamp = Date.now().toString(36);
  const canvasId = parseArg("canvas-id", `phase6-${stamp}`);
  const correlationId = parseArg("correlation-id", `corr-phase6-${stamp}`);
  const hermesTileId = `tile-hermes-phase6-${stamp}`;
  const plannedCodexTileId = `tile-codex-worker-${stamp}`;
  const timeoutMs = Number.parseInt(parseArg("timeout-ms", String(DEFAULT_TIMEOUT_MS)), 10);

  const ping = await rpc("ping");
  if (!ping?.pong) throw new Error("Relay ping did not return { pong: true }");
  await requireMethods();

  const parentCreated = await rpc("envoy.taskCreate", {
    canvasId,
    sourceTileId: "operator",
    targetTileId: hermesTileId,
    correlationId,
    title: "delegation-phase-6 proof",
    instruction: [
      "Claim this parent task as Hermes.",
      "Then create exactly one child task via qf_task_create for a Codex worker.",
      `Use targetTileId ${plannedCodexTileId}.`,
      `Use canvasId ${canvasId}.`,
      `Reuse correlation_id ${correlationId}.`,
      "The child task should inspect BUILD_PLAN_V3.md and report the active v3 goal in one short paragraph.",
      "Spawn Codex with quantflow_role_spawn using workflowTaskId, workflowCorrelationId, and workflowEnvoySpaceId from the child task.",
      "Do not use quantflow_terminal_write or cable text for the handoff.",
      "After Codex completes, read qf_receipt_list and complete this parent task with the child task id and receipt count.",
    ].join(" "),
    acceptanceCriteria: [
      "Hermes creates a child task through qf_task_create.",
      "Codex claims the child task through qf_task_claim.",
      "Codex completes through qf_task_complete.",
      "Receipts share the parent correlation id.",
      "No terminal_write handoff is used.",
    ],
    operatorOverride: true,
  });

  const parentTask = parentCreated?.task;
  if (!parentTask?.task_id || !parentTask?.envoy_space_id) {
    throw new Error(`Parent task create failed: ${JSON.stringify(parentCreated)}`);
  }

  const hermesRole = await rpc("role.get", { id: "hermes" });
  if (!hermesRole?.id) throw new Error("Hermes role is unavailable");

  let hermesSpawn;
  try {
    hermesSpawn = await rpc("canvas.roleSpawn", {
      role: hermesRole,
      tileId: hermesTileId,
      canvasId,
      workspaceId: canvasId,
      workflowTaskId: parentTask.task_id,
      workflowCorrelationId: correlationId,
      workflowEnvoySpaceId: parentTask.envoy_space_id,
      displayName: "Hermes phase-6 proof",
      position: { x: 120, y: 120 },
      size: { width: 620, height: 520 },
    });
  } catch (err) {
    // The relay's canvas RPC times out at 60s but the spawn keeps going
    // (cold WSL/herdr start can exceed it). Confirm via tile registry
    // instead of failing the whole trial on spawn RPC latency.
    if (!/timed out|timeout/i.test(err instanceof Error ? err.message : String(err))) throw err;
    hermesSpawn = await waitFor("Hermes tile to register after roleSpawn timeout", SLOW_RPC_TIMEOUT_MS, async () => {
      const listed = await rpc("canvas.tileList");
      const tiles = Array.isArray(listed?.tiles) ? listed.tiles : [];
      const tile = tiles.find((item) => item.tileId === hermesTileId);
      return tile ? { herdrPaneId: tile.herdrPaneId, terminalTarget: tile.raw?.terminalTarget } : null;
    });
  }

  const childTask = await waitFor("Hermes qf_task_create child task", timeoutMs, async () => {
    const listed = await rpc("envoy.taskList", { correlationId, status: "all" });
    const tasks = Array.isArray(listed?.tasks) ? listed.tasks : [];
    return tasks.find((task) =>
      task.task_id !== parentTask.task_id &&
      task.source_tile_id === hermesTileId &&
      task.target_tile_id,
    );
  }).catch(async (err) => {
    err.hermesOutput = await readTileOutput(hermesTileId);
    throw err;
  });

  const doneChild = await waitFor("Codex qf_task_claim and qf_task_complete", timeoutMs, async () => {
    const listed = await rpc("envoy.taskList", { correlationId, status: "all" });
    const tasks = Array.isArray(listed?.tasks) ? listed.tasks : [];
    const current = tasks.find((task) => task.task_id === childTask.task_id);
    return current?.status === "done" && current?.claimed_by ? current : null;
  }).catch(async (err) => {
    err.hermesOutput = await readTileOutput(hermesTileId);
    err.codexOutput = childTask.target_tile_id
      ? await readTileOutput(childTask.target_tile_id)
      : "";
    throw err;
  });

  const receiptsResult = await rpc("envoy.receiptList", { correlationId });
  const receipts = Array.isArray(receiptsResult?.receipts) ? receiptsResult.receipts : [];
  const receiptKinds = receipts.map((receipt) => receipt.kind);
  const hasChildClaim = receipts.some((receipt) =>
    receipt.task_id === doneChild.task_id &&
    receipt.kind === "claim" &&
    receipt.actor_tile_id === doneChild.claimed_by,
  );
  const hasChildComplete = receipts.some((receipt) =>
    receipt.task_id === doneChild.task_id &&
    receipt.kind === "complete",
  );

  await waitFor("Obsidian task board correlation", 60000, async () => {
    return readTaskBoardSnippet(correlationId) ? true : null;
  });

  const taskBoardSnippet = readTaskBoardSnippet(correlationId);
  const hermesOutput = await readTileOutput(hermesTileId);
  const codexOutput = await readTileOutput(doneChild.target_tile_id);
  const fallbackDetected = /terminal_write|direct steering|fallback/i.test(`${hermesOutput}\n${codexOutput}`);

  const proof = {
    ok: Boolean(doneChild && hasChildClaim && hasChildComplete && taskBoardSnippet && !fallbackDetected),
    canvas_id: canvasId,
    correlation_id: correlationId,
    parent_task: publicTaskFields(parentTask),
    hermes_spawn: {
      tile_id: hermesTileId,
      herdr_pane_id: hermesSpawn?.herdrPaneId,
      terminal_target: hermesSpawn?.terminalTarget,
    },
    child_task: publicTaskFields(doneChild),
    receipt_count: receipts.length,
    receipt_kinds: receiptKinds,
    has_child_claim: hasChildClaim,
    has_child_complete: hasChildComplete,
    obsidian_task_board: TASK_BOARD,
    obsidian_contains_correlation: Boolean(taskBoardSnippet),
    fallback_detected: fallbackDetected,
  };

  console.log(JSON.stringify(proof, null, 2));
  if (!proof.ok) {
    console.error("\nHermes output:\n" + hermesOutput.slice(-4000));
    console.error("\nCodex output:\n" + codexOutput.slice(-4000));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const payload = {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    hermes_output: err?.hermesOutput ?? undefined,
    codex_output: err?.codexOutput ?? undefined,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
});
