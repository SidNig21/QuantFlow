import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
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

const {
  _setCanvasStateDir,
  loadState,
  saveState,
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

  test("flag-on overlays ephemeral fields from JSON cache only", async () => {
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

    process.env.QF_ONE_TRUTH = "1";
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
