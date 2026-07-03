/**
 * D1 dual-write + Kernel boot assembly for canvas-persistence.
 * See docs/v5/TILE_EXTENSION_SCHEMA.md for field disposition.
 */

import type {
  CanvasSettingsSnapshot,
  TileExtensionSnapshot,
  TileSnapshot,
} from "../../../src/kernel/queries/index";
import {
  getCanvasKernelAccess,
  noteJsonEphemeralReadForTesting,
  noteKernelReadForTesting,
} from "./canvas-kernel-access";

const CANVAS_TILE_TYPES = new Set([
  "term",
  "note",
  "code",
  "image",
  "graph",
  "browser",
]);

const KNOWN_TILE_KEYS = new Set([
  "id",
  "type",
  "x",
  "y",
  "width",
  "height",
  "filePath",
  "folderPath",
  "url",
  "workspacePath",
  "ptySessionId",
  "terminalTarget",
  "runtimeTarget",
  "userTitle",
  "autoTitle",
  "routeHandle",
  "herdrPaneId",
  "herdrAgentName",
  "herdrWorkspaceId",
  "herdrTerminalId",
  "zIndex",
]);

export interface TileState {
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
  herdrPaneId?: string;
  herdrAgentName?: string;
  herdrWorkspaceId?: string;
  herdrTerminalId?: string;
  zIndex: number;
  [key: string]: unknown;
}

export interface CanvasViewport {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface EphemeralTileOverlay {
  ptySessionId?: string;
  herdrPaneId?: string;
  herdrTerminalId?: string;
}

function tileDisplayName(tile: TileState): string {
  return String(tile.userTitle || tile.autoTitle || tile.type || "tile");
}

function collectExtraJson(tile: TileState): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tile)) {
    if (KNOWN_TILE_KEYS.has(key)) continue;
    if (value !== undefined) extra[key] = value;
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function extensionPayloadFromTile(tile: TileState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tileId: tile.id,
    canvasType: tile.type,
  };
  if (tile.filePath !== undefined) payload.filePath = tile.filePath;
  if (tile.folderPath !== undefined) payload.folderPath = tile.folderPath;
  if (tile.url !== undefined) payload.url = tile.url;
  if (tile.workspacePath !== undefined) payload.workspacePath = tile.workspacePath;
  if (tile.terminalTarget !== undefined) payload.terminalTarget = tile.terminalTarget;
  if (tile.runtimeTarget !== undefined) payload.runtimeTarget = tile.runtimeTarget;
  if (tile.userTitle !== undefined) payload.userTitle = tile.userTitle;
  if (tile.autoTitle !== undefined) payload.autoTitle = tile.autoTitle;
  if (tile.routeHandle !== undefined) payload.routeHandle = tile.routeHandle;
  if (tile.herdrAgentName !== undefined) payload.herdrAgentName = tile.herdrAgentName;
  if (tile.herdrWorkspaceId !== undefined) payload.herdrWorkspaceId = tile.herdrWorkspaceId;

  const extraJson = collectExtraJson(tile);
  if (extraJson) payload.extraJson = extraJson;

  return payload;
}

async function upsertTileToKernel(tile: TileState): Promise<void> {
  const access = getCanvasKernelAccess();
  const displayName = tileDisplayName(tile);
  const existing = access.queryTileGet(tile.id);

  if (!existing) {
    const created = await access.dispatchCommand("kernel.tile.create", {
      id: tile.id,
      displayName,
      tileKind: "worker",
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      zIndex: tile.zIndex,
    });
    if (!created.ok) throw new Error(created.error ?? "kernel.tile.create failed");
  } else {
    const synced = await access.dispatchCommand("kernel.tile.layout_sync", {
      id: tile.id,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      zIndex: tile.zIndex,
      displayName,
    });
    if (!synced.ok) throw new Error(synced.error ?? "kernel.tile.layout_sync failed");
  }

  const extResult = await access.dispatchCommand(
    "kernel.tile_extension.set",
    extensionPayloadFromTile(tile),
  );
  if (!extResult.ok) throw new Error(extResult.error ?? "kernel.tile_extension.set failed");
}

export async function syncCanvasStateToKernel(state: {
  tiles: TileState[];
  viewport: CanvasViewport;
}): Promise<void> {
  const access = getCanvasKernelAccess();
  const settingsResult = await access.dispatchCommand("kernel.canvas.settings.set", {
    centerX: state.viewport.centerX,
    centerY: state.viewport.centerY,
    zoom: state.viewport.zoom,
  });
  if (!settingsResult.ok) {
    throw new Error(settingsResult.error ?? "kernel.canvas.settings.set failed");
  }

  for (const tile of state.tiles) {
    await upsertTileToKernel(tile);
  }
}

