---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: founder direction 2026-07-11 (post-U6, revised same day) + Cursor ce-pov co-sign
origin: docs/plans/2026-07-11-001-feat-eve-agentos-path-a-adapter-plan.md
type: feat
branch: quantflow-v7-agentos-anchor
repos:
  - QuantFlow
title: "feat: T-UX-lite — cable-in-chat (/cable command in tile chat)"
created: 2026-07-11
deepened: 2026-07-11 (rev 2 — founder correction: no auto-forward; agents pick and choose)
---

# feat: T-UX-lite — cable-in-chat (`/cable` command in tile chat)

**Target repo:** `QuantFlow` (branch `quantflow-v7-agentos-anchor`, base `019591a`)

**Position on ladder:** After U6 (✅ `bf4f131`). Before **T-UX-agent** (agent-chosen cable comms + QuantFlow skill file — sketched below, own plan later) and T-PERF / T-UX-full (native TUI passthrough, designed with T-PERF). U7 remains founder-only.

**Rev 2 correction (founder, 2026-07-11):** "I don't want the tile cable system to just forward messages — they should be able to pick and choose who they communicate with." Auto-forward polarity (rev 1 D1) is **rejected**. Tile Enter always stays local chat with the tile's own agent. Crossing the cable is an explicit act: the operator's `/cable` command (this plan) or the agent's own choice via a cable tool (T-UX-agent, next).

---

## Goal Capsule

Typing in a tile is always a conversation with that tile's own agent — unchanged. New: from inside the tile chat, `/cable <message>` sends `<message>` across the canvas cable to the peer tile. B's terminal shows the inbound `[a2a A→B] …`, A's terminal shows B's reply `[a2a B→A] …`. **No cable popover involved.** Transport is the already-proven U6 rail (`sendConnectionRelay` → host `/cable/send` → real `promptSession`); this slice only adds the chat command and confirms the exchange is visible in both terminals.

---

## Summary

U5/U6 proved the transport programmatically; the operator experience still requires the cable popover. The seam is one line: `agentos-terminal-bridge.ts:219` — the ACP line editor's `onSubmit` goes straight to `transport.prompt(attach.sessionId, line)`. T-UX-lite inserts a command check there: lines starting with `/cable ` ride `sendConnectionRelay`; everything else is byte-identical local chat. Everything downstream (host relay, `[a2a]` prefixing, reply echo to sender, relay log) already exists and passed U6 live.

---

## Problem Frame

Founder (2026-07-11): "when tiles are connected they can communicate — I would never step outside of the chat and type in the cable prompt," refined same day to "they should pick and choose who they communicate with," not blind forwarding. Today cable sends only happen via the popover (`renderer.js:1367 sendCableMessage`) or programmatically. The v6 exit proof sentence was proven scripted (U6) but never wired to the operator's hands.

**What already works (verified in code 2026-07-11):**
- Canvas cable draw → `kernel.connection.create` (`src/renderer/canvas/kernel-canvas.ts:45`) and the shell renderer pushes the connection list to main via `stringSyncConnections` (`renderer.js:311` → `ipc-tile-registry.ts:51` → `syncConnectionGraph`), which also pushes to the WSL host ACL (`pushConnectionGraphToHost`).
- `sendConnectionRelay` (`agentos-a2a-relay.ts:62`) → `sendTileDelegate` → `delegateAgentOs` → host `POST /cable/send` → `executeCableSend` (`tools/agentos-host/host.js:659`): prompts target session with `[a2a from→to] msg`, prompts the reply back into the sender's session, returns the reply, and `appendRelayLog` records both directions.
- Both tiles' terminals render session activity via `onSessionEvent` → `acpEventToTerminalText` (`agentos-terminal-bridge.ts:206-211`), so host-side prompts on either session are already visible in that tile's terminal.
- `notifySender` (`tile-relay-dispatcher.ts:294-303`) additionally writes the `[a2a B→A] reply` line into the sender's terminal via `writeAgentOsTileTerminal`.

