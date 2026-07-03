import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as crypto from "node:crypto";
import { QUANTFLOW_DIR } from "./paths";
import {
  createConnection as dbCreateConnection,
  listConnections as dbListConnections,
  updateConnection as dbUpdateConnection,
  getConnection as dbGetConnection,
} from "./runtime-state/connections-repo";
import type { ConnectionRow } from "./runtime-state/types";
import {
  assembleCanvasStateFromKernel,
  buildEphemeralCacheDocument,
  extractEphemeralOverlayFromJson,
  syncCanvasStateToKernel,
  type EphemeralTileOverlay,
  type TileState,
} from "./canvas-kernel-sync";

let stateDir = QUANTFLOW_DIR;

function getStateFile(): string {
  return join(stateDir, "canvas-state.json");
}

/** D2 ephemeral overlay cache — separate from authority `canvas-state.json`. */
function getEphemeralCacheFile(): string {
  return join(stateDir, "canvas-ephemeral.json");
}

export function _getEphemeralCacheFileForTesting(): string {
  return getEphemeralCacheFile();
}

export function _setCanvasStateDir(dir: string): void {
  stateDir = dir;
}

export type { TileState };

export interface ConnectionState {
  id: string;
  tileAId: string;
  tileBId: string;
  label?: string;
  from?: ConnectionEndpointState;
  to?: ConnectionEndpointState;
  kind?: string;
  createdAt: number;
  updatedAt: number;
}

interface ConnectionEndpointState {
  tileId: string;
  side: "N" | "E" | "S" | "W";
}

export interface CanvasState {
  version: 1 | 2;
  tiles: TileState[];
  connections: ConnectionState[];
  viewport: {
    centerX: number;
    centerY: number;
    zoom: number;
  };
}

function isOneTruthEnabled(): boolean {
  return process.env.QF_ONE_TRUTH === "1";
}

function hasEphemeralCache(): boolean {
  return existsSync(getEphemeralCacheFile());
}

async function atomicWriteJson(targetPath: string, payload: unknown): Promise<void> {
  const tmp = join(tmpdir(), `canvas-write-${crypto.randomUUID()}.json`);
  const json = JSON.stringify(payload, null, 2);
  await writeFile(tmp, json, "utf-8");
  await rename(tmp, targetPath);
}

async function writeEphemeralCache(tiles: TileState[]): Promise<void> {
  if (!existsSync(stateDir)) {
    await mkdir(stateDir, { recursive: true });
  }
  await atomicWriteJson(
    getEphemeralCacheFile(),
    buildEphemeralCacheDocument(tiles),
  );
}

async function clearEphemeralCache(): Promise<void> {
  try {
    await rm(getEphemeralCacheFile(), { force: true });
  } catch {
    // Non-fatal when cache was never written.
  }
}

/**
 * Ephemeral overlay for D1/D2 boot and export.
 * Prefers `canvas-ephemeral.json` (D2 flag-ON saves). Falls back to extracting
 * ephemeral fields from the last full `canvas-state.json` when no cache exists
 * (flag-OFF dual-write / pre-D2 transition).
 */
async function loadEphemeralOverlay(): Promise<Map<string, EphemeralTileOverlay>> {
  if (hasEphemeralCache()) {
    try {
      const cacheRaw = await readFile(getEphemeralCacheFile(), "utf-8");
      return extractEphemeralOverlayFromJson(cacheRaw);
    } catch {
      return new Map();
    }
  }
  try {
    const authorityRaw = await readFile(getStateFile(), "utf-8");
    return extractEphemeralOverlayFromJson(authorityRaw);
  } catch {
    return new Map();
  }
}