function sanitizeCoord(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function canvasTypeFromExtension(ext: TileExtensionSnapshot | null): TileState["type"] {
  const raw = ext?.canvasType;
  if (typeof raw === "string" && CANVAS_TILE_TYPES.has(raw)) {
    return raw as TileState["type"];
  }
  return "term";
}

function tileFromKernelRow(
  row: TileSnapshot,
  ext: TileExtensionSnapshot | null,
  ephemeral?: EphemeralTileOverlay,
): TileState {
  const tile: TileState = {
    id: row.id,
    type: canvasTypeFromExtension(ext),
    x: sanitizeCoord(row.x),
    y: sanitizeCoord(row.y),
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
  };

  if (ext?.filePath != null) tile.filePath = ext.filePath;
  if (ext?.folderPath != null) tile.folderPath = ext.folderPath;
  if (ext?.url != null) tile.url = ext.url;
  if (ext?.workspacePath != null) tile.workspacePath = ext.workspacePath;
  if (ext?.terminalTarget != null) tile.terminalTarget = ext.terminalTarget;
  if (ext?.runtimeTarget != null) tile.runtimeTarget = ext.runtimeTarget;
  if (ext?.userTitle != null) tile.userTitle = ext.userTitle;
  if (ext?.autoTitle != null) tile.autoTitle = ext.autoTitle;
  if (ext?.routeHandle != null) tile.routeHandle = ext.routeHandle;
  if (ext?.herdrAgentName != null) tile.herdrAgentName = ext.herdrAgentName;
  if (ext?.herdrWorkspaceId != null) tile.herdrWorkspaceId = ext.herdrWorkspaceId;

  if (ext?.extraJson) {
    for (const [key, value] of Object.entries(ext.extraJson)) {
      if (value !== undefined && value !== null) tile[key] = value;
    }
  }

  // Stage E leftover: runtime-ephemeral handles overlay from JSON cache, not Kernel truth.
  if (ephemeral?.ptySessionId) tile.ptySessionId = ephemeral.ptySessionId;
  if (ephemeral?.herdrPaneId) tile.herdrPaneId = ephemeral.herdrPaneId;
  if (ephemeral?.herdrTerminalId) tile.herdrTerminalId = ephemeral.herdrTerminalId;

  return tile;
}

function viewportFromSettings(settings: CanvasSettingsSnapshot | null): CanvasViewport {
  if (!settings) return { centerX: 0, centerY: 0, zoom: 1 };
  return {
    centerX: settings.centerX,
    centerY: settings.centerY,
    zoom: settings.zoom,
  };
}

export function assembleCanvasStateFromKernel(
  ephemeralByTileId: Map<string, EphemeralTileOverlay>,
): {
  version: 2;
  tiles: TileState[];
  viewport: CanvasViewport;
} {
  noteKernelReadForTesting();
  const access = getCanvasKernelAccess();
  const tileRows = access.queryTileList();
  const settings = access.queryCanvasSettingsGet();

  const tiles = tileRows.map((row) => {
    const ext = access.queryTileExtensionGet(row.id);
    return tileFromKernelRow(row, ext, ephemeralByTileId.get(row.id));
  });

  return {
    version: 2,
    tiles,
    viewport: viewportFromSettings(settings),
  };
}

/** Parse JSON only for Stage E ephemeral overlay fields — not a truth read. */
export function extractEphemeralOverlayFromJson(
  raw: string,
): Map<string, EphemeralTileOverlay> {
  noteJsonEphemeralReadForTesting();
  const overlay = new Map<string, EphemeralTileOverlay>();
  try {
    const parsed = JSON.parse(raw) as { tiles?: unknown };
    if (!Array.isArray(parsed.tiles)) return overlay;
    for (const entry of parsed.tiles) {
      if (!entry || typeof entry !== "object") continue;
      const tile = entry as Record<string, unknown>;
      const id = tile["id"];
      if (typeof id !== "string") continue;
      const ephemeral: EphemeralTileOverlay = {};
      if (typeof tile["ptySessionId"] === "string") {
        ephemeral.ptySessionId = tile["ptySessionId"];
      }
      if (typeof tile["herdrPaneId"] === "string") {
        ephemeral.herdrPaneId = tile["herdrPaneId"];
      }
      if (typeof tile["herdrTerminalId"] === "string") {
        ephemeral.herdrTerminalId = tile["herdrTerminalId"];
      }
      if (Object.keys(ephemeral).length > 0) overlay.set(id, ephemeral);
    }
  } catch {
    // Missing or corrupt JSON — no ephemeral overlay.
  }
  return overlay;
}
