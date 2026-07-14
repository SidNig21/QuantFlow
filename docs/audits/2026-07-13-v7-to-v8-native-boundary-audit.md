# V7 → V8 Mac Boundary Audit

**Status:** completed before M1 implementation

This audit treats `quantflow-v7-agentos-anchor` as evidence, not as a porting
backlog. V8 copies only validated product contracts; it rebuilds their native
macOS implementation from first principles.

## Evidence reviewed

- v7 tree: 556 Electron files, 121 `src/` files, 47 QA files, and 25 sidecar
  files. The Electron main and window trees alone contain 383 files.
- `KERNEL_CONSTITUTION.md`, v3 schema/authority docs, and the v7 Kernel command
  dispatcher (`src/kernel/commands/index.ts`).
- v7 task state machine (`src/kernel/tasks/state-machine.ts`).
- Eve promotion, session-tile, per-tile prompt-rail, and native-collaboration
  commits: `02bdc34`, `706e77d`, `935b235`, `0af36c9`.
- Dock catalogue and actor bridge (`quantflow-electron/src/main/dock-catalog.ts`,
  `dock-actors.ts`).
- Native-host candidates (`tools/agentos-host/{host,eve-supervisor,eve-session-broker}.js`).

The local checkout has neither `tools/agentos-host/node_modules` nor the paired
`quantflow-eve` checkout. Historical live proofs therefore establish what v7
was intended to prove, but do **not** prove that the runtime can execute on this
Mac today.

## Keep as V8 product contracts

| Contract | Evidence | V8 treatment |
| --- | --- | --- |
| Kernel is sole truth | Constitution; v7 command dispatcher writes a command audit record then routes mutations | Reimplement in Swift + one SQLite database. No JSON/canvas/runtime mirror. |
| Task verification gate | v7 state machine requires `submitted → verifying → complete` | Port exactly and test it in M1. |
| Receipts and events are append-only | Constitution and v3 authority rules | Enforce at the Swift command boundary and SQLite trigger layer. |
| Canvas is a projection | Constitution; v7 one-truth work | SwiftUI reads query snapshots and emits commands only. |
| Semantic cable meanings | v3 `Connection` contract | Keep the six typed semantics; render only after the Kernel row exists. |
| Dock is a verified actor catalogue | v7 catalogue has only `eve` in `DOCK_SPAWN_ACTOR_IDS` | Start V8 with Eve alone. Other catalogue entries are not port commitments. |
| Durable per-tile actor/session identity | v7 native-collab proof asserts distinct tiles, AgentOS actor addresses, and Eve sessions | Preserve the identity contract; do not use ports as cable identity. |
| Per-tile prompt serialization | v7 `tilePromptRails` queues each tile independently | Preserve this runtime rule; never serialize the whole canvas. |

## Do not port

| Source | Why it stops at the boundary |
| --- | --- |
| `quantflow-electron/` | 556-file Electron, React, preload, PTY, IPC, and Windows UI shell. It provides interaction reference only. |
| `runtime-state/` and `runtime.db` | It is explicitly a derived/legacy mirror while its repositories still issue direct SQL writes. V8 has one Kernel SQLite store. |
| `canvas-state.json` and canvas persistence | Historical compatibility path and a second-state-risk. V8 has no canvas persistence format. |
| WSL lifecycle, Windows paths, herdr, tmux, and Windows PTY adapters | Platform tax, not product logic. |
| `eve dev` terminal rail | v7 retired it in favour of durable Eve session tiles. V8 starts native-session-first. |
| Actor lanes, global queues, and finite session pools | Historical performance workarounds. They violate the V8 normal-pace/unlimited-tile product bar. |
| Non-Eve dock species | v7 catalogue lists them, but only Eve is on the verified spawn rail. |

## Important runtime discrepancy: resolve by Mac measurement

The current handoff describes a **shared, prewarmed multi-session Eve server**.
The v7 implementation in `tools/agentos-host/eve-supervisor.js` instead creates
**one Eve server per actor key** and maintains a **size-one warm pool**. It uses
one unique local port and workflow data directory per actor, then gives each tile
one durable Eve session.

Those are not interchangeable. V8 must not silently call the v7 supervisor a
shared-server implementation, and it must not copy the per-tile server topology
as if it were a Mac requirement.

**V8 decision:** M3 starts with a native runtime spike that benchmarks the
shared-server/per-session design against the real Eve version on this Mac. It
passes only if two independently addressed tiles can create, resume, prompt, and
cable using durable session IDs. If Eve's actual concurrency semantics reject
that design, the alternative is an explicit documented topology decision—not a
hidden warm pool or lane.

## V8 implementation boundary

### M1 — narrow Kernel, not a migration dump

Implement only the canonical tables needed to prove the product spine:

```text
workflows, tiles, worker_instances, tasks, receipts,
events, connections, commands
```

Roles, harnesses, and models are small catalogues behind `worker_instances`.
State cards, artifacts, permissions, task dependencies, vault, evaluations,
and performance tracing stay out until a concrete V8 surface needs them.

M1 acceptance is exactly: create a workflow/tile/worker/task, move a tile via a
Kernel command, enforce the task state machine, and verify receipts/events and
the query snapshot from SQLite.

### M2–M4 — build against contracts, not v7 folders

- **M2:** SwiftUI pan/zoom canvas, selection, drag → Kernel tile command → event
  → projection refresh. No copied renderer state.
- **M3:** native Node runtime spike and a minimal Swift `RuntimeClient`; no
  Electron route, WSL detection, or terminal display code.
- **M4:** a one-entry Eve dock that creates Kernel records before requesting a
  runtime session. Measure promptability from click to the accepted first input.

## Audit conclusion

V7 did prove a valuable spine: governed durable workflow state, an inspectable
canvas, one verified Eve dock species, durable session identity, and typed cable
semantics. It did **not** prove that Electron, WSL, `runtime.db`, the full v3
schema, the full dock catalogue, or the per-tile Eve-server topology belong in
V8.

V8 is therefore a greenfield native implementation with five carried contracts:
Kernel truth, verification gates, evidence, projection-only canvas, and
session-scoped Eve collaboration. Everything else needs a V8 acceptance proof.
