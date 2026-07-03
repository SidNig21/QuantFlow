/**
 * Kernel tile extension persistence — D0 Stage D.
 *
 * Canonical home for canvas-only tile fields (see docs/v5/TILE_EXTENSION_SCHEMA.md).
 * Runtime-ephemeral handles (ptySessionId, herdrPaneId, herdrTerminalId) stay out of
 * Kernel truth until Stage E.
 */

import type { KernelDB } from '../database';
import type { CommandResult } from '../commands/types';
import type { CanvasSettingsRow, TileExtensionRow } from '../schema/types';

const CANVAS_SETTINGS_ID = 'canvas';

const TILE_EXTENSION_COLUMNS = {
  canvasType: 'canvas_type',
  filePath: 'file_path',
  folderPath: 'folder_path',
  url: 'url',
  workspacePath: 'workspace_path',
  terminalTarget: 'terminal_target',
  runtimeTarget: 'runtime_target',
  userTitle: 'user_title',
  autoTitle: 'auto_title',
  routeHandle: 'route_handle',
  herdrAgentName: 'herdr_agent_name',
  herdrWorkspaceId: 'herdr_workspace_id',
  extraJson: 'extra_json',
} as const;

type TileExtensionPayloadKey = keyof typeof TILE_EXTENSION_COLUMNS;

const VALID_CANVAS_TYPES = new Set([
  'term',
  'note',
  'code',
  'image',
  'graph',
  'browser',
]);

