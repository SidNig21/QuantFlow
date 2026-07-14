---
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
type: arch
branch: quantflow-mac-native
repos:
  - QuantFlow
  - quantflow-eve
title: "arch: QuantFlow Mac native rebuild — Swift spine + Eve + AgentOS dock actors"
created: 2026-07-13
supersedes_windows_execution: quantflow-v7-agentos-anchor
reference_windows_branch: quantflow-v7-agentos-anchor
---

# QuantFlow Mac Native Rebuild — Handoff & Steer

**Audience:** Mac-side agent (continuous build). **Windows operator:** handoff only — do not build Electron on Windows.

**Reference (frozen, do not extend):** `quantflow-v7-agentos-anchor` on GitHub — months of v3–v7 work; core spine is sound; Windows/WSL/Electron integration is the bloat and failure mode.

**New execution home:** same repo, new branch `quantflow-mac-native` (or Mac-local clone). Strip dated plan sprawl; keep constitutional spine.

---

## Goal Capsule

**Objective:** Rebuild QuantFlow as a native macOS app (SwiftUI, macOS 14+) that preserves the v3 spine — Kernel owns truth, Canvas projects, Conductor plans, Harness adapts — with dock catalogue entries spawning **Rivet AgentOS actors**, Eve as the first dock species via **Vercel Eve** (`eve.dev`), and ~1s dock-click tile readiness without Windows/WSL baggage.

**Authority:** `KERNEL_CONSTITUTION.md` + `docs/v3/{GLOSSARY,AUTHORITY_RULES,KERNEL_SCHEMA_V1}.md` + Windows v7 learnings (shared Eve server, session-scoped cables, dock actor registry). Windows execution plans (`REBUILD_QUEUE`, premier, v4/v7 ladders) are **archive reference only**.

**Open blockers:** AgentOS `createSession` serializes on one actor — Mac must not repeat Windows lane/pool hacks. The V8 port boundary audit is binding before M1–M4; it identifies v7's per-actor Eve-server implementation as distinct from the shared-server V8 hypothesis.

---

## Product Contract

### Summary

Windows proved the product shape and runtime contracts. It did not prove the shell should stay Electron + WSL. Mac rebuild **ports contracts and behavior**, not folders.

The dock is an **actor catalogue**: each card names a species (Eve first) that spawns a Rivet actor address `[workspaceId, tileId]` (or the measured shared-Eve pattern) through AgentOS. Eve runs as a multi-session server; tiles bind to Eve **sessions**, not ports.

### Problem Frame

1. **Platform bloat** — Electron shell, WSL sidecar, dual persistence, plan-queue sprawl obscured a sound Kernel spine.
2. **Windows-specific tax** — `/mnt/c` Eve boot (~20s), WSL lifecycle, IPC bridges dominated perf and morale.
3. **AgentOS attach path** — readiness must not block on serialized `createSession`; Mac greenfield should design attach order correctly from slice 1.

### What to keep (constitutional — non-negotiable)

| Layer | Keep |
| --- | --- |
| Kernel | SQLite truth, command/query boundary, task state machine, append-only receipts, State Cards |
| Canvas | Infinite workflow surface, semantic connections (delegation, context, artifact, verification, receipts, blockers), tile flip, no private authoritative state |
| Conductor | Read-only assessment + operator-triggered single actions through Kernel commands only |
| Harness | Runtime adapter fence; evidence returns drafts; Kernel posts truth |
| Dock | Catalogue of spawnable **actor species** backed by Rivet/AgentOS |
| Eve | Multi-session server; session-scoped identity for cables; React or native session **view** (not `eve dev` PTY rail — retired on Windows for split-session bug) |
| AgentOS | Rivet actor registry, ACP adapter path, localhost wire protocol (see `tools/agentos-host/AGENTS.md`) |
| quantflow-eve | Paired agent package; `eve build` before gates; session tools use `ctx.session.id` |

### What to delete on Mac branch (do not port)

