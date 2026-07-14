import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { HerdrEventSubscriber } from "./herdr-event-subscriber";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function socketPathForTest(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "qf-herdr-sub-"));
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

describe("HerdrEventSubscriber", () => {
  test("subscribes and forwards pushed herdr events", async () => {
    const server = await withSocketServer((socket) => {
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        if (!buffer.includes("\n")) return;
        socket.write(JSON.stringify({
          id: "qf-events-subscribe",
          result: { type: "subscription_ack" },
        }) + "\n");
        socket.write(JSON.stringify({
          event: {
            type: "pane.agent_status_changed",
            pane_id: "pane-1",
            agent_status: "working",
            previous_agent_status: "idle",
          },
        }) + "\n");
      });
    });

    const subscriber = new HerdrEventSubscriber({
      socketPath: server.socketPath,
      platform: "linux",
      initialBackoffMs: 50,
      maxBackoffMs: 100,
    });
    const seen: Record<string, unknown>[] = [];
    subscriber.onLine((line) => seen.push(line));

    try {
      await subscriber.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(subscriber.isConnected()).toBe(true);
      expect(seen.some((line) => line.event)).toBe(true);
    } finally {
      subscriber.stop();
      await server.close();
    }
  });

  test("reconnects after the socket closes", async () => {
    let connections = 0;
    const server = await withSocketServer((socket) => {
      connections += 1;
      socket.on("data", () => {
        socket.write(JSON.stringify({
          id: "qf-events-subscribe",
          result: { type: "subscription_ack" },
        }) + "\n");
        if (connections === 1) {
          socket.end();
        }
      });
    });

    const subscriber = new HerdrEventSubscriber({
      socketPath: server.socketPath,
      platform: "linux",
      initialBackoffMs: 30,
      maxBackoffMs: 60,
    });

    try {
      await subscriber.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(connections).toBeGreaterThanOrEqual(2);
    } finally {
      subscriber.stop();
      await server.close();
    }
  });

  test("stop prevents further reconnect attempts", async () => {
    const server = await withSocketServer((socket) => {
      socket.on("data", () => {
        socket.write(JSON.stringify({
          id: "qf-events-subscribe",
          result: { type: "subscription_ack" },
        }) + "\n");
        socket.end();
      });
    });

    const subscriber = new HerdrEventSubscriber({
      socketPath: server.socketPath,
      platform: "linux",
      initialBackoffMs: 500,
      maxBackoffMs: 500,
    });

    try {
      await subscriber.start();
      subscriber.stop();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(subscriber.isConnected()).toBe(false);
    } finally {
      await server.close();
    }
  });
});
