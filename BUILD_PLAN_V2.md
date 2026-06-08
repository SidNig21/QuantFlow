# QuantFlow v2 Build Plan

This is the single working file for QuantFlow v2.

Read `CONCEPT.md` first for the product definition. After that, work from this file only.

The archived 7-layer charters in `reference/archive/quantflow-v2-layer-charters/` are reference material, not an execution path. They are mapped below so useful thinking is not lost, but they do not control scope.

## Current Truth

Branch: `quantflow-v2`

Current spine:

| Area | Status |
| --- | --- |
| Gate 1, herdr socket ping to pong | Done, `f72c0b4` |
| Gate 2, legend spawn to herdr pane to interactive PTY | Done, `035f4f5`, `15b7852` |
| Retire v1 relay cluster | Done, `6961506` |
| Unify spawn pipeline through `runtimeTarget` | Done, `de9c497` |
| Docs collapsed to one build path | Done, `147cabb` |
| Gate 3, herdr `events.subscribe` tile state | Implemented, pending operator proof |
| Envoy task bus MVP | Implemented locally, pending operator push |

## Current Slice

### Gate 3: Live tile state from herdr socket events

Goal: replace WSL tile status polling with live herdr socket events.

Do this now:

- [x] Add a long-lived herdr `events.subscribe` client in Electron main.
- [x] Keep the existing one-shot `callHerdrSocket` RPC helper for request/response calls.
- [x] Add a separate streaming helper for subscription sockets, with reconnect, backoff, unsubscribe, and cleanup.
- [x] Normalize herdr events into a small QuantFlow event shape.
- [x] Track `pane_id`, `tile_id`, previous status, next status, timestamp, and raw event payload when useful.
- [x] Forward status updates from main to the shell renderer.
- [x] Update tile header badges from socket events.
- [x] Persist status transitions through `runtime-state/status-repo.ts` if the event carries a real status transition.
- [x] Preserve native Windows PTY fallback behavior. Windows-only tiles must not become herdr-owned.
- [x] Remove the 5 second `herdrGetStatus` polling loop from `src/windows/shell/src/renderer.js`.
- [x] Add tests for event normalization, reconnect/backoff, cleanup, and renderer update behavior.

Gate 3 passes when:

- A herdr-backed tile changes status without the renderer polling `herdr:status`.
- The 5 second `herdrGetStatus` loop is gone or fully disabled.
- Native Windows PTY tiles still work.
- A missing or restarted herdr socket does not crash the app.
- A manual proof can show: spawn a herdr tile, trigger a status change, see the badge update from events.

Do not do during Gate 3:

- Do not build Envoy.
- Do not build Obsidian integration.
- Do not redesign Watchtower.
- Do not implement A2A.
- Do not revive the string relay.
- Do not do legend cleanup except where needed for Gate 3 proof.
- Do not implement memory/context tile work.
- Do not implement RL templates.
- Do not start visual redesign implementation.

## Next Slice

### retirement-herdr-cli

Goal: remove the remaining herdr CLI bridge after Gate 3 proves socket state is stable.

Current reason this exists:

- `src/main/herdr-session-spawn.ts` already uses `herdr-socket-bridge.ts`.
- `src/main/ipc-herdr.ts` still imports `src/main/herdr-bridge.ts` for legacy list/read/send/status calls.
- `herdr:read` is allowed as debug only, not as tile display.

Work:

- [ ] Port `herdr:available` to socket.
- [ ] Port `herdr:list` to socket.
- [ ] Port `herdr:send` to socket.
- [ ] Decide whether `herdr:status` is still needed after Gate 3. If kept, port it to socket.
- [ ] Keep or replace `herdr:read` only as a debug path. It must never become display.
- [ ] Delete or quarantine `src/main/herdr-bridge.ts`.
- [ ] Update tests so socket behavior is the default.
- [ ] Fix Windows test harness issues around local Unix sockets versus WSL socket routing.

Pass when:

- No active code imports `herdr-bridge.ts`.
- WSL/herdr runtime operations use socket APIs.
- Interactive tile display still goes through PTY attach, not pane reads.

## Next After That

### envoy-obsidian

