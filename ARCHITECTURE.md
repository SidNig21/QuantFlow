# QuantFlow V2 — Four Layer Architecture

**Layer 1 — Visual** — Collaborator canvas, React, xterm.js. Unchanged from V1. Owns tile positions, string visuals, user interaction only.

**Layer 2 — Process Runtime** — Herdr. Owns all WSL agent sessions. Named sessions, semantic state (working/blocked/done/idle), persists across crashes, Unix socket API. node-pty is Windows shell fallback only.

**Layer 3 — Communication** — A2A for agent-to-agent, MCP relay port 9811 for agent-to-tool. Every agent tile publishes an Agent Card. Strings on canvas are visual representations of A2A connections. No custom relay pipeline.

**Layer 4 — Shared Memory** — Envoy. One space per canvas. Cross-boundary coordination, signed receipts, audit trail. Dumb tiles never call Envoy directly — watchers post on their behalf.

**Build order:** herdr socket bridge → one tile end to end → A2A strings → full legend palette → Envoy bridge.

No layer does another layer's job. This document is the authority. No implementation decisions not covered here without updating this document first.
