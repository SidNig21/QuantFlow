---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: founder direction 2026-07-11 (post-U6) + Cursor ce-pov co-sign
origin: docs/plans/2026-07-11-001-feat-eve-agentos-path-a-adapter-plan.md
type: feat
branch: quantflow-v7-agentos-anchor
repos:
  - QuantFlow
title: "feat: T-UX-lite — cable-in-chat (tile Enter routes over canvas cable)"
created: 2026-07-11
deepened: null
---

# feat: T-UX-lite — cable-in-chat (tile Enter routes over canvas cable)

**Target repo:** `QuantFlow` (branch `quantflow-v7-agentos-anchor`, base `bf4f131`)

**Position on ladder:** After U6 (✅ `bf4f131`). Before T-PERF / T-UX-full (native TUI passthrough — explicitly out of scope here, designed later with T-PERF). U7 remains founder-only.

---

## Goal Capsule

When two AgentOS tiles are cabled on the canvas, the operator types in tile A's chat and the message crosses the cable: tile B's terminal shows the inbound `[a2a A→B] …`, tile A's terminal shows B's reply `[a2a B→A] …`. **No cable popover involved.** Transport is the already-proven U6 rail (`sendConnectionRelay` → host `/cable/send` → real `promptSession`); this slice only re-routes the tile's Enter key and makes the exchange visible in both terminals.

---

## Summary

U5/U6 proved the transport programmatically; the operator experience still requires the cable popover. The fork point is one line: `agentos-terminal-bridge.ts:219` — the ACP line editor's `onSubmit` goes straight to `transport.prompt(attach.sessionId, line)`. T-UX-lite inserts a routing decision there: if the tile has a live canvas cable, the submitted line rides `sendConnectionRelay` instead of the local prompt; otherwise behavior is unchanged. Everything downstream (host relay, `[a2a]` prefixing, reply echo to sender, relay log) already exists and passed U6 live.

---

## Problem Frame

Founder (2026-07-11): "when tiles are connected they can communicate — I would never step outside of the chat and type in the cable prompt." Today typing in a tile is always local chat to that tile's agent; cable sends only happen via the popover (`renderer.js:1367 sendCableMessage`) or programmatically. The v6 exit proof sentence ("cable two tiles, send a message, see the reply in terminals") was proven in the basement (U6 scripted) but never wired to the operator's hands.

**What already works (verified in code 2026-07-11):**
- Canvas cable draw → `kernel.connection.create` (`src/renderer/canvas/kernel-canvas.ts:45`) and the shell renderer pushes the connection list to main via `stringSyncConnections` (`renderer.js:311` → `ipc-tile-registry.ts:51` → `syncConnectionGraph`), which also pushes to the WSL host ACL (`pushConnectionGraphToHost`).
- `sendConnectionRelay` (`agentos-a2a-relay.ts:62`) → `sendTileDelegate` → `delegateAgentOs` → host `POST /cable/send` → `executeCableSend` (`tools/agentos-host/host.js:659`): prompts target session with `[a2a from→to] msg`, prompts the reply back into the sender's session, returns the reply, and `appendRelayLog` records both directions.
- Both tiles' terminals render session activity via `onSessionEvent` → `acpEventToTerminalText` (`agentos-terminal-bridge.ts:206-211`), so host-side prompts on either session are already visible in that tile's terminal.
- `notifySender` (`tile-relay-dispatcher.ts:294-303`) additionally writes the `[a2a B→A] reply` line into the sender's terminal via `writeAgentOsTileTerminal`.

**What's missing:** (1) the Enter-key fork, (2) a per-tile connection lookup in the registry, (3) an outbound echo so the sender sees what they dispatched, (4) confirmation that live cable draw/remove keeps the main graph fresh (re-sync hook if not).

