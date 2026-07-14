# EVENT_BUS_MAP — Stage E1 (P4.E1)

> **Authority:** one canonical projection path for Kernel facts. Everything else is
> runtime telemetry, audit, or shell routing — never a second truth fan-out.
> Proof: `bun qa/run.ts one-event-path`

## Canonical path (KEEP)

| Name | Transport | Emitters | Consumers | Classification | E1 disposition |
| --- | --- | --- | --- | --- | --- |
| **Kernel event fan-out** | in-process `EventEmitter` (`kernel-event`) → IPC `kernel:event` | `emitKernelEvent` in `src/kernel/**`, `src/main/conductor/conductor-loop.ts`, `conductor-tools-readonly.ts` | Main: `onKernelEvent` (watchers, divergence QA). Renderer: `preload/shell.ts` → `kernelApi.onEvent` → `routeKernelEvent` → `projection.js` reads. `conductor-panel.js` secondary listener on same channel. | **CANONICAL projection path** | **Keep** — sole fan-out for `KERNEL_EVENT_KINDS` (33 kinds in `taxonomy.ts`; synced via `taxonomy-sync`). |

```text
Kernel mutation → emitKernelEvent → webContents kernel:event
  → renderer routeKernelEvent (PF1 targeted + 50ms debounced refresh)
  → projection.js / canvas cache reconcile
```

## Runtime telemetry & audit (KEEP — non-canonical)

| Name | Transport | Emitters | Consumers | Classification | E1 disposition |
| --- | --- | --- | --- | --- | --- |
| **runtime.db events log** | SQLite `events` table via `appendEvent` / `listEvents` | `envoy-listener`, `envoy-service`, `envoy-task-service`, `workflow-service`, `herdr-status-service`, `herdr-runtime`, `ipc-herdr-spawn`, `tasks-repo` (`task.transition`), `ipc-runtime-state` (`qf:runtime:events.append`) | Main/tests: `envoy-task-service` correlation reads, smoke scripts. IPC pull: `qf:runtime:events.list` (Watchtower API; no renderer push subscriber). | **Audit / runtime telemetry** | **Keep** — derived mirror log; kinds must stay **disjoint** from `KERNEL_EVENT_KINDS` (`one-event-path` enforces). Header contract in `events-repo.ts`. |
| **Runtime event kinds (inventory)** | — | — | — | Audit only | See appendix A. Prefix families: `envoy.*`, `herdr.*`, `workflow.*` (runtime orchestration), `task.transition`. No exact overlap with Kernel taxonomy. |
| **status-repo transitions** | SQLite `status_transitions` | `herdr-status-service`, `ipc-runtime-state` | IPC `qf:runtime:status.*`; diagnostics | **Runtime telemetry** | **Keep** — pane agent status history; not canvas projection. |
| **herdr:status-changed** | IPC push (`webContents.send`) | `herdr-status-service` | Shell preload → `shellApi.onHerdrStatusChanged` → `renderer.js` (badge ephemera + `kernel.worker.status_update` command) | **Harness adapter** (telemetry in, Kernel command out) | **Deprecate for projection** — renderer must not refresh dock/projection from this bus; worker status projection flows via `worker.status_updated` on `kernel:event`. Allowlisted in `qa/lib/one-event-path-allowlist.ts`. |
| **EnvoyListener packet bus** | in-process `EventEmitter` (`packet`) | `envoy-listener.ts` stdout parse | `envoy-service` / task bridge subscribers; also mirrored to `events-repo` as `envoy.packet` | **Runtime telemetry** | **Keep** — harness ingress; audit via events-repo. |
| **PTY lifecycle** | sidecar JSON-RPC notification `session.exited` → IPC `pty:exit`, `pty:status-changed`, `pty:data` | `pty.ts`, sidecar `server.ts` | Preload `universal.ts` / `shell.ts`; renderer `onPtyExit` closes term tiles | **Harness stream / milestone** | **Keep** — E2 fences raw stream out of projection; `pty:exit` tile close allowlisted (local harness teardown, not Kernel fact). |
| **shell:forward** | IPC multicast `(target, channel, ...args)` | `main/index.ts` (open-file, browser tile, viewer) | Preload buffers → `shellApi.onForwardToWebview` → webview `.send` | **Shell routing** | **Keep** — cross-surface UI routing; not Kernel truth. String relay visual pings only. |
| **watchtower:relay-log** | IPC invoke → in-memory relay ring | `tile-session-registry` via `ipc-tile-registry` | Renderer Watchtower pull (`watchtowerRelayLog`); display only | **Audit / debug** | **Keep** — smart-string relay history for Watchtower; no projection. |
| **string:relay** | IPC invoke | Renderer / RPC callers | `smart-strings-repo` + relay log | **Harness / visual ping** | **Keep** — cable ping path; Kernel remains authority for connections. |

## Renderer-local logs (DEPRECATE for truth — KEEP for Watchtower UI)

| Name | Transport | Emitters | Consumers | Classification | E1 disposition |
| --- | --- | --- | --- | --- | --- |
| **operationalEvents** | in-renderer ring buffer (`createOperationalEventLog`) | `renderer.js` local UI actions (cables, tiles, roles) | Watchtower panels only | **Audit / operator feed** | **Deprecate for truth** — must not drive cache/projection. Header in `operational-event-log.js`. |
| **kernelEventLog** | in-renderer ring buffer (`createKernelEventLog`) | Fed only from `routeKernelEvent` → `recordEvent` | Watchtower merge with operationalEvents | **Audit mirror of canonical events** | **Keep** — read-only echo of `kernel:event`; not a second emitter. |

