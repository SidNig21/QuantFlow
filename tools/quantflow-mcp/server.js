#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import { withRelayToken } from "./relay-token.js";

const execFileAsync = promisify(execFile);
const RPC_ONCE_SCRIPT = fileURLToPath(new URL("./rpc-once.js", import.meta.url));

function detectRelayHosts() {
  if (process.env.QUANTFLOW_RELAY_HOST) return [process.env.QUANTFLOW_RELAY_HOST];
  const hosts = ["127.0.0.1"];
  if (os.platform() !== "linux") return hosts;

  // On WSL2, 127.0.0.1 works with mirrored networking. Classic WSL2 needs the
  // Windows host gateway from /etc/resolv.conf. Try both so Hermes does not get
  // stuck on one networking mode.
  try {
    const resolv = fs.readFileSync("/etc/resolv.conf", "utf8");
    const match = /nameserver\s+([\d.]+)/.exec(resolv);
    if (match && !hosts.includes(match[1])) hosts.push(match[1]);
  } catch {
    // Fall back to loopback if resolv.conf unreadable.
  }
  return hosts;
}

function toWindowsPath(path) {
  const normalized = path.replaceAll("\\", "/");
  const match = /^\/mnt\/([a-z])\/(.+)$/i.exec(normalized);
  if (!match) return path;
  return `${match[1].toUpperCase()}:\\${match[2].replaceAll("/", "\\")}`;
}

const RELAY_PORT = Number.parseInt(process.env.QUANTFLOW_RELAY_PORT || "9811", 10);
const RELAY_HOSTS = detectRelayHosts();
let rpcId = 1;

function rpcAtHost(host, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: RELAY_PORT }, () => {
      const id = rpcId++;
      socket.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params: withRelayToken(params) }) + "\n",
      );
    });

    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`QuantFlow relay timeout at ${host}:${RELAY_PORT}`));
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

async function rpcViaWindowsNode(method, params = {}) {
  const encodedParams = Buffer.from(JSON.stringify(params), "utf8").toString("base64");
  const scriptPath = toWindowsPath(RPC_ONCE_SCRIPT);
  const { stdout } = await execFileAsync(
    "cmd.exe",
    ["/c", "node", scriptPath, method, encodedParams],
    { timeout: 20000 },
  );
  const payload = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) || "{}");
  if (!payload.ok) throw new Error(payload.error || "Windows relay proxy failed");
  return payload.result;
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
  if (os.platform() === "linux") {
    try {
      return await rpcViaWindowsNode(method, params);
    } catch (err) {
      errors.push(`windows-node-proxy ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`QuantFlow relay unavailable: ${errors.join("; ")}`);
}

function toZodField(field) {
  let schema;
  if (field.kind === "number") {
    schema = z.number();
  } else if (field.kind === "stringArray") {
    schema = z.array(z.string());
  } else if (field.kind === "enum") {
    schema = z.enum(field.values);
  } else {
    schema = z.string();
  }

  if (field.default !== undefined) schema = schema.default(field.default);
  if (field.optional) schema = schema.optional();
  return schema;
}

function toZodShape(schema) {
  return Object.fromEntries(
    Object.entries(schema || {}).map(([key, field]) => [key, toZodField(field)]),
  );
}

const server = new McpServer({
  name: "quantflow",
  version: "1.0.0",
});

for (const tool of TOOL_DEFINITIONS) {
  server.tool(
    tool.name,
    tool.description,
    toZodShape(tool.schema),
    async (params) => tool.handle(rpc)(params),
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
