# QuantFlow v2 — build plan

Read `CONCEPT.md` first. Boundaries in `SCOPE.md`.

**This is the only build plan.** Archived layer charters live in `reference/archive/quantflow-v2-layer-charters/` — do not execute from there.

**Rule:** Next slice only after current gate passes operator acceptance in `SCOPE.md`.

---

**Gate 1 — DONE (`f72c0b4`)** — herdr socket ping → pong from Electron main.

---

**Gate 2 — DONE (`035f4f5`, `15b7852`)** — Hermes legend → herdr pane → interactive PTY.

- retirement-v1-relay: DONE (`6961506`)
- unify-spawn-pipeline: DONE (`de9c497`) — all WSL legend agents via `runtimeTarget` + herdr
- canvas polish: legend 400×500 tiles, larger resize handles, cable ports above resize zones

---

**Gate 3 — ACTIVE** — live tile state via herdr `events.subscribe` (no WSL polling).

Pass when: tile badges update from socket events; renderer 5s `herdrGetStatus` poll removed or retired.

---

**retirement-herdr-cli** — port `ipc-herdr.ts` to socket; delete `herdr-bridge.ts` CLI path.

---

**envoy-obsidian** — proof + memory bus (no A2A).

- One Envoy space per canvas; main-process bridge (`envoy listen` / post)
- Watchers post receipts for dumb tiles; Hermes reads proof
- Obsidian vault = durable operator memory; wire context pins / handoff paths to Envoy evidence
- Spike pass: one cable action → one Envoy receipt → visible in Watchtower or vault note

**Rejected:** A2A, Agent Cards, custom string relay (see `RETIREMENT.md`).

---

**Later** — legend cleanup (RL template isolation), Watchtower evolution, full palette.
