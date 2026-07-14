# QuantFlow Mac — start here

**Branch:** `quantflow-mac-native`  
**Platform:** macOS 14+, SwiftUI native app  
**Windows reference (frozen):** `quantflow-v7-agentos-anchor` — do not execute from it.

---

## Read order (every Mac session)

1. **This file** — front door; wins conflicts on Mac branch.
2. **`docs/plans/2026-07-13-002-arch-quantflow-mac-native-rebuild-plan.md`** — active ladder (M0–M7), scope, acceptance.
3. **`KERNEL_CONSTITUTION.md`** — Kernel owns truth; mutation/query paths.
4. **`docs/v3/{GLOSSARY,AUTHORITY_RULES,KERNEL_SCHEMA_V1}.md`** — canonical primitives.
5. **`docs/v7/HANDOFF-EVE-SESSION-TILE.md`** — Eve display rail (session tile yes; `eve dev` PTY no).
6. **`tools/agentos-host/AGENTS.md`** — AgentOS sidecar wire protocol (port to native Mac Node, no WSL).
7. Nearest **`AGENTS.md`** on the path you are editing.

**Do not execute from:** `REBUILD_QUEUE.md`, `BUILD_PLAN_V4.md`, `docs/v7/PREMIER_PHASE_PLAN.md`, or anything under `reference/windows-superseded/` unless this file points there for archaeology.

---

## Spine (unchanged from v3)

```text
Kernel owns truth → Canvas projects → Conductor plans → Harness adapts → Receipts prove
```

| Layer | Mac home |
| --- | --- |
| Kernel | Swift + SQLite (commands, queries, events) |
| Canvas | SwiftUI infinite workflow surface |
| Conductor | Swift read-only + operator actions via Kernel only |
| Harness | Swift protocol; shell first, agents behind fence |
| Runtime | Native Mac Node sidecar: AgentOS (Rivet) + Eve (Vercel) |

MCP stays external. Vault stays mirror, not live state.

---

## Runtime stack (Mac)

- **Dock catalogue** — spawnable actor species (Eve first); maps to Rivet/AgentOS.
- **Eve** — one shared multi-session server, prewarmed at sidecar boot; per-tile **session** identity; `quantflow-eve` paired repo.
- **AgentOS** — Rivet actor encasement; localhost HTTP like `tools/agentos-host/host.js`.
- **No WSL. No Electron.** Sidecar runs on macOS Node 24+.

---

## Product bar

- Dock click → **promptable in ≤1s** (hard fail >2s) at normal pace.
- Unlimited Eve tiles over time; no actor-lane pools, no fake-ready input queues.
- Cables use **session id**, not port.

---

## Active ladder (one rung at a time)

| Rung | Goal |
| --- | --- |
| **M0** | Branch hygiene, archive Windows plan sprawl, Xcode shell |
| **M1** | Kernel in Swift + tests |
| **M2** | Canvas SwiftUI + Kernel events |
| **M3** | Native Mac AgentOS/Eve sidecar |
| **M4** | Dock catalogue + Eve spawn ≤1s |
| **M5** | Cables + two-Eve proof |
| **M6** | Conductor + Inspector (read-only) |
| **M7** | Harness stub |

Details and requirements: the Mac rebuild plan (step 2 above).

---

## Entry command (Mac agent)

```text
go quantflow-mac M0 — START_HERE_MAC.md then docs/plans/2026-07-13-002-arch-quantflow-mac-native-rebuild-plan.md
```

---

## Windows archive layout (M0)

Move to `reference/windows-superseded/` (keep in git, remove from read order):

- `REBUILD_QUEUE.md`, `START_HERE.md` (Windows structure-freeze)
- `BUILD_PLAN_V4.md`, `docs/v7/PREMIER_PHASE_PLAN.md`, dated `docs/plans/2026-07-*` except `2026-07-13-002-*`
- `quantflow-electron/` — reference only until parity; not built on Mac branch

---

## Paired repos

| Repo | Role |
| --- | --- |
| `QuantFlow` (this) | Mac app + sidecar + Kernel |
| `quantflow-eve` | Eve agent; `npx eve build` before Eve gates |

---

## Handoff from Windows operator

Windows months on `quantflow-v7-agentos-anchor` validated Eve session tiles, shared Eve server, session-scoped cables, and dock actor promotion. Mac rebuild **ports those contracts**, not the Electron/WSL shell.
