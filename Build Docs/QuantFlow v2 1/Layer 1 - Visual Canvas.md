# Layer 1 - Visual Canvas

Status: carry unchanged.

Owner: Collaborator canvas fork.

Layer rule: Layer 1 owns canvas display, user interaction, tile geometry, string visuals, panels, and status UI only. It must not own process lifecycle, A2A delivery, Envoy memory, or Watchtower event truth.

## 1A - Canvas Renderer Audit

```text
Goal: QuantFlow V2 Layer 1A - Canvas renderer audit
Layer: 1 - Visual (Canvas)
Depends on: Branch confirmed on quantflow-v2; ARCHITECTURE.md and BUILD_PLAN_V2.md read in the current repo.
Scope: Audit the existing canvas renderer for pan, zoom, infinite grid, viewport transforms, minimap/edge indicators if present, and persisted canvas load/save behavior. Document the current files, tests, and any visual risk without rewriting renderer behavior. Confirm that renderer state stays strictly visual and does not make process-runtime, A2A, or Envoy decisions.
Acceptance criteria:
- Identify the concrete renderer entry points, expected to include src/windows/shell/src/renderer.js, canvas-viewport.js, canvas-state.js, canvas-minimap.js, shell.css, and related tests.
- Run the existing focused renderer/canvas tests where available, including canvas-viewport, canvas-state, canvas-rpc, and any renderer-adjacent tests that are already present.
- Confirm pan, zoom, grid positioning, canvas persistence, and empty-canvas behavior still work in the app or with existing tests.
- Produce an audit note in the v2 vault or repo docs that says "Layer 1A locked" only if no behavior change is needed.
- If defects are found, list them as follow-up issues and do not fix them inside this audit goal unless they block all later sections.
Out of scope:
- Rewriting renderer geometry.
- Changing visual design.
- Adding process/runtime state.
- Changing herdr, A2A, Envoy, Watchtower, or tile spawning code.
Retirement: None.
```

## 1B - Tile DOM Management Audit

```text
Goal: QuantFlow V2 Layer 1B - Tile DOM management audit
Layer: 1 - Visual (Canvas)
Depends on: 1A Canvas renderer audit complete.
Scope: Audit tile creation, dragging, resizing, close confirmation, z-order, tile selection, route handles, and webview/terminal tile shell mounting. Confirm this layer only presents tiles and persists visual metadata; it must not decide WSL process lifecycle or communication transport.
Acceptance criteria:
- Identify current tile files, expected to include src/windows/shell/src/tile-manager.js, tile-renderer.js, tile-interactions.js, tile-route-handles.js, pty-close-confirmation.js, and relevant tests.
- Verify tile create, drag, resize, close, and route handle rendering with focused tests and one manual smoke path if the app is running.
- Confirm visual tile records can carry runtime identifiers such as herdrPaneId/herdrAgentName later without Layer 1 owning their meaning.
- Record a short "stable/no rewrite" finding or a bounded defect list.
Out of scope:
- Implementing herdr agent.start.
- Adding new built-in tile definitions.
- Changing terminal PTY spawn behavior.
- Deleting legacy runtime fields.
Retirement: None.
```

## 1C - String Visual Layer Audit

```text
Goal: QuantFlow V2 Layer 1C - String/cable visual layer audit
Layer: 1 - Visual (Canvas)
Depends on: 1B Tile DOM management audit complete.
Scope: Audit visible strings/cables: drawing mode, cable math, cable renderer, drop targets, pulses, deletion, inspector focus, and connection persistence from the visual side. Confirm strings are only visual representations and will later map to A2A connections in Layer 3.
Acceptance criteria:
- Identify current cable files, expected to include cable-draw-mode.js, cable-drop.js, cable-math.js, cable-renderer.js, cable-overlay.js, cable-inspector.js, and their tests.
- Run focused cable tests.
- Confirm visual connection rows sync to the current connection model without assuming custom string relay is the final transport.
- Confirm deleting a visual string removes only the visual/persisted connection representation and does not delete unproven A2A or Envoy records before Layer 3 defines that lifecycle.
- Confirm the current string delete path does not call into string-relay.ts, smart-string-pipeline.ts, or any relay delivery on delete. If it does, document it as a Layer 3G dependency, not a Layer 1 fix.
- Record "Layer 1C locked" with any caveats.
Out of scope:
- A2A connection creation.
- String relay rewrites.
- Watchtower lifecycle events.
- Envoy posting.
Retirement: None.
```

## 1D - Port Rendering Audit

