# HANDOFF — Eve session tile: one server-side session per tile, React session view, TUI rail retired

**Date:** 2026-07-12 · **Branch:** `quantflow-v7-agentos-anchor` @ `c586e28` (+ uncommitted working tree, see §2) · **Repos:** `QuantFlow` + `quantflow-eve`
**Driver:** founder, in the Codex app. This document is the single authority for this work.

> **SUPERSEDES:** `docs/v7/HANDOFF-T-UX-REMAINDER.md` **§4 (U1, both fork paths)**. Fork (b) — host-side `eve dev --url` PTY rail — was BUILT (it's the uncommitted tree) and live-tested on 2026-07-12. It renders beautifully and is architecturally wrong: it created the split-session defect below. Do not iterate on it; do not build fork (a) either. Everything else in HANDOFF-T-UX-REMAINDER (§5 native-collab close-out, §6 commit rules, §7 manual exit shape, §9 gotchas, §10 parked queue) **remains valid** and is incorporated by reference. Plan 002 remains valid U2–U6 reference.

---

## 0. Paste-to-Codex kickoff

```
Repo: C:\Users\rybow\QuantFlow (branch quantflow-v7-agentos-anchor) + C:\Users\rybow\quantflow-eve
Read docs/v7/HANDOFF-EVE-SESSION-TILE.md fully — it is the new authority; it supersedes
HANDOFF-T-UX-REMAINDER §4 (the native-TUI rung, both forks) and keeps the rest of that doc valid.

Task order:
1. §5 E1: eve-acp persistent session fix (quantflow-eve first, rebuild .aospkg, commit on green).
2. §5 E2: session broker design — STOP and report the design BEFORE building (founder gate).
3. §5 E3: Eve session tile view (React, eve/react useEveAgent) after E2 approval.
4. §5 E4: delete the eve-dev TUI PTY rail (keep the warm pool and eve-server supervisor).
5. §5 E5: gates green incl. agentos-eve-native-collab; assertions never weakened.
Commit rules = HANDOFF-T-UX-REMAINDER §6. Never touch DOCK_SPAWN_ACTOR_IDS.
Respect every §9 gotcha there plus §7 here. One Electron gate at a time, never mid-edit.
```

---

## 1. The defect this rerail fixes (verified live 2026-07-12, real shortcut-launched app)

A2A dispatch WORKS: tile A ran `cable_list` → `cable_send`, got B's answer ("four"), reported it. Tile B stayed **visually blank**. Root cause is structural, not a bug in the relay:

- Each Eve tile runs ONE Eve server (WSL, `eve start`, per-actor port) with **two independent clients** attached:
  1. the guest ACP adapter (`quantflow-eve/agentos/eve-acp/index.js`) — carries human ACP prompts and A2A deliveries;
  2. the `eve dev --url` TUI PTY (`tools/agentos-host/eve-supervisor.js` → `openEveTuiForActorKey`) — what the operator sees.
- Worse than "two sessions": the adapter's `createTurn` (index.js ~131) POSTs `/eve/v1/session` with only `{message}` — **every prompt creates a brand-new Eve session**. N+1 sessions per tile.
- The TUI cannot attach to an existing session: `eve dev --help` has no `--session`; Eve docs state "each terminal UI creates a fresh client session while sharing the server process."
- The tile's session-event render rail is deliberately OFF for Eve (`usesNativeTerminal('eve')`, `agentos-terminal-bridge.ts:122` / `:243`), so A2A activity has no path to the visible pane at all.

Blank tile B is exactly what this architecture must produce. **Eve is server-native** (conversation = server-side durable session; the TUI is a dev-time viewer), so the fix is to make the session the single source of truth and render IT — not to force a terminal shape.

## 2. Honest ledger (working tree = fork (b); salvage list is explicit)

| Work | State | Disposition |
|------|-------|-------------|
| U5/U6 transport, `/cable`, bite 1 framing/discovery/tripwire | ✅ committed `d69ec3a` `bf4f131` `f37b9ab` `c586e28` | untouched — coordination rail stays exactly as is |
| Warm Eve pool (`prewarmEve`/`adoptWarmEve` in eve-supervisor.js, uncommitted) | 🟡 in tree, works | **KEEP** — server pool is needed regardless of display rail |
| `eve dev` TUI PTY rail (`openEveTuiForActorKey`/`writeEveTui`/`resizeEveTui`/`closeEveTui`, host.js `eve-tui` terminal kind, bridge `usesNativeTerminal` branch) | 🟡 in tree, works visually, architecturally superseded | **DO NOT COMMIT** — deleted in E4 |
| U4 Eve `cable_list`/`cable_send` tools (`quantflow-eve/agent/tools/`) | 🟡 untracked, reviewed, in bundle | commit per HANDOFF-T-UX-REMAINDER §6 (eve repo first) |
| U6 `agentos-eve-native-collab` proof + wiring | 🟡 in tree, never passed live | **KEEP**, assertions unchanged; goes green in E5 |
| eve-acp persistent session | 🔴 not started | E1 |
| Session broker + React session tile | 🔴 not started | E2/E3 |

## 3. Platform facts the plan rests on (all verified in installed code 2026-07-12 — do not re-litigate)

1. `POST /eve/v1/session/:sessionId` exists (continue an existing session externally); `GET /eve/v1/session/:sessionId/stream` is index-based NDJSON with reconnect. (`eve/dist/src/public/channels/eve.js`, eve 0.11.8)
2. Eve's official client (`eve/client`, `ClientSession`) manages `sessionId` + `continuationToken` + `streamIndex` — the exact cursor semantics E1 must adopt.
3. `eve/react` ships `useEveAgent` — **headless** hook with `host` (absolute origin → the tile's Eve baseUrl) and `initialSession: SessionState` (**resumable cursor = attach to existing session**), plus `send`/`stop`/`reset`, optimistic projection, reconnect. (`eve/dist/src/react/use-eve-agent.d.ts`)
4. QuantFlow's renderer is React 19.2.4 — the hook drops in directly.
5. Founder-locked framing: no `/cable`-style text injection into a foreign conversation, ever; QuantFlow visualizes real AgentOS/Eve state only.

## 4. Target architecture (one sentence per layer)

**One Eve server per tile (unchanged, warm pool kept) → ONE durable Eve session per tile = the single source of truth → the ACP adapter is the only Eve writer and continues that session (human ACP prompts and A2A deliveries land in it) → the host broker serializes AgentOS prompts and read-only tails the stream → the tile renders that session with a React view instead of a PTY.** Terminal-native agents (Codex CLI, Claude Code, pi, opencode) keep PTY/ACP tiles; server-native agents get session tiles. Two tile flavors, one AgentOS encasement.

## 5. Work order (dependency-ordered; commit per slice on green)

### E1 — eve-acp persistent session (small, a real bug regardless of everything else)

`quantflow-eve/agentos/eve-acp/index.js`: per ACP `sessionId`, create the Eve session ONCE (first prompt), store `{eveSessionId, continuationToken}`, and send every subsequent turn via `POST /eve/v1/session/:eveSessionId` with the continuation semantics Eve's own `client/session.js` uses. Preferred: import Eve's official client (`eve/client` `ClientSession`) inside the adapter if aospkg bundling allows; otherwise mirror its cursor handling manually. Update `eve-acp/index.test.js` to pin: two prompts on one ACP session hit ONE Eve session.
**Gotcha:** the host loads `quantflow-eve/agentos/dist/package.aospkg` — rebuild the package (see `quantflow-eve/agentos/scripts/`) after any adapter change, same failure class as HANDOFF-T-UX-REMAINDER §9.1 (stale bundle = old behavior, silently).
**Exit:** adapter tests green + a2a/multispawn gates green. Commit `quantflow-eve` first.

### E2 — session broker (STOP AND REPORT DESIGN BEFORE BUILDING — founder gate)

Requirements the design must satisfy; the mechanism is yours to propose:
- The adapter and the tile view resolve the **same** Eve `sessionId` for a tile (e.g. adapter reports the sessionId to the host on create, host registry keyed by actor key; or host pre-creates the session — note `POST /eve/v1/session` requires a message, so lazy-create-on-first-turn + registry is likely the shape).
- **Per-tile turn serialization:** a human turn and a peer (A2A) turn must never race. ALL writes funnel through the host queue into AgentOS's prompt rail; the ACP adapter is the sole process that POSTs Eve turns and owns the continuation cursor. The broker never writes directly to Eve.
- The adapter reports `eveSessionId` once at first create. The renderer obtains the broker's read-only `{sessionId, events, revision}` projection; the broker tails `GET /session/:id/stream` and publishes update revisions without remounting the tile per event.
- Coordination rail (`/cable/*`, framing, `additionalInstructions`) untouched.

### E3 — Eve session tile view (after E2 approval)

New React component in `quantflow-electron` for Eve tiles: `useEveAgent({ host: tileEveBaseUrl, initialSession })`; render messages, reasoning, and tool calls in QuantFlow's design language (hook is headless — the visuals are ours; plain first pass is fine, no synthetic `>` prompt chrome, no fake banners). Tile input sends into the same session via the E2 funnel. Inbound peer turns must render live: received → working → replied.
**Known dependent:** the `agentos-eve-cable-chat` gate drives the ACP line editor's `/cable` path — give it a valid input path on the new surface (route `/cable` through the E2 funnel or drive the coordination rail directly); do not delete the gate.

### E4 — retire the TUI PTY rail (only after E3 is proven on canvas)

Delete: `openEveTuiForActorKey`/`writeEveTui`/`resizeEveTui`/`closeEveTui` + `runningTuis`/`tuiByShellId` (eve-supervisor.js), the `eve-tui` terminal kind (host.js), `usesNativeTerminal` special-casing (agentos-terminal-bridge.ts). Keep: `ensureEveForActorKey`, warm pool, `stopEveForActorKey`, port allocation — the server supervisor is permanent. Update eve-supervisor tests.

### E5 — proofs green (assertions never weakened)

```sh
bun qa/run.ts agentos-toolkit-envelope
bun qa/run.ts agentos-eve-multispawn
bun qa/run.ts agentos-eve-a2a
bun qa/run.ts agentos-eve-cable-chat      # with its E3 input path
bun qa/run.ts agentos-eve-native-collab   # the U6 close-out — code exists, see HANDOFF-T-UX-REMAINDER §5 env notes
```

Extend `agentos-eve-native-collab` (or add a sibling) with the NEW exit assertion this rerail exists for: **tile B's rendered view contains the inbound framed peer message and B's reply** — not just B's persisted session events.

## 6. Founder manual exit (~10 min, after E5)

1. Spawn Eve A + B from the dock; cable them. Tiles show the session view (live conversation, no `"Eve ready"` banner, no fake `> `).
2. In A: `Ask your cabled peer what 2 + 2 is and tell me their answer.`
3. Pass: A's tile shows her choosing the cable tool; **B's tile visibly shows the inbound `Message from cabled agent @…`, working state, and B's reply**; A reports "my peer says 4."
4. Type a normal human message into B before and after — same conversation, one cursor, no phantom turns.
5. Delete the cable, repeat → A reports no peers.

## 7. Gotchas (additive to HANDOFF-T-UX-REMAINDER §9, which all still apply)

1. **Stale `.aospkg` = stale adapter.** Any `quantflow-eve/agentos/**` change needs the package rebuild before host restart; symptom is "fix didn't take."
2. **`useEveAgent` rejects `send` while a turn is in flight** (client-side only) — that does NOT serialize cross-client writers; E2's funnel is the real serializer.
3. **Session config is read when the hook's store is created** — remount the tile component to point at a different host/session; don't mutate options in place.
4. **Warm-pool adoption re-keys the server, not the session** — sessions are created lazily per tile after adoption; the broker registry must key by actor key (workspaceId+tileId), never by port.
5. **Never assert Electron relay logs for agent-initiated sends** (HANDOFF-T-UX-REMAINDER §9.6) — assert persisted session events and, new in E5, the rendered view.

## 8. Parked (unchanged)

T-PERF relay-actor warm pool (Rivet keying trap noted), U8 DOX (now also: document the session-tile architecture + two tile flavors in `tools/agentos-host/AGENTS.md`), U7 promotion (founder-only, `DOCK_SPAWN_ACTOR_IDS`), Omnigent (L6 supervision only). Upstream nice-to-have, non-blocking: file `eve dev --session <id>` attach request with Vercel — if it ever ships, it's a debug convenience, not a dependency.
