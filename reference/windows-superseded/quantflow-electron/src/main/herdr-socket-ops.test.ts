import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import {
  getPaneStatus,
  listPanes,
  readPane,
  sendToPane,
} from "./herdr-socket-ops";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function socketPathForTest(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "qf-herdr-ops-"));
  tempDirs.push(dir);
  return path.join(dir, "herdr.sock");
}

async function withSocketServer(
  handler: (socket: net.Socket, request: Record<string, unknown>) => void,
): Promise<{ socketPath: string; close: () => Promise<void> }> {
  const socketPath = socketPathForTest();
  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      handler(socket, JSON.parse(line));
    });
  });
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

function reply(socket: net.Socket, id: unknown, result: Record<string, unknown>): void {
  socket.write(JSON.stringify({ id, result }) + "\n");
}

describe("herdr-socket-ops", () => {
  test("listPanes maps pane.list results", async () => {
    const server = await withSocketServer((socket, request) => {
      expect(request.method).toBe("pane.list");
      reply(socket, request.id, {
        panes: [{
          pane_id: "pane-1",
          workspace_id: "ws-1",
          tab_id: "tab-1",
          cwd: "/tmp",
          agent_status: "idle",
          focused: false,
          revision: 1,
        }],
      });
    });
    const prev = process.env.HERDR_SOCKET_PATH;
    process.env.HERDR_SOCKET_PATH = server.socketPath;
    try {
      const panes = await listPanes();
      expect(panes).toEqual([{
        pane_id: "pane-1",
        workspace_id: "ws-1",
        tab_id: "tab-1",
        cwd: "/tmp",
        agent_status: "idle",
        focused: false,
        revision: 1,
      }]);
    } finally {
      if (prev === undefined) delete process.env.HERDR_SOCKET_PATH;
      else process.env.HERDR_SOCKET_PATH = prev;
      await server.close();
    }
  });

  test("readPane returns visible text from pane.read", async () => {
    const server = await withSocketServer((socket, request) => {
      expect(request.method).toBe("pane.read");
      reply(socket, request.id, { text: "hello pane" });
    });
    const prev = process.env.HERDR_SOCKET_PATH;
    process.env.HERDR_SOCKET_PATH = server.socketPath;
    try {
      await expect(readPane("pane-1", 20)).resolves.toBe("hello pane");
    } finally {
      if (prev === undefined) delete process.env.HERDR_SOCKET_PATH;
      else process.env.HERDR_SOCKET_PATH = prev;
      await server.close();
    }
  });

  test("sendToPane uses send_text then send_keys Enter", async () => {
    const methods: string[] = [];
    const server = await withSocketServer((socket, request) => {
      methods.push(String(request.method));
      reply(socket, request.id, { ok: true });
    });
    const prev = process.env.HERDR_SOCKET_PATH;
    process.env.HERDR_SOCKET_PATH = server.socketPath;
    try {
      await sendToPane("pane-1", "codex");
      expect(methods).toEqual(["pane.send_text", "pane.send_keys"]);
    } finally {
      if (prev === undefined) delete process.env.HERDR_SOCKET_PATH;
      else process.env.HERDR_SOCKET_PATH = prev;
      await server.close();
    }
  });

  test("getPaneStatus reads agent_status from pane.get", async () => {
    const server = await withSocketServer((socket, request) => {
      expect(request.method).toBe("pane.get");
      reply(socket, request.id, {
        pane: { pane_id: "pane-1", agent_status: "working" },
      });
    });
    const prev = process.env.HERDR_SOCKET_PATH;
    process.env.HERDR_SOCKET_PATH = server.socketPath;
    try {
      await expect(getPaneStatus("pane-1")).resolves.toBe("working");
    } finally {
      if (prev === undefined) delete process.env.HERDR_SOCKET_PATH;
      else process.env.HERDR_SOCKET_PATH = prev;
      await server.close();
    }
  });
});
