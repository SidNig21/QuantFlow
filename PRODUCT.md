# QuantFlow — Product Definition

Shared product taste for every agent (Claude, Codex, Cursor, …) touching QuantFlow.
This is **product context, not architecture**. It does not override
`BUILD_PLAN_V3.md` or `KERNEL_CONSTITUTION.md`; when they conflict, those win.

Read this before doing UI/UX work so design stops being improvised from
screenshots and vibe memory.

## What QuantFlow Is

> QuantFlow is where autonomous work becomes **visible, coordinated, and provable**.

An infinite-canvas workspace for orchestrating real, multi-agent work. Tiles are
live participants (terminals, workers, the Conductor); strings are relationships
between them; workflows are the persistent missions those tiles serve. The Kernel
owns the truth; the canvas projects it.

## Who It Is For

A power operator running serious agent work — trading research, RL validation,
multi-step build/verify loops. They think in **workflows**, not windows. They
need to glance at the canvas and know: what is happening, who is doing it, what is
blocked, and what has been proven. They will not tolerate a toy.

## Product Pillars

1. **Canvas-first.** The infinite canvas is the primary surface. We add meaning
   *onto* it (regions, semantic strings, flip-side State Cards), we do not replace
   it with dashboards, modals, or Kanban boards.
2. **Kernel-backed projections.** Everything the UI shows is a projection of
   Kernel truth. No screen invents its own state. If it is on screen, the Kernel
   said so.
3. **Dense, not busy.** High information density is good; visual noise is not.
   Every pixel should carry meaning. Decoration that does not increase
   understanding is a regression (see Goal 7 failure signal: "visual complexity
   increases without adding understanding").
4. **Provable.** Receipts and verification are first-class. The product's promise
   is that you can trust what it tells you because there is an evidence chain
   behind it.
5. **Restrained.** Calm by default; color and motion are spent only where they
   carry signal (a blocker, a live string, an alert), never for flourish.

## What QuantFlow Is Not

- Not a full dashboard product or BI tool.
- Not a 100-agent fleet console.
- Not a rigid, layout-mandatory design tool.
- Not a chat app with agents bolted on.
- Not a cloud-first platform (local authority comes first; cloud is parked).

## How Features Should Feel

- **Workflow regions:** soft, canvas-native boundaries that group a mission's
  tiles and surface its name/objective/status/counts/blockers — a labelled zone,
  never a panel.
- **Semantic strings:** a string's color/shape tells you what the relationship
  *means* (delegation, verification, context, artifact, blocker, receipt handoff).
  Strings carry meaning, not message payloads.
- **State Cards (tile flip):** the compressed current reality of a tile, so the
  operator never has to read 10,000 terminal lines to know what a worker is doing.
- **Conductor:** a planner surface that reads Kernel truth and acts only through
  approved Kernel commands, with every decision on the receipt chain.

## Design Authority

Visual decisions follow `DESIGN.md`. Both `PRODUCT.md` and `DESIGN.md` are taste
rails for agents; neither is a runtime dependency, and neither overrides the
Kernel Constitution or the build plan.
