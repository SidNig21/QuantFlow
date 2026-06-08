# Layer 4 - Shared Memory (Envoy)

Status: rewrite, replace stub adapter.

Owner: Envoy CLI bridge.

Layer rule: Envoy owns shared memory, signed receipts, cross-boundary coordination, audit trail, and canvas space inbox/outbox. Dumb tiles never call Envoy directly; watchers post on their behalf.

Known current replacement target:
- `src/main/string-adapters/envoy-stub-adapter.ts`
- `src/main/smart-string-pipeline.ts` uses target_adapter `envoy-shared-space` through the stub.

## 4A - Space Initialization

```text
Goal: QuantFlow V2 Layer 4A - Envoy space initialization
Layer: 4 - Shared Memory (Envoy)
Depends on: 2G startup sequence passed; 3D string-to-A2A mapping preferred for identity/correlation consistency.
Scope: Create or attach one Envoy space per canvas load. The app must know the Envoy space ID/name, readiness, and failure state before any bridge/listener posts events.
Acceptance criteria:
- Define deterministic canvas-to-Envoy space naming using workspace/canvas identity.
- Add main-process Envoy service initialization that can create/ensure the space via Envoy CLI.
- Persist current Envoy space identity with canvas/runtime state.
- Show readiness/failure in diagnostics or status without blocking non-Envoy UI.
- Proof: load a canvas, verify exactly one Envoy space exists and is marked ready; reload and confirm the same space is reused.
- Tests: space naming, create/ensure idempotence, failure handling, persistence.
Out of scope:
- Long-lived envoy listen process; that is 4B.
- Posting dumb tile packets; that is 4C.
- Deleting envoy stub.
Retirement: None.
```

## 4B - Canvas-Envoy Bridge

```text
Goal: QuantFlow V2 Layer 4B - Canvas-Envoy bridge listener
Layer: 4 - Shared Memory (Envoy)
Depends on: 4A Space initialization passed.
Scope: Run `envoy listen` as a long-lived child process in Electron main for the active canvas space. Normalize incoming Envoy packets into runtime events with safe lifecycle management.
Acceptance criteria:
- Add a main-process child process manager for envoy listen with start, stop, restart, stdout/stderr parsing, and app shutdown cleanup.
- If the listener child process exits unexpectedly, the bridge automatically attempts restart with exponential backoff up to three times, then surfaces a Watchtower error event. It does not silently fail.
- Listener is scoped to the active canvas Envoy space.
- Malformed Envoy output is logged as a warning event without crashing the app.
- Runtime events include envoySpaceId, packet ID/receipt if available, connectionId/correlationId when present, and timestamp.
- Proof: start app, confirm listener process is running; post a test packet externally and see it in runtime events/diagnostics.
- Tests: process lifecycle, parse success/failure, restart behavior, cleanup.
Out of scope:
- Watcher posts for dumb tiles.
- Hermes reads via envoy-mcp.
- Stub deletion.
Retirement: None.
```

## 4C - Watcher Posts for Dumb Tiles

```text
Goal: QuantFlow V2 Layer 4C - Watcher posts for dumb tiles
Layer: 4 - Shared Memory (Envoy)
Depends on: 4B Canvas-Envoy bridge listener passed.
Scope: For dumb process tiles such as PufferLib, Python, Generic CLI, and Generic Shell, watchers in QuantFlow main observe structured output/files and post Envoy packets on their behalf. Dumb tiles must not receive Envoy credentials or call Envoy directly.
Acceptance criteria:
- Define which tile types count as dumb/process tiles for v2.
- Add a watcher/posting path in main that can convert dumb tile output/file events into Envoy post commands.
- Packets include tileId, connectionId if applicable, correlationId if known, payload, source kind, and timestamp.
- Envoy credentials/config remain in main process only.
- Proof: run a dumb tile that emits a structured line or watched file; QuantFlow posts one Envoy packet; Envoy listener/runtime events show matching ID.
- Tests: packet shaping, credential isolation, duplicate suppression, bad payload handling.
Out of scope:
- Hermes read path.
- Cross-machine deployment.
- Direct Envoy SDK use inside dumb tile process.
Retirement: None.
```

## 4D - Evidence Schema

