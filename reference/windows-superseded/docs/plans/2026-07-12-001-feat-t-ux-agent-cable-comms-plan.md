---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: founder doctrine 2026-07-12 (leverage AgentOS internals; agents pick and choose) + Fable⇄Cursor merged scope (iron-sharpens-iron round, 2026-07-12)
origin: docs/plans/2026-07-11-002-feat-t-ux-lite-cable-in-chat-plan.md
type: feat
branch: quantflow-v7-agentos-anchor
repos:
  - QuantFlow
  - quantflow-eve
title: "feat: T-UX-agent — agent-chosen cable comms on native AgentOS surfaces"
created: 2026-07-12
deepened: null
---

# feat: T-UX-agent — agent-chosen cable comms on native AgentOS surfaces

**Target repos:** `QuantFlow` (branch `quantflow-v7-agentos-anchor`) + `quantflow-eve` (Eve-side tool; commit before QuantFlow when the tool contract changes).

**Position on ladder:** After T-UX-lite (`/cable` operator command — built, uncommitted, compatible; can land before or with this). Before T-PERF + T-UX-full (designed together) → U8 → U7 (founder-only).

**This plan is the merged Fable⇄Cursor scope (2026-07-12).** Both briefs converged on the same three core slices; the merge adds inline-reply semantics, protocol-not-peers instructions, and the toolkit tripwire gate.

---

## Goal Capsule

Agents pick and choose who they communicate with. The operator tells Eve A, in plain chat, "ask your cabled peer to check the odds" — Eve A discovers her cables, sends through the host bridge, and the peer's answer returns **inline to her tool call**, which she reports back conversationally. The receiving agent gets a **clean, named message** ("Message from cabled agent …"), never raw `[a2a tile-…→tile-…]` plumbing. Everything rides surfaces AgentOS ships in 0.2.7: `additionalInstructions` at session create, the host bridge (`executeCableSend` — same pattern as Rivet's canonical toolkit `execute`), and persisted session events. A CI tripwire watches for the day the native actor envelope accepts `toolKits`, at which point `buildCableKit` mounts unchanged and the Eve-side tool retires.

---

## Problem Frame

The 2026-07-12 manual smoke (evidence: founder screenshot) proved transport but broke semantics three ways: (1) the receiving Eve was prompted with raw `[a2a tile-…→tile-…] …` wrapper and errored `command not found: [a2a`; (2) the host back-prompted the sender's Eve with the reply, burning an extra LLM turn on conversational noise; (3) no message identity — agents and operator can't tell who said what. Root cause: routing metadata is string-concatenated into prompts instead of framed messages, and replies re-prompt instead of returning.

**Verified platform facts (2026-07-12, spike + package probes):**
- `agentOS({toolKits})` **throws** `unrecognized_keys: "toolKits"` on 0.2.7 (Zod `.strict()`, `@rivet-dev/agentos/dist/index.js:19-30`); zero toolkit plumbing in 0.2.8-rc.1 or the `main` dist-tag either. Rivet's official `examples/agent-to-agent` is unrunnable on every published version. Mounting `buildCableKit` is a **version gate**, not a product gate.
- The canonical AgentOS A2A pattern (agent invokes host tool → host bridges to peer session → result returns **inline as the tool result**) is semantically our `executeCableSend` (`host.js:659`) — except ours re-prompts the sender instead of returning inline. That delta is defect (2).
- `CreateSessionOptions.additionalInstructions` is native in 0.2.7 (`agentos/dist/index.d.ts:634`) and unused — `host.js:1044-1046` passes only `env`.
- Persisted session events are native (`getSessionEvents`, seq-ordered). Terminals already render live session events.
- Eve processes are spawned per actor key with `EVE_PORT` in env (`eve-supervisor.js:69-84`); host owns `port ↔ actorKey` and `tileId ↔ sessionId` maps (`host.js:165-176`) and the cable ACL (`hostConnectionGraph`, synced from the canvas).

---

## Requirements

