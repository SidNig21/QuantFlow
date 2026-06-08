# Layer 2 - Process Runtime (Herdr)

Status: rewrite.

Owner: Herdr socket bridge.

Layer rule: Herdr owns WSL agent sessions, named sessions, semantic state, crash persistence, and the Unix socket API. `node-pty` remains only for native Windows shell fallback and, where still needed, terminal display plumbing. Layer 2 must not own A2A task semantics or Envoy memory.

Known current state:
- `src/main/herdr-socket-bridge.ts` has v2 Slice 1 ping -> pong proof.
- `src/main/herdr-bridge.ts` still wraps the herdr CLI for pane list/read/send/status.
- `src/main/ipc-herdr.ts` exposes legacy `herdr:*` IPC methods.
- `src/main/pty.ts` and terminal shell files still own PTY session display/fallback.

## 2A - Socket Client Baseline

```text
Goal: QuantFlow V2 Layer 2A - Socket client baseline verification
Layer: 2 - Process Runtime (Herdr)
Depends on: Existing commit f72c0b4/branch state where ping -> pong was proven; current branch quantflow-v2.
Scope: Verify the existing herdr socket client remains intact before extending it. This is an audit/proof goal only because 2A is already implemented.
Acceptance criteria:
- Read src/main/herdr-socket-bridge.ts and confirm it resolves the WSL socket and sends newline-delimited JSON RPC.
- Run the existing focused test/build path that covers the socket bridge if present; otherwise run a direct ping smoke path through the app/IPC route already used by the repo.
- Confirm proof still returns a pong envelope equivalent to type=pong, version present, protocol=2.
- Record the proof output and current commit SHA.
Out of scope:
- Adding agent.start, pane.split, events.subscribe, reconnect, or startup gating.
- Editing the socket bridge unless the ping proof is broken.
Retirement: None.
```

## 2B - Session Spawn

```text
Goal: QuantFlow V2 Layer 2B - Session spawn via herdr socket
Layer: 2 - Process Runtime (Herdr)
Depends on: 2A Socket client baseline verified.
Scope: Replace WSL tile session creation with herdr socket calls for agent.start and pane.split. A Legend-spawned WSL tile must create or attach to a named herdr agent/pane, then render terminal output through the existing display path. The code should introduce a reusable socket RPC helper rather than shelling out through herdr-bridge.ts for new v2 operations.
Acceptance criteria:
- Add typed socket RPC support in or near src/main/herdr-socket-bridge.ts for request/response methods beyond ping, with timeout/error handling and newline framing.
- Implement a main-process spawn service/API that can call herdr agent.start and pane.split using a deterministic agent name derived from canvas/workspace/tile identity.
- Wire the renderer Legend spawn path so a Hermes tile can spawn from the Legend through herdr, not direct node-pty WSL spawn.
- herdr-bridge.ts CLI exec path must not be called for the new spawn flow but must not be deleted in this section.
- The canvas tile appears only after the herdr response returns enough identity to persist herdrPaneId and herdrAgentName.
- Use `herdr terminal attach <terminal_id>` to stream live ANSI frames into xterm.js. Store terminal_id alongside herdrPaneId and herdrAgentName. Do not use pane.read polling for display except as a documented interim fallback.
- Existing Windows native PowerShell/Generic Shell fallback still uses node-pty and is not broken.
- Proof: from a clean app launch, click Hermes in the Legend, see one canvas tile, capture its herdrPaneId/herdrAgentName, and verify herdr agent/pane exists via socket or herdr list.
- Tests: add focused unit tests for spawn request shaping, identity assignment, failed spawn handling, and fallback branching; run bun test for touched files plus bun run build if feasible.
Out of scope:
- Full event subscription/badges; that is 2C.
- Reconnect on canvas restore; that is 2D.
- A2A Agent Card registration; that is 3A/3B.
- Envoy space initialization.
- Deleting herdr-bridge.ts.
Retirement: None yet. Keep herdr-bridge.ts until 2G passes.
```

## 2C - State Subscription

```text
Goal: QuantFlow V2 Layer 2C - State subscription via herdr events.subscribe
Layer: 2 - Process Runtime (Herdr)
Depends on: 2B Session spawn via herdr socket passed.
Scope: Replace 5-second polling for WSL tile badges/status with a long-lived herdr events.subscribe socket stream. Tile UI should update semantic state from herdr events while preserving fallback status behavior for native Windows PTY tiles.
Acceptance criteria:
- Add a resilient events.subscribe client with reconnect/backoff, unsubscribe/cleanup, and typed event normalization.
- Route herdr semantic states such as idle, working, blocked, done, and unknown into the renderer status badge model for WSL tiles.
- Remove 5-second polling for WSL herdr tiles in a dedicated commit. If any non-WSL path still needs polling, label it explicitly Windows-only with a code comment.
- Watchtower/runtime event rows receive normalized herdr state changes with tileId, herdrPaneId, herdrAgentName, timestamp, and raw event payload where safe.
- Proof: spawn a Hermes or Codex WSL tile, cause activity, and observe tile badge changes without waiting for a polling interval.
- Tests: focused tests for event normalization, subscription lifecycle, renderer badge update mapping, and fallback isolation.
Out of scope:
- Reconnect by name after app restart; that is 2D.
- A2A task lifecycle events; that is Layer 3/6.
- Deleting all polling code before a passing proof.
Retirement: Retire 5-second polling for WSL tile state after this passes. Keep any fallback polling explicitly labeled Windows-only.
```