Goal: add proof and durable memory after the herdr runtime spine is stable.

Use archived Layer 4 as reference, with one major correction: no A2A dependency.

Work:

- [x] Create or attach one Envoy space per canvas for the task bus MVP.
- [x] Add an Electron main bridge for `envoy listen` and post.
- [x] Normalize Envoy packets into runtime events.
- [x] Add Envoy task create, list, claim, update, complete, block, and fail.
- [x] Add claim locking so two agents cannot own the same task.
- [x] Add MCP tools for agent task operations through the `9811` relay.
- [x] Add `ENVOY.md` and `bun run smoke:envoy-task` proof command.
- [ ] Let watchers post receipts for dumb tiles. Dumb tiles do not receive Envoy credentials.
- [ ] Let Hermes read proof through Envoy tooling.
- [ ] Wire Obsidian vault context pins and handoff paths to Envoy evidence.
- [ ] Prove one cable action creates one receipt visible in Watchtower or a vault note.

Pass when:

- One canvas has one Envoy proof space.
- One real action produces one traceable receipt.
- Obsidian is operator memory, not a second build plan.

Task bus MVP proof:

- `bun run smoke:envoy-task` creates one task, claims it, rejects a second claim, posts progress, completes it, and prints one `correlation_id` with receipt ids.
- Agent tools are `qf_envoy_space_status`, `qf_task_list`, `qf_task_create`, `qf_task_claim`, `qf_task_update`, `qf_task_complete`, `qf_task_block`, `qf_task_fail`, `qf_receipt_list`, and `qf_envoy_watch`.
- See `ENVOY.md` for the task state model and example tool calls.

## Frozen Until Gate 3 Passes

These are not current work:

- Legend palette cleanup.
- RL template isolation and Commence workflow.
- Watchtower evolution.
- Full V2 visual redesign implementation.
- Memory/context tile type.
- External QA loop.
- Factory Droid.
- Tennis vision.
- RL infra.

## Rejected

Do not implement:

- A2A.
- Agent Cards.
- HTTP agent delegation.
- Custom string relay cluster.
- `pane.read` as display.
- Direct `herdr-client.sock` to xterm.
- Direct `envoy-stub` calls.
- Parallel GoalBuddy layer execution.
- Vault `Projects/QuantFlow/Build Plan.md` as execution source.
- New build-plan layers unless the operator explicitly asks.

## Archived 7-Layer Map

The old layer charters are useful as a memory palace, not as a plan.

| Archived layer | New status |
| --- | --- |
| Layer 1, Visual Canvas | Mostly audit/reference. Visual implementation waits until backend gates stabilize. |
| Layer 2, Process Runtime Herdr | Active source of ideas. Current work is the old 2C: `events.subscribe`. 2B is done. CLI retirement follows. |
| Layer 3, Communication A2A + MCP | A2A is rejected. MCP on port 9811 stays. Correlation/runtime-state ideas may survive without A2A. |
| Layer 4, Shared Memory Envoy | Future `envoy-obsidian` reference. Remove A2A dependency from interpretation. |
| Layer 5, Legend Palette + Templates | Frozen until Gate 3. Later used for role config, templates, and Commence cleanup. |
| Layer 6, Watchtower | Later. It should consume herdr events and Envoy receipts after those exist. |
| Layer 7, External QA Loop | Later. Useful for testing strategy, not current app scope. |

## Operator Checklist Before Any Coding Session

1. Confirm branch is `quantflow-v2`.
2. Read `CONCEPT.md`.
3. Read this file.
4. Confirm the current slice.
5. If the requested work is not in the current slice, ask before coding.
6. Commit before handoff.

## Agent Handoff

Use this block for coding agents:

```text
Branch quantflow-v2.
Read CONCEPT.md, then BUILD_PLAN_V2.md.
BUILD_PLAN_V2.md is the only execution plan.
Current slice: Gate 3 only, herdr events.subscribe tile state.
Do not execute archived layer charters.
Do not use Obsidian v1 build plans.
No A2A. No string relay revival. pane.read display is rejected.
Next after Gate 3: retirement-herdr-cli.
Next after that: envoy-obsidian.
One executor at a time. Commit before handoff.
```
