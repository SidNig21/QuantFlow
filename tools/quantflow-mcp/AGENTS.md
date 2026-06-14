# tools/quantflow-mcp — Agent Guide

The MCP server is the external adapter for QuantFlow v3. It is not the internal control plane.

## What This Subtree Owns

- MCP tool definitions exposed to external agents (Hermes, Claude Code, Codex, etc.).
- Request routing from MCP tool calls to Kernel commands.
- MCP server configuration and transport.
- Smoke tests for external agent delegation.

## Authority Rules

```text
MCP is the external adapter.
MCP is not the internal fast path.
Do not make Conductor depend on MCP for native QuantFlow control.
Keep MCP tools aligned with Kernel commands.
```

## What This Subtree Must Not Do

- Own canonical state — task lists, receipt chains, tile state.
- Implement business logic that belongs in the Kernel or Conductor.
- Allow external agents to bypass the task `submitted → verifying` gate.
- Write directly to SQLite without going through a Kernel command.

## Shipped v2 Tools (Kept for External Agent Compatibility)

```text
qf_task_create, qf_task_claim, qf_task_update, qf_task_complete,
qf_task_block, qf_task_fail, qf_receipt_list, qf_envoy_watch,
qf_envoy_space_status, qf_task_list,
quantflow_tile_create, quantflow_tile_list, quantflow_tile_read,
quantflow_tile_rename, quantflow_tile_remove, quantflow_tile_move,
quantflow_tile_resize, quantflow_tile_focus,
quantflow_cable_create, quantflow_cable_list, quantflow_cable_remove,
quantflow_cable_remove_between_tiles, quantflow_cable_send,
quantflow_role_spawn, quantflow_role_list,
quantflow_ping, quantflow_notify,
quantflow_terminal_read, quantflow_terminal_write,
quantflow_pty_write, quantflow_pty_expect,
quantflow_viewport_get, quantflow_viewport_set,
quantflow_watchtower_snapshot,
quantflow_orchestration_run_create, quantflow_orchestration_run_get,
quantflow_orchestration_run_list, quantflow_orchestration_run_cancel,
quantflow_orchestration_capability_register,
quantflow_orchestration_capability_list,
quantflow_orchestration_resolve_route, quantflow_orchestration_tile_heartbeat,
quantflow_context_inject, quantflow_context_pin,
quantflow_route_task
```

These tools remain as the external adapter interface. As the Kernel command boundary is hardened in Goal 2, these tools must route through Kernel commands rather than direct internal calls.

## v3 Kernel Task Gate Tools (Goal 3)

```text
qf_task_submit  → kernel.taskSubmit   (working → submitted)
qf_task_verify  → kernel.taskVerify   (pass completes; fail returns to working)
qf_task_reject  → kernel.taskReject   (verification_failed → working)
```

These route to the authoritative Kernel task state machine via the JSON-RPC
methods registered in `src/main/ipc/task-ipc.ts`. They enforce verified
completion: a worker submits, the system verifies, and `complete` is gated on a
`verification_passed` receipt. The legacy Envoy `qf_task_complete` path stays
for compatibility (see `ENVOY.md`).

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. `ENVOY.md` for current task bus contract
6. This file
7. Relevant MCP source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
