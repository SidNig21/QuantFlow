# QuantFlow v2 — Architecture

**Branch:** `quantflow-v2`  
**Authority:** This file + `V2 BUILD PLAN.md` for v2 execution. v1 remains on `QuantFlow` branch with vault `Projects/QuantFlow/Build Plan.md`.

**30-day gate (2026-06-01):** Nothing beyond the herdr socket bridge ships until ping → pong is proven from Electron main. See Build Plan Slice 1.

---

## Core lesson

v1 tried to build coordination from scratch — custom relays, session logic on top of node-pty, a fuzzy Envoy role. v2 assigns **one job per layer** and uses purpose-built tools: herdr (process), A2A (communication), Envoy (memory), Collaborator fork canvas (visual). Assemble standards; do not reimplement herdr inside Electron.

---

## Four layers

Each layer has one job. No layer does another layer's work.

### Layer 1 — Visual (Collaborator fork)

Canvas, React shell, xterm.js, tiles, strings (visual), ports, pan/zoom.

- **Owns:** spatial UI and operator interaction.
- **Does not own:** process state, agent routing, durable run memory.

**v2 stance:** Keep almost entirely as-is. The fork was the right move.

### Layer 2 — Process runtime (herdr)

Herdr owns every WSL agent session: named sessions, processes, semantic state (idle / working / blocked / done), persistence across crashes, control via Unix socket API.

- **Owns:** WSL session authority — create panes, `agent.start`, lifecycle, events.
- **Does not own:** canvas layout, cross-agent messaging, durable audit store.

**Display (unchanged from v1 proofs):** node-pty runs **herdr attach/client inside WSL** → xterm. Direct `herdr-client.sock` → xterm remains **blocked** (slice 0a). node-pty is **Windows native shell fallback only**.

**v2 stance:** Socket API is the machine interface; CLI bridge (`herdr-bridge.ts`) is legacy until migrated slice by slice.

### Layer 3 — Communication (A2A + MCP)

- **A2A:** agent-to-agent — Agent Cards, discovery, delegation. Canvas strings are the **visual** map of A2A links underneath.
- **MCP (port 9811):** agent-to-tool — existing QuantFlow relay stays. A2A picks the agent; MCP gives tools.

- **Owns:** routing work between agents.
- **Does not own:** PTY bytes, durable receipts, canvas persistence.

**v2 stance:** Replaces the custom string-relay / watcher / transformer pipeline ambition. Implement once; new agents speak the standard.

### Layer 4 — Shared memory (Envoy)

Cross-boundary memory: tasks, evidence, decisions, receipts, signed provenance. **One space per canvas.**

- **Owns:** durable shared state, cross-machine results, audit trail.
- **Does not own:** live agent chat transport, terminal rendering.

**v2 stance:** Envoy is memory and proof — not the messaging layer. A2A moves messages; Envoy remembers them. Dumb tiles never call Envoy directly; watchers post structured packets on their behalf (carried forward from v1).

---

## Explicit non-overlap

| Layer | Does NOT |
|-------|----------|
| Canvas | Track process state (herdr does) |
| herdr | Route agent messages (A2A does) |
| A2A | Store durable state (Envoy does) |
| Envoy | Render UI (canvas does) |

---

## Carried forward from v1 (non-negotiable until explicitly changed)

- `connections[]` canonical; `connection_id` + `correlation_id` for Watchtower / Envoy proof.
- **Manual Commence** for session templates (operator inspects canvas before workers start).
- **Templates + legend** build canvas; Hermes orchestrates **after** Commence — not via MCP tile CAD.
- Strings: event pings, not stdout firehose (trigger config survives; transport becomes A2A in later slices).
- herdr: bootstrap on need; **never teardown** on app quit.

---

## Deferred (real, but gated)

A2A wiring, Envoy bridge on canvas load, full legend palette, Factory Droid / BYO Machine QA, tennis vision tiles, RL training infrastructure — all planned **after** the herdr socket foundation passes Slice 1 in `V2 BUILD PLAN.md`.

---

## Repo layout

| Path | Role |
|------|------|
| `quantflow-electron/` | Electron app (Layer 1 + main-process bridges) |
| `tools/quantflow-mcp/` | MCP → relay :9811 |
| Vault `Projects/QuantFlow/` | v1 spikes and reference only — not v2 execution authority |

---

## Upstream Collaborator

Keep `upstream` → `collaborator-ai/collab-public`. Cherry-pick canvas/security fixes; do not blind-merge over QuantFlow main-process work.
