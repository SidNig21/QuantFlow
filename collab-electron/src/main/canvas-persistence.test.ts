import { afterEach, describe, expect, mock, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_ROOT = join(
  tmpdir(),
  `canvas-persistence-test-${Date.now()}`,
);
const COLLAB_DIR = join(TEST_ROOT, ".quantflow");
const STATE_FILE = join(COLLAB_DIR, "canvas-state.json");

mock.module("./paths", () => ({
  COLLAB_DIR,
}));

const {
  loadState,
  saveState,
} = await import("./canvas-persistence");
mock.restore();

type ConnectionState = {
  id: string;
  tileAId: string;
  tileBId: string;
  label?: string;
  createdAt: number;
  updatedAt: number;
};

async function readSavedState() {
  return JSON.parse(await readFile(STATE_FILE, "utf-8"));
}

afterEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
});

describe("canvas-persistence connections", () => {
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
    expect(state?.connections).toEqual([]);
  });

  test("loadState with connections array round-trips correctly", async () => {
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
    expect(state?.connections).toEqual(connections);
  });

  test("saveState + loadState preserves a connection", async () => {
    const connection: ConnectionState = {
      id: "conn-1",
      tileAId: "tile-a",
      tileBId: "tile-b",
      label: "persisted",
      createdAt: 10,
      updatedAt: 20,
    };

    await saveState({
      version: 1,
      tiles: [],
      connections: [connection],
      viewport: { centerX: 100, centerY: 200, zoom: 1.5 },
    });

    expect((await readSavedState()).connections).toEqual([connection]);

    const loaded = await loadState();
    expect(loaded?.connections).toEqual([connection]);
  });
});