## 2D - Session Reconnect

```text
Goal: QuantFlow V2 Layer 2D - Session reconnect on canvas restore
Layer: 2 - Process Runtime (Herdr)
Depends on: 2C State subscription via herdr events.subscribe passed.
Scope: On canvas restore, reconnect WSL tiles to existing herdr agents/panes by herdrAgentName/herdrPaneId instead of spawning duplicates. The restore path must call agent.list or equivalent socket state, match persisted tile identity, and repair missing pane identity when possible.
Acceptance criteria:
- Canvas persistence includes herdrPaneId and herdrAgentName for every WSL tile created by Layer 2B.
- App startup/load-state calls herdr agent.list/pane list through the socket path and builds a reconnect map.
- If a persisted tile's agent is found, the tile reconnects to the live pane/session and resumes status events.
- If the agent is missing, the tile shows a clear recoverable state and offers respawn only through the approved spawn path.
- Reconnect does not create duplicate herdr agents for the same persisted tile name.
- Proof: spawn a WSL tile, save canvas, restart app while herdr still has the agent, reload canvas, and verify the same herdr identity is reused.
- Tests: identity matching, duplicate-prevention, missing-agent handling, stale-pane repair, and renderer state hydration.
Out of scope:
- Cross-machine restore.
- Envoy memory replay.
- A2A reconnection semantics beyond preserving tile identity fields.
Retirement: None.
```

## 2E - Windows Fallback

```text
Goal: QuantFlow V2 Layer 2E - Windows fallback isolation
Layer: 2 - Process Runtime (Herdr)
Depends on: 2D Session reconnect passed.
Scope: Keep node-pty sidecar behavior for native Windows PowerShell/Generic Shell tiles only, while ensuring WSL agent tiles never silently fall back to node-pty session ownership. Make the distinction explicit in config, code paths, diagnostics, and tests.
Acceptance criteria:
- Tile/runtime config has an explicit runtime target field or equivalent distinction for herdr-wsl vs windows-pty.
- WSL agent recipes fail visibly when herdr is unavailable instead of spawning a hidden node-pty WSL replacement.
- Generic PowerShell/native shell tiles continue to spawn through node-pty and render correctly.
- Diagnostics and Watchtower identify which tiles are herdr-wsl and which are windows-pty.
- Proof: with herdr unavailable, WSL agent spawn is blocked with visible error; Windows shell still works.
- Tests: fallback routing matrix for Hermes/Codex/Claude/Puffer/Python vs Generic Shell/PowerShell.
Out of scope:
- A2A registration.
- Legend built-in expansion except where needed to test runtime target.
- Removing node-pty from the project.
Retirement: None. node-pty remains supported for native Windows fallback.
```

## 2F - Tile Identity Model

```text
Goal: QuantFlow V2 Layer 2F - Tile identity model
Layer: 2 - Process Runtime (Herdr)
Depends on: 2E Windows fallback isolation passed.
Scope: Make herdrPaneId and herdrAgentName first-class persisted identity fields on every WSL/herdr tile. Ensure identity is created once, saved with canvas state, exposed to renderer/Watchtower, and never inferred from labels alone.
Acceptance criteria:
- Define a single shared tile runtime identity shape that includes tileId, runtimeTarget, herdrPaneId, herdrAgentName, display/session fields, and fallback fields as needed.
- Canvas save/load preserves identity fields without lossy transforms.
- Renderer tile state, Watchtower snapshots, and any runtime registry use the same identity fields.
- Labels can change without breaking reconnect or event routing.
- Proof: rename a tile label, save/restart, and verify reconnect still uses herdrAgentName/herdrPaneId.
- Tests: serialization, rename safety, missing identity validation, duplicate name rejection or deterministic conflict handling.
Out of scope:
- Agent Card schema; that is 3A.
- A2A connection identity; that is 3D.
- Envoy correlation schema.
Retirement: None.
```

## 2G - Startup Sequence

```text
Goal: QuantFlow V2 Layer 2G - Herdr startup sequence and ready gate
Layer: 2 - Process Runtime (Herdr)
Depends on: 2F Tile identity model passed.
Scope: Bootstrap herdr on app launch, verify socket readiness, expose a visible ready/not-ready state, and gate WSL Legend actions until herdr is ready. This closes the Layer 2 socket-client wiring and allows retiring the older CLI exec approach for WSL runtime operations.
Acceptance criteria:
- App startup performs a herdr availability/bootstrap check before enabling WSL agent Legend recipes.
- UI shows a visible herdr readiness state in status bar/Legend without blocking unrelated native Windows shell fallback.
- Startup failures include actionable diagnostics and a retry path.
- All WSL herdr operations introduced in 2B-2F use the socket client, not the herdr CLI wrapper.
- Proof: cold launch with herdr running enables WSL recipes; cold launch with herdr stopped disables WSL recipes and shows ready error; retry works after herdr starts.
- Tests: startup state machine, Legend gating, retry, and failure diagnostics.
- Build: bun run build passes if feasible.
Out of scope:
- A2A strings.
- Envoy bridge.
- Full Legend config schema.
Retirement: Delete herdr-bridge.ts in a dedicated retirement commit only after grep confirms no WSL runtime path imports or calls it. The commit message must say "retirement: herdr-bridge.ts CLI exec removed after 2G proof."
```
