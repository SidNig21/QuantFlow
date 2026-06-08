# Layer 3 - Communication (A2A + MCP)

Status: new, replaces custom string relay.

Owner: A2A protocol plus existing MCP relay.

Layer rule: Every agent tile publishes an Agent Card. Canvas strings represent A2A connections between Agent Cards. MCP relay port 9811 remains agent-to-tool plumbing. Layer 3 must not spawn processes or own Envoy memory.

Known current replacement targets:
- `src/main/string-relay.ts`
- `src/main/ipc-string-relay.ts`
- `src/main/smart-string-pipeline.ts`
- `src/main/herdr-routes.ts`
- `src/main/runtime-state/connections-repo.ts`
- `src/main/runtime-state/tasks-repo.ts`
- `src/main/runtime-state/events-repo.ts`

## 3A - Agent Card Schema

```text
Goal: QuantFlow V2 Layer 3A - Agent Card schema
Layer: 3 - Communication (A2A + MCP)
Depends on: 2F Tile identity model passed; 2G preferred before wiring UI actions.
Scope: Define the Agent Card schema every agent-capable tile publishes: stable name, tile identity, capabilities, endpoint, supported task types, runtime target, and health/status fields. Store or expose the schema in one authoritative module with validation.
Acceptance criteria:
- Create a typed Agent Card schema module and tests.
- Create schema at `src/main/a2a/agent-card-schema.ts`. All other Layer 3 sections import from this path. Do not duplicate the schema.
- Schema includes at minimum agentCardId, tileId, displayName, herdrAgentName, herdrPaneId, capabilities, endpoint, runtimeTarget, status, createdAt, updatedAt, and metadata.
- Schema distinguishes agent tiles from dumb/process tiles and native shell fallback tiles.
- Invalid cards fail validation with useful errors.
- Existing built-in agent recipes can map to Agent Card defaults without duplicating config.
- Proof: one spawned Hermes tile can produce a valid Agent Card object from runtime identity.
Out of scope:
- Publishing cards on spawn; that is 3B.
- Creating A2A connections; that is 3C.
- Envoy evidence schema.
Retirement: None.
```

## 3B - Agent Card Registration

```text
Goal: QuantFlow V2 Layer 3B - Agent Card registration
Layer: 3 - Communication (A2A + MCP)
Depends on: 3A Agent Card schema passed and 2B/2F spawn identity available.
Scope: On agent tile spawn or reconnect, automatically publish/register an Agent Card. On tile close or identity loss, unregister or mark the card unavailable. Registration must be observable through tests and Watchtower/runtime state.
Acceptance criteria:
- Add an Agent Card registry in main/runtime state with list/get/register/update/remove operations.
- Register cards automatically for Hermes, Codex, Claude Code, and other agent-capable built-ins when herdr identity is assigned.
- Reconnect restores card registration without changing agentCardId unexpectedly.
- Closing a tile marks the card unavailable or unregisters it according to the chosen lifecycle, documented in code/tests.
- Watchtower or diagnostics can list registered Agent Cards.
- Proof: spawn two agent tiles, list two valid cards, close one tile, see lifecycle transition.
Out of scope:
- Drawing strings as A2A connections; that is 3C.
- Task delegation.
- Envoy posting.
Retirement: None.
```

## 3C - A2A Task Delegation

```text
Goal: QuantFlow V2 Layer 3C - A2A task delegation from strings
Layer: 3 - Communication (A2A + MCP)
Depends on: 3B Agent Card registration passed and 1C string visual audit locked.
Scope: Drawing a string between two agent tiles creates an A2A-capable connection between their Agent Cards. Sending work over that string creates an A2A task delegation instead of using the custom plain string relay.
Acceptance criteria:
- Add an A2A connection/service module that accepts source Agent Card, target Agent Card, connectionId, and task payload.
- Renderer string creation calls into the A2A connection creation path when both endpoints have Agent Cards.
- Delegated task records include taskId, connectionId, sourceAgentCardId, targetAgentCardId, submittedAt, status, and correlationId.
- A2A task delivery uses HTTP POST to the agent's declared endpoint in its Agent Card, following the A2A protocol spec at github.com/a2aproject/A2A. If the endpoint is not yet live, the task is queued with submitted status and retried on endpoint availability.
- If one endpoint lacks an Agent Card, the UI gives a clear unsupported/legacy state instead of pretending A2A is active.
- Proof: draw a string from Hermes to Claude/Codex, submit a small task, and see target receipt plus result/ack.
- Tests: endpoint validation, card lookup, task creation, unsupported endpoint handling, and no legacy relay invocation for A2A-capable pairs.
Out of scope:
- Full lifecycle visualization; that is 3E/6B.
- Deleting custom relay; that is 3G.
- Envoy mirror.
Retirement: None.
```