| ID | Requirement |
| --- | --- |
| R1 | Every AgentOS tile session is created with QuantFlow instructions (via native `additionalInstructions`): tile identity + the cable **protocol** — never a peer list (cables are dynamic; peers are discovered live). |
| R2 | A cable message delivered to an agent reads as a clean, named message: `Message from cabled agent @<label> (canvas cable): <text>`. The raw `[a2a from→to]` wrapper never appears in any agent's prompt. |
| R3 | Replies never re-prompt. Agent-initiated send: reply returns inline as the tool result (canonical semantics). Operator-initiated send (`/cable`, popover, proofs): reply is display-rendered on the sender tile only. Host back-prompt (`host.js:699-707`) is removed. |
| R4 | Host exposes cable discovery: `GET /cable/peers` resolving caller identity → live cables + peer labels, powered by `hostConnectionGraph` + session/tile maps. ACL unchanged: no cable, no message. |
| R5 | Eve gets a cable tool (`quantflow-eve` tools dir, Eve-first authoring): `cable_list` + `cable_send` → host HTTP. Identity contract: Eve's own `EVE_PORT` (already in env) → host resolves port→actor→tile. Interface mirrors canonical toolkit semantics so `buildCableKit` is a drop-in swap. |
| R6 | Tripwire qa gate `agentos-toolkit-envelope`: asserts the current known state (toolKits rejected with `unrecognized_keys`). Green today; **fails loudly on the version bump that accepts toolkits** with the message "mount buildCableKit — see this plan." |
| R7 | Scripted gate `agentos-eve-agent-a2a`: operator prompts Eve A in plain chat to message her peer; Eve A uses the cable tool; B receives clean framing (assert no `"[a2a "` in B's prompted text); reply returns as A's tool result; relay log records both directions; evidence screenshot. |
| R8 | Existing gates stay green: `agentos-eve-multispawn`, `agentos-eve-a2a`, `agentos-eve-cable-chat` (if landed). Known interaction: U6's gate asserts `relay.ok` + reply + relay-log both directions — all preserved by R3 (reply still returned from `promptSession(target)`; only the sender re-prompt is removed). |

**Out of scope:** mounting `buildCableKit` (blocked upstream — R6 tripwire owns the trigger), native TUI / PTY passthrough (T-UX-full), T-PERF warm actor pool, Omnigent, U7 promotion, kernel `message.*` receipt schema (U8), non-Eve agent-initiated sends (documented limitation — see D6).

---

## Key Technical Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | **Instructions teach protocol, never peers.** `additionalInstructions` is create-time-only; peer lists would be stale after the first cable draw/delete. Live peers come from `cable_list`. | Merged-scope correction to "inject peer list" — staleness bug avoided. |
| D2 | **Inline-reply semantics (canonical).** `executeCableSend` returns the peer's reply to its caller; it never re-prompts the sender session. Display on the sender tile is the dispatcher's job (`notifySender`), not the host's. | Kills the extra LLM turn + conversational noise; matches Rivet's documented toolkit pattern exactly. |
| D3 | **Eve-side tool = interim mount point; the bridge is permanent.** `executeCableSend` is already the canonical `execute`; only where the tool mounts differs. Documented limitation (D6) until the native envelope accepts toolkits. | Cursor's framing adopted with the coverage caveat made explicit. |
| D4 | **Identity by port.** Eve reads her own `EVE_PORT`; host resolves port→actorKey→tile/session via the supervisor + session maps. No new secrets, no session ids leaked into Eve config. Verify-first: confirm adopted warm-pool processes keep their spawn port. | Uses env already injected at `eve-supervisor.js:82`; survives the warm pool. |
| D5 | **Tripwire, not vigilance.** The toolkit spike (proven 2026-07-12: throws `unrecognized_keys`) becomes a qa gate that inverts on upgrade. Nobody "watches upstream"; CI does. | Resolves the Fable⇄Cursor "wait vs build" debate by deleting the human from it. |
| D6 | **Known limitation, stated:** until actor toolkits ship, only Eve has agent-initiated sends — Pi/Claude-Code/OpenCode tiles can receive but not initiate. The toolkit mount is multi-actor **coverage**, not optional optimization. | The honest version of both briefs. |
| D7 | **Relay log stays as the kernel receipt; session events are the display truth.** No new message store: framed prompts land in persisted session events natively; `appendRelayLog` keeps QuantFlow's audit trail. | Leverage-internals doctrine; zero new persistence. |

---

## Implementation

### Slice 1 — QuantFlow skill instructions at session create (host.js)

At `host.js:1044` (`POST /session` → `handle.createSession(picked.software, { env })`), add `additionalInstructions`:

```js
const sessionId = await handle.createSession(picked.software, {
  env: picked.env,
  additionalInstructions: buildQuantflowTileInstructions({
    tileId: address.tileId,
    workspaceId: address.workspaceId,
    software: picked.software,
  }),
});
```

New `buildQuantflowTileInstructions` in host.js (or a small `quantflow-instructions.js` beside it). Content — protocol only, ~10 lines: you are an agent on a QuantFlow canvas tile (id `<tileId>`); the operator may draw cables connecting you to peer agents; messages from peers arrive prefixed `Message from cabled agent @…`; treat them as requests from a collaborating agent and answer directly and concisely; if you have a cable tool available, use it only when the task warrants contacting a peer; cables are dynamic — discover peers at send time, never assume. **No peer lists (D1).** Keep the text in one exported constant-builder so proofs can assert against it.

### Slice 2 — clean framing + inline reply (host.js `executeCableSend`, ~659-710)

1. Replace `const delegated = "[a2a " + from + "→" + targetTileId + "] " + msg` with framed delivery: `Message from cabled agent @<fromLabel> (canvas cable <connId>): <msg>`. Labels: derive from the sessions map (`software` + short tile suffix, e.g. `eve-96131` — same label style the tile header shows); add a `label` field to the session record at create if not present.
2. **Delete the back-prompt block** (`host.js:699-707`, `promptSession(sourceSessionId, back)`). The reply is already returned (`{ ok, targetTileId, reply }`) to the HTTP caller / tool caller — that IS the canonical inline return (D2).
3. `QF_AGENTOS_SIM` behavior unchanged.
4. Electron side: `notifySender` (`tile-relay-dispatcher.ts:294-303`) remains the sender-tile display path and is now the ONLY sender-side rendering (the double-display risk from rev-2 plan resolves itself). Verify single render in the live proof.

### Slice 3 — cable discovery endpoint (host.js)

`GET /cable/peers?port=<evePort>` (also accept `?tileId=` for UI/electron callers):
- Resolve identity: port → actorKey via eve-supervisor mapping (export a `getActorKeyForPort(port)`; verify-first where the pool stores it — if adopted warm processes re-key, follow the adoption record), then actorKey → tileId → live cables from `hostConnectionGraph`.
- Response: `{ tileId, peers: [{ connectionId, peerTileId, peerLabel, peerSoftware }] }` — labels from the sessions map where the peer has a live session, else tile id.
- ACL: only returns cables the caller is on. Unknown port → 404.

`POST /cable/send` gains port-identity support: accept `{ fromPort, connectionId, text }` and resolve `fromTileId` from the port (existing `fromTileId`/`fromSessionId` callers unchanged).

### Slice 4 — Eve-side cable tool (quantflow-eve repo)

Eve-first authoring pattern (tools dir next to instructions). Two tools:
- `cable_list()` → `GET {QF_HOST_URL}/cable/peers?port={EVE_PORT}` → returns peers array.
- `cable_send({ connectionId, text })` → `POST {QF_HOST_URL}/cable/send` with `{ fromPort: EVE_PORT, connectionId, text }` → returns `{ reply }` **inline** (D2).

Env contract: add `QF_HOST_URL` to Eve spawn env in `eve-supervisor.js:69-84` (host knows its own port: `AGENTOS_HOST_PORT` ?? 7430, loopback within WSL). `EVE_PORT` already present. Tool descriptions must say "requires an existing canvas cable — use cable_list first". Commit order: quantflow-eve first, then QuantFlow (per repo rule).

### Slice 5 — tripwire gate `agentos-toolkit-envelope` (qa)

- `tools/agentos-host/toolkit-envelope-probe.mjs`: the proven 3-assertion spike — `agentOS({toolKits:[minimal kit]})` throws with `unrecognized_keys` containing `toolKits`; same for `buildConfigJson`. Exit 0 when it throws as expected; exit 1 (loud message: `AgentOS native envelope now ACCEPTS toolKits — mount buildCableKit/buildDelegateKit; see docs/plans/2026-07-12-001…`) when it stops throwing.
- `qa/lib/agentos-toolkit-envelope.ts` + registration in `qa/run.ts`. No Electron needed — plain `bun`/node run against `tools/agentos-host/node_modules`.

### Slice 6 — scripted proof + gate `agentos-eve-agent-a2a` (U6 pattern)

`agentos-eve-agent-a2a-proof.ts` (reuse `agentos-eve-proof-shared.ts`): spawn Eve A + B, sync one cable, then **prompt A in plain chat**: `Use your cable tool to send your cabled peer exactly this message and report their reply: agent-a2a-ok`. Assert:
- relay log gains A→B entry (tool path) and the framed text delivered to B contains `Message from cabled agent` and does NOT contain `"[a2a "` (assert via B's persisted session events — `getSessionEvents` through the host, or the relay/host log);
- A's answer text contains `agent-a2a-ok` (reply made it back inline and A reported it);
- B was NOT re-prompted after its reply (session events count check — no second inbound prompt on B) and A received no host-side back-prompt.
Screenshot `V7-04-agentos-eve-agent-a2a-live.png`. Launcher/env-flag/package.json/qa-lib wiring mirrors U6 exactly (`QF_AGENTOS_EVE_AGENT_A2A_PROOF`, TIMEOUT_MS 480_000). Same `assertEveStillUnpromoted` guard.

---

## Acceptance

**Scripted:** `bun qa/run.ts agentos-toolkit-envelope` and `bun qa/run.ts agentos-eve-agent-a2a` green; `agentos-eve-multispawn` + `agentos-eve-a2a` (+ `agentos-eve-cable-chat` if landed) still green.

**Founder (manual, the real exit):**
1. Spawn Eve A + Eve B, draw cable A↔B.
2. In A's chat, plain text: `Ask your cabled peer what 2 + 2 is and tell me their answer.`
3. **Pass:** A uses her cable tool (visible in her transcript), B's terminal shows a clean `Message from cabled agent @eve-…` prompt (no `[a2a`, no `command not found`), B answers, and A reports "my peer says 4" style — one coherent conversation, no extra turns on either side.
4. Delete the cable, repeat → A reports she has no cabled peers (tool returns empty; she does not hallucinate a send).

## Regression guard

- U6 gate compatibility is by design (R8): reply still comes from `promptSession(target)` and both relay-log directions still append in `sendConnectionRelay`. If the U6 gate asserted anything about the sender back-prompt, fix the gate, not the semantics — but per its committed source it does not.
- `bun test` suites: acp-prompt-line-editor, agent-adapter, tile-chat-route (if landed), plus new probe unit run.
- Manual spot-check: operator `/cable` (if T-UX-lite landed) still works and now shows the reply once, not twice.

## Risks / open questions

1. **Warm-pool port adoption (D4 verify-first):** if an adopted warm Eve's port differs from the actor-key hash, the port→actor map must come from the supervisor's adoption record, not recomputation. One-file check in `eve-supervisor.js` before building Slice 3.
2. **Label source:** tile display labels live canvas-side; host labels derive from software+tile-suffix. Good enough for framing; exact-label parity can ride U8.
3. **Eve tool schema:** quantflow-eve's tool registration format must be confirmed in that repo before Slice 4 (Eve-first authoring memory says instructions.md + tools/ dir; verify current shape).
4. **Instructions token cost:** ~10 lines per session — negligible, but keep the builder honest: one constant, no per-message injection.
5. **T-UX-lite interplay:** lite's `/cable` path calls the same `sendConnectionRelay` → benefits from framing automatically. If lite lands after this plan, no changes needed either way.

---

## Ladder note

Sequence stays: **T-UX-agent (this)** → T-PERF + T-UX-full (one design conversation) → U8 DOX (document the tripwire + cable protocol in `tools/agentos-host/AGENTS.md`) → U7 founder sign-off. The day `agentos-toolkit-envelope` flips: mount `buildCableKit`/`buildDelegateKit` in the actor config, port the Eve tool's users to the in-VM `agentos-cable` CLI, retire Slice 4 — bridge and semantics unchanged.