```text
Goal: QuantFlow V2 Layer 1D - Port rendering audit
Layer: 1 - Visual (Canvas)
Depends on: 1C String visual layer audit complete.
Scope: Audit input/output dots on tile edges, hover/drag affordances, side-specific routing metadata, and accessibility labels. Confirm port rendering is display-only and can carry directional metadata for Layer 3 without owning communication.
Acceptance criteria:
- Identify where ports/route handles are rendered, expected to include tile-renderer.js, tile-route-handles.js, cable-drop.js, and associated CSS.
- Verify all visible port positions remain stable across drag, resize, and zoom.
- Confirm current connection metadata supports source/target direction fields or document the exact migration needed for Layer 3D.
- Record locked status or a small compatibility note for later sections.
Out of scope:
- Implementing protocol adapters.
- Changing connection schema beyond audit notes.
- Adding new visual styles unless required to fix a failing existing test.
Retirement: None.
```

## 1E - Sidebar Audit

```text
Goal: QuantFlow V2 Layer 1E - Sidebar audit
Layer: 1 - Visual (Canvas)
Depends on: 1B Tile DOM management audit complete.
Scope: Audit the Files/Tiles sidebar, tile registry display, workspace list, and any navigation panel behavior that helps operators find tiles/files. Confirm it remains a visual/navigation layer and does not become runtime truth.
Acceptance criteria:
- Identify sidebar/nav files, expected to include panel-manager.js, workspace-manager.js, src/windows/nav/src/App.tsx, src/windows/tile-list/src/App.tsx, and tile-registry.ts.
- Run available tile-list/nav/sidebar focused tests.
- Confirm tile count and registry display can consume later runtime state without writing process truth itself.
- Record stable status and any dependency notes for Layer 5 built-in/custom tile display.
Out of scope:
- Building custom tile registration.
- Changing workspace import/indexing.
- Adding herdr/Envoy logic.
Retirement: None.
```

## 1F - Watchtower Panel Shell Audit

```text
Goal: QuantFlow V2 Layer 1F - Watchtower panel shell audit
Layer: 1 - Visual (Canvas)
Depends on: 1E Sidebar audit complete.
Scope: Audit the existing Watchtower panel as a visual container: tabs, filters, summaries, attention cards, retry/focus affordances, export diagnostics, and update cadence. Confirm this layer renders events but does not decide event truth.
Acceptance criteria:
- Identify current Watchtower files, expected to include watchtower-view.js, operational-event-log.js, ipc-runtime-state.ts, ipc-string-relay.ts, and related tests.
- Run focused Watchtower tests.
- Confirm the panel can later switch data sources to herdr events, A2A task events, and Envoy mirror events without a complete UI rewrite.
- Record what data-shape adapters Layer 6 must replace.
Out of scope:
- Implementing Layer 6 event source switch.
- Adding A2A task events.
- Adding Envoy mirror events.
- Retiring relay logs.
Retirement: None.
```

## 1G - Legend Palette UI Audit

```text
Goal: QuantFlow V2 Layer 1G - Legend palette UI audit
Layer: 1 - Visual (Canvas)
Depends on: 1B Tile DOM management audit complete.
Scope: Audit the Legend palette UI: icons, sections, density toggle, spawn mode, built-in tile list, template display, and Commence button behavior as a visual/operator control. Confirm it is ready to be wired to the v2 config and herdr spawn flow in Layer 5.
Acceptance criteria:
- Identify current legend files, expected to include legend-dock.js, legend-spawn.js, legend-v1.css, legend-dock.test.ts, and legend-spawn.test.ts.
- Run focused Legend tests.
- Confirm current built-in entries include at least Hermes, Codex, Claude Code, PufferLib, Python, and Generic CLI; record missing entries required by Layer 5B.
- Confirm Commence is currently visual/operator state and must not auto-start workers until Layer 5E.
Out of scope:
- Locking the tile config schema.
- Adding missing built-ins.
- Wiring herdr agent.start.
- Changing templates beyond audit notes.
Retirement: None.
```

## 1H - Status Bar Audit

```text
Goal: QuantFlow V2 Layer 1H - Status bar audit
Layer: 1 - Visual (Canvas)
Depends on: 1A Canvas renderer audit complete.
Scope: Audit workspace name, tile count, health, zoom, runtime readiness indicators, and any bottom/top status display. Confirm the status bar can show herdr startup readiness later but does not perform startup logic.
Acceptance criteria:
- Identify the status bar implementation in renderer/shell files and CSS.
- Verify workspace name, tile count, health, and zoom remain accurate during basic canvas operations.
- Document exactly where Layer 2G can surface "herdr ready/not ready" without introducing runtime ownership into Layer 1.
- Record locked status or bounded follow-up notes.
Out of scope:
- Implementing herdr bootstrap.
- Adding health probes outside current UI.
- Changing diagnostics logic.
Retirement: None.
```