```text
Goal: QuantFlow V2 Layer 4D - Envoy evidence schema
Layer: 4 - Shared Memory (Envoy)
Depends on: 4C Watcher posts for dumb tiles passed.
Scope: Define the structured packet schema that makes an Envoy post Watchtower-provable. The schema must align connection_id, correlation_id, task_id, payload, source, target, receipt, and timestamps so Layer 6 can render an end-to-end chain.
Acceptance criteria:
- Create a versioned Envoy evidence schema and validation tests.
- Required fields include schema_version, envoy_space_id, packet_id or receipt_id, connection_id, correlation_id, payload, source_tile_id, source_kind, created_at, and posted_by.
- Optional fields include task_id, target_tile_id, a2a_connection_id, result summary, signature/receipt metadata.
- Invalid packets are rejected before posting where possible or marked invalid in runtime events.
- Proof: one posted dumb tile packet validates and appears in runtime events with connection_id and correlation_id.
- Tests: required fields, optional fields, validation failures, redaction rules.
Out of scope:
- Final Watchtower correlation UI.
- Cross-machine signing beyond what Envoy already returns.
- Stub deletion.
Retirement: None.
```

## 4E - Hermes Reads Envoy

```text
Goal: QuantFlow V2 Layer 4E - Hermes reads Envoy
Layer: 4 - Shared Memory (Envoy)
Depends on: 4D Evidence schema passed and 3B Agent Card registration passed.
Scope: Hermes tile can read the active canvas Envoy space inbox exclusively through envoy-mcp. Reads must preserve matching connection and correlation IDs so the originating flow is traceable. Direct CLI exec for Hermes reads is not permitted in this section.
Acceptance criteria:
- Hermes Agent Card/capabilities advertise Envoy read support when configured.
- Hermes reads Envoy exclusively through envoy-mcp. Direct CLI exec for Hermes reads is not permitted in this section.
- Read results include Envoy packet identifiers and original connection/correlation IDs.
- Watchtower/runtime events record Hermes receipt/read acknowledgement.
- Proof: dumb tile posts Envoy packet; Hermes reads it; runtime events show post and read with the same correlation_id.
- Tests: read request shaping, missing space handling, result normalization, correlation preservation.
Out of scope:
- Automated planning based on Envoy contents.
- Cross-machine Envoy.
- Stub deletion before proof.
Retirement: None.
```

## 4F - Stub Adapter Retirement

```text
Goal: QuantFlow V2 Layer 4F - Envoy stub adapter retirement
Layer: 4 - Shared Memory (Envoy)
Depends on: 4E Hermes reads Envoy passed and 4A-4E proofs recorded.
Scope: Delete `envoy-stub-adapter.ts` and replace all `envoy-shared-space` delivery paths with the real Envoy bridge. This must be a dedicated retirement goal/commit.
Acceptance criteria:
- No production code imports envoyStubDeliver or emits string.deliver.envoy-stub as the main delivery path.
- `envoy-shared-space` target adapter posts through the real Envoy service and receives/records a real packet/receipt.
- Tests that asserted stub behavior are migrated to real bridge behavior or deleted with explicit rationale.
- Proof: run the same dumb tile -> Envoy -> Hermes read proof after deleting the stub.
- Build/test passes for touched areas.
Out of scope:
- New Envoy features.
- Cross-machine deployment.
- Watchtower UI redesign.
Retirement: Delete `src/main/string-adapters/envoy-stub-adapter.ts` after real bridge proof passes.
```

## 4G - Cross-Machine Preparation

```text
Goal: QuantFlow V2 Layer 4G - Cross-machine preparation note
Layer: 4 - Shared Memory (Envoy)
Depends on: 4F Stub adapter retirement passed.
Scope: Write a design note only for later Prime Intellect/Modal bursts and cross-machine Envoy spaces. No implementation should land in this goal.
Acceptance criteria:
- Document current local-only Envoy assumptions.
- Identify what must change for remote workers: identity, auth, space addressing, receipts, file transfer/artifacts, timeout/retry policy, and operator visibility.
- Identify what must not change: one canvas space authority, dumb tiles do not call Envoy directly, Watchtower correlation fields remain stable.
- Link the note from this v2 vault folder or repo docs.
Out of scope:
- Implementing remote workers.
- Adding Modal/Prime Intellect clients.
- Changing current local bridge code.
Retirement: None.
```
