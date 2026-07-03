import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { setKernelDbForTesting } from "../../../src/kernel/database";
import { handleTileCommand } from "../../../src/kernel/commands/tile-commands";
import { queryTileExtensionGet } from "../../../src/kernel/tile-extensions/index";
import { createInMemoryKernelDb } from "../../../qa/lib/kernel-memory-db";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { _resetForTesting as resetConnections } from "./runtime-state/connections-repo";
import {
  _resetCanvasKernelAccessForTesting,
  _getCanvasKernelAccessCountersForTesting,
} from "./canvas-kernel-access";

const TEST_ROOT = join(tmpdir(), `canvas-one-truth-test-${Date.now()}`);
const STATE_DIR = join(TEST_ROOT, ".quantflow");
const STATE_FILE = join(STATE_DIR, "canvas-state.json");

const {
  _setCanvasStateDir,
  loadState,
  saveState,
  exportState,
  _getEphemeralCacheFileForTesting,
} = await import("./canvas-persistence");

let kernelDb: ReturnType<typeof createInMemoryKernelDb> | null = null;

beforeEach(() => {
  kernelDb = createInMemoryKernelDb("wf_canvas_one_truth");
  setKernelDbForTesting(kernelDb.kdb);
  installTestRuntimeDb();
  resetConnections();
  _setCanvasStateDir(STATE_DIR);
  _resetCanvasKernelAccessForTesting();
  delete process.env.QF_ONE_TRUTH;
});

afterEach(() => {
  delete process.env.QF_ONE_TRUTH;
  setKernelDbForTesting(null);
  _resetCanvasKernelAccessForTesting();
  kernelDb?.db.close();
  kernelDb = null;
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
});

describe("canvas one-truth boot (QF_ONE_TRUTH=1)", () => {
  test("flag-on assembles tiles, viewport, and connections from Kernel + DB", async () => {
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-k1",
          type: "code",
          x: 30,
          y: 40,
          width: 640,
          height: 480,
          filePath: "/src/main.ts",
          userTitle: "Main",
          zIndex: 3,
        },
      ],
      connections: [
        {
          id: "conn-k1",
          tileAId: "tile-k1",
          tileBId: "tile-k1",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      viewport: { centerX: 50, centerY: 60, zoom: 2 },
    });

    process.env.QF_ONE_TRUTH = "1";
    _resetCanvasKernelAccessForTesting();
    const loaded = await loadState();

    expect(loaded?.version).toBe(2);
    expect(loaded?.tiles).toEqual([
      expect.objectContaining({
        id: "tile-k1",
        type: "code",
        x: 30,
        y: 40,
        width: 640,
        height: 480,
        filePath: "/src/main.ts",
        userTitle: "Main",
        zIndex: 3,
      }),
    ]);
    expect(loaded?.viewport).toEqual({ centerX: 50, centerY: 60, zoom: 2 });
    expect(loaded?.connections[0]?.id).toBe("conn-k1");
    expect(_getCanvasKernelAccessCountersForTesting().kernelReadCount).toBeGreaterThan(0);
  });

  test("flag-on overlays ephemeral fields from ephemeral cache", async () => {
    process.env.QF_ONE_TRUTH = "1";
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-ephemeral",
          type: "term",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          ptySessionId: "pty-live",
          herdrPaneId: "pane-live",
          herdrTerminalId: "term-live",
          zIndex: 0,
        },
      ],
      connections: [],
      viewport: { centerX: 0, centerY: 0, zoom: 1 },
    });

    _resetCanvasKernelAccessForTesting();
    const loaded = await loadState();

    expect(loaded?.tiles[0]).toMatchObject({
      id: "tile-ephemeral",
      ptySessionId: "pty-live",
      herdrPaneId: "pane-live",
      herdrTerminalId: "term-live",
    });
    expect(_getCanvasKernelAccessCountersForTesting().jsonEphemeralReadCount).toBe(1);
  });

  test("flag-off load does not read Kernel", async () => {
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-json",
          type: "note",
          x: 1,
          y: 2,
          width: 100,
          height: 100,
          zIndex: 0,
        },
      ],
      connections: [],
      viewport: { centerX: 0, centerY: 0, zoom: 1 },
    });

    _resetCanvasKernelAccessForTesting();
    const loaded = await loadState();
    expect(loaded?.tiles[0]?.id).toBe("tile-json");
    expect(_getCanvasKernelAccessCountersForTesting().kernelReadCount).toBe(0);
  });

  test("missing extension row still boots with defaults", async () => {
    expectOk(
      handleTileCommand(kernelDb!.kdb, "kernel.tile.create", {
        id: "tile-no-ext",
        displayName: "Bare",
        tileKind: "worker",
        x: 5,
        y: 6,
        width: 200,
        height: 150,
        zIndex: 1,
      }),
    );
    expect(queryTileExtensionGet(kernelDb!.kdb, "tile-no-ext")).toBeNull();

    process.env.QF_ONE_TRUTH = "1";
    const loaded = await loadState();
    expect(loaded?.tiles).toEqual([
      expect.objectContaining({
        id: "tile-no-ext",
        type: "term",
        x: 5,
        y: 6,
        width: 200,
        height: 150,
        zIndex: 1,
      }),
    ]);
  });
});

