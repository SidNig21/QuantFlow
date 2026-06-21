# QuantFlow — Design Rails

Shared visual taste for agents doing UI/UX work. Pair with `PRODUCT.md` (what we
are building and for whom). These are **rails, not a runtime dependency**, and they
never override `BUILD_PLAN_V3.md` or `KERNEL_CONSTITUTION.md`.

The goal: UI work stops being improvised per-screen. When two agents touch the
canvas a week apart, the result should look like one product.

## First Principles

1. **Canvas-first, projection-only.** Visual surfaces render Kernel state; they
   never become a second source of truth. If you need data, query the Kernel.
2. **Soft over hard.** Prefer canvas-native overlays (boundaries, badges, flip
   faces) over modals, drawers, and full dashboards. A region is a labelled zone,
   not a panel.
3. **Density with calm.** Pack in information, but keep the resting state quiet.
   Reach for emphasis only when there is signal to convey.
4. **Meaningful color only.** Color encodes meaning, not branding flourish.
   Semantic strings, blockers, and live activity earn color; structure does not.
5. **No layout tyranny.** Snapping and predictable zones are fine; a mandatory
   layout engine or auto-graph layout is not. Never make layout a runtime
   authority.

## Visual Language

- **Typography:** one sans stack (`--font-sans`). Titles ~13px/600, secondary
  ~11px, labels/uppercase micro-text ~10px with letter-spacing. Avoid more than
  three sizes in one surface.
- **Hierarchy:** name → objective → status/summary → alerts, top to bottom, most
  important first.
- **Spacing:** generous padding inside soft containers; align to the existing
  canvas grid (20px cell) where it helps readability.
- **Color tokens (use existing CSS variables, do not hardcode new palettes):**
  - Text: `--text-secondary`, `--text-tertiary`.
  - Accent / structural highlight: `--accent`.
  - Alert / blocker: `--coral`.
  - Mix with `color-mix(... transparent)` for soft fills/strokes rather than
    introducing new opaque colors.
- **Motion:** subtle and purposeful (a live string flow, a brief pulse on relay).
  Never animate for decoration. Respect existing `--motion-*` timings.

## Brand Mark

The QuantFlow insignia is the **Flow Cube**: a corner-on wireframe cube spun
about its body diagonal, with live nodes routing the edge loop. It replaces the
old Q-ring/F mark. The `QUANTFLOW` wordmark stays as-is.

- **Live Green `#B7FF00` remains the identity color.** It is the primary node
  and underline color.
- Animated/live surfaces may use the approved packet spectrum:
  Live Green `#B7FF00`, teal `#2fe6cf`, and violet `#c79bff`.
- Tiny/static surfaces may use a single Live Green node for legibility.
- No pure black or pure white. Use QuantFlow dark `#0a0d12` and ivory
  `#f2f0ec` for icon/background contrast.
- The canvas watermark uses the cube + wordmark lockup, quiet behind tiles. It
  is a projector only; it never owns canvas state or workflow meaning.

## Semantic String Palette (Goal 7)

A string's color tells the operator what the relationship means. Keep these
consistent across the cable layer and any legend:

| Type | Meaning | Tone |
| --- | --- | --- |
| `delegation` | one tile delegates work to another | accent blue |
| `context_flow` | shared context/plan flows along the string | light blue |
| `artifact_dependency` | a tile depends on another's artifact | amber |
| `verification` | one tile verifies another's work | green |
| `receipt_handoff` | a receipt/evidence handoff | violet |
| `blocker` | the relationship is blocking progress | coral (alert, dashed) |
| `manual_connection` | operator link with no declared meaning | idle/neutral |

Only `blocker` reads as an alert. The rest are calm unless live.

## When To Use What

- **Workflow region** — to show mission membership + status on the canvas.
- **Semantic string** — to show a relationship's meaning between two tiles.
- **State Card (flip)** — to show one tile's compressed current reality.
- **Conductor panel** — to show the planner's reads/plan/decisions.
- **Modal** — rarely; only for a blocking, explicit operator decision. Default to
  inline/canvas affordances first.

## Anti-Patterns (regressions)

- A region/overlay that feels like a separate dashboard.
- Decorative strings or strings used as message transport.
- Re-rendering canonical state from local UI memory instead of the Kernel.
- New color palettes or font stacks introduced ad hoc.
- Visual complexity that does not increase understanding.

## External Design Tooling (optional, sandbox only)

[Efecto](https://efecto.app) is an AI design sandbox (Figma/v0-style, built for
agents — MCP tools/API/SSE for artboards, layouts, app screens, Tailwind
sections, brand systems, effects; docs note Claude Code / Cursor / Windsurf /
Codex workflows: [docs](https://efecto.app/docs), [MCP](https://efecto.app/docs/mcp)).

It may be useful for exploring **hard visual pieces before implementing them** —
workflow region visuals, the semantic string legend, tile flip / State Card
layout, Conductor panel polish, settings/controls consistency.

Rules, same category as Dosu/Entire in `BUILD_PLAN_V3.md`:

- Efecto lives **beside** QuantFlow, never inside it. No runtime dependency, no
  build step, no MCP server wired into the app.
- It has **no authority** over the Kernel, `BUILD_PLAN_V3.md`, or these docs.
- Use it to produce reference designs; humans/agents then implement against these
  rails. Exported designs are inspiration, not source of truth.
- Skip it if it adds friction. It is optional design-ops, not a gate.
