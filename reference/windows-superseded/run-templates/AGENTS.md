# run-templates - v4 R6 saved run configs

## Purpose

This folder holds plan-layer run templates such as Scout, Research, and Deep.
Templates are saved layouts plus workflow wiring: tiles, connections, DAG task
phases, budgets, artifact expectations, checkpoint phases, and attention levels.

## Ownership

- Templates are config, not Kernel truth.
- The Conductor template runner compiles them into a Workflow, tiles, tasks,
  dependencies, checkpoint requests, and execution metadata.
- The Kernel remains the only owner of instantiated workflow/task/artifact/receipt
  state.

## Local Contracts

- Reference only roleIds that are stocked by the legend/role registry.
- Use local task/checkpoint ids inside JSON; the runner scopes them per Workflow.
- Declare attention as `high`, `medium`, or `low`.
- Low-attention phases may run in parallel. High-attention phases must be
  serialized. Medium phases are human-facing and should not be batched unless a
  future rung explicitly changes that rule.
- Checkpoints declare candidate sets only. They must not encode an automatic
  selection.
- Do not add spawn commands, model routing, credentials, live Run state, replay
  data, semantic verification, lessons, or outcome logs here.

## Verification

Run from `quantflow-electron/`:

```text
bun run smoke:run-template
```

The smoke must prove config-only loading, roleId validation, shared
`dag-scheduler` use, R5 checkpoint selection, no auto-pick, and attention-profile
behavior.

## Child DOX Index

No child AGENTS.md files.
