# QuantFlow v2 — build plan

Read `CONCEPT.md` first. Boundaries in `SCOPE.md`.

**Rule:** Next slice only after current gate passes operator acceptance in `SCOPE.md`.

---

**Gate 1 — DONE (`f72c0b4`)** — herdr socket ping → pong from Electron main.

Proof: `{"type":"pong","version":"0.5.5","protocol":2}`

---

**Gate 2 — DONE (`035f4f5`)** — one Hermes tile, end to end.

- retirement-v1-relay: DONE (`6961506`)
- Legend spawn → herdr socket creates pane, starts agent (`hermes` command).
- Tile persists `herdrPaneId`, `herdrAgentName`.
- Display: **PTY bridge** to that pane (v1 slice 2a model). Interactive xterm.
- Windows Generic CLI unchanged (node-pty only).

---

**Gate 3** — live tile state via herdr `events.subscribe` (no WSL polling).

---

**unify-spawn-pipeline — ACTIVE** — all WSL legend agents via herdr.

- `runtimeTarget` on every role (`herdr-wsl` | `windows-pty`)
- `commandTemplate` / `startupPrompt` sent via `pane.send_text` on herdr spawn
- One shared `spawnRoleTileAt()` — no macro-typing for `herdr-wsl` tiles
- Pass: Legend Codex → herdr pane → command sent → interactive tile

**Not this slice:** RL template cleanup, A2A, Envoy.

---

**Later** — A2A strings → legend palette → Envoy bridge (see `SCOPE.md` frozen list).