function sanitizeCoord(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function isPortSide(value: unknown): value is ConnectionEndpointState["side"] {
  return value === "N" || value === "E" || value === "S" || value === "W";
}

function normalizeEndpoint(
  value: unknown,
  tileAId: string,
  tileBId: string,
): ConnectionEndpointState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const endpoint = value as { tileId?: unknown; side?: unknown };
  if (typeof endpoint.tileId !== "string" || !isPortSide(endpoint.side)) {
    return undefined;
  }
  if (endpoint.tileId !== tileAId && endpoint.tileId !== tileBId) {
    return undefined;
  }
  return { tileId: endpoint.tileId, side: endpoint.side };
}

function normalizeConnection(value: unknown): ConnectionState | null {
  if (!value || typeof value !== "object") return null;
  const conn = value as {
    id?: unknown;
    tileAId?: unknown;
    tileBId?: unknown;
    label?: unknown;
    from?: unknown;
    to?: unknown;
    kind?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  if (
    typeof conn.id !== "string" ||
    typeof conn.tileAId !== "string" ||
    typeof conn.tileBId !== "string"
  ) {
    return null;
  }

  const normalized: ConnectionState = {
    id: conn.id,
    tileAId: conn.tileAId,
    tileBId: conn.tileBId,
    createdAt: typeof conn.createdAt === "number" && Number.isFinite(conn.createdAt)
      ? conn.createdAt
      : 0,
    updatedAt: typeof conn.updatedAt === "number" && Number.isFinite(conn.updatedAt)
      ? conn.updatedAt
      : 0,
  };
  if (typeof conn.label === "string") normalized.label = conn.label;
  const from = normalizeEndpoint(conn.from, conn.tileAId, conn.tileBId);
  const to = normalizeEndpoint(conn.to, conn.tileAId, conn.tileBId);
  if (from && to) {
    normalized.from = from;
    normalized.to = to;
  }
  if (typeof conn.kind === "string" && conn.kind.trim()) {
    normalized.kind = conn.kind;
  }
  return normalized;
}

function connectionRowToState(row: ConnectionRow): ConnectionState {
  const conn: ConnectionState = {
    id: row.id,
    tileAId: row.tile_a_id,
    tileBId: row.tile_b_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.label != null) conn.label = row.label;
  if (row.from_tile_id && row.from_side) {
    conn.from = { tileId: row.from_tile_id, side: row.from_side };
  }
  if (row.to_tile_id && row.to_side) {
    conn.to = { tileId: row.to_tile_id, side: row.to_side };
  }
  if (row.kind && row.kind !== "string") conn.kind = row.kind;
  return conn;
}

function loadConnectionsFromDb(): ConnectionState[] {
  try {
    return dbListConnections().map(connectionRowToState);
  } catch {
    return [];
  }
}

function mergeJsonAndDbConnections(jsonConnections: ConnectionState[]): ConnectionState[] {
  const dbConnections = loadConnectionsFromDb();
  if (dbConnections.length === 0) return jsonConnections;

  const dbById = new Map(dbConnections.map((c) => [c.id, c]));
  const merged: ConnectionState[] = jsonConnections.map((c) => dbById.get(c.id) ?? c);
  const jsonIds = new Set(jsonConnections.map((c) => c.id));
  for (const dbConn of dbConnections) {
    if (!jsonIds.has(dbConn.id)) merged.push(dbConn);
  }
  return merged;
}

function upsertConnectionToDb(conn: ConnectionState): void {
  const existing = dbGetConnection(conn.id);
  if (existing) {
    dbUpdateConnection(conn.id, {
      label: conn.label ?? null,
      fromTileId: conn.from?.tileId ?? null,
      fromSide: conn.from?.side ?? null,
      toTileId: conn.to?.tileId ?? null,
      toSide: conn.to?.side ?? null,
      kind: conn.kind ?? "string",
    });
  } else {
    dbCreateConnection({
      id: conn.id,
      tileAId: conn.tileAId,
      tileBId: conn.tileBId,
      fromTileId: conn.from?.tileId,
      fromSide: conn.from?.side,
      toTileId: conn.to?.tileId,
      toSide: conn.to?.side,
      label: conn.label,
      kind: conn.kind ?? "string",
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    });
  }
}

async function loadStateFromKernel(): Promise<CanvasState | null> {
  try {
    const ephemeralByTileId = await loadEphemeralOverlay();
    const kernelState = assembleCanvasStateFromKernel(ephemeralByTileId);

    return {
      version: 2,
      tiles: kernelState.tiles,
      connections: loadConnectionsFromDb(),
      viewport: kernelState.viewport,
    };
  } catch {
    return null;
  }
}

async function loadStateFromJson(): Promise<CanvasState | null> {
  try {
    const raw = await readFile(getStateFile(), "utf-8");
    const state = JSON.parse(raw) as CanvasState & {
      connections?: unknown;
    };
    if (state.version !== 1 && state.version !== 2) return null;
    for (const tile of state.tiles) {
      tile.x = sanitizeCoord(tile.x);
      tile.y = sanitizeCoord(tile.y);
    }
    const jsonConnections: ConnectionState[] = Array.isArray(state.connections)
      ? state.connections
        .map(normalizeConnection)
        .filter((conn): conn is ConnectionState => Boolean(conn))
      : [];

    state.connections = mergeJsonAndDbConnections(jsonConnections);
    state.version = 2;
    return state;
  } catch {
    return null;
  }
}

export async function loadState(): Promise<CanvasState | null> {
  if (isOneTruthEnabled()) {
    return loadStateFromKernel();
  }
  // D2 downgrade: `canvas-ephemeral.json` means Kernel holds tile truth from a
  // prior flag-ON session — do not boot from stale `canvas-state.json`.
  if (hasEphemeralCache()) {
    return loadStateFromKernel();
  }
  return loadStateFromJson();
}

function normalizeConnectionsFromState(
  state: CanvasState,
): ConnectionState[] {
  return Array.isArray(state.connections)
    ? state.connections
      .map(normalizeConnection)
      .filter((conn): conn is ConnectionState => Boolean(conn))
    : [];
}

async function syncConnectionsToDb(connections: ConnectionState[]): Promise<void> {
  try {
    for (const conn of connections) {
      upsertConnectionToDb(conn);
    }
  } catch {
    // Non-fatal: DB unavailable in test environment or during first boot before migration
  }
}

async function writeFullAuthorityJson(state: CanvasState, connections: ConnectionState[]): Promise<void> {
  if (!existsSync(stateDir)) {
    await mkdir(stateDir, { recursive: true });
  }
  await atomicWriteJson(getStateFile(), {
    ...state,
    version: 2,
    connections,
  });
}

export async function saveState(state: CanvasState): Promise<void> {
  const normalizedConnections = normalizeConnectionsFromState(state);

  await syncConnectionsToDb(normalizedConnections);

  try {
    await syncCanvasStateToKernel({
      tiles: state.tiles,
      viewport: state.viewport,
    });
  } catch (err) {
    console.warn(
      "[canvas-persistence] Kernel parity sync failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (isOneTruthEnabled()) {
    // D2: Kernel holds truth; persist ephemeral overlay only. Authority JSON is
    // left untouched so flag-OFF downgrade can still read the last full export.
    await writeEphemeralCache(state.tiles);
    return;
  }

  await clearEphemeralCache();
  await writeFullAuthorityJson(state, normalizedConnections);
}

/**
 * PF3 on-demand export: assemble full CanvasState v2 from Kernel + ephemeral cache
 * + DB connections and write to `targetPath` or default `canvas-state.json`.
 */
export async function exportState(targetPath?: string): Promise<string> {
  const ephemeralByTileId = await loadEphemeralOverlay();
  const kernelState = assembleCanvasStateFromKernel(ephemeralByTileId);
  const connections = loadConnectionsFromDb();
  const fullState: CanvasState = {
    version: 2,
    tiles: kernelState.tiles,
    connections,
    viewport: kernelState.viewport,
  };

  const outPath = targetPath ?? getStateFile();
  const outDir = join(outPath, "..");
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }
  await atomicWriteJson(outPath, fullState);
  return outPath;
}
