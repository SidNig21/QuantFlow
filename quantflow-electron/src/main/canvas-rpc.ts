import { ipcMain, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { registerMethod } from "./json-rpc-server";
import { dispatchKernelCommand } from "@qf-kernel/commands/index";
import { subscribeWebContents } from "@qf-kernel/events/index";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingRequest>();
const REQUEST_TIMEOUT_MS = 60_000;

let shellWindow: BrowserWindow | null = null;

function sendToShell(
  method: string,
  params: unknown,
): Promise<unknown> {
  if (!shellWindow || shellWindow.isDestroyed()) {
    return Promise.reject(new Error("Shell window not available"));
  }

  const requestId = randomUUID();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`canvas RPC timed out: ${method}`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timer });

    shellWindow!.webContents.send("canvas:rpc-request", {
      requestId,
      method: method.replace(/^canvas\./, ""),
      params,
    });
  });
}

export function registerCanvasRpc(win: BrowserWindow): void {
  shellWindow = win;
  subscribeWebContents(win.webContents);

  ipcMain.on(
    "canvas:rpc-response",
    (_event, response: {
      requestId: string;
      result?: unknown;
      error?: { code: number; message: string };
    }) => {
      const entry = pending.get(response.requestId);
      if (!entry) return;

      pending.delete(response.requestId);
      clearTimeout(entry.timer);

      if (response.error) {
        entry.reject(new Error(response.error.message));
      } else {
        entry.resolve(response.result);
      }
    },
  );

  registerMethod(
    "canvas.tileList",
    (params) => sendToShell("canvas.tileList", params),
    {
      description: "List all canvas tiles with positions",
      params: {},
    },
  );

  registerMethod(
    "canvas.tileCreate",
    async (params) => {
      // Renderer creates the tile first so we capture its assigned ID.
      const result = await sendToShell("canvas.tileCreate", params) as Record<string, unknown> | null;
      const tileId = (result?.['tileId'] ?? result?.['id']) as string | undefined;
      if (!tileId) return result; // renderer returned no ID — no Kernel record

      // Kernel write gate: must accept before this RPC call is treated as successful.
      const p = params as Record<string, unknown>;
      const pos = p['position'] as Record<string, number> | undefined;
      const size = p['size'] as Record<string, number> | undefined;
      const kernelResult = await dispatchKernelCommand('kernel.tile.create', {
        id: tileId,
        displayName: String(result['displayName'] ?? result['type'] ?? p['type'] ?? 'tile'),
        tileKind: 'worker',
        x: pos?.['x'] ?? 0,
        y: pos?.['y'] ?? 0,
        width: size?.['width'] ?? 320,
        height: size?.['height'] ?? 240,
      }, 'canvas-rpc');

      if (!kernelResult.ok) {
        // Kernel rejected — roll back the provisional renderer tile.
        await sendToShell('canvas.tileRemove', { tileId }).catch(() => undefined);
        throw new Error(`Kernel rejected tile.create: ${kernelResult.error}`);
      }

      return result;
    },
    {
      description: "Create a new tile on the canvas",
      params: {
        type: "Tile type (note, code, image, graph, terminal)",
        filePath: "(optional) Absolute path to file",
        folderPath: "(optional) Absolute path to folder",
        position: "(optional) {x, y} canvas coordinates",
        size: "(optional) {width, height} in pixels",
      },
    },
  );

  registerMethod(
    "canvas.roleSpawn",
    (params) => sendToShell("canvas.roleSpawn", params),
    {
      description: "Spawn a terminal tile from a QuantFlow role",
      params: {
        role: "Role object returned by role.get",
        cwd: "(optional) Working directory for the terminal",
        position: "(optional) {x, y} canvas coordinates",
        size: "(optional) {width, height} in pixels",
      },
    },
  );

  registerMethod(
    "canvas.tileRemove",
    async (params) => {
      const p = params as Record<string, unknown>;
      const tileId = p['tileId'] as string | undefined;

      // Kernel write gate — removes record before visual removal.
      if (tileId) {
        const kernelResult = await dispatchKernelCommand('kernel.tile.remove', { id: tileId }, 'canvas-rpc');
        if (!kernelResult.ok) {
          throw new Error(`Kernel rejected tile.remove: ${kernelResult.error}`);
        }
      }

      // Canvas visual removal.
      return sendToShell('canvas.tileRemove', params);
    },
    {
      description: "Remove a tile from the canvas",
      params: { tileId: "ID of the tile to remove" },
    },
  );

  registerMethod(
    "canvas.tileMove",
    async (params) => {
      const p = params as Record<string, unknown>;
      const pos = p['position'] as Record<string, number> | undefined;
      const tileId = p['tileId'] as string | undefined;

      // Kernel write gate — writes new position before visual update.
      if (tileId && pos) {
        const kernelResult = await dispatchKernelCommand('kernel.tile.move', {
          id: tileId,
          x: pos['x'] ?? 0,
          y: pos['y'] ?? 0,
        }, 'canvas-rpc');
        if (!kernelResult.ok) {
          throw new Error(`Kernel rejected tile.move: ${kernelResult.error}`);
        }
      }

      // Canvas visual update.
      return sendToShell('canvas.tileMove', params);
    },
    {
      description: "Move a tile to a new position",
      params: {
        tileId: "ID of the tile to move",
        position: "{x, y} canvas coordinates",
      },
    },
  );

  registerMethod(
    "canvas.tileResize",
    async (params) => {
      const p = params as Record<string, unknown>;
      const size = p['size'] as Record<string, number> | undefined;
      const tileId = p['tileId'] as string | undefined;

      // Kernel write gate — writes new dimensions before visual update.
      if (tileId && size) {
        const kernelResult = await dispatchKernelCommand('kernel.tile.resize', {
          id: tileId,
          width: size['width'] ?? 320,
          height: size['height'] ?? 240,
        }, 'canvas-rpc');
        if (!kernelResult.ok) {
          throw new Error(`Kernel rejected tile.resize: ${kernelResult.error}`);
        }
      }

      // Canvas visual update.
      return sendToShell('canvas.tileResize', params);
    },
    {
      description: "Resize a tile",
      params: {
        tileId: "ID of the tile to resize",
        size: "{width, height} in pixels",
      },
    },
  );

  registerMethod(
    "canvas.tileRename",
    (params) => sendToShell("canvas.tileRename", params),
    {
      description: "Rename a tile display title without changing its route handle",
      params: {
        tileId: "ID of the tile to rename",
        title: "New display title; empty string clears the custom title",
      },
    },
  );

  registerMethod(
    "canvas.connectionList",
    (params) => sendToShell("canvas.connectionList", params),
    {
      description: "List all canvas connections",
      params: {},
    },
  );

  registerMethod(
    "canvas.connectionCreate",
    async (params) => {
      const p = params as Record<string, unknown>;
      if (!p['tileAId'] || !p['tileBId']) {
        return sendToShell('canvas.connectionCreate', params);
      }

      // Renderer creates connection first so we capture its assigned ID.
      const result = await sendToShell('canvas.connectionCreate', params) as Record<string, unknown> | null;
      const connId = result?.['id'] as string | undefined;

      // Kernel write gate.
      const kernelResult = await dispatchKernelCommand('kernel.connection.create', {
        id: connId,
        tileAId: p['tileAId'] as string,
        tileBId: p['tileBId'] as string,
        label: (p['label'] as string | null) ?? null,
      }, 'canvas-rpc');

      if (!kernelResult.ok) {
        // Roll back provisional connection.
        if (connId) {
          await sendToShell('canvas.connectionRemove', { id: connId }).catch(() => undefined);
        }
        throw new Error(`Kernel rejected connection.create: ${kernelResult.error}`);
      }

      return result;
    },
    {
      description: "Create a connection between two tiles",
      params: {
        tileAId: "ID of the first tile",
        tileBId: "ID of the second tile",
        label: "(optional) Label for the connection",
        fromSide: "(optional) Source visual port side: N, E, S, or W",
        toSide: "(optional) Target visual port side: N, E, S, or W",
        kind: "(optional) Connection kind metadata; relay remains one-shot and cable-bounded",
      },
    },
  );

  registerMethod(
    "canvas.connectionRemove",
    async (params) => {
      const p = params as Record<string, unknown>;
      const id = p['id'] as string | undefined;

      // Kernel write gate — removes record before visual removal.
      if (id) {
        const kernelResult = await dispatchKernelCommand('kernel.connection.delete', { id }, 'canvas-rpc');
        if (!kernelResult.ok) {
          throw new Error(`Kernel rejected connection.delete: ${kernelResult.error}`);
        }
      }

      // Canvas visual removal.
      return sendToShell('canvas.connectionRemove', params);
    },
    {
      description: "Remove a canvas connection",
      params: { id: "ID of the connection to remove" },
    },
  );

  registerMethod(
    "canvas.connectionUpdateLabel",
    (params) => sendToShell("canvas.connectionUpdateLabel", params),
    {
      description: "Update the label on a canvas connection",
      params: {
        id: "ID of the connection",
        label: "New connection label",
      },
    },
  );

  registerMethod(
    "canvas.terminalWrite",
    (params) => sendToShell("canvas.terminalWrite", params),
    {
      description: "Write input to a terminal tile",
      params: {
        tileId: "ID of the terminal tile",
        input: "String to write to the terminal",
      },
    },
  );

  registerMethod(
    "canvas.terminalRead",
    (params) => sendToShell("canvas.terminalRead", params),
    {
      description: "Read recent output from a terminal tile",
      params: {
        tileId: "ID of the terminal tile",
        lines: "(optional) Number of lines to capture (default 50)",
      },
    },
  );

  registerMethod(
    "canvas.tileFocus",
    (params) => sendToShell("canvas.tileFocus", params),
    {
      description:
        "Pan and zoom viewport to show the specified tiles, " +
        "then flash their focus rings",
      params: {
        tileIds: "Array of tile IDs to bring into view",
      },
    },
  );

  registerMethod(
    "canvas.viewportGet",
    (params) => sendToShell("canvas.viewportGet", params),
    {
      description: "Get current canvas viewport (pan and zoom)",
      params: {},
    },
  );

  registerMethod(
    "canvas.viewportSet",
    (params) => sendToShell("canvas.viewportSet", params),
    {
      description: "Set canvas viewport pan and zoom",
      params: {
        x: "Viewport x offset",
        y: "Viewport y offset",
        zoom: "Zoom level (1 = 100%)",
      },
    },
  );

  registerMethod(
    "canvas.browserNavigate",
    (params) => sendToShell("browserNavigate", params),
    {
      description: "Navigate a browser tile to a URL",
      params: {
        tileId: "ID of the browser tile",
        url: "URL to navigate to",
      },
    },
  );

  registerMethod(
    "canvas.browserScreenshot",
    (params) => sendToShell("browserScreenshot", params),
    {
      description:
        "Capture a screenshot of a browser tile (base64 PNG)",
      params: { tileId: "ID of the browser tile" },
    },
  );

  registerMethod(
    "canvas.browserSnapshot",
    (params) => sendToShell("browserSnapshot", params),
    {
      description:
        "Get DOM tree snapshot of a browser tile",
      params: { tileId: "ID of the browser tile" },
    },
  );

  registerMethod(
    "canvas.browserClick",
    (params) => sendToShell("browserClick", params),
    {
      description: "Click an element in a browser tile",
      params: {
        tileId: "ID of the browser tile",
        selector:
          "CSS selector for the element to click",
      },
    },
  );

  registerMethod(
    "canvas.browserType",
    (params) => sendToShell("browserType", params),
    {
      description:
        "Type text into an element in a browser tile",
      params: {
        tileId: "ID of the browser tile",
        selector:
          "CSS selector for the element",
        text: "Text to type",
      },
    },
  );

  registerMethod(
    "canvas.browserScroll",
    (params) => sendToShell("browserScroll", params),
    {
      description: "Scroll a browser tile",
      params: {
        tileId: "ID of the browser tile",
        x: "Horizontal scroll delta (pixels)",
        y: "Vertical scroll delta (pixels)",
      },
    },
  );

  registerMethod(
    "canvas.browserEvaluate",
    (params) => sendToShell("browserEvaluate", params),
    {
      description:
        "Run JavaScript in a browser tile and return the result",
      params: {
        tileId: "ID of the browser tile",
        expression: "JavaScript expression to evaluate",
      },
    },
  );

  registerMethod(
    "canvas.browserWait",
    (params) => sendToShell("browserWait", params),
    {
      description:
        "Wait for a browser tile to finish loading",
      params: {
        tileId: "ID of the browser tile",
        timeout:
          "(optional) Max wait in ms (default 10000)",
      },
    },
  );

  registerMethod(
    "canvas.browserInfo",
    (params) => sendToShell("browserInfo", params),
    {
      description:
        "Get current URL, title, and loading state of a " +
        "browser tile",
      params: { tileId: "ID of the browser tile" },
    },
  );
}
