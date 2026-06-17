# Incoming Goals — v3 Backlog (intake, not authority)

A capture surface for candidate goals discovered while **using** QuantFlow during
the dogfooding phase. Items here are raw intake: ideas, gaps, papercuts, and
"this feels missing" notes.

**Nothing here is authorized work.** A candidate becomes real only when the
operator promotes it into `BUILD_PLAN_V3.md` as a numbered goal with full scope
and explicitly authorizes it (one goal at a time). Until then, do not implement
from this file.

See `docs/v3/STATUS.md` for current v3 state and `BUILD_PLAN_V3.md` for the
authoritative ladder (Goal 10 / cloud is the only parked rung).

## How to add an item

Keep entries short and evidence-based — what you actually hit, not a feature
wishlist. Use this shape:

```md
### <short title>
- **Problem / friction:** what felt missing or wrong while using the product
- **Evidence:** where you saw it (workflow, tile, command, receipt/eval id, screenshot)
- **Proposed scope:** rough idea of the change (1–3 bullets), if any
- **Layer(s):** kernel / renderer / conductor / harness / vault / evals / shell
- **Priority:** low / medium / high
- **Status:** captured | discussed | promoted to BUILD_PLAN_V3 (Goal N) | dropped
```

## Candidates

### Canvas layout diagnostics (deterministic, Kernel-data only)
- **Problem / friction:** the Kernel knows tile geometry, but an agent/operator can still miss *visual* problems — a tile hidden behind another (z-index), a blocked worker scrolled offscreen, a verification string with a missing/!visible endpoint, a workflow region too cluttered to read.
- **Evidence:** not yet observed in real use — captured from the SpatialClaw discussion (2026-06-16). **Confirm during dogfooding before promoting.**
- **Proposed scope (cheap, do this first if promoted):**
  - Pure geometry helpers over the existing `CanvasSnapshot` + workflow regions + viewport: `detectOverlaps`, `findOffscreenTiles(viewport)`, `tilesInRegion`, `connectionsMissingEndpoint`, `layoutScore`. No screenshot, no ML, no code sandbox.
  - Surface as a Conductor read-tool (`diagnose_canvas_layout`) and/or a `visual_diagnosis` receipt. Diagnose + propose only — never mutates; proposals route through Conductor → Kernel commands.
- **Layer(s):** kernel/queries (read), conductor (read-tool), maybe evals-style pure module
- **Priority:** medium (high value, low cost — but gated on real dogfooding evidence)
- **Status:** captured

### Canvas Perception Kernel — screenshot + code-reasoning loop (SpatialClaw-inspired, heavier)
- **Problem / friction:** the deterministic helpers above can't judge truly pixel-level questions (text unreadable at current zoom, a browser tile showing an error, strings visually crossing badly). SpatialClaw's lesson: give the agent a *composable* workspace (write code cell → inspect intermediate vars/images → revise) instead of one screenshot or rigid tool calls.
- **Evidence:** SpatialClaw (NVlabs) — https://spatialclaw.github.io/ , https://github.com/NVlabs/SpatialClaw. Reference for the **action-interface pattern only**, not the 3D/SAM3/Depth stack.
- **Proposed scope (deferred — separate, larger goal):**
  - New `canvas.captureViewport` RPC (PNG of current viewport / fit-to-workflow). Browser tiles already screenshot; the infinite canvas does not.
  - Persistent reasoning sandbox (TS `vm` or subprocess) preloaded with snapshot/regions/state-cards/viewport (+ optional screenshot) and the geometry helpers; agent composes/inspects/revises; returns a diagnosis/proposal.
  - Ship as a `canvas-perception` harness/plugin (diagnostic/verifier role) and/or MCP external tool — NOT the Conductor internal fast path.
- **Layer(s):** harness/plugin, kernel RPC (screenshot), conductor (consume proposals)
- **Priority:** low (real risk: agent-written code in a sandbox; only build if Phase-0 helpers prove insufficient)
- **Status:** captured — **do NOT install SpatialClaw as a dependency**; pattern-only. Aligns with Goal 7's parked Smart Grid / layout-verification ideas.
- **Hard rails (carry into any promotion):** screenshots are never source of truth; visual reasoning never mutates canvas/Kernel state; high-risk proposals still go through Conductor approval; no GPU/3D/segmentation stack for v3.

## Promotion checklist (when an item graduates)

1. Operator decides it's worth a goal.
2. Write it up in `BUILD_PLAN_V3.md` with Goal/Why/Repo scope/Out of
   scope/Acceptance/Failure signals (the standard goal shape).
3. Confirm it respects the Kernel Constitution (no new authority outside the
   Kernel; canvas stays a projector; evals/vault stay derived/mirror).
4. Mark the item here as `promoted to BUILD_PLAN_V3 (Goal N)`.
5. Authorize and build under the normal worker/verifier protocol.