**What's missing:** (1) the `/cable` command in the tile chat line editor, (2) a per-tile connection lookup in the registry, (3) an outbound echo so the sender sees what they dispatched, (4) confirmation that live cable draw/remove keeps the main graph fresh (re-sync hook if not).

---

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Plain typing + Enter in an AgentOS tile is byte-identical to today — local chat with the tile's own agent, cabled or not. |
| R2 | `/cable <message>` in an AgentOS tile chat sends `<message>` over the tile's live canvas cable via `sendConnectionRelay`. `/cable` on an uncabled tile echoes a clear error (`[a2a error] no canvas cable on this tile`) and prompts nothing. |
| R3 | Sender terminal shows the outbound line as `[a2a <fromTile>→<toTile>] <text>` at send time, and shows the peer's reply (existing `notifySender` path). Target terminal shows the inbound `[a2a …]` prompt and its own reply (existing session-event rendering — verify, don't rebuild). |
| R4 | Cable draw and cable delete on the live canvas immediately refresh the main-process connection graph (verify `stringSyncConnections` fires on both; add the hook only if missing). |
| R5 | Scripted qa gate `agentos-eve-cable-chat` proves the typed path end to end (two Eves, cable, `/cable` keystrokes through the real line editor, relay log both directions, plain line does NOT relay, screenshot). |
| R6 | Existing gates `agentos-eve-multispawn` and `agentos-eve-a2a` stay green; windows-pty and herdr rails untouched. |

**Out of scope (explicit non-goals):** auto-forwarding plain chat over cables (founder-rejected), agent-initiated cable comms + QuantFlow skill file (**T-UX-agent**, next rung — see sketch), native Eve TUI / PTY passthrough (T-UX-full), Omnigent, T-PERF warm actor pool, U7 dock promotion, any `tools/agentos-host/host.js` change, kernel `message.sent/replied` receipt semantics (U8/R4 later).

---

## Key Technical Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | **Local-default polarity, explicit `/cable` command.** Plain Enter never crosses a cable. | Founder correction 2026-07-11: cables are permission + chosen communication, not a forwarding pipe. The operator command is the lite stopgap; agent choice arrives in T-UX-agent. |
| D2 | **Multiple cables:** `/cable` uses the most recently synced connection for the tile (deterministic); echoes a notice `[a2a] n cables on this tile — using <id>`. Peer-addressed form (`/cable@<tile>`) is T-UX-agent territory. | Keeps lite small; single-cable is the acceptance scenario. |
| D3 | **Pure routing function** `resolveTileChatRoute(line, connections)` in a new dependency-free module `tile-chat-route.ts`, unit-tested without Electron. | Command parsing, error cases, and multi-cable rules live in one testable place; future polarity or syntax changes are one-file edits. |
| D4 | **Dynamic import** of `agentos-a2a-relay` inside the submit handler. | `agentos-a2a-relay` → `tile-relay-dispatcher` → `agentos-terminal-bridge` already forms a chain; a static back-import from the bridge would create a cycle. The codebase already uses this pattern (`hostSidecarBaseUrl`). |
| D5 | **Registry, not dispatcher, owns the lookup:** add `getConnectionsForTile(tileId)` to `tile-session-registry.ts`. | Registry is the connection graph's home; it must not import relay modules (keeps the cycle rule simple). |
| D6 | **No host.js changes.** The host's back-prompt of the reply into the sender session (host.js:699-707) stays as-is even though it costs an extra LLM turn on the sender. | U6 passed live with it; touching the host is T-UX-agent/T-PERF territory. Note in the manual test expectations: sender's Eve may add a comment after the `[a2a]` reply line — acceptable for lite. |

---

## Implementation

### Slice 1 — routing core (pure, unit-tested)

