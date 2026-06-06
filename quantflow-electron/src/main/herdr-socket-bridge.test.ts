import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { callHerdrSocket, HerdrSocketError } from "./herdr-socket-bridge";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function socketPathForTest(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "qf-herdr-rpc-"));
  tempDirs.push(dir);
  return path.join(dir, "herdr.sock");
}

async function withSocketServer(
  handler: (socket: net.Socket) => void,
): Promise<{ socketPath: string; close: () => Promise<void> }> {
  const socketPath = socketPathForTest();
  const server = net.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    socketPath,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function onRpcLine(
  socket: net.Socket,
  handler: (request: Record<string, unknown>) => void,
): void {
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const newline = buffer.indexOf("\n");
    if (newline === -1) return;
    const line = buffer.slice(0, newline);
    handler(JSON.parse(line));
  });
}

describe("callHerdrSocket", () => {
  test("sends a newline-framed RPC request and returns the matching result", async () => {
    const seen: Record<string, unknown>[] = [];
    const server = await withSocketServer((socket) => {
      onRpcLine(socket, (request) => {
        seen.push(request);
        socket.write(JSON.stringify({
          id: request.id,
          result: { pane_id: "pane-1" },
        }) + "\n");
      });
    });

    try {
      const result = await callHerdrSocket(
        "agent.start",
        { name: "qf.canvas.hermes.tile-1" },
        { socketPath: server.socketPath, timeoutMs: 250 },
      );

      expect(result).toEqual({ pane_id: "pane-1" });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        method: "agent.start",
        params: { name: "qf.canvas.hermes.tile-1" },
      });
      expect(typeof seen[0]?.id).toBe("string");
    } finally {
      await server.close();
    }
  });

  test("ignores unrelated response ids until the matching newline frame arrives", async () => {
    const server = await withSocketServer((socket) => {
      onRpcLine(socket, (request) => {
        socket.write(JSON.stringify({
          id: "unrelated",
          result: { pane_id: "wrong" },
        }) + "\n");
        socket.write(JSON.stringify({
          id: request.id,
          result: { pane_id: "pane-2" },
        }) + "\n");
      });
    });

    try {
      await expect(callHerdrSocket(
        "pane.split",
        { agent_name: "qf.canvas.hermes.tile-1" },
        { socketPath: server.socketPath, timeoutMs: 250 },
      )).resolves.toEqual({ pane_id: "pane-2" });
    } finally {
      await server.close();
    }
  });

  test("turns herdr error envelopes into protocol errors", async () => {
    const server = await withSocketServer((socket) => {
      onRpcLine(socket, (request) => {
        socket.write(JSON.stringify({
          id: request.id,
          error: { message: "agent already exists" },
        }) + "\n");
      });
    });

    try {
      await expect(callHerdrSocket(
        "agent.start",
        { name: "qf.canvas.hermes.tile-1" },
        { socketPath: server.socketPath, timeoutMs: 250 },
      )).rejects.toMatchObject({
        name: "HerdrSocketError",
        code: "protocol",
        message: "agent already exists",
      });
    } finally {
      await server.close();
    }
  });

  test("reports a missing socket as server_down", async () => {
    const missingSocketPath = path.join(socketPathForTest(), "missing.sock");

    await expect(callHerdrSocket(
      "ping",
      {},
      { socketPath: missingSocketPath, timeoutMs: 250 },
    )).rejects.toMatchObject({
      name: "HerdrSocketError",
      code: "server_down",
    } satisfies Partial<HerdrSocketError>);
  });
});
