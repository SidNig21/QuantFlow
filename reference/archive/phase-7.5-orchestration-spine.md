# Phase 7.5 — Orchestration spine (repo bridge)

This document is the **implementation milestone** between **QuantFlow Unification** (Phases 0–7 shipped) and **Opus Sections 3–12**. Canonical narrative and ordering stay in the Obsidian spec pack; **this file is what Git tracks** so agents and humans agree on the next slice.

## Why “gaps” appear (and how we stay aligned)

| Cause | What happens | How we fix alignment |
|-------|----------------|----------------------|
| **Doc before code** | The first draft of this file described an ideal DDL before migration `002` landed. | Treat **`migrations/*.sql` + `runtime-state/types.ts`** as **source of truth**. Update **this doc** when schema changes. |
| **Parallel implementers** | One worker chose flexible columns (`tiles_runtime.metadata`, `tile_capabilities.metadata` for `schemaVersion`) instead of every field as its own SQL column. | Document **as-built** below; add new migrations for new columns instead of rewriting history. |
| **Rename drift** | Tests or comments still said `collab-electron/` after the folder became `quantflow-electron/`. | **QuantFlow identity tests** (`package-identity.test.ts`) must use **`quantflow-electron/`** paths. |
| **Incremental spine** | Bridge doc mentioned `schema_id` on tasks before it existed in SQLite. | **`003-task-message-schema.sql`** adds nullable `schema_id` / `schema_version` on `tasks` (opt-in typing). |

**Rule:** If vault prose and repo disagree, **repo migrations win** until someone ports the change back to Obsidian.

## Canonical prose (vault)

| Doc | Role |
|-----|------|
| `Specs/Cursor Opus QuantFlow Plan — INDEX.md` | Master read order, overlap rules |
| `Specs/Cursor Opus QuantFlow Plan — Orchestration & flow spine.md` | Tier 1–4 gaps, section mapping |
| `QuantFlow Unification.md` | What already shipped |

## Goal

QuantFlow has a **durable terminal canvas** (`runtime.db`, cables UX, herdr bridge, MCP). Phase 7.5 adds the **orchestration spine**: IDs and tables so multi-tile handoff can be correlated, grouped, traced, and observed — **without** a DAG scheduler or visual workflow builder in v1.

## Principles (minimal first)

1. **No workflow engine in migrations 002–003** — primitives only (`runs`, FK columns, nullable correlation/trace/thread, optional message schema).
2. **`tiles_runtime` separate from `pty_sessions`** — presence for non-terminal tiles later.
3. **Message schemas opt-in** — `tasks.schema_id` / `tasks.schema_version` nullable (migration **003**); legacy sends stay untyped.
4. **Capability routing is boring** — rows in `tile_capabilities`; optional `schemaVersion` in row `metadata` JSON until you normalize further.
5. **Backpressure v1** — express via `tiles_runtime.metadata` and/or future columns (`accepting_input`, `queue_depth`); add a migration when §5 needs fixed columns.

## As-built schema (Git truth)

| Artifact | Path |
|----------|------|
| Migration 001 | `quantflow-electron/src/main/runtime-state/migrations/001-initial.sql` |
| Migration 002 | `.../002-orchestration-spine.sql` — `runs`, `artifacts`, `tile_capabilities`, `tiles_runtime`, orchestration columns on `tasks` / `events` |
| Migration 003 | `.../003-task-message-schema.sql` — `tasks.schema_id`, `tasks.schema_version`, index `tasks_schema_id` |
| Types & repos | `runtime-state/types.ts`, `*-repo.ts`, `orchestration-service.ts` |
| IPC / RPC | `ipc-orchestration.ts`, JSON-RPC registration in same module |
| MCP | `tools/quantflow-mcp/tool-definitions.js` |

### `runs` (002)

Includes `root_task_id`, `status`, `title`, `metadata` JSON, `started_at`, `completed_at`, timestamps — envelope for a logical workflow.

### `tiles_runtime` (002)

**As-built:** `tile_id`, optional `pane_id`, optional `status`, `presence` (e.g. `online`), `metadata` JSON, `last_seen_at`, timestamps.

**Bridge-doc delta:** first draft listed `accepting_input`, `queue_depth`, etc. as dedicated columns. Those can be added in **004+** when §5 reads them without JSON parsing.

### `tile_capabilities` (002)

**As-built:** `id`, `tile_id`, `capability`, `metadata` JSON (merge **`schemaVersion`** here from `registerTileCapability`), timestamps, `UNIQUE(tile_id, capability)`.

### `tasks` (002 + 003)

Orchestration columns from 002; **003** adds **`schema_id`**, **`schema_version`** (nullable).

## Exit criteria (Phase 7.5) — **met**

- [x] Migrations **002** and **003** apply on top of Phase 7 databases (`schema_migrations` rows 2 and 3).
- [x] Insert **run**, **tasks** with `run_id` / `correlation_id`, **events** with matching IDs.
- [x] Register **tile_capabilities** and **tiles_runtime** (heartbeat).
- [x] **Artifacts** table present; repo/API wired per implementation pass.
- [x] Main-process + MCP surfaces for run/capability/route/heartbeat/correlated task (see repo).

## What happens next

1. Wire **cable / string relay** paths to **`createCorrelatedTask`** where appropriate.
2. Opus **Section 5** — validate payload when `schema_id` is set; structured errors to `events`.
3. Canonical Opus **Section 3** — persist `connections[]` aligned with spine IDs.

---

**Revision:** 2026-05 — synced with as-built migrations **002–003**, rename **`quantflow-electron`**, and alignment rules above.