## 3D - String-to-A2A Mapping

```text
Goal: QuantFlow V2 Layer 3D - String-to-A2A mapping
Layer: 3 - Communication (A2A + MCP)
Depends on: 3C A2A task delegation passed.
Scope: Persist the mapping between visual connections[] rows and their underlying A2A connection/task channel. The visual string is the canvas representation; the A2A connection is the communication authority.
Acceptance criteria:
- Connection persistence stores a2aConnectionId or equivalent protocol mapping alongside existing connectionId.
- Directional fields from_tile_id/to_tile_id or tile_a_id/tile_b_id are consistently mapped to source/target Agent Cards.
- Existing visual string delete/update operations update the A2A mapping without orphaning records.
- Reopening the canvas restores visual strings and A2A mapping consistently.
- Proof: create string, inspect runtime DB/state, confirm one visual connection row maps to one A2A connection; restart and verify mapping persists.
- Tests: create, restore, delete, direction swap, missing card recovery, and no duplicate A2A connection on reload.
Out of scope:
- Task lifecycle UI polish.
- Envoy correlation.
- Custom relay deletion.
Retirement: None.
```

## 3E - Task Lifecycle Tracking

```text
Goal: QuantFlow V2 Layer 3E - A2A task lifecycle tracking
Layer: 3 - Communication (A2A + MCP)
Depends on: 3D String-to-A2A mapping passed.
Scope: Track A2A task states submitted, working, input-required, completed, and failed. Emit structured runtime events that Watchtower can render and correlate with the originating string.
Acceptance criteria:
- Task lifecycle store supports submitted, working, input-required, completed, failed, and timestamps for each transition.
- A2A service writes lifecycle events with taskId, connectionId, source/target Agent Card IDs, tile IDs, correlationId, and error/result summaries.
- Watchtower data adapters can read these events even if the final Layer 6 UI switch is not complete.
- Failed and input-required states preserve enough detail for operator diagnosis without leaking secrets.
- Proof: run one successful delegated task and one intentionally failing/blocked task; confirm lifecycle rows/events exist.
- Tests: valid/invalid transitions, event emission, correlation grouping, redaction/safe summaries.
Out of scope:
- Final Watchtower visual flow; that is 6B/6D.
- Envoy mirror events.
- Retiring custom relay.
Retirement: None.
```

## 3F - MCP Relay Preservation

```text
Goal: QuantFlow V2 Layer 3F - MCP relay preservation
Layer: 3 - Communication (A2A + MCP)
Depends on: 3E Task lifecycle tracking passed.
Scope: Confirm MCP relay port 9811 remains available for agent-to-tool interactions and does not conflict with A2A networking, A2A task IDs, or Watchtower events.
Acceptance criteria:
- Inventory existing MCP relay usage and port 9811 assumptions.
- Add or update diagnostics proving MCP relay health independently from A2A health.
- A2A connection creation does not bind or reserve port 9811.
- Agent tile can still call an MCP tool path while also having an A2A string connection.
- Proof: with A2A string active, run an MCP relay smoke action on port 9811 and capture success.
- Tests: config collision checks, diagnostics shape, and port/non-conflict assumptions where feasible.
Out of scope:
- Replacing MCP relay.
- Adding new MCP tools.
- Envoy bridge.
Retirement: None. MCP relay is preserved.
```

## 3G - String Relay Retirement

```text
Goal: QuantFlow V2 Layer 3G - Custom string relay retirement
Layer: 3 - Communication (A2A + MCP)
Depends on: 3F MCP relay preservation passed and 3A-3F proofs recorded.
Scope: Delete or quarantine the custom string relay pipeline only after A2A strings, task lifecycle tracking, and MCP preservation are proven. This must be a dedicated retirement goal/commit, not mixed with feature work.
Acceptance criteria:
- Confirm no Layer 3 A2A-capable path depends on src/main/string-relay.ts, ipc-string-relay.ts, smart-string-pipeline.ts, or herdr-routes.ts custom relay behavior.
- Remove old IPC methods from preload/renderer only after replacing their callers.
- Update Watchtower data source assumptions away from relay logs where Layer 6 has replacement events.
- Keep any still-needed tests by migrating them to A2A equivalents; delete tests only when behavior is intentionally retired.
- Proof: create A2A string, delegate task, observe lifecycle; MCP relay still works; build/test passes.
- Commit message clearly states custom string relay retired after A2A proof.
Out of scope:
- New A2A features.
- Envoy bridge.
- Visual redesign.
Retirement: Delete custom string relay pipeline after Layer 3 A2A is proven and 3F is done.
```
