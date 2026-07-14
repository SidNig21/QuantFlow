import { afterEach, describe, expect, test } from "bun:test";
import net from "node:net";
import {
  getJsonRpcTcpAddress,
  registerMethod,
  startJsonRpcServer,
  stopJsonRpcServer,
} from "./json-rpc-server";
import { RELAY_UNAUTHORIZED_CODE } from "./relay-auth";

const TEST_TOKEN = "test-relay-token";

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

function rpcSocket(
  socketPath: string,
  method: string,
  params: unknown = {},
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath, () => {
      socket.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params,
        }) + "\n",
      );
    });

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
  test("defaults to loopback TCP bind", async () => {
    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });
    expect(info.tcp?.host).toBe("127.0.0.1");
  });

  test("rejects TCP requests without a relay token", async () => {
    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });

    const response = await rpc(info.tcp!.port, "rpc.discover");

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: RELAY_UNAUTHORIZED_CODE,
        message: "Unauthorized relay token",
      },
    });
  });

  test("rejects TCP requests with the wrong relay token", async () => {
    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });

    const response = await rpc(info.tcp!.port, "rpc.discover", {
      token: "wrong-token",
    });

    expect(response).toMatchObject({
      error: {
        code: RELAY_UNAUTHORIZED_CODE,
        message: "Unauthorized relay token",
      },
    });
  });

  test("serves registered methods over TCP with a valid token", async () => {
    registerMethod(
      "test.echo",
      (params) => ({ echoed: params }),
      { description: "Echo test method" },
    );

    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });
    expect(info.tcp?.port).toBeGreaterThan(0);

    const response = await rpc(info.tcp!.port, "test.echo", {
      token: TEST_TOKEN,
      value: "hello",
    });

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { echoed: { value: "hello" } },
    });
  });

  test("does not pass relay token to method handlers", async () => {
    registerMethod(
      "test.capture",
      (params) => params,
      { description: "Capture params" },
    );

    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });

    const response = await rpc(info.tcp!.port, "test.capture", {
      token: TEST_TOKEN,
      value: "visible",
    });

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { value: "visible" },
    });
  });

  test("returns JSON-RPC method-not-found errors over TCP", async () => {
    const info = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });

    const response = await rpc(info.tcp!.port, "missing.method", {
      token: TEST_TOKEN,
    });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32601,
        message: "Method not found: missing.method",
      },
    });
  });

  test("unix socket accepts requests without a relay token", async () => {
    registerMethod(
      "test.socket",
      () => ({ socket: true }),
      { description: "Socket test method" },
    );

    const info = await startJsonRpcServer({
      enableSocket: true,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });
    expect(info.socketPath).toBeTruthy();

    const response = await rpcSocket(info.socketPath!, "test.socket");

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { socket: true },
    });
  });

  test("cleans up TCP server state on stop so it can restart", async () => {
    const first = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });
    expect(first.tcp?.port).toBeGreaterThan(0);

    stopJsonRpcServer();
    expect(getJsonRpcTcpAddress()).toBeNull();

    const second = await startJsonRpcServer({
      enableSocket: false,
      tcpPort: 0,
      relayToken: TEST_TOKEN,
    });
    expect(second.tcp?.port).toBeGreaterThan(0);
  });
});
