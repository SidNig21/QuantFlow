import { afterEach, describe, expect, test } from "bun:test";
import net from "node:net";
import {
  getJsonRpcTcpAddress,
  registerMethod,
  startJsonRpcServer,
  stopJsonRpcServer,
} from "./json-rpc-server";

function rpc(
  port: number,
  method: string,
  params: unknown = {},
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: "127.0.0.1", port },
      () => {
        socket.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
          }) + "\n",
        );
      },
    );

    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("RPC request timed out"));
    }, 1000);

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) return;

      clearTimeout(timer);
      socket.end();
      try {
        resolve(JSON.parse(buffer.slice(0, newlineIdx)));
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

afterEach(() => {
  stopJsonRpcServer();
});

describe("JSON-RPC TCP relay", () => {
  test("serves registered methods over TCP", async () => {
    registerMethod(
      "test.echo",
      (params) => ({ echoed: params }),
      { description: "Echo test method" },
    );

    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
    });
    expect(info.tcp?.port).toBeGreaterThan(0);

    const response = await rpc(info.tcp!.port, "test.echo", {
      value: "hello",
    });

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { echoed: { value: "hello" } },
    });
  });

  test("returns JSON-RPC method-not-found errors over TCP", async () => {
    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
    });

    const response = await rpc(info.tcp!.port, "missing.method");

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32601,
        message: "Method not found: missing.method",
      },
    });
  });

  test("cleans up TCP server state on stop so it can restart", async () => {
    const first = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
    });
    expect(first.tcp?.port).toBeGreaterThan(0);

    stopJsonRpcServer();
    expect(getJsonRpcTcpAddress()).toBeNull();

    const second = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
    });
    expect(second.tcp?.port).toBeGreaterThan(0);
  });
});
