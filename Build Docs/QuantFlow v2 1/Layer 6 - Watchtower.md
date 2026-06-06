# Layer 6 - Watchtower

Status: evolve from v1.

Owner: QuantFlow proof layer.

Layer rule: Watchtower renders truth from Layer 2 herdr events, Layer 3 A2A task events, and Layer 4 Envoy evidence. It does not create tasks, spawn sessions, or post memory.

Known current anchors:
- `src/windows/shell/src/watchtower-view.js`
- `src/windows/shell/src/operational-event-log.js`
- `src/main/ipc-runtime-state.ts`
- `src/main/runtime-state/events-repo.ts`
- `src/main/runtime-state/tasks-repo.ts`
- `src/main/runtime-state/connections-repo.ts`

## 6A - Event Source Switch

```text
Goal: QuantFlow V2 Layer 6A - Watchtower event source switch
Layer: 6 - Watchtower
Depends on: 2C State subscription via herdr events.subscribe passed.
Scope: Switch Watchtower's runtime state for WSL tiles from custom relay/PTY polling snapshots to herdr events.subscribe-derived events. Keep fallback display for native Windows PTY tiles explicitly separate.
Acceptance criteria:
- Watchtower consumes normalized herdr state events for WSL tiles.
- Old relay log counters are not presented as the primary WSL tile health source.
- Native Windows PTY fallback remains visible but clearly labeled as fallback.
- Filtering/search still works for active, idle, blocked, waiting, done/quiet, and exited states.
- Proof: WSL tile state changes appear in Watchtower from herdr event stream without polling.
- Tests: event adapter, filters, summary counts, fallback isolation.
Out of scope:
- A2A task lifecycle display.
- Envoy mirror events.
- Correlation chain view.
Retirement: Retire Watchtower dependency on 5-second polling for WSL state after this passes.
```

## 6B - A2A Task Events

```text
Goal: QuantFlow V2 Layer 6B - A2A task events in Watchtower
Layer: 6 - Watchtower
Depends on: 3E A2A task lifecycle tracking passed and 6A event source switch passed.
Scope: Render A2A task lifecycle states submitted, working, input-required, completed, and failed in Watchtower with connection, source, target, and correlation details.
Acceptance criteria:
- Watchtower has a task/lifecycle view or existing tab section that shows A2A task events.
- Each event displays taskId, connection label/id, source/target tile or Agent Card names, status, age, and safe summary/error.
- Input-required and failed tasks are surfaced in attention/alerts.
- Clicking a task/event can focus the relevant string/tile when that behavior already exists.
- Proof: one successful delegated A2A task and one failed/input-required task are visible and searchable.
- Tests: render states, alerts, focus metadata, redaction, empty state.
Out of scope:
- Envoy mirror events.
- End-to-end correlation chain.
- Creating A2A tasks.
Retirement: None.
```

## 6C - Envoy Mirror Events

```text
Goal: QuantFlow V2 Layer 6C - Envoy mirror events in Watchtower
Layer: 6 - Watchtower
Depends on: 4D Evidence schema passed and 4E Hermes reads Envoy preferred.
Scope: Render Envoy posts, receipts, and reads in Watchtower with matching connection/correlation IDs. Envoy evidence should be visible alongside herdr and A2A events.
Acceptance criteria:
- Watchtower consumes normalized Envoy evidence events from runtime state.
- Envoy post/read rows display envoySpaceId, packet/receipt ID, connectionId, correlationId, source tile, posted_by, and safe payload summary.
- Missing/invalid evidence packets are visible as warnings/errors.
- Envoy events can be filtered/searched by connectionId and correlationId.
- Proof: dumb tile posts Envoy packet; Watchtower shows post; Hermes reads it; Watchtower shows read with same correlation_id.
- Tests: event adapter, rendering, invalid evidence warning, search/filter.
Out of scope:
- Cross-machine Envoy.
- Creating Envoy packets.
- Full correlation chain timeline.
Retirement: None.
```

## 6D - Correlation Chain View

```text
Goal: QuantFlow V2 Layer 6D - Correlation chain view
Layer: 6 - Watchtower
Depends on: 6A, 6B, 6C passed; Layers 2-5 core proofs complete.
Scope: Build the acceptance proof for the whole system: one flow visible end to end from source tile -> string -> A2A delivery -> Envoy post/read -> receipt/result. This view groups by correlation_id and exposes each step with timestamps and involved identities.
Acceptance criteria:
- Watchtower groups runtime events by correlation_id.
- A chain row/timeline shows source tile, visual connection, A2A task submitted/working/completed or failed, Envoy packet/receipt/read, and target receipt/result where applicable.
- Missing expected steps are shown as gaps, not hidden.
- Chain can be copied/exported as diagnostic text with IDs and safe summaries.
- Proof: run one complete RL-style flow and capture the full chain in Watchtower with one correlation_id.
- The proof flow is: PufferLib dumb tile emits a structured output line -> watcher posts to Envoy -> Hermes reads from Envoy -> A2A task delegated from Hermes to Codex tile -> Codex returns result -> all steps visible in Watchtower under one correlation_id.
- Tests: grouping, timeline ordering, missing-step gaps, export text, redaction.
Out of scope:
- New protocol behavior.
- New Envoy features.
- Visual redesign beyond what is needed for a readable proof.
Retirement: After this passes, old relay-log-centric proof paths can be retired in dedicated cleanup if no longer referenced.
```

## 6E - File-Based Updates

```text
Goal: QuantFlow V2 Layer 6E - File-based updates
Layer: 6 - Watchtower
Depends on: 6A event source switch passed; 4C watcher posts preferred if using Envoy mirror.
Scope: Agents can write structured files to a watched folder, and Watchtower renders live updates using the Thymer pattern. This gives dumb or constrained workers a file-based status channel without direct protocol calls.
Acceptance criteria:
- Define watched folder location and structured file schema.
- Main process watches the folder and normalizes create/update events into runtime events.
- Watchtower renders file-based updates with tile/source identity, status, message, timestamps, and correlationId if present.
- Invalid files produce warnings without crashing watcher.
- Proof: write a structured status file from a tile/session; Watchtower updates live.
- Tests: file schema, watcher normalization, invalid file handling, duplicate/update behavior, rendering.
Out of scope:
- Replacing herdr events.
- Replacing A2A task lifecycle events.
- Direct Envoy posting from agents.
Retirement: None.
```