---

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Typing + Enter in an AgentOS tile that has ≥1 live canvas cable routes the line over the cable via `sendConnectionRelay`; with no cable, local chat is byte-identical to today. |
| R2 | Sender terminal shows the outbound line as `[a2a <fromTile>→<toTile>] <text>` at submit time, and shows the peer's reply (existing `notifySender` path). |
| R3 | Target terminal shows the inbound `[a2a …]` prompt and its own reply (existing session-event rendering — verify, don't rebuild). |
| R4 | Escape hatch: a line starting with `/local ` strips the prefix and goes to the tile's own agent even when cabled. |
| R5 | Cable draw and cable delete on the live canvas immediately refresh the main-process connection graph (verify `stringSyncConnections` fires on both; add the hook only if missing). |
| R6 | Scripted qa gate `agentos-eve-cable-chat` proves the typed path end to end (two Eves, cable, keystrokes through the line editor, relay log both directions, screenshot). |
| R7 | Existing gates `agentos-eve-multispawn` and `agentos-eve-a2a` stay green; windows-pty and herdr rails untouched. |

**Out of scope (explicit non-goals):** native Eve TUI / PTY passthrough (T-UX-full), agent-initiated `cable.send` toolkit mount (blocked by AgentOS 0.2.7 schema, host.js:58-61), Omnigent, T-PERF warm actor pool, U7 dock promotion, any `tools/agentos-host/host.js` change, kernel `message.sent/replied` receipt semantics (U8/R4 later).

---

## Key Technical Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | **Default-relay polarity:** when cabled, plain Enter goes to the peer; `/local ` prefix reaches own agent. | Matches founder acceptance verbatim ("type in left tile, B hears it"). Tradeoff flagged: your own Eve stops answering plain chat while cabled. Polarity is isolated in one pure function (D3) so flipping it after founder's first manual session is a one-line change. |
| D2 | **Multiple cables:** relay to the most recently synced connection for that tile (deterministic); log a terminal notice `[a2a] n cables on this tile — using <id>`. Fan-out is future work. | Keeps lite small; single-cable is the acceptance scenario. |
| D3 | **Pure routing function** `resolveTileChatRoute(line, connections)` in a new dependency-free module `tile-chat-route.ts`, unit-tested without Electron. | The polarity/prefix/multi-cable rules live in one testable place. |
| D4 | **Dynamic import** of `agentos-a2a-relay` inside the submit handler. | `agentos-a2a-relay` → `tile-relay-dispatcher` → `agentos-terminal-bridge` already forms a chain; a static back-import from the bridge would create a cycle. The codebase already uses this pattern (`hostSidecarBaseUrl`). |
| D5 | **Registry, not dispatcher, owns the lookup:** add `getConnectionsForTile(tileId)` to `tile-session-registry.ts`. | Registry is the connection graph's home; it must not import relay modules (keeps the cycle rule simple). |
| D6 | **No host.js changes.** The host's back-prompt of the reply into the sender session (host.js:699-707) stays as-is even though it costs an extra LLM turn on the sender. | U6 passed live with it; touching the host is T-PERF/T-UX-full territory. Note it in the manual test expectations (sender's Eve may add a comment after the `[a2a]` reply line — acceptable for lite). |

---

## Implementation

### Slice 1 — routing core (pure, unit-tested)

**New file `quantflow-electron/src/main/tile-chat-route.ts`:**
```ts
export interface TileChatRoute {
  kind: "local" | "cable";
  text: string;            // /local prefix stripped for local routes
  connectionId?: string;   // set for cable routes
  toTileId?: string;
  notice?: string;         // e.g. multi-cable warning, rendered before send
}
export function resolveTileChatRoute(
  tileId: string,
  line: string,
  connections: ConnectionGraphEntry[],  // already filtered to this tile
): TileChatRoute
```
Rules: empty/whitespace → local unchanged; `/local ` prefix → local with prefix stripped; no connections → local; ≥1 connection → cable using the last entry (most recently synced), peer = the other tile id on that entry; >1 connection also sets `notice`.

**New file `quantflow-electron/src/main/tile-chat-route.test.ts`:** cover all rules above (no Electron imports — same style as `acp-prompt-line-editor.test.ts`).

### Slice 2 — registry lookup

**`quantflow-electron/src/main/tile-session-registry.ts`:** add
```ts
export function getConnectionsForTile(tileId: string): ConnectionGraphEntry[]
```
— iterate `connectionGraph` values where `tileAId === tileId || tileBId === tileId`, preserving insertion order. No other registry changes.

### Slice 3 — the Enter fork

**`quantflow-electron/src/main/agentos-terminal-bridge.ts` (~line 216-222):** replace the direct `onSubmit` with a router:
```ts
if (isAcpPromptSoftware(attach.software)) {
  bridge.acpEditor = createAcpPromptLineEditor({
    onEcho: echo,
    onSubmit: (line) => submitTileChatLine(tileId, attach.sessionId, line, echo),
    onSubmitError: () => echo("\r\n[error: prompt failed]\r\n> "),
  });
}
```
New function in the same file (keeps `attach`/transport access local):
```ts
async function submitTileChatLine(tileId, sessionId, line, echo) {
  const route = resolveTileChatRoute(tileId, line, getConnectionsForTile(tileId));
  if (route.notice) echo(`\r\n${route.notice}\r\n`);
  if (route.kind === "local") {
    const transport = await transportOrThrow();
    return transport.prompt(sessionId, route.text);
  }
  echo(`\r\n[a2a ${tileId}→${route.toTileId}] ${route.text}\r\n`);
  const { sendConnectionRelay } = await import("./agentos-a2a-relay"); // D4: avoid static cycle
  const relay = await sendConnectionRelay({
    connectionId: route.connectionId!, fromTileId: tileId, text: route.text,
  });
  if (!relay.ok) echo(`\r\n[a2a error] ${relay.message ?? "relay failed"}\r\n> `);
}
```
Notes for the builder: `onSubmit`'s return promise feeds the editor's error path — keep the async contract identical (rejection → `onSubmitError`). Reply display needs no new code: `notifySender` writes `[a2a B→A] …` into this terminal, and the host also back-prompts the sender session (renders via session events).