- `quantflow-electron/` entire tree (reference only until parity)
- `REBUILD_QUEUE.md`, structure-freeze queues, premier perf plans as **execution** authority
- WSL lifecycle (`host-lifecycle.ts` Windows paths)
- `runtime.db` dual-truth patterns
- Actor-lane / warm-pool-of-servers experiments
- Five-click burst acceptance — product bar is **per click ≤1s promptable, unlimited tiles at normal pace**

### Definitions

| Term | Mac meaning |
| --- | --- |
| **Dock catalogue** | Declarative list of spawnable actor species (id, displayName, software, harnessKind). Eve is first promoted species. |
| **Actor address** | Rivet compound key `[workspaceId, tileId]` for AgentOS; Eve may use shared-server + per-tile session id (see Windows Addendum 1). |
| **Promptable** | Operator can type in tile and message reaches live Eve session (≤1s target after app warm). |
| **Runtime sidecar** | Local Node process hosting AgentOS + Eve supervisor on Mac (no WSL). Swift app speaks HTTP/JSON like today's `http-transport.ts`. |

### Requirements

| ID | Requirement |
| --- | --- |
| R1 | macOS 14+ SwiftUI app with four modules: Kernel, Canvas, Conductor, Harness (folder boundaries enforced in Xcode). |
| R2 | Kernel persists workflow truth in SQLite; Canvas reads via query API only; no canvas-owned tile/task state. |
| R3 | Dock catalogue drives spawn: click card → Kernel `tile.create` + `worker.spawn` + runtime sidecar session for that species. |
| R4 | Eve dock species uses Vercel Eve: one shared multi-session Eve server prewarmed at sidecar boot; per-tile durable session; cables use session id not port. |
| R5 | AgentOS (Rivet) remains encasement for dock actors; Swift never writes Kernel truth from agent runtimes. |
| R6 | Tile promptable ≤1s per dock click at normal operator pace; hard fail >2s; no fake-ready input queue. |
| R7 | Semantic connections render on canvas and record Kernel `connection` rows with typed semantics. |
| R8 | Inspector + Conductor views read same Kernel projections as canvas. |
| R9 | Windows branch `quantflow-v7-agentos-anchor` stays untouched as archaeological reference; Mac work on `quantflow-mac-native`. |
| R10 | Dated Windows plan docs moved to `reference/windows-superseded/` — not deleted from git history, removed from agent read order. |

### Acceptance Examples

| ID | Example |
| --- | --- |
| AE1 | Operator clicks Eve on dock → tile shell + session view in ≤1s → sends message → Eve replies; no WSL. |
| AE2 | Two Eve tiles, one cable, `cable_send` both directions with session-scoped identity. |
| AE3 | Conductor panel shows tasks/receipts/blockers from Kernel; no private planner store. |

### Scope Boundaries

**In scope (Mac ladder M0–M4)**

- Repo hygiene + branch cut
- Swift Kernel + Canvas shell
- Dock catalogue (Eve first)
- Native Mac runtime sidecar (port `tools/agentos-host` without WSL)
- Eve session tile view
- Basic tasks + receipts

**Out of scope (later M-rungs)**

- Full Conductor loop, vault mirror, MCP server, cloud tier, RL/evals
- Porting entire Windows QA harness
- Pi/Claude/Codex dock species until Eve path green

**Non-goals**

- Continuing Electron on Windows
- Reintroducing `eve dev` PTY display rail
- Finite session pools or actor lanes as perf workarounds

### Success Criteria

1. Native Mac app launches; canvas shows tiles and connections from Kernel.
2. Eve dock spawn promptable ≤1s (after sidecar warm).
3. AgentOS sidecar runs natively on macOS (Node 24+), not WSL.
4. Constitutional mutation path preserved: intent → Kernel command → event → Canvas refresh.
5. Agent read order on Mac branch fits on one screen: `AGENTS.md` → this plan → `KERNEL_CONSTITUTION.md` → `docs/v3/`.

### Outstanding Questions

