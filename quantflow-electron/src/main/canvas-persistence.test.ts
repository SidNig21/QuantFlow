import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installTestRuntimeDb } from "./runtime-state/test-sqlite-adapter";
import { listConnections as dbListConnections, _resetForTesting as resetConnections } from "./runtime-state/connections-repo";

const TEST_ROOT = join(
  tmpdir(),
  `canvas-persistence-test-${Date.now()}`,
);
const STATE_DIR = join(TEST_ROOT, ".quantflow");
const STATE_FILE = join(STATE_DIR, "canvas-state.json");

const {
  _setCanvasStateDir,
  loadState,
  saveState,
} = await import("./canvas-persistence");

type ConnectionState = {
  id: string;
  tileAId: string;
  tileBId: string;
  label?: string;
  from?: { tileId: string; side: "N" | "E" | "S" | "W" };
  to?: { tileId: string; side: "N" | "E" | "S" | "W" };
  kind?: string;
  createdAt: number;
  updatedAt: number;
};

beforeEach(() => {
  installTestRuntimeDb();
  resetConnections();
  _setCanvasStateDir(STATE_DIR);
});

async function readSavedState() {
  return JSON.parse(await readFile(STATE_FILE, "utf-8"));
}

afterEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
});

describe("canvas-persistence connections", () => {
  test("saveState + loadState preserves herdr runtime tile identity", async () => {
    const tile = {
      id: "tile-hermes",
      type: "term" as const,
      x: 20,
      y: 40,
      width: 520,
      height: 420,
      cwd: "/repo",
      ptySessionId: "session-display",
      terminalTarget: "herdr-wsl:terminal-1",
      runtimeTarget: "herdr-wsl",
      userTitle: "Hermes",
      autoTitle: "herdr attach",
      routeHandle: "hermes",
      herdrPaneId: "pane-1",
      herdrAgentName: "qf.quantflow-v2.hermes.tile-hermes",
      herdrWorkspaceId: "workspace-1",
      herdrTerminalId: "terminal-1",
      zIndex: 4,
    };

    await saveState({
      version: 1,
      tiles: [tile],
      connections: [],
      viewport: { centerX: 100, centerY: 200, zoom: 1.5 },
    });

    expect((await readSavedState()).tiles[0]).toMatchObject({
      terminalTarget: "herdr-wsl:terminal-1",
      runtimeTarget: "herdr-wsl",
      herdrPaneId: "pane-1",
      herdrAgentName: "qf.quantflow-v2.hermes.tile-hermes",
      herdrWorkspaceId: "workspace-1",
      herdrTerminalId: "terminal-1",
    });

    const loaded = await loadState();
    expect(loaded?.tiles[0]).toMatchObject({
      id: "tile-hermes",
      terminalTarget: "herdr-wsl:terminal-1",
      runtimeTarget: "herdr-wsl",
      herdrPaneId: "pane-1",
      herdrAgentName: "qf.quantflow-v2.hermes.tile-hermes",
      herdrWorkspaceId: "workspace-1",
      herdrTerminalId: "terminal-1",
    });
  });

  test("loadState with no connections field returns connections: []", async () => {
    await Bun.write(
      STATE_FILE,
      JSON.stringify({
        version: 1,
        tiles: [],
        viewport: { centerX: 0, centerY: 0, zoom: 1 },
      }, null, 2),
    );

    const state = await loadState();
    expect(state?.version).toBe(2);
    expect(state?.connections).toEqual([]);
  });

  test("loadState accepts v1 connections without metadata", async () => {
    const connections: ConnectionState[] = [
      {
        id: "conn-1",
        tileAId: "tile-a",
        tileBId: "tile-b",
        label: "alpha",
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    await Bun.write(
      STATE_FILE,
      JSON.stringify({
        version: 1,
        tiles: [],
        connections,
        viewport: { centerX: 0, centerY: 0, zoom: 1 },
      }, null, 2),
    );

    const state = await loadState();
    expect(state?.version).toBe(2);
    expect(state?.connections).toEqual(connections);
  });

  test("loadState accepts v2 connections with side and kind metadata", async () => {
    const connections: ConnectionState[] = [
      {
        id: "conn-1",
        tileAId: "tile-a",
        tileBId: "tile-b",
        label: "alpha",
        from: { tileId: "tile-a", side: "E" },
        to: { tileId: "tile-b", side: "W" },
        kind: "relay",
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    await Bun.write(
      STATE_FILE,
      JSON.stringify({
        version: 2,
        tiles: [],
        connections,
        viewport: { centerX: 0, centerY: 0, zoom: 1 },
      }, null, 2),
    );

    const state = await loadState();
    expect(state?.version).toBe(2);
    expect(state?.connections).toEqual(connections);
  });

  test("loadState strips unsafe connection metadata but keeps legacy endpoints", async () => {
    await Bun.write(
      STATE_FILE,
      JSON.stringify({
        version: 2,
        tiles: [],
        connections: [
          {
            id: "conn-1",
            tileAId: "tile-a",
            tileBId: "tile-b",
            from: { tileId: "tile-x", side: "E" },
            to: { tileId: "tile-b", side: "Q" },
            kind: "",
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        viewport: { centerX: 0, centerY: 0, zoom: 1 },
      }, null, 2),
    );

    const state = await loadState();
    expect(state?.connections).toEqual([
      {
        id: "conn-1",
        tileAId: "tile-a",
        tileBId: "tile-b",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
  });

  test("saveState + loadState preserves a connection", async () => {
    const connection: ConnectionState = {
      id: "conn-1",
      tileAId: "tile-a",
      tileBId: "tile-b",
      label: "persisted",
      from: { tileId: "tile-a", side: "E" },
      to: { tileId: "tile-b", side: "W" },
      kind: "relay",
      createdAt: 10,
      updatedAt: 20,
    };

    await saveState({
      version: 1,
      tiles: [],
      connections: [connection],
      viewport: { centerX: 100, centerY: 200, zoom: 1.5 },
    });

    expect((await readSavedState()).version).toBe(2);
    expect((await readSavedState()).connections).toEqual([connection]);

    const loaded = await loadState();
    expect(loaded?.connections).toEqual([connection]);
  });
});

describe("canvas-persistence DB sync (connections survive restart)", () => {
  test("saveState writes connections to SQLite", async () => {
    const connection: ConnectionState = {
      id: "db-conn-1",
      tileAId: "tile-a",
      tileBId: "tile-b",
      label: "db-backed",
      createdAt: 100,
      updatedAt: 200,
    };

    await saveState({
      version: 1,
      tiles: [],
      connections: [connection],
      viewport: { centerX: 0, centerY: 0, zoom: 1 },
    });

    const dbConns = dbListConnections();
    expect(dbConns.length).toBe(1);
    expect(dbConns[0].id).toBe("db-conn-1");
    expect(dbConns[0].tile_a_id).toBe("tile-a");
    expect(dbConns[0].label).toBe("db-backed");
  });

  test("loadState returns DB-only connections not in JSON", async () => {
    // Write a minimal JSON file with no connections
    await Bun.write(
      STATE_FILE,
      JSON.stringify({
        version: 2,
        tiles: [],
        connections: [],
        viewport: { centerX: 0, centerY: 0, zoom: 1 },
      }, null, 2),
    );

    // Manually insert a connection into DB (simulates surviving a JSON wipe)
    const { createConnection: dbCreate } = await import("./runtime-state/connections-repo");
    dbCreate({ id: "orphan-db-conn", tileAId: "x", tileBId: "y" });

    const state = await loadState();
    expect(state?.connections.length).toBe(1);
    expect(state?.connections[0].id).toBe("orphan-db-conn");
    expect(state?.connections[0].tileAId).toBe("x");
  });
});