describe("canvas kernel parity on save", () => {
  test("saveState upserts tiles, extensions, and canvas settings", async () => {
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-save",
          type: "browser",
          x: 11,
          y: 22,
          width: 800,
          height: 600,
          url: "https://example.com",
          userTitle: "Browser",
          zIndex: 7,
          cwd: "/repo",
        },
      ],
      connections: [],
      viewport: { centerX: 10, centerY: 20, zoom: 1.5 },
    });

    const ext = queryTileExtensionGet(kernelDb!.kdb, "tile-save");
    expect(ext).toMatchObject({
      canvasType: "browser",
      url: "https://example.com",
      userTitle: "Browser",
      extraJson: { cwd: "/repo" },
    });

    const settings = kernelDb!.db
      .prepare("SELECT center_x, center_y, zoom FROM canvas_settings WHERE id = 'canvas'")
      .get() as { center_x: number; center_y: number; zoom: number };
    expect(settings).toEqual({ center_x: 10, center_y: 20, zoom: 1.5 });
  });
});

function expectOk(result: { ok: boolean; error?: string }): void {
  if (!result.ok) throw new Error(result.error ?? "command failed");
}

describe("canvas one-truth save demotion (D2)", () => {
  test("flag-on save leaves canvas-state.json untouched and writes ephemeral cache", async () => {
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-stale",
          type: "note",
          x: 1,
          y: 2,
          width: 100,
          height: 100,
          zIndex: 0,
        },
      ],
      connections: [],
      viewport: { centerX: 0, centerY: 0, zoom: 1 },
    });
    const authorityBefore = await readFile(STATE_FILE, "utf-8");

    process.env.QF_ONE_TRUTH = "1";
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-new",
          type: "code",
          x: 50,
          y: 60,
          width: 640,
          height: 480,
          filePath: "/src/main.ts",
          ptySessionId: "pty-new",
          zIndex: 1,
        },
      ],
      connections: [],
      viewport: { centerX: 10, centerY: 20, zoom: 1.5 },
    });

    expect(await readFile(STATE_FILE, "utf-8")).toBe(authorityBefore);
    expect(existsSync(_getEphemeralCacheFileForTesting())).toBe(true);
    const cache = JSON.parse(await readFile(_getEphemeralCacheFileForTesting(), "utf-8"));
    expect(cache.version).toBe("ephemeral-v1");
    expect(cache.tiles).toEqual([
      { id: "tile-new", ptySessionId: "pty-new" },
    ]);
  });

  test("flag-off save clears ephemeral cache and writes full authority JSON", async () => {
    process.env.QF_ONE_TRUTH = "1";
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-temp",
          type: "term",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          ptySessionId: "pty-temp",
          zIndex: 0,
        },
      ],
      connections: [],
      viewport: { centerX: 0, centerY: 0, zoom: 1 },
    });
    expect(existsSync(_getEphemeralCacheFileForTesting())).toBe(true);

    delete process.env.QF_ONE_TRUTH;
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-temp",
          type: "term",
          x: 0,
          y: 0,
          width: 320,
          height: 240,
          ptySessionId: "pty-temp",
          zIndex: 0,
        },
      ],
      connections: [],
      viewport: { centerX: 0, centerY: 0, zoom: 1 },
    });

    expect(existsSync(_getEphemeralCacheFileForTesting())).toBe(false);
    const saved = JSON.parse(await readFile(STATE_FILE, "utf-8"));
    expect(saved.version).toBe(2);
    expect(saved.tiles[0].id).toBe("tile-temp");
  });

  test("exportState produces full CanvasState v2 matching flag-off save", async () => {
    const state = {
      version: 2 as const,
      tiles: [
        {
          id: "tile-export",
          type: "browser" as const,
          x: 12,
          y: 34,
          width: 800,
          height: 600,
          url: "https://example.com",
          userTitle: "Browser",
          ptySessionId: "pty-export",
          zIndex: 3,
        },
      ],
      connections: [
        {
          id: "conn-export",
          tileAId: "tile-export",
          tileBId: "tile-export",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      viewport: { centerX: 5, centerY: 6, zoom: 2 },
    };

    process.env.QF_ONE_TRUTH = "1";
    await saveState(state);

    const exportPath = join(STATE_DIR, "export-test.json");
    await exportState(exportPath);
    const exported = JSON.parse(await readFile(exportPath, "utf-8"));
    expect(exported.version).toBe(2);
    expect(exported.tiles[0]).toMatchObject({
      id: "tile-export",
      type: "browser",
      url: "https://example.com",
      ptySessionId: "pty-export",
    });

    delete process.env.QF_ONE_TRUTH;
    await saveState(state);
    const flagOffLoaded = await loadState();
    expect(flagOffLoaded?.tiles[0]).toMatchObject(exported.tiles[0]);
  });

  test("downgrade load after flag-on saves returns Kernel-assembled state", async () => {
    process.env.QF_ONE_TRUTH = "1";
    await saveState({
      version: 2,
      tiles: [
        {
          id: "tile-downgrade",
          type: "note",
          x: 99,
          y: 88,
          width: 300,
          height: 200,
          filePath: "/x.md",
          zIndex: 4,
        },
      ],
      connections: [],
      viewport: { centerX: 1, centerY: 2, zoom: 1.1 },
    });

    delete process.env.QF_ONE_TRUTH;
    const loaded = await loadState();
    expect(loaded?.tiles[0]).toMatchObject({
      id: "tile-downgrade",
      type: "note",
      x: 99,
      y: 88,
      filePath: "/x.md",
    });
    expect(loaded?.viewport).toEqual({ centerX: 1, centerY: 2, zoom: 1.1 });
  });
});
