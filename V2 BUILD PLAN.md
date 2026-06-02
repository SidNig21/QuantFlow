# QuantFlow v2 — Build Plan

**Only execution doc on branch `quantflow-v2`.** Read `V2 ARCHITECTURE.md` first.

**Baseline:** branched from v1 `QuantFlow` @ legend 1B (`2dedca2` lineage). v1 branch and vault Build Plan stay frozen for v1 work.

**30-day rule (2026-06-01):** No slice beyond Slice 1 until herdr socket ping → pong works from Electron main. Do not revisit this gate for 30 days.

---

## What we are proving

QuantFlow v2 works when:

1. Electron main talks to herdr over the **socket API** (not CLI spawn per call).
2. WSL sessions use herdr authority + PTY bridge display (v1 proofs stand).
3. A2A + Envoy + legend extensions land **only on top of** a proven socket foundation.

---

## Slices (mandatory order)

| Slice | Name | Scope | Done when |
|-------|------|--------|-----------|
| **0** | v2 docs | `V2 ARCHITECTURE.md`, `V2 BUILD PLAN.md` | Committed on `quantflow-v2`; agents read these first |
| **1** | **herdr socket bridge** | **One module:** connect from main, `ping` → `pong` | See acceptance below — **ACTIVE** |
| **2** | herdr spawn rewire | Legend/backend: create pane, PTY attach, persist `herdrPaneId`, events socket | *Scoped after Slice 1 pong — not started* |
| **3** | Legend + typed templates | Unified spawn config; named herdr sessions; manual Commence | *Gated* |
| **4** | A2A protocol | Agent Cards per tile; strings ↔ delegations; MCP 9811 unchanged | *Gated* |
| **5** | Envoy on canvas load | One space per canvas; watcher-posts-for-dumb-tiles; stub replaced | *Gated* |

**Out of slice order (post-5):** Factory Droid / BYO Machine QA, tennis vision, RL training infra — tracked in architecture deferred list.

---

## Slice 0 — acceptance

- [x] `V2 ARCHITECTURE.md` describes four layers and non-overlap.
- [x] This file lists slices 0–5 with gates.
- [x] First commit on `quantflow-v2` is **docs only** (these two files).

---

## Slice 1 — herdr socket bridge (ACTIVE)

**Goal:** Prove Electron main can reach the herdr Unix socket API in WSL.

**Scope (strict):**

- Add `quantflow-electron/src/main/herdr-socket-bridge.ts` only.
- Implement `pingHerdrSocket()` (or equivalent export): newline-delimited JSON `{"id","method":"ping","params":{}}` → `result.type === "pong"`.
- Windows: reach WSL socket via `wsl.exe` transport (no new dependencies).
- Linux / dev-in-WSL: direct `net.connect` to socket path.
- **Do not** wire IPC, legend, Envoy, A2A, or replace `herdr-bridge.ts` in this slice.
- **Do not** implement `events.subscribe`, pane ops, or spawn rewire.

**Socket path resolution:**

1. `process.env.HERDR_SOCKET_PATH` if set  
2. Else WSL default `~/.config/herdr/herdr.sock` (via `herdr status server` when needed)

**Prerequisite (operator):** herdr server running in WSL (`herdr status server` → `status: running`).

### Acceptance

| # | Check |
|---|--------|
| 1 | With herdr server **running** in WSL, a one-shot call from main returns `{ type: "pong", ... }`. |
| 2 | With herdr server **stopped**, call fails fast with a clear error (not hang). |
| 3 | Second commit on `quantflow-v2` contains **only** `herdr-socket-bridge.ts` (plus no unrelated files). |

**Proof command (dev):** from `quantflow-electron/`, run bridge ping via `bun` against the module export after implementation.

---

## Slice 2 — acceptance (draft — finalize after pong)

- WSL legend spawn creates herdr pane and PTY attach; `herdrPaneId` persisted on tile.
- `herdr:available` (or successor) uses socket bridge, not CLI `exec` for availability.
- Windows shell tiles still use node-pty sidecar only.
- Slice 2 scope doc updated in this file before implementation starts.

---

## Slice 3 — acceptance (draft)

- Legend palette entries spawn named herdr sessions from typed template config (single config format for built-in + custom tiles).
- Session template: layout + strings + Envoy registration; **manual Commence** before workers start.

---

## Slice 4 — acceptance (draft)

- Each agent tile publishes an A2A Agent Card.
- String inspector / triggers map to A2A delegations (event pings, not stdout firehose).
- MCP relay on **9811** still passes smoke `ping` → `pong`.

---

## Slice 5 — acceptance (draft)

- Canvas load creates/joins one Envoy space.
- Dumb tiles never call Envoy directly; watcher proxy posts structured packets.
- Watchtower and Envoy agree on `connection_id` / `correlation_id` for proof flows.

---

## Agent read order (v2)

1. `V2 ARCHITECTURE.md`  
2. `V2 BUILD PLAN.md` (this file)  
3. Vault `Projects/QuantFlow/How the pieces fit.md` for v1 guardrails still in force  
4. Do **not** implement from `Projects/QuantFlow/reference/`

---

## Git

| Item | Value |
|------|--------|
| Branch | `quantflow-v2` |
| Push remote | `origin` only |
| v1 branch | `QuantFlow` (preserved) |
