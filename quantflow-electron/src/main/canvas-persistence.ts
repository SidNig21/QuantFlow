import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
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

let stateDir = QUANTFLOW_DIR;

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
  terminalTarget?: string;
  runtimeTarget?: string;
  userTitle?: string;
  autoTitle?: string;
  routeHandle?: string;
  /** herdr pane_id linked to this tile, e.g. "w65190c26215c41-1" */
  herdrPaneId?: string;
  herdrAgentName?: string;
  herdrWorkspaceId?: string;
  herdrTerminalId?: string;
  zIndex: number;
}

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

interface CanvasState {
  version: 1 | 2;
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

export async function loadState(): Promise<CanvasState | null> {
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

    // Merge with DB connections: DB wins for same id; DB-only rows appended.
    let dbConnections: ConnectionState[] = [];
    try {
      dbConnections = dbListConnections().map(connectionRowToState);
    } catch {
      // DB unavailable (test environment or first boot) — use JSON only
    }

    if (dbConnections.length > 0) {
      const dbById = new Map(dbConnections.map((c) => [c.id, c]));
      const merged: ConnectionState[] = jsonConnections.map((c) => dbById.get(c.id) ?? c);
      const jsonIds = new Set(jsonConnections.map((c) => c.id));
      for (const dbConn of dbConnections) {
        if (!jsonIds.has(dbConn.id)) merged.push(dbConn);
      }
      state.connections = merged;
    } else {
      state.connections = jsonConnections;
    }

    state.version = 2;
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
  const normalizedConnections: ConnectionState[] = Array.isArray(state.connections)
    ? state.connections
      .map(normalizeConnection)
      .filter((conn): conn is ConnectionState => Boolean(conn))
    : [];

  const json = JSON.stringify({
    ...state,
    version: 2,
    connections: normalizedConnections,
  }, null, 2);
  await writeFile(tmp, json, "utf-8");
  await rename(tmp, getStateFile());

  // Sync connections to SQLite so they survive restart independent of canvas-state.json.
  try {
    for (const conn of normalizedConnections) {
      upsertConnectionToDb(conn);
    }
  } catch {
    // Non-fatal: DB unavailable in test environment or during first boot before migration
  }
}