## Main-process orchestration (MAP ONLY — Stage D scope)

| Name | Transport | Emitters | Consumers | Classification | E1 disposition |
| --- | --- | --- | --- | --- | --- |
| **orchestration-service** | direct repo calls (no event bus) | N/A — synchronous repo API | `ipc-orchestration`, tests | **Legacy mirror writes** | **Defer (D/E follow-up)** — `runs-repo`, `tasks-repo`, `tiles-runtime-repo` writes; collapse to Kernel commands in later chunks. Do not modify in E1. |
| **onKernelEvent (main)** | in-process | Same as canonical | `src/kernel/watchers/index.ts`, QA divergence | **CANONICAL side-channel** | **Keep** — State Card promotion + QA; not a competing renderer path. |

## Dead / unused

| Name | Transport | Emitters | Consumers | Classification | E1 disposition |
| --- | --- | --- | --- | --- | --- |
| **watchtowerRuntimeEvents** | IPC `qf:runtime:events.list` wrapper | preload `shell.ts` only | **None** (no call sites) | **Dead API surface** | **Defer** — preload stub; Watchtower uses relay log + merged renderer logs today. Remove in Stage G IPC rationalization. |

## Deferred findings (E1 — document, do not build)

| ID | Finding | Rationale |
| --- | --- | --- |
| **E1-F1** | `herdr:status-changed` still pushes to renderer before Kernel round-trip | Acceptable harness adapter if projection only reacts to `kernel:event` `worker.*`; badge update stays local ephemera. Full collapse → Kernel watcher-only path is high-risk. |
| **E1-F2** | `onPtyExit` closes canvas tiles without `kernel:event` | Harness lifecycle; E2 milestone/receipt fence. |
| **E1-F3** | `orchestration-service` runtime repo writes | Stage D4 deferred; not an event bus but duplicate write path. |
| **E1-F4** | `watchtowerRuntimeEvents` unused preload export | Delete in G5 IPC cleanup. |

## Appendix A — runtime `events-repo` kind families

| Kind prefix / exact | Source module | Notes |
| --- | --- | --- |
| `task.transition` | `tasks-repo.ts` | Runtime task mirror FSM; Kernel task FSM emits `task.*` kernel events separately. |
| `envoy.packet`, `envoy.listen.*` | `envoy-listener.ts` | Envoy stdout ingress audit. |
| `envoy.space.*`, `envoy.profile.*` | `envoy-service.ts` | Space lifecycle telemetry. |
| `envoy.task.*` | `envoy-task-service.ts` | Envoy task mirror audit (post-Kernel bridge). |
| `envoy.spawn.notify_failed` | `ipc-herdr-spawn.ts` | Spawn failure telemetry. |
| `workflow.task.created`, `workflow.context.injected`, `workflow.activated` | `workflow-service.ts`, `ipc-herdr-spawn.ts` | Runtime workflow orchestration audit (not `workflow.created` Kernel kind). |
| `herdr.agent_status`, `herdr.bootstrap` | `herdr-status-service.ts`, `herdr-runtime.ts` | Herdr harness telemetry. |

## Verification

```bash
bun qa/run.ts one-event-path
bun qa/run.ts storm
bun qa/run.ts pty-flood
bun qa/run.ts taxonomy-sync
```

## Appendix B — E2 stream consumer audit (PTY + status side-channels)

| Path | Frequency class | Canvas effect today | Disposition |
| --- | --- | --- | --- |
| `pty:data` → `universal.ts` → terminal webview `onPtyData` | High (per chunk; 16ms batch on Win PowerShell sidecar only) | xterm write only — **no shell renderer subscriber** | **Keep fenced** — `processPtyDataForCanvas` is explicit no-op |
| `pty:data` → `pty.ts` `scheduleForegroundCheck` → `pty:status-changed` | Debounced 500ms on fg process change (skipped Win sidecar) | **None** — `onPtyStatusChanged` exported but **not wired** in shell renderer | **Keep** — no canvas leak |
| Terminal OSC 7 → `notifyCwdChanged` → `pty-cwd-changed` host IPC | Milestone (precmd / cd) | `autoTitle`, tile title DOM, debounced canvas save | **Coalesce (E2)** — `createPtyCwdCoalescer` 200ms; no `syncTileList`/`updateCables` |
| `pty:exit` → shell `onPtyExit` | Milestone (session exit) | `closeCanvasTile` → `kernel.tile.remove` + local teardown | **Keep** — legitimate milestone; Kernel path verified (D3) |
| `pty-session-id` / `pty-start-failed` / `pty-restore-stale` webview IPC | Milestone | Status/title/session hooks; save on fail | **Keep** — not stream-derived |
| Watchtower `syncTerminalTileStatuses` | Low (panel refresh) | `ptyStatus` edge-trigger; batch `syncTileList`+`updateCables` only on change | **Keep** — extracted `applyTerminalStatusMilestones`; not tied to stdout |
| `herdr:status-changed` → shell renderer | Harness ping | Badge ephemera + `kernel.worker.status_update` | **Keep (E1)** — no `syncTileList`/`updateCables`/projection refresh |
