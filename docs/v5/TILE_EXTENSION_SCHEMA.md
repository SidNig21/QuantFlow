# Tile Extension Schema (D0)

> **Authority:** Kernel additive schema for Stage D / PF3.  
> **Status:** D0 — schema + accessors only; no caller migration (D1/D3 wire usage).  
> **Branch:** `quantflow-v5-fabled`

## Purpose

`canvas-state.json` and in-memory `canvas-state.js` currently hold canvas-only tile
fields alongside geometry that already lives on the Kernel `tiles` table. D0 gives those
stable, canvas-specific fields a **Kernel home** so `canvas-state.json` can be demoted to
cache/export in later chunks (D1–D3) without inventing a second truth store.

The Kernel remains the sole source of truth. This schema is **additive only** — no
destructive changes to v3 baseline tables.

## What stays on `tiles` (do not duplicate)

| Field | Kernel column | Notes |
| --- | --- | --- |
| `id` | `tiles.id` | Primary key |
| `x`, `y` | `tiles.x`, `tiles.y` | Geometry |
| `width`, `height` | `tiles.width`, `tiles.height` | Geometry |
| `zIndex` | `tiles.z_index` | Stacking order |
| `displayName` | `tiles.display_name` | Kernel display name (distinct from canvas `userTitle` / `autoTitle`) |
| `tileKind` | `tiles.tile_kind` | Kernel role kind (`worker`, `conductor`, …) — distinct from canvas `type` |

## `tile_extensions` — per-tile canvas fields

One row per tile (`tile_id` PK, FK → `tiles`, `ON DELETE CASCADE`).

### Canonical columns (typed)

| Canvas field | Column | Type | Meaning |
| --- | --- | --- | --- |
| `type` | `canvas_type` | `TEXT` | Canvas tile content kind: `term`, `note`, `code`, `image`, `graph`, `browser`. Distinct from Kernel `tile_kind`. |
| `filePath` | `file_path` | `TEXT` | Bound file path (note/code tiles). |
| `folderPath` | `folder_path` | `TEXT` | Bound folder path. |
| `url` | `url` | `TEXT` | Browser tile URL (`null` = cleared). |
| `workspacePath` | `workspace_path` | `TEXT` | Workspace root for terminal/agent tiles. |
| `terminalTarget` | `terminal_target` | `TEXT` | Preferred terminal backend (`auto`, `herdr`, `windows-pty`, …). |
| `runtimeTarget` | `runtime_target` | `TEXT` | Preferred runtime/harness routing target. |
| `userTitle` | `user_title` | `TEXT` | Operator-edited canvas title. |
| `autoTitle` | `auto_title` | `TEXT` | System-derived canvas title. |
| `routeHandle` | `route_handle` | `TEXT` | Stable route/surface handle for deep links. |
| `herdrAgentName` | `herdr_agent_name` | `TEXT` | Herdr agent identity (configuration, survives reload). |
| `herdrWorkspaceId` | `herdr_workspace_id` | `TEXT` | Herdr workspace identity (configuration). |

### `extra_json` escape hatch

`extra_json` (`TEXT`, default `'{}'`) holds future additive fields without a migration.
D0 does not read or write any keys here from production paths.

### Ephemeral — excluded from Kernel truth (stay in JSON cache until Stage E)

These are **live runtime handles** or **display-only attach IDs**. They change when PTY/Herdr
sessions reconnect and must not be treated as durable Kernel truth in D0.

| Canvas field | Disposition | Rationale |
| --- | --- | --- |
| `ptySessionId` | **ephemeral** | Live OS/PTY session handle; invalid after disconnect/restart. PTY liveness is harness/runtime, not truth. |
| `herdrPaneId` | **ephemeral** | Live Herdr pane binding (`w65190c26215c41-1`). Authoritative worker↔Herdr link when needed lives on `worker_instances.herdr_pane_id` via `kernel.worker.status_update`. |
| `herdrTerminalId` | **ephemeral** | Live Herdr terminal attach identity for display; re-assigned on reconnect. |

Until D1/D3 wire Kernel reads, these fields **continue to live in `canvas-state.json`**
as a derived cache. Stage E fences PTY raw streams out of projection.

## `canvas_settings` — canvas-scoped viewport

Singleton row (`id = 'canvas'`) — not tile-scoped.

| Field | Column | Type | Meaning |
| --- | --- | --- | --- |
| `viewport.centerX` | `center_x` | `REAL` | Canvas pan center X |
| `viewport.centerY` | `center_y` | `REAL` | Canvas pan center Y |
| `viewport.zoom` | `zoom` | `REAL` | Canvas zoom level |

## Kernel accessors (D0)

| Kind | Name | Handler |
| --- | --- | --- |
| Command | `kernel.tile_extension.set` | `src/kernel/tile-extensions/index.ts` — upsert; partial update; rejects unknown `tileId` |
| Query | `kernel.tile_extension.get` | `src/kernel/tile-extensions/index.ts` |
| Command | `kernel.canvas.settings.set` | `src/kernel/tile-extensions/index.ts` — viewport upsert; partial update |
| Query | `kernel.canvas.settings.get` | `src/kernel/tile-extensions/index.ts` |

No new event kinds in D0 — extension writes are not yet on the projection hot path.

## Versioning rule

- **Additive only:** new columns/tables via numbered migrations; never DROP or destructive ALTER.
- **Partial updates:** command payloads omit unchanged fields; explicit `null` clears nullable columns.
- **Caller migration:** deferred to D1 (boot from Kernel) and D3 (retire `canvas-state.js`).

## Migration

`src/kernel/migrations/008-d0-tile-extensions.sql` — schema version 8.
