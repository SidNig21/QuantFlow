# src/renderer — Agent Guide

The renderer is a visual projector of Kernel state. It is not a database.

## What This Subtree Owns

- Canvas rendering — tiles, connections, viewport pan/zoom.
- User intent capture — drag, drop, click, keyboard shortcuts.
- Tile flip UI — terminal front / StateCard back.
- Conductor tile display.
- `canvas/grid.ts` - shared Surface S1 grid tokens for the live shell and future renderer surfaces: 12 columns, 8px baseline, gutters, margins, and string-lane sizing. Tokens only; no Kernel truth.
- `state/kernel-client.ts` — Typed contract for `window.kernelApi`; wrappers for `sendKernelCommand`, `sendKernelQuery`, `onKernelEvent`. (Goal 2)
- `canvas/kernel-canvas.ts` — Canvas action wrappers that route through Kernel commands: `spawnTile`, `moveTile`, `resizeTile`, `connectTiles`, `closeTile`. (Goal 2)
- `components/WorkflowRegion/workflow-region-view.ts` — pure projector: formats a Kernel workflow region into a soft region model + ordered display sections (workflow / objective / status / tiles / tasks / receipts / blockers / strings). (Goal 7)
- `components/StringOverlay/semantic-string-view.ts` — pure projector: maps a connection's `semantic_type` to presentation (label / class hook / directional / alert) via `SEMANTIC_STRING_STYLES` + `resolveSemanticString` + `normalizeStringType`. (Goal 7)
- `components/StateCardView/state-card-view.ts` — pure projector: formats a Kernel State Card snapshot into the canonical display sections. (Goal 4)
- `components/TileBack/tile-back.ts` — back-face model built from a State Card snapshot. (Goal 4)
- `components/Tile/tile.ts` — tile flip-state contract (front = live content, back = State Card). (Goal 4)
- `shortcuts/index.ts` — shared shortcut contract; `Shift+F` flips all tiles. (Goal 4)
- `components/ConductorTile/conductor-view.ts` — pure projector: formats the embedded Conductor's view into the canonical sections (plan / state reads / tool calls / delegations / receipts reviewed / blockers / next action). (Goal 5A)

These are framework-agnostic contracts shared with the live shell renderer
(`quantflow-electron/src/windows/shell`) via the `@qf-renderer` build alias. They
hold no canonical State Card state — the data comes from `kernel.state_card.get`.

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
5. `PRODUCT.md` + `DESIGN.md` — product/visual taste rails for any UI work (not runtime deps)
6. This file
7. Relevant renderer source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
