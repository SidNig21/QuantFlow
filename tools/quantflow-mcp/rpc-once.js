#!/usr/bin/env node
import net from "node:net";

const [, , method, encodedParams = "e30="] = process.argv;
const params = JSON.parse(Buffer.from(encodedParams, "base64").toString("utf8"));
const relayHost = process.env.QUANTFLOW_RELAY_HOST || "127.0.0.1";
const relayPort = Number.parseInt(process.env.QUANTFLOW_RELAY_PORT || "9811", 10);

function rpc(methodName, rpcParams) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: relayHost, port: relayPort }, () => {
      socket.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: methodName, params: rpcParams }) + "\n");
    });

    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`QuantFlow relay timeout at ${relayHost}:${relayPort}`));
    }, 15000);

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) return;

      clearTimeout(timer);
      socket.end();
      const message = JSON.parse(buffer.slice(0, newlineIdx));
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

try {
  const result = await rpc(method, params);
  console.log(JSON.stringify({ ok: true, result }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exitCode = 1;
}
