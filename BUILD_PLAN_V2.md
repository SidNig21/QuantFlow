# QuantFlow v2 — build plan

Read `CONCEPT.md` first. Boundaries in `SCOPE.md`.

**Rule:** Next slice only after current gate passes operator acceptance in `SCOPE.md`.

---

**Gate 1 — DONE (`f72c0b4`)** — herdr socket ping → pong from Electron main.

Proof: `{"type":"pong","version":"0.5.5","protocol":2}`

---

**Gate 2 — ACTIVE** — one Hermes tile, end to end.

- Legend spawn → herdr socket creates pane, starts agent (`hermes` command).
- Tile persists `herdrPaneId`, `herdrAgentName`.
- Display: **PTY bridge** to that pane (v1 slice 2a model). Interactive xterm.
- Windows Generic CLI unchanged (node-pty only).

**Not gate 2:** A2A, Envoy, full legend, events.subscribe (that's gate 3).

---

**Gate 3** — live tile state via herdr `events.subscribe` (no WSL polling).

---

**Later** — A2A strings → legend palette → Envoy bridge (see `SCOPE.md` frozen list).
