-- D0 Tile Extension Schema: Kernel home for canvas-only tile fields + viewport.
-- Additive only. Enables demoting canvas-state.json in Stage D follow-on chunks.
-- See docs/v5/TILE_EXTENSION_SCHEMA.md for field disposition.

CREATE TABLE tile_extensions (
  tile_id            TEXT PRIMARY KEY REFERENCES tiles(id) ON DELETE CASCADE,
  canvas_type        TEXT,
  file_path          TEXT,
  folder_path        TEXT,
  url                TEXT,
  workspace_path     TEXT,
  terminal_target    TEXT,
  runtime_target     TEXT,
  user_title         TEXT,
  auto_title         TEXT,
  route_handle       TEXT,
  herdr_agent_name   TEXT,
  herdr_workspace_id TEXT,
  extra_json         TEXT NOT NULL DEFAULT '{}',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX tile_extensions_canvas_type ON tile_extensions(canvas_type);

CREATE TABLE canvas_settings (
  id         TEXT PRIMARY KEY DEFAULT 'canvas',
  center_x   REAL NOT NULL DEFAULT 0,
  center_y   REAL NOT NULL DEFAULT 0,
  zoom       REAL NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
VALUES (8, 'D0 tile_extensions + canvas_settings viewport store', unixepoch() * 1000);