export interface TileExtensionSnapshot {
  tileId: string;
  canvasType: string | null;
  filePath: string | null;
  folderPath: string | null;
  url: string | null;
  workspacePath: string | null;
  terminalTarget: string | null;
  runtimeTarget: string | null;
  userTitle: string | null;
  autoTitle: string | null;
  routeHandle: string | null;
  herdrAgentName: string | null;
  herdrWorkspaceId: string | null;
  extraJson: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasSettingsSnapshot {
  centerX: number;
  centerY: number;
  zoom: number;
  updatedAt: number;
}

function parseExtraJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rowToTileExtension(row: Record<string, unknown>): TileExtensionSnapshot {
  return {
    tileId: row['tile_id'] as string,
    canvasType: (row['canvas_type'] as string | null) ?? null,
    filePath: (row['file_path'] as string | null) ?? null,
    folderPath: (row['folder_path'] as string | null) ?? null,
    url: (row['url'] as string | null) ?? null,
    workspacePath: (row['workspace_path'] as string | null) ?? null,
    terminalTarget: (row['terminal_target'] as string | null) ?? null,
    runtimeTarget: (row['runtime_target'] as string | null) ?? null,
    userTitle: (row['user_title'] as string | null) ?? null,
    autoTitle: (row['auto_title'] as string | null) ?? null,
    routeHandle: (row['route_handle'] as string | null) ?? null,
    herdrAgentName: (row['herdr_agent_name'] as string | null) ?? null,
    herdrWorkspaceId: (row['herdr_workspace_id'] as string | null) ?? null,
    extraJson: parseExtraJson(row['extra_json']),
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

function rowToCanvasSettings(row: Record<string, unknown>): CanvasSettingsSnapshot {
  return {
    centerX: row['center_x'] as number,
    centerY: row['center_y'] as number,
    zoom: row['zoom'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

function tileExists(db: KernelDB, tileId: string): boolean {
  return db.prepare('SELECT id FROM tiles WHERE id = ?').get(tileId) != null;
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collectTileExtensionUpdates(
  payload: Record<string, unknown>,
): { updates: Partial<Record<TileExtensionPayloadKey, string | null>>; error: string | null } {
  const updates: Partial<Record<TileExtensionPayloadKey, string | null>> = {};
  for (const key of Object.keys(TILE_EXTENSION_COLUMNS) as TileExtensionPayloadKey[]) {
    if (!(key in payload)) continue;
    const normalized = normalizeOptionalString(payload[key]);
    if (normalized === undefined && payload[key] !== null) {
      return { updates, error: `tile_extension.set: ${key} must be a string or null` };
    }
    if (key === 'canvasType' && normalized != null && !VALID_CANVAS_TYPES.has(normalized)) {
      return { updates, error: `tile_extension.set: invalid canvasType: ${normalized}` };
    }
    if (key === 'extraJson') {
      if (payload[key] === null) {
        updates.extraJson = '{}';
      } else if (typeof payload[key] === 'object' && payload[key] !== null) {
        updates.extraJson = JSON.stringify(payload[key]);
      } else {
        return { updates, error: 'tile_extension.set: extraJson must be an object or null' };
      }
      continue;
    }
    updates[key] = normalized ?? null;
  }
  return { updates, error: null };
}

export function handleTileExtensionCommand(
  db: KernelDB,
  type: string,
  payload: Record<string, unknown>,
): CommandResult {
  switch (type) {
    case 'kernel.tile_extension.set':
      return tileExtensionSet(db, payload);
    case 'kernel.canvas.settings.set':
      return canvasSettingsSet(db, payload);
    default:
      return { ok: false, error: `Unhandled tile extension command: ${type}` };
  }
}

function tileExtensionSet(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const tileId = payload['tileId'] as string | undefined;
  if (!tileId || !tileId.trim()) {
    return { ok: false, error: 'tile_extension.set: tileId required' };
  }
  if (!tileExists(db, tileId)) {
    return { ok: false, error: `tile_extension.set: tile not found: ${tileId}` };
  }

  const { updates, error } = collectTileExtensionUpdates(payload);
  if (error) return { ok: false, error };
  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'tile_extension.set: at least one extension field required' };
  }

  const now = Date.now();
  const existing = db
    .prepare('SELECT * FROM tile_extensions WHERE tile_id = ?')
    .get(tileId) as Record<string, unknown> | undefined;

  try {
    if (!existing) {
      const insertCols = ['tile_id', 'created_at', 'updated_at'];
      const insertVals: unknown[] = [tileId, now, now];
      for (const [key, column] of Object.entries(TILE_EXTENSION_COLUMNS)) {
        const typedKey = key as TileExtensionPayloadKey;
        if (updates[typedKey] === undefined) continue;
        insertCols.push(column);
        insertVals.push(updates[typedKey]);
      }
      const placeholders = insertCols.map(() => '?').join(', ');
      db.prepare(
        `INSERT INTO tile_extensions (${insertCols.join(', ')}) VALUES (${placeholders})`,
      ).run(...insertVals);
    } else {
      const setParts = ['updated_at = ?'];
      const setVals: unknown[] = [now];
      for (const [key, column] of Object.entries(TILE_EXTENSION_COLUMNS)) {
        const typedKey = key as TileExtensionPayloadKey;
        if (updates[typedKey] === undefined) continue;
        setParts.push(`${column} = ?`);
        setVals.push(updates[typedKey]);
      }
      setVals.push(tileId);
      db.prepare(
        `UPDATE tile_extensions SET ${setParts.join(', ')} WHERE tile_id = ?`,
      ).run(...setVals);
    }
    return { ok: true, id: tileId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function canvasSettingsSet(db: KernelDB, payload: Record<string, unknown>): CommandResult {
  const updates: Partial<Pick<CanvasSettingsRow, 'center_x' | 'center_y' | 'zoom'>> = {};
  if ('centerX' in payload) {
    const v = Number(payload['centerX']);
    if (!Number.isFinite(v)) return { ok: false, error: 'canvas.settings.set: centerX must be a number' };
    updates.center_x = v;
  }
  if ('centerY' in payload) {
    const v = Number(payload['centerY']);
    if (!Number.isFinite(v)) return { ok: false, error: 'canvas.settings.set: centerY must be a number' };
    updates.center_y = v;
  }
  if ('zoom' in payload) {
    const v = Number(payload['zoom']);
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, error: 'canvas.settings.set: zoom must be a positive number' };
    }
    updates.zoom = v;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'canvas.settings.set: at least one of centerX, centerY, zoom required' };
  }

  const now = Date.now();
  const existing = db
    .prepare('SELECT id FROM canvas_settings WHERE id = ?')
    .get(CANVAS_SETTINGS_ID);

  try {
    if (!existing) {
      db.prepare(`
        INSERT INTO canvas_settings (id, center_x, center_y, zoom, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        CANVAS_SETTINGS_ID,
        updates.center_x ?? 0,
        updates.center_y ?? 0,
        updates.zoom ?? 1,
        now,
      );
    } else {
      const setParts = ['updated_at = ?'];
      const setVals: unknown[] = [now];
      if (updates.center_x !== undefined) {
        setParts.push('center_x = ?');
        setVals.push(updates.center_x);
      }
      if (updates.center_y !== undefined) {
        setParts.push('center_y = ?');
        setVals.push(updates.center_y);
      }
      if (updates.zoom !== undefined) {
        setParts.push('zoom = ?');
        setVals.push(updates.zoom);
      }
      setVals.push(CANVAS_SETTINGS_ID);
      db.prepare(
        `UPDATE canvas_settings SET ${setParts.join(', ')} WHERE id = ?`,
      ).run(...setVals);
    }
    return { ok: true, id: CANVAS_SETTINGS_ID };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function queryTileExtensionGet(db: KernelDB, tileId: string): TileExtensionSnapshot | null {
  const row = db
    .prepare('SELECT * FROM tile_extensions WHERE tile_id = ?')
    .get(tileId) as Record<string, unknown> | undefined;
  return row ? rowToTileExtension(row) : null;
}

export function queryCanvasSettingsGet(db: KernelDB): CanvasSettingsSnapshot | null {
  const row = db
    .prepare('SELECT * FROM canvas_settings WHERE id = ?')
    .get(CANVAS_SETTINGS_ID) as Record<string, unknown> | undefined;
  return row ? rowToCanvasSettings(row) : null;
}

export type { TileExtensionRow, CanvasSettingsRow };
