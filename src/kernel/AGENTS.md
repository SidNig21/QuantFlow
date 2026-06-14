# src/kernel — Agent Guide

The Kernel is the sole source of truth for QuantFlow v3.

## What This Subtree Owns

All canonical state and the mutation/query boundary:

- `schema/types.ts` — TypeScript interfaces for all canonical primitives.
- `migrations/001-v3-baseline.sql` — SQLite schema DDL (v3 baseline).
- `database.ts` — SQLite singleton; opens `kernel.db`, runs baseline migration. (Goal 2)
- `events/index.ts` — EventEmitter event bus; forwards `KernelEventPayload` to subscribed WebContents. (Goal 2)
- `commands/types.ts` — `CommandResult` interface. (Goal 2)
- `commands/index.ts` — Command dispatcher; writes audit row to `commands` table, routes by prefix. (Goal 2)
- `commands/tile-commands.ts` — Tile CRUD: create, move, resize, rename, status_update, remove. (Goal 2)
- `commands/connection-commands.ts` — Connection CRUD: create, delete. (Goal 2)
- `commands/workflow-commands.ts` — Workflow CRUD: create, update. (Goal 2)
- `queries/index.ts` — Read-only queries: canvas snapshot, tile list, tile get. (Goal 2)
- Future: task state machine and transition enforcement (Goal 3).
- Future: receipt store (append-only) (Goal 3).
- Future: StateCard watchers (Goal 4).
- Future: WorkerInstance registry (Goal 6).
- Future: Harness registry — configuration only, not harness implementations (Goal 6).

## Authority Rules

```text
Kernel owns truth.
All state mutations go through Kernel commands.
Do not import renderer state.
Do not let workers self-complete tasks without verification.
Receipts are append-only.
Events are append-only.
State Cards are current summaries, not history.
```

## Command Idempotency (Goal 2)

`tile.create` and `connection.create` are idempotent: a re-create of an
existing id is a no-op success (`{ ok: true }`). This lets the same canonical
create arrive via both the manual shell gate and the MCP/RPC gate, and lets
restore re-hydrate stable ids, without double-insert errors.

`tile.remove` and `connection.delete` are idempotent: a missing row is success
(the desired end state already holds). An event fires only when a row actually
changed. Because DELETE is authoritative-idempotent, the canvas-rpc path does
not need a "not found" bypass — the gate stays strict (`!ok` throws).

## What This Subtree Must Not Do

- Import from `src/renderer/`.
- Store authoritative state outside the canonical SQLite schema.
- Allow a task to transition from `working` to `complete` without `submitted` and `verifying` gates.
- Accept mutations from MCP directly — MCP tools must call Kernel commands.
- Delete or modify receipts or events.

## Canonical Task Transitions

```text
open → claimed → working → submitted → verifying → complete
working → blocked → working
working / submitted / verifying → failed
```

Enforce these transitions centrally here. Do not let callers bypass them.

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. This file
6. Relevant kernel source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
