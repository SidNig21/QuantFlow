# Kernel Constitution

Read this before every v3 coding session. It is short by design.

## The One Rule

Kernel owns truth.

Everything else derives from that rule.

## Who Does What

| Primitive | Role |
| --- | --- |
| Kernel | Sole source of truth. All state writes go here. |
| Canvas | Projector. Renders Kernel state. Never a database. |
| Conductor | Planner. Reads Kernel, creates tasks, assigns work. Never owns truth. |
| Workers | Executors. Claim tasks, do work, submit results. Never self-complete. |
| Receipts | Evidence. Append-only proof of what happened. |
| State Cards | Current compressed reality per tile/worker. Not history. |
| Harnesses | Runtime adapters. Wrap workers; never own truth. |
| MCP | External adapter. Not the internal control plane. |
| Vault | Knowledge mirror. Durable long-term context. Not live state. |

## Mutation Path

```text
intent → Kernel command → Kernel write → Kernel event → renderer re-renders
```

No component may write canonical state outside this path.

## Query Path

```text
renderer/Conductor → Kernel query → Kernel snapshot
```

No component may hold a private authoritative copy of Kernel state.

## Invariants

- Receipts are append-only. Never delete or modify a receipt.
- Events are append-only state-transition history.
- State Cards are current summaries, not receipt history.
- Tasks are state-machine objects with enforced transitions, not chat messages.
- Workers may submit completion; the Kernel verifies it.
- Canvas may not mutate canonical tile/task/workflow state directly.
- MCP tools call Kernel commands. They do not replace them.

## Task State Machine

```text
open → claimed → working → submitted → verifying → complete

working → blocked → working
working / submitted / verifying → failed
```

Workers may not skip `submitted → verifying` to reach `complete`.

## Vocabulary Lock

Use only canonical v3 primitives defined in `BUILD_PLAN_V3.md` and `docs/v3/GLOSSARY.md`:

```text
Workflow, Tile, WorkerInstance, Harness, Model, Role, Task, TaskDependency,
Receipt, StateCard, Artifact, Event, Connection, Permission, Command
```

Do not invent new names for existing concepts.

## Schema and Rules Reference

These documents expand the constitutional definitions above. Read them when touching Kernel-owned code:

- `docs/v3/AUTHORITY_RULES.md` — detailed mutation rules, invariants, and violation signals
- `docs/v3/KERNEL_SCHEMA_V1.md` — canonical table definitions, field lists, and relationships
- `src/kernel/schema/types.ts` — TypeScript type surface for all primitives
- `src/kernel/migrations/001-v3-baseline.sql` — SQL DDL for the v3 Kernel database

## Read Order for v3 Sessions

1. Applicable `AGENTS.md` chain (root first, then child for the target folder)
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md` (this file)
4. `docs/v3/AUTHORITY_RULES.md` when touching state mutation or task lifecycle
5. `docs/v3/KERNEL_SCHEMA_V1.md` when touching schema or primitives
6. Current goal scope
7. Relevant repo files
8. `BUILD_PLAN_V2.md` for shipped behavior only, when v3 explicitly references it
