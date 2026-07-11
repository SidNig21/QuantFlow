# tools/agentos-host — Agent Guide

WSL-only Node sidecar that serves `@rivet-dev/agentos` as a RivetKit native
actor registry and preserves the localhost wire protocol consumed by
`src/harness/agentos/http-transport.ts`.

## Purpose

- Hold AgentOS/RivetKit dependencies outside the QuantFlow root package.
- Address one AgentOS-backed actor per `[workspaceId, tileId]` via
  `getOrCreate`; sessions are transcript/replay ids, never delivery addresses.
- Preserve the existing HTTP/SSE adapter contract around the actor action API.
- Keep API keys in the inherited host/session environment: never log them,
  return them over HTTP, or persist their values in the actor filesystem.

## Ownership

| File | Role |
| --- | --- |
| `host.js` | RivetKit registry/client; HTTP/SSE compatibility server; actor/session routing; credential-order session env |
| `package.json` | Exact AgentOS/software version pins |
| `host-config.test.mjs` | Fast session-config tests; must not start Rivet or the HTTP listener |

## Wire protocol

Host listens on `AGENTOS_HOST_PORT` (default `7430`) and binds `0.0.0.0` by
default so Windows can use the WSL IP when localhost mirroring is unavailable.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ ok, hasCredential }`; no credential required |
| POST | `/session` | `{ software, workspaceId, tileId }` | `{ sessionId, software, workspaceId, tileId, actorKey, actorId }` |
| POST | `/session/:id/prompt` | `{ text }` | blocks until turn completion and returns `{ ok, text, response }` |
| GET | `/session/:id/events` | — | SSE `session-event`, `permission-request`, and terminal payloads |
| POST | `/session/:id/permission` | `{ requestId, approved }` | `{ ok }` |
| GET | `/session/:id/runtime` | — | actor key/id, lifecycle, persisted sessions, and persisted events |
| GET | `/file` | `?path=&sessionId=` | raw bytes; `sessionId` may be omitted only when one host session exists |
| POST | `/dispose` | — | closes shells/sessions/connections, returns `{ ok }`, then exits the host |

ACP permission requests block until `POST .../permission` arrives.

## Actor boundary

- The durable door is exactly `[workspaceId, tileId]`. Never use `sessionId` as
  the actor key or keep a raw session object as the delivery address.
- The compatibility session map stores the compound key and SSE subscribers;
  actions re-resolve through `getOrCreate(actorKey)`.
- The native wrapper accepts serializable software, mounts, and VM permissions.
  It rejects JavaScript `toolKits`; the preserved QuantFlow/cable/delegate
  toolkit definitions in `host.js` are deferred and must not be described as
  active.
- The wrapper fixes idle sleep to one hour. At `0.2.7`, graceful
  `registry.shutdown()` strands a prompted actor in `no_envoys`; `/dispose`
  deliberately exits without that call. Rivet Engine then removes the dead
  envoy and can schedule the same actor key again.
- Rivet internal actor/engine ports default to `AGENTOS_HOST_PORT + 1/+2`; use
  `AGENTOS_RIVET_ACTOR_PORT` / `AGENTOS_RIVET_ENGINE_PORT` to override them.

## `0.2.7` package boundary / upstream issue draft

1. **Session close is asynchronous but typed as complete.** The wrapper exposes
   `closeSession(): Promise<void>` at
   `node_modules/@rivet-dev/agentos/dist/index.d.ts:730`, while core
   `agent-os.js:3390-3399` explicitly starts `_closeSessionInternal()` as
   fire-and-forget. A prompted persisted session stayed `running` through a
   30-second drain poll.
2. **The agent process cannot be terminated through the actor action surface.**
   A prompted actor reported one running PID 1 `node` from `allProcesses()` but
   an empty `listProcesses()`. Core builds that list from `_processes`
   (`agent-os.js:2068`) and `killProcess()` only looks up that same map
   (`agent-os.js:2130-2136`), so `killProcess(1)` returned an internal error.
   There is no VM-stop action in `AgentOsActions` at this version.
3. **Graceful registry drain is the failing lease path; dead-envoy recovery
   works.** RivetKit `shutdown()` calls `runtime.shutdownRegistry()` at
   `rivetkit/src/registry/index.ts:576-626`. After that path, a prompted actor
   repeatedly reopened as `no_envoys`. After killing the host process instead,
   `GET /envoys?namespace=default` returned zero records and the next host
   reopened the exact actor id. `DELETE /envoys/:key` is not a supported engine
   route (404), and no stale envoy record remained to delete.
   The process-exit workaround then passed one full prompted-actor proof:
   actor `hgzm9j7xt1olak1humv7kcnmg8bl00` answered before and after host exit
   under the same key. The pre-exit session was not returned by
   `listPersistedSessions()` after reopen, so actor-local replay continuity is
   still an upstream boundary even though durable re-addressing now works.
4. **Slot count is native-managed, not a working TypeScript knob.**
   `RIVET_TOTAL_SLOTS` is parsed (`rivetkit/src/utils/env-vars.ts:19-22`) into
   deprecated `envoy.totalSlots` (`registry/config/envoy.ts:28-30`), but
   `RuntimeServeConfig` and `buildServeConfig()` omit it
   (`registry/runtime.ts:274-291,632-645`); NAPI's `JsServeConfig` omits it too
   (`@rivetkit/rivetkit-napi/index.d.ts:184-201`). Live `/envoys` snapshots
   reported `slots: 3` and later `slots: 1`, so the field is residual capacity,
   not a fixed one-slot declaration. Slot count remains native-managed (no
   supported TypeScript knob), but **concurrent multi-actor capacity is
   verified working**: on 2026-07-09 two actors under distinct compound keys
   (`["fable-verify","p1e-verify-tile"]` → `9atf1ecx…`,
   `["fable-verify","p1e-verify-tile-2"]` → `hke10rkp…`) held live sessions
   simultaneously and both returned exact model replies. The earlier one-slot
   backoff was stale probe actors holding capacity through the one-hour idle
   window, not a package ceiling. Upper capacity bound is unmeasured.

## Credential order

1. `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY` / `OPENCODE_ZEN_API_KEY` → Eve
   custom ACP software (`software: "eve"`); whichever alias is present is
   forwarded into the VM session env as `OPENCODE_GO_API_KEY` (the name
   `quantflow-eve/agent/agent.ts` reads). Value is never written to VM files
   or returned over HTTP. Use `QUANTFLOW_EVE_AGENTOS_PKG` to override the
   package path; default is the sibling
   `../../../quantflow-eve/agentos/dist/package.aospkg`.
2. `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY` / `OPENCODE_ZEN_API_KEY` → Pi
   with custom provider files under both supported VM homes. Default is
   OpenCode Go (`https://opencode.ai/zen/go/v1`, model `glm-5.2`); use
   `AGENTOS_PROVIDER=zen` for the legacy Zen route or `AGENTOS_MODEL` to change
   the model.
3. `OPENROUTER_API_KEY` → Pi with the Anthropic-compatible OpenRouter base.
4. `ANTHROPIC_API_KEY` → Pi directly.

Named Claude sessions retain their OAuth/API-key precedence. Codex and bundled
OpenCode rejection rules stay explicit; never silently fall back to Pi.

## Version pins

- `@rivet-dev/agentos` `0.2.7`
- `@rivet-dev/agentos-core` `0.2.7` (toolkit definitions only)
- `@agentos-software/pi` `0.2.7`
- `@agentos-software/opencode` `0.2.7`
- `@agentos-software/claude-code` `0.2.7`
- `@agentos-software/codex` `0.3.1` (still the explicitly rejected stub)
- `zod` `4.4.3`

Version bumps require a deliberate churn review; the SDK stays behind
`AgentOsTransport`.

## Setup and verification

```bash
wsl -e bash -lc "cd /mnt/c/Users/rybow/QuantFlow/tools/agentos-host && npm install"
node --check tools/agentos-host/host.js
bun test src/harness/agentos
npm --prefix tools/agentos-host test
bun qa/run.ts agentos-live
```

Windows lifecycle is owned by `src/harness/agentos/host-lifecycle.ts`.

## Child DOX Index

None.
