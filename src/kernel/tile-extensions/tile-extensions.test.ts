import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleTileCommand } from '../commands/tile-commands';
import {
  handleTileExtensionCommand,
  queryCanvasSettingsGet,
  queryTileExtensionGet,
} from './index';

function makeDb(): Database {
  const migrationsDir = join(import.meta.dir, '..', 'migrations');
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const file of [
    '001-v3-baseline.sql',
    '008-d0-tile-extensions.sql',
  ]) {
    db.exec(readFileSync(join(migrationsDir, file), 'utf-8'));
  }
  const now = Date.now();
  db.prepare(
    `INSERT INTO workflows (id, name, objective, status, vault_path, created_at, updated_at)
     VALUES ('wf1', 'wf', 'o', 'active', NULL, ?, ?)`,
  ).run(now, now);
  return db;
}

function createTile(db: Database, id: string): void {
  expect(
    handleTileCommand(db as never, 'kernel.tile.create', {
      id,
      workflowId: 'wf1',
      displayName: id,
      tileKind: 'worker',
    }).ok,
  ).toBe(true);
}

describe('tile extensions (D0)', () => {
  test('upsert + get round-trip', () => {
    const db = makeDb();
    createTile(db, 'tile_a');
    const set = handleTileExtensionCommand(db as never, 'kernel.tile_extension.set', {
      tileId: 'tile_a',
      canvasType: 'term',
      filePath: '/tmp/note.md',
      userTitle: 'My Term',
      runtimeTarget: 'herdr',
    });
    expect(set.ok).toBe(true);

    const got = queryTileExtensionGet(db as never, 'tile_a');
    expect(got).toMatchObject({
      tileId: 'tile_a',
      canvasType: 'term',
      filePath: '/tmp/note.md',
      userTitle: 'My Term',
      runtimeTarget: 'herdr',
      folderPath: null,
    });
    expect(got?.createdAt).toBeGreaterThan(0);
    expect(got?.updatedAt).toBeGreaterThan(0);
  });

  test('partial update preserves untouched fields', () => {
    const db = makeDb();
    createTile(db, 'tile_b');
    expect(
      handleTileExtensionCommand(db as never, 'kernel.tile_extension.set', {
        tileId: 'tile_b',
        canvasType: 'note',
        autoTitle: 'Auto',
        url: 'https://example.com',
      }).ok,
    ).toBe(true);

    const first = queryTileExtensionGet(db as never, 'tile_b');
    expect(
      handleTileExtensionCommand(db as never, 'kernel.tile_extension.set', {
        tileId: 'tile_b',
        userTitle: 'Edited',
      }).ok,
    ).toBe(true);

    const second = queryTileExtensionGet(db as never, 'tile_b');
    expect(second).toMatchObject({
      canvasType: 'note',
      autoTitle: 'Auto',
      url: 'https://example.com',
      userTitle: 'Edited',
    });
    expect(second!.updatedAt).toBeGreaterThanOrEqual(first!.updatedAt);
  });

  test('unknown tile rejected', () => {
    const db = makeDb();
    const result = handleTileExtensionCommand(db as never, 'kernel.tile_extension.set', {
      tileId: 'missing',
      canvasType: 'term',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('tile not found');
  });

  test('cascade delete removes extension row', () => {
    const db = makeDb();
    createTile(db, 'tile_c');
    expect(
      handleTileExtensionCommand(db as never, 'kernel.tile_extension.set', {
        tileId: 'tile_c',
        canvasType: 'code',
      }).ok,
    ).toBe(true);
    expect(queryTileExtensionGet(db as never, 'tile_c')).not.toBeNull();

    expect(handleTileCommand(db as never, 'kernel.tile.remove', { id: 'tile_c' }).ok).toBe(true);
    expect(queryTileExtensionGet(db as never, 'tile_c')).toBeNull();
  });

  test('canvas viewport get/set', () => {
    const db = makeDb();
    expect(queryCanvasSettingsGet(db as never)).toBeNull();

    expect(
      handleTileExtensionCommand(db as never, 'kernel.canvas.settings.set', {
        centerX: 120,
        centerY: 340,
        zoom: 1.25,
      }).ok,
    ).toBe(true);
    expect(queryCanvasSettingsGet(db as never)).toMatchObject({
      centerX: 120,
      centerY: 340,
      zoom: 1.25,
    });

    expect(
      handleTileExtensionCommand(db as never, 'kernel.canvas.settings.set', {
        zoom: 2,
      }).ok,
    ).toBe(true);
    expect(queryCanvasSettingsGet(db as never)).toMatchObject({
      centerX: 120,
      centerY: 340,
      zoom: 2,
    });
  });
});