### Slice 4 — live cable sync freshness (verify-first)

Trace `renderer.js:311` (`stringSyncConnections`): confirm it fires on cable **create** and **delete** paths (`addConnection` / `removeConnectionById`, `updateCables`), not only on canvas load. If any path misses, add the sync call beside `updateCables()` in that path. Expected outcome: draw cable → main graph has it before the first Enter. Do not touch kernel command handlers.

### Slice 5 — scripted proof + qa gate (U6 pattern, typed path)

- **`quantflow-electron/src/main/agentos-terminal-bridge.ts`:** add a small export for the proof: `getAgentOsPtySessionIdForTile(tileId): string | null` (scan `ptyBridges` for `bridge.tileId === tileId`).
- **New `quantflow-electron/src/main/agentos-eve-cable-chat-proof.ts`** (`runAgentosEveCableChatProof`, prefix `AGENTOS-EVE-CABLE-CHAT-PROOF:`): reuse `agentos-eve-proof-shared.ts` helpers. Spawn Eve A + B (same as U6 proof), `syncConnectionGraph` one cable, wait for both terminal attaches to register pty bridges, then drive the **typed** path: `writeAgentOsPtySession(ptySessionIdA, "Reply with exactly: cable-chat-ok\r")` (feeds the real line editor). Poll `getStringLog(connectionId)` (up to ~120s) for forward entry A→B with the text and backward entry B→A containing `cable-chat-ok`. Also assert `/local ping` does NOT append to the relay log (escape hatch). Screenshot `V7-03-agentos-eve-cable-chat-live.png`, `exitProofApp`.
- **Wire-up (mirror U6 exactly):** env flag `QF_AGENTOS_EVE_CABLE_CHAT_PROOF` branch in `index.ts` beside the U6 branch; launcher `quantflow-electron/scripts/proof-agentos-eve-cable-chat.ts` (TIMEOUT_MS 480_000, screenshot check); package.json script `proof:agentos-eve-cable-chat`; `qa/lib/agentos-eve-cable-chat.ts` with the same `assertEveStillUnpromoted` guard; register `agentos-eve-cable-chat` in `qa/run.ts` after `agentos-eve-a2a`.

---

## Acceptance

**Scripted (gate):** `bun qa/run.ts agentos-eve-cable-chat` green: typed keystrokes through the real line editor produce forward+backward relay-log entries, `/local` bypasses the cable, eve still unpromoted, evidence `V7-03-agentos-eve-cable-chat-live.png`.

**Founder (manual, the real exit):**
1. Spawn Eve A + Eve B from the dock rail.
2. Draw cable A↔B on canvas.
3. Focus A's terminal, type `Reply with exactly: cable-chat-ok`, Enter.
4. **Pass:** B's terminal shows the inbound `[a2a A→B] …` and B answering; A's terminal shows `[a2a B→A] cable-chat-ok`. No cable popover opened. (A's own Eve may append a comment after the reply — known D6 behavior, not a failure.)
5. Type `/local hello`, Enter → A's own Eve answers locally.

## Regression guard

- `bun qa/run.ts agentos-eve-multispawn` and `bun qa/run.ts agentos-eve-a2a` both stay green (U6's proof calls `promptAgentOsTile`/`sendConnectionRelay` directly and never touches the line editor — a fork bug would not be caught there, which is exactly why Slice 5 drives keystrokes).
- `acp-prompt-line-editor.test.ts`, `agent-adapter.test.ts`, and the new `tile-chat-route.test.ts` pass under `bun test`.
- windows-pty / herdr tiles: no file in their path is touched; spot-check one windows-pty tile chat manually.
- Uncabled AgentOS tile chat: prompt flow identical (route resolves local when `connections` is empty).

## Risks / open questions

1. **Polarity (D1)** is the only contested UX call — founder reviews it in the manual test; flip lives in `resolveTileChatRoute` alone.
2. **Import cycle** bridge↔relay is handled by dynamic import (D4); builder must not "clean it up" into a static import.
3. **Double reply display** on sender (notifySender line + host back-prompt session render) may show the reply twice in A's terminal. Acceptable for lite; if it offends, suppress the `notifySender` agentos echo — one guarded line in `tile-relay-dispatcher.ts:294-303` — but only after seeing it live.
4. **Slice 4 unknown:** if live cable-draw doesn't sync the graph until canvas save, first Enter after drawing may route local. Verify-first; the fix is one renderer call.