**New file `quantflow-electron/src/main/tile-chat-route.ts`:**
```ts
export interface TileChatRoute {
  kind: "local" | "cable" | "cable-error";
  text: string;            // command prefix stripped for cable routes
  connectionId?: string;   // set for cable routes
  toTileId?: string;
  notice?: string;         // multi-cable notice or cable-error message
}
export function resolveTileChatRoute(
  tileId: string,
  line: string,
  connections: ConnectionGraphEntry[],  // already filtered to this tile
): TileChatRoute
```
Rules: line does not start with `/cable` → `local`, text unchanged (INCLUDING empty/whitespace lines — preserve today's editor behavior exactly). `/cable <text>` with ≥1 connection → `cable` using the last entry (most recently synced), peer = the other tile id on that entry; >1 connection also sets `notice`. `/cable <text>` with no connections → `cable-error` with notice `no canvas cable on this tile`. `/cable` with empty message → `cable-error` with notice `usage: /cable <message>`. `/cable` prefix matching is exact word (`/cable ` or bare `/cable`), case-sensitive; anything else (e.g. `/cables`) is local text.

**New file `quantflow-electron/src/main/tile-chat-route.test.ts`:** cover every rule above (no Electron imports — same style as `acp-prompt-line-editor.test.ts`).

### Slice 2 — registry lookup

**`quantflow-electron/src/main/tile-session-registry.ts`:** add
```ts
export function getConnectionsForTile(tileId: string): ConnectionGraphEntry[]
```
— iterate `connectionGraph` values where `tileAId === tileId || tileBId === tileId`, preserving insertion order. No other registry changes.

### Slice 3 — the submit fork

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
  if (route.kind === "local") {
    const transport = await transportOrThrow();
    return transport.prompt(sessionId, route.text);
  }
  if (route.kind === "cable-error") {
    echo(`\r\n[a2a error] ${route.notice}\r\n> `);
    return;
  }
  if (route.notice) echo(`\r\n[a2a] ${route.notice}\r\n`);
  echo(`\r\n[a2a ${tileId}→${route.toTileId}] ${route.text}\r\n`);
  const { sendConnectionRelay } = await import("./agentos-a2a-relay"); // D4: avoid static cycle
  const relay = await sendConnectionRelay({
    connectionId: route.connectionId!, fromTileId: tileId, text: route.text,
  });
  if (!relay.ok) echo(`\r\n[a2a error] ${relay.message ?? "relay failed"}\r\n> `);
}
```
Notes for the builder: `onSubmit`'s return promise feeds the editor's error path — keep the async contract identical (rejection → `onSubmitError`); a `cable-error` route resolves normally (it is handled, not a prompt failure). Reply display needs no new code: `notifySender` writes `[a2a B→A] …` into this terminal, and the host also back-prompts the sender session (renders via session events).

### Slice 4 — live cable sync freshness (verify-first)

Trace `renderer.js:311` (`stringSyncConnections`): confirm it fires on cable **create** and **delete** paths (`addConnection` / `removeConnectionById`, `updateCables`), not only on canvas load. If any path misses, add the sync call beside `updateCables()` in that path. Expected outcome: draw cable → main graph has it before the first `/cable`. Do not touch kernel command handlers.

### Slice 5 — scripted proof + qa gate (U6 pattern, typed path)

- **`quantflow-electron/src/main/agentos-terminal-bridge.ts`:** add a small export for the proof: `getAgentOsPtySessionIdForTile(tileId): string | null` (scan `ptyBridges` for `bridge.tileId === tileId`).
- **New `quantflow-electron/src/main/agentos-eve-cable-chat-proof.ts`** (`runAgentosEveCableChatProof`, prefix `AGENTOS-EVE-CABLE-CHAT-PROOF:`): reuse `agentos-eve-proof-shared.ts` helpers. Spawn Eve A + B (same as U6 proof), `syncConnectionGraph` one cable, wait for both terminal attaches to register pty bridges, then drive the **typed** path: `writeAgentOsPtySession(ptySessionIdA, "/cable Reply with exactly: cable-chat-ok\r")` (feeds the real line editor). Poll `getStringLog(connectionId)` (up to ~120s) for forward entry A→B with the text and backward entry B→A containing `cable-chat-ok`. Then negative check: `writeAgentOsPtySession(ptySessionIdA, "plain local line\r")`, settle ~5s, assert the relay log gained NO new entries (plain chat never relays). Screenshot `V7-03-agentos-eve-cable-chat-live.png`, `exitProofApp`.
- **Wire-up (mirror U6 exactly):** env flag `QF_AGENTOS_EVE_CABLE_CHAT_PROOF` branch in `index.ts` beside the U6 branch; launcher `quantflow-electron/scripts/proof-agentos-eve-cable-chat.ts` (TIMEOUT_MS 480_000, screenshot check); package.json script `proof:agentos-eve-cable-chat`; `qa/lib/agentos-eve-cable-chat.ts` with the same `assertEveStillUnpromoted` guard; register `agentos-eve-cable-chat` in `qa/run.ts` after `agentos-eve-a2a`.

---

## Acceptance

**Scripted (gate):** `bun qa/run.ts agentos-eve-cable-chat` green: `/cable` keystrokes through the real line editor produce forward+backward relay-log entries, a plain line adds nothing to the relay log, eve still unpromoted, evidence `V7-03-agentos-eve-cable-chat-live.png`.

**Founder (manual, the real exit):**
1. Spawn Eve A + Eve B from the dock rail.
2. Draw cable A↔B on canvas.
3. Focus A's terminal, type plain `hello`, Enter → A's own Eve answers locally (cable changes nothing about normal chat).
4. Type `/cable Reply with exactly: cable-chat-ok`, Enter.
5. **Pass:** B's terminal shows the inbound `[a2a A→B] …` and B answering; A's terminal shows `[a2a B→A] cable-chat-ok`. No cable popover opened. (A's own Eve may append a comment after the reply — known D6 behavior, not a failure.)
6. Delete the cable, type `/cable ping` → `[a2a error] no canvas cable on this tile`.

## Regression guard

- `bun qa/run.ts agentos-eve-multispawn` and `bun qa/run.ts agentos-eve-a2a` both stay green (U6's proof calls `promptAgentOsTile`/`sendConnectionRelay` directly and never touches the line editor — a fork bug would not be caught there, which is exactly why Slice 5 drives keystrokes).
- `acp-prompt-line-editor.test.ts`, `agent-adapter.test.ts`, and the new `tile-chat-route.test.ts` pass under `bun test`.
- windows-pty / herdr tiles: no file in their path is touched; spot-check one windows-pty tile chat manually.
- Uncabled AgentOS tile chat: prompt flow identical (non-`/cable` lines route local regardless of connections).

## Risks / open questions

1. **Import cycle** bridge↔relay is handled by dynamic import (D4); builder must not "clean it up" into a static import.
2. **Double reply display** on sender (notifySender line + host back-prompt session render) may show the reply twice in A's terminal. Acceptable for lite; if it offends, suppress the `notifySender` agentos echo — one guarded line in `tile-relay-dispatcher.ts:294-303` — but only after seeing it live.
3. **Slice 4 unknown:** if live cable-draw doesn't sync the graph until canvas save, first `/cable` after drawing may error. Verify-first; the fix is one renderer call.
4. **`/cable` collides with future slash-commands?** Reserve the `/` prefix convention consciously: `resolveTileChatRoute` is the single parser, so future commands extend one function.

---

## Next rung sketch — T-UX-agent (own plan, do not build here)

Founder direction: agents pick and choose who they communicate with. Path A makes this buildable without waiting for AgentOS toolkit support: Eve runs on real Node (WSL), so her cable tool lives in **her** runtime, not the AgentOS actor schema.

Likely shape (to be planned properly):
1. Host read endpoint `GET /cables/for-session/:sessionId` (host already holds `hostConnectionGraph` + `sessionToTile`) so an agent can discover its peers.
2. Eve-side tool (quantflow-eve repo, Eve-first authoring pattern: `tools/` dir) that lists cables and POSTs `/cable/send` with `fromSessionId` (already accepted by `executeCableSend`).
3. **QuantFlow skill file** — `instructions.md` injected per tile session: "you are a tile on a QuantFlow canvas; cables name the peers you may message; use the cable tool to communicate when the task warrants." This is the founder's "skill file explaining how to use quantflow."
4. Deferred `buildCableKit` (host.js:732) becomes the native path if/when AgentOS accepts JS toolkits — the Eve-side tool is the bridge until then.
