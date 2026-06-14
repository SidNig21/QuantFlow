# src/renderer — Agent Guide

The renderer is a visual projector of Kernel state. It is not a database.

## What This Subtree Owns

- Canvas rendering — tiles, connections, viewport pan/zoom.
- User intent capture — drag, drop, click, keyboard shortcuts.
- Tile flip UI — terminal front / StateCard back.
- Conductor tile display.
- `state/kernel-client.ts` — Typed contract for `window.kernelApi`; wrappers for `sendKernelCommand`, `sendKernelQuery`, `onKernelEvent`. (Goal 2)
- `canvas/kernel-canvas.ts` — Canvas action wrappers that route through Kernel commands: `spawnTile`, `moveTile`, `resizeTile`, `connectTiles`, `closeTile`. (Goal 2)
- Workflow region overlay (Goal 7).
- StateCard view component (Goal 4).

## Authority Rules

```text
Renderer is a projector.
Do not store canonical workflow/tile/task state here.
Renderer sends user intent to Kernel.
Renderer renders Kernel snapshots/events.
Do not create a second source of truth.
```

## What This Subtree Must Not Do

- Write canonical tile position, status, task, or receipt state to local renderer store only.
- Mutate tile state without a Kernel command round-trip.
- Update the canvas before the Kernel accepts the mutation.
- Hold a private authoritative copy of workflow or task state.
- Import `src/kernel/` internal state directly — use IPC/query boundary.

## The Correct Pattern

```text
User drags tile → renderer captures intent
→ Kernel command: tile.move
→ Kernel writes state, emits event
→ Renderer receives event
→ Canvas re-renders at new position
```

Not: renderer moves tile locally and syncs later.

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. This file
6. Relevant renderer source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