| ID | Question | Default |
| --- | --- | --- |
| OQ1 | Eve session UI: native Swift transcript vs embedded eve/react WebView? | Start Swift-native broker tail; embed only if parity blocked in M3. |
| OQ2 | Shared Eve actor vs per-tile actors on Mac? | Shared Eve **server** yes; per-tile Rivet actors for non-Eve; Eve uses measured shared-actor + session identity until Rivet concurrent createSession exists. |
| OQ3 | Publish separate GitHub repo later? | Optional; branch-first per operator ruling. |

---

## Mac build ladder (continuous goal shape)

Execute **one rung at a time**. Each rung ends with a demo + commit.

```text
M0 — Branch hygiene
  Create quantflow-mac-native from v7 anchor (or Mac local cut).
  Move docs/plans/* (except this file), REBUILD_QUEUE, PREMIER, v4/v7 ladders → reference/windows-superseded/
  New START_HERE.md: Mac read order only.
  Swift Xcode project: QuantFlow.app, macOS 14, empty shell window.

M1 — Kernel in Swift
  Port schema v3 baseline tables (tiles, connections, tasks, receipts, workers, workflows).
  Command dispatcher + query snapshots.
  Proof: unit tests create tile, move tile, post receipt.

M2 — Canvas SwiftUI
  Infinite pan/zoom canvas, tile nodes, semantic edge types, selection/drag.
  Subscribes to Kernel events; zero authoritative local tile store.
  Proof: drag tile → Kernel command → re-render.

M3 — Runtime sidecar (AgentOS + Eve native Mac)
  Copy tools/agentos-host → tools/agentos-host-mac OR same folder with platform branch.
  Remove WSL assumptions; bind localhost; first measure shared-server/per-session Eve against v7's per-actor server topology. Document the result before selecting a production topology.
  Swift RuntimeClient: HTTP transport matching existing session/prompt/events routes.
  Proof: sidecar health + one Eve session create <100ms on warm server.

M4 — Dock catalogue + Eve spawn
  Port DOCK_SPAWN_ACTOR_IDS / legend recipe **shape** (not Electron files).
  Dock UI → spawn Eve: tile + worker + sidecar session + session broker registration.
  Eve session tile view (SwiftUI) tails broker snapshots.
  Proof: dock click ≤1s promptable; message round-trip.

M5 — Cables + two-Eve proof
  Kernel connections + host /cable/* with session-scoped identity.
  Proof: cabled Eves exchange message both directions.

M6 — Conductor + Inspector (read-only)
  Kernel query projections in secondary panels.

M7 — Harness interface stub
  WorkerHarness protocol in Swift; shell harness first; agent path behind fence.
```

---

## What to lift from Windows (copy contracts, not code)

| Windows artifact | Mac use |
| --- | --- |
| `KERNEL_CONSTITUTION.md` | Binding |
| `docs/v3/KERNEL_SCHEMA_V1.md` | Swift schema |
| `tools/agentos-host/host.js` wire routes | Sidecar API contract |
| `tools/agentos-host/eve-supervisor.js` shared server model | Direct port |
| `tools/agentos-host/eve-session-broker.js` | Direct port |
| `quantflow-electron/src/main/legend-recipes.ts` | Dock catalogue **data shape** |
| `src/harness/agentos/transport.ts` | Swift client interface |
| `docs/v7/HANDOFF-EVE-SESSION-TILE.md` | Eve display rail decisions (no PTY) |
| `quantflow-eve/agent/tools/cable_*.ts` | Eve build + session id tools |

---

## Entry command (paste to Mac agent)

```text
go quantflow-mac M0 — docs/plans/2026-07-13-002-arch-quantflow-mac-native-rebuild-plan.md

Windows quantflow-v7-agentos-anchor is reference only. Build on branch quantflow-mac-native.
Preserve Kernel/Canvas/Conductor/Harness spine. Eve (eve.dev) + AgentOS (rivet.dev) via native Mac sidecar.
Dock catalogue = actor species → Rivet spawn. No Electron, no WSL, no dated plan execution.
First demo: M1 Kernel tests green. Do not skip M0 hygiene.
```
