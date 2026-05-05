#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";

function detectRelayHost() {
  if (process.env.QUANTFLOW_RELAY_HOST) return process.env.QUANTFLOW_RELAY_HOST;
  if (os.platform() !== "linux") return "127.0.0.1";
  try {
    const resolv = fs.readFileSync("/etc/resolv.conf", "utf8");
    const match = /nameserver\s+([\d.]+)/.exec(resolv);
    if (match) return match[1];
  } catch {
    // Fall back to loopback outside WSL.
  }
  return "127.0.0.1";
}

const RELAY_HOST = detectRelayHost();
const RELAY_PORT = Number.parseInt(process.env.QUANTFLOW_RELAY_PORT || "9811", 10);
let rpcId = 1;

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: RELAY_HOST, port: RELAY_PORT }, () => {
      const id = rpcId++;
      socket.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`QuantFlow relay timeout at ${RELAY_HOST}:${RELAY_PORT}`));
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
