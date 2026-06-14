# src/main/conductor — Agent Guide

The Conductor is the native in-process planner for QuantFlow v3.

## What This Subtree Owns

- Conductor planning loop.
- Native Kernel tool bindings used by the Conductor.
- Conductor prompt templates.
- Model provider abstraction (routes to Cloudflare AI Gateway, OpenRouter, direct API, local, etc.).
- Conductor tile data feed (what the canvas displays on the Conductor tile).

## Authority Rules

```text
Conductor plans only.
Conductor may call native Kernel tools.
Conductor may not own truth.
Conductor may not bypass task verification.
Conductor may not execute shell commands directly unless routed through a worker/harness.
```

## What This Subtree Must Not Do

- Store private authoritative state — task lists, tile snapshots — outside the Kernel.
- Complete tasks without verification evidence.
- Call MCP tools for internal QuantFlow coordination (use native Kernel tool bindings instead).
- Execute shell commands except through a WorkerInstance/Harness.
- Perform high-risk actions silently — surface them and request human approval.
- Become a second source of truth for workflow or task state.

## Minimum Native Tool Surface (Goal 5)

```text
get_canvas_snapshot, get_workflow_snapshot, get_state_cards, get_task_list,
create_task, assign_task, submit_task, verify_task, block_task,
post_receipt, spawn_role, connect_tiles, focus_tile, request_human_approval
```

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. This file
6. Relevant conductor source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
