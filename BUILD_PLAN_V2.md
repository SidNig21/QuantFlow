# QuantFlow V2 — Build Plan

**Slice 1 — DONE (f72c0b4)** — Herdr socket bridge. Connect Electron main process to herdr Unix socket in WSL2. Send ping, receive pong.

Proof: `{"type":"pong","version":"0.5.5","protocol":2}`

**Slice 2 — One tile end to end.** Hermes tile spawns from legend via herdr agent.start. xterm.js renders output. Tile shows live state from herdr events. No polling.

**Slice 3 — A2A strings.** One string between two tiles creates an A2A connection. Source tile has Agent Card. Target receives delegated task. Result flows back.

**Slice 4 — Full legend palette.** All built-in tiles spawn correctly. Custom tile registration form uses identical config format to built-ins.

**Slice 5 — Envoy bridge.** Canvas loads one Envoy space. Dumb tile output posted by watcher. Hermes reads with matching connection and correlation IDs.

**Rule:** Do not start a slice until the previous slice passes its acceptance criteria.
