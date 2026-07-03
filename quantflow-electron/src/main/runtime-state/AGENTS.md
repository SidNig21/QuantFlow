# runtime-state — DOX contract

## Purpose

`runtime.db` (better-sqlite3) holds **runtime-ephemeral** and **legacy mirror** data for the Electron main process. Stage D (D4) demotes it: Kernel owns canonical canvas facts when `QF_ONE_TRUTH=1`.

## Ownership

Main process harness / runtime adapter boundary. Canonical task/tile/connection truth lives in Kernel SQLite — not here.

## Local Contracts

- **Derived mirror:** rows may reflect Kernel state for export/display but must not be written as authority under one-truth.
- **Flag gate:** `QF_ONE_TRUTH=1` → connection canonical reads/writes route through `connections-access.ts` → Kernel `connections` table; no `canvas-persistence` upserts to `connections-repo`.
- **Legacy downgrade:** flag OFF preserves dual-write (JSON + runtime.db connections) until structure-freeze lifts.
- **Ephemeral stays:** PTY sessions, status transitions, events log, queue_depth, tiles_runtime — legitimate runtime mirror (non-authoritative).

## Repo classification (D4 inventory)

| Repo | Class | Writers | Readers | D4+ plan |
|------|-------|---------|---------|----------|
| `connections-repo` | **K** | `canvas-persistence` (flag OFF only), `ipc-runtime-state` (flag OFF), `smart-strings-repo` (config JSON) | `connections-access` seam, tests | **Collapsed:** canonical reads/writes → Kernel via `connections-access.ts` when `QF_ONE_TRUTH=1`; `queue_depth` ops stay runtime-only |
| `tasks-repo` | **K** | `ipc-runtime-state`, `orchestration-service` | `ipc-runtime-state`, `orchestration-service` | D5/E: route through Kernel `tasks`; stop runtime writes |
| `runs-repo` | **K** | `orchestration-service` | `orchestration-service`, tests | Delete after orchestration → Kernel workflows |
| `artifacts-repo` | **K** | (tests only in prod path) | tests | Kernel artifacts only; repo delete in PF3 |
| `schemas-repo` | **R** | `ipc-runtime-state` | `ipc-runtime-state` | Keep — runtime payload validation registry |
| `events-repo` | **E** | `envoy-*`, `workflow-service`, `herdr-*`, `ipc-runtime-state`, `ipc-herdr-spawn` | `ipc-runtime-state`, `envoy-task-service`, tests | Keep — derived audit/relay log; **E1:** kinds disjoint from `KERNEL_EVENT_KINDS`; map in `docs/v5/EVENT_BUS_MAP.md`; lint `bun qa/run.ts one-event-path` |
| `status-repo` | **R** | `herdr-status-service`, `ipc-runtime-state` | `ipc-runtime-state`, `herdr-status-service` | Keep — pane status transitions |
| `pty-sessions-repo` | **R** | `pty.ts`, `ipc-runtime-state` | `ipc-runtime-state`, `pty.ts` | Keep — PTY lifecycle mirror |
| `tiles-runtime-repo` | **R** | `orchestration-service`, `ipc-orchestration` | `orchestration-service`, `diagnostics/probes`, `ipc-orchestration` | Keep — tile presence / last_seen |
| `tile-capabilities-repo` | **R** | `orchestration-service` | `orchestration-service` | Keep — orchestration capabilities |
| `envoy-repo` | **V** | `envoy-kernel-bridge`, `envoy-service`, `envoy-task-service`, `ipc-herdr-spawn` | `obsidian-envoy-mirror`, `envoy-*`, tests | **Retirement deferred** — see § Envoy retirement (D4) |

## Envoy retirement (D4 finding)

R3c-b bridged task **mutations** to Kernel (`envoy-kernel-bridge.ts`; `task_id ≡ kernel.tasks.id`), but **`envoy-repo` remains the live mirror** for: space registration (`envoy_spaces`), task display rows (`envoy_tasks`), receipts (`envoy_receipts`), and Obsidian vault export (`obsidian-envoy-mirror.ts` reads `listEnvoyTasks` / `listEnvoyReceipts`). BUILD_PLAN_V4 R3 ledger explicitly **deferred full `envoy_tasks` table retirement**. D4 “un-defer” means a follow-up chunk (D4b or E): (1) mirror writes become strictly post-Kernel projection, (2) Obsidian mirror reads Kernel task/receipt queries, (3) drop `envoy_tasks`/`envoy_receipts` tables after divergence test. **Not implemented in D4** — scope too large; bridge already prevents duplicate task authority.
## Verification

- `bun qa/run.ts connection-round-trip` (D4 gate)
- `bun qa/run.ts one-event-path` (E1 event bus discipline)
- `quantflow-electron`: `bun test src/main/canvas-one-truth.test.ts`

## Child DOX Index

(none — leaf subtree)
