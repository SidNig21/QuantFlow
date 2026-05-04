import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as crypto from "node:crypto";
import { COLLAB_DIR } from "./paths";

let stateDir = COLLAB_DIR;

function getStateFile(): string {
  return join(stateDir, "canvas-state.json");
}

export function _setCanvasStateDir(dir: string): void {
  stateDir = dir;
}

interface TileState {
  id: string;
  type: "term" | "note" | "code" | "image" | "graph" | "browser";
  x: number;
  y: number;
  width: number;
  height: number;
  filePath?: string;
  folderPath?: string;
  url?: string | null;
  workspacePath?: string;
  ptySessionId?: string;
  userTitle?: string;
  autoTitle?: string;
  routeHandle?: string;
  zIndex: number;
}

export interface ConnectionState {
  id: string;
  tileAId: string;
  tileBId: string;
  label?: string;
  createdAt: number;
  updatedAt: number;
}

interface CanvasState {
  version: 1;
  tiles: TileState[];
  connections: ConnectionState[];
  viewport: {
    centerX: number;
    centerY: number;
    zoom: number;
  };
}

function sanitizeCoord(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function loadState(): Promise<CanvasState | null> {
  try {
    const raw = await readFile(getStateFile(), "utf-8");
    const state = JSON.parse(raw) as CanvasState & {
      connections?: unknown;
    };
    if (state.version !== 1) return null;
    for (const tile of state.tiles) {
      tile.x = sanitizeCoord(tile.x);
      tile.y = sanitizeCoord(tile.y);
    }
    state.connections = Array.isArray(state.connections)
      ? state.connections
      : [];
    return state;
  } catch {
    return null;
  }
}

export async function saveState(state: CanvasState): Promise<void> {
  if (!existsSync(stateDir)) {
    await mkdir(stateDir, { recursive: true });
  }
  const tmp = join(
    tmpdir(),
    `canvas-state-${crypto.randomUUID()}.json`,
  );
  const json = JSON.stringify(state, null, 2);
  await writeFile(tmp, json, "utf-8");
  await rename(tmp, getStateFile());
}
