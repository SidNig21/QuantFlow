# QuantFlow Visual Component Inventory

**Audit date:** 2026-06-22  
**Scope:** Full-repo visual/UI topology (read-only inventory)  
**Primary product surface:** `quantflow-electron/` — one Electron shell window + embedded React webviews  
**Projector contracts (no DOM):** `src/renderer/`  
**Taste rails (non-runtime):** `DESIGN.md`, `PRODUCT.md`  
**Ancillary:** `quantflow-lottie/` (Lottie dev tool), `quantflow-eve/` (Cloudflare agent — no canvas UI)

---

## A. High-Level UI Topology

QuantFlow is **not a single React app**. The operator-facing product is a **hybrid architecture**:

```
Electron main (index.ts)
└── BrowserWindow — shell (frameless Win32 / hidden titlebar macOS)
    ├── Vanilla JS canvas host (index.html + renderer.js ~3800 LOC)
    │   ├── Titlebar + window controls
    │   ├── Left panel webview (nav OR tile-list)
    │   ├── Central canvas viewport (#panel-viewer)
    │   ├── Right panel webview (terminal-tile OR agent-chat)
    │   └── Body-level overlays (legend dock, modals, watchtower, …)
    └── 8 registered React webview surfaces (Vite bundles)
        nav | viewer | terminal | terminal-tile | graph-tile
        settings | tile-list | agent-chat
```

**State model:** No Zustand/Redux. Canvas truth lives in `canvas-state.js` module singletons (`tiles[]`, `connections[]`). Webviews use React local state + IPC. Kernel events drive re-renders via `canvas-rpc.js` and `tile-manager.js`.

**Navigation:** No React Router. IPC + webview `postMessage` + shell prefs (`window.shellApi.setPref`).

### Visual tree (shell → canvas → overlays)

```
body
├── #titlebar (.titlebar-brand — Flow Cube SVG + wordmark)
├── .window-controls (win32 minimize/maximize/close)
├── #nav-toggle, #agent-toggle (.panel-toggle)
├── #panels
│   ├── #panel-nav
│   │   ├── #nav-toolbar (#settings-btn, #sidebar-mode-control Files|Tiles)
│   │   └── <webview> → nav App OR tile-list App
│   ├── #nav-resize (.resize-handle)
│   ├── #panel-viewer  ← infinite canvas viewport
│   │   ├── #new-tile-btn
│   │   ├── #grid-canvas (2D pan/zoom grid)
│   │   ├── #canvas-watermark (+ #flow-cube-watermark lockup)
│   │   ├── #region-layer > #region-layer-content (workflow regions SVG)
│   │   ├── #tile-layer > .canvas-tile[] (DOM tiles + embedded webviews)
│   │   ├── #cable-layer > #cable-layer-content (connection SVG)
│   │   ├── #edge-indicators (off-screen tile peek dots)
│   │   ├── #zoom-indicator
│   │   └── #status-bar
│   ├── #agent-resize
│   └── #panel-agent → <webview> terminal-tile OR agent-chat
├── #settings-overlay > #settings-modal → settings webview
├── #canvas-skill-dialog (first-run skill installer)
├── #resize-overlay (panel drag shield)
├── #loading-overlay (#loading-flow-cube + status text)
└── [runtime-appended to body / #panel-viewer]
    ├── Legend dock (.lv1-* from legend-dock.js + legend-v1.css)
    ├── Legend spawn ghost (.lv1-spawn-ghost)
    ├── #watchtower-panel (Shift+W — inline in renderer.js)
    ├── #conductor-panel (conductor-panel.js)
    ├── Command palette (command-palette.js)
    ├── Shortcut panel (shortcut-panel.js, ?)
    ├── Workflow modal (workflow-modal.js)
    ├── Cable inspector (cable-inspector.js)
    ├── Cable HUD (cableHudEl — relay feedback)
    ├── Toast host (.toast-host)
    └── Tooltip layer (tooltip.js — data-tooltip attrs)
```

---

## B. Component Inventory Table

**Legend — tier:** Core = primary product surface | Secondary = supporting UI | Hidden = operator/debug | Legacy = built but likely unused

| Component / surface | File path | Role | Parent / children | Styling source | Visual states | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| **Shell HTML scaffold** | `quantflow-electron/src/windows/shell/index.html` | Static DOM skeleton for canvas + panels | Root of shell | `shell.css` | loading overlay visible at boot | Core |
| **Shell orchestrator** | `quantflow-electron/src/windows/shell/src/renderer.js` | Boot, IPC wiring, overlay lifecycle, watchtower inline | body | `shell.css` + inline DOM | boot/ready/error | Core |
| **Titlebar brand** | `index.html` `#titlebar` | App identity strip | body | `shell.css`, inline SVG | idle | Core |
| **Window controls** | `index.html` `.window-controls` | Win32 chrome | body | `shell.css` | hover/active/hidden macOS | Core |
| **Panel toggles** | `#nav-toggle`, `#agent-toggle` | Show/hide side panels | body | `shell.css` | pressed/unpressed | Core |
| **Nav panel shell** | `#panel-nav` | Left dock container | `#panels` | `shell.css` | collapsed/expanded/resizing | Core |
| **Nav toolbar** | `#nav-toolbar` | Settings + sidebar mode | `#panel-nav` | `shell.css` | Files/Tiles mode active | Core |
| **Nav webview (Files)** | `windows/nav/src/App.tsx` | Workspace file tree | `#panel-nav` webview | `nav/.../App.css`, `@collab/components` | selected/hover/loading | Core |
| **Tile list webview** | `windows/tile-list/src/App.tsx` | Live tile registry sidebar | `#panel-nav` webview | `tile-list/App.css` | grouped/filtered/selected | Core |
| **Canvas viewport** | `#panel-viewer` | Pan/zoom transform root | `#panels` | `shell.css`, inline transform | panning/zooming | Core |
| **Grid background** | `canvas-grid.js` → `#grid-canvas` | 2D grid draw | `#panel-viewer` | canvas 2D + CSS | opacity from prefs | Core |
| **Canvas watermark** | `canvas-watermark.js`, `flow-cube-watermark.js` | Empty-state hints + Flow Cube | `#canvas-watermark` | `shell.css` | empty/non-empty (`data-empty`) | Core |
| **Workflow region layer** | `workflow-region-overlay.js` → `#region-layer` | Mission/region SVG boxes | `#panel-viewer` | `shell.css` + SVG | active/idle/status colors | Core |
| **Tile layer** | `tile-renderer.js`, `tile-manager.js` → `#tile-layer` | All canvas tiles | `#panel-viewer` | `shell.css`, inline pos/size/z | see Tile map §D | Core |
| **Cable layer** | `cable-renderer.js` → `#cable-layer` | Connection SVG | `#panel-viewer` | `shell.css` + SVG classes | see Cable map §E | Core |
| **Edge indicators** | `edge-indicators.js` → `#edge-indicators` | Off-screen tile navigation dots | `#panel-viewer` | `shell.css` | hover/highlight | Secondary |
| **Zoom indicator** | `#zoom-indicator` | Transient zoom badge | `#panel-viewer` | `shell.css` z:260 | show/hide | Secondary |
| **Status bar** | `#status-bar` | Workspace/tile count/health/zoom | `#panel-viewer` | `shell.css` | health LED levels | Core |
| **Agent panel** | `#panel-agent` | Right rail webview host | `#panels` | `shell.css` | collapsed/expanded | Core |
| **Terminal tile webview** | `windows/terminal-tile/src/App.tsx` | Per-tile PTY surface | tile webview / agent panel | `terminal-tile/.../App.css`, `TerminalTab` | running/idle/error tabs | Core |
| **Agent chat webview** | `windows/agent-chat/src/App.tsx` | ACP agent thread UI | `#panel-agent` webview | `agent-chat/styles.css` (Tailwind) | streaming/tool-call/idle | Core |
| **Viewer webview** | `windows/viewer/src/App.tsx` | note/code/image/pdf content | tile webview | `viewer/.../App.css`, `@collab/components` | editing/loading/conflict | Core |
| **Graph tile webview** | `windows/graph-tile/src/App.tsx` | Force-directed workspace graph | tile webview | `graph-tile/.../App.css`, `WorkspaceGraph` | replay/idle | Core |
| **Settings overlay** | `#settings-overlay`, `settings/App.tsx` | Full settings modal | body webview | `settings.css` + Tailwind | pane navigation | Core |
| **Canvas skill dialog** | `#canvas-skill-dialog` | First-run agent skill install | body | `shell.css` | hidden/visible | Secondary |
| **Loading overlay** | `#loading-overlay` | Boot splash | body | `shell.css` z:9700+ | visible until ready | Core |
| **Resize overlay** | `#resize-overlay` | Panel resize drag shield | body | `shell.css` | active during drag | Secondary |
| **Legend dock** | `legend-dock.js` | Left spawn rail (recipes, templates) | appended to viewport/body | `legend-v1.css`, `shell.css` | spawn/connect modes, compact | Core |
| **Legend spawn ghost** | `legend-spawn.js` | Click-to-place preview | canvas | `legend-v1.css` | dragging/placing | Core |
| **Command palette** | `command-palette.js` | Cmd+K actions | body | `shell.css` z:9000+ | open/closed/filter | Core |
| **Shortcut panel** | `shortcut-panel.js` | `?` shortcut reference | body | `shell.css` | open/closed | Secondary |
| **Workflow modal** | `workflow-modal.js` | Run workflow from legend | body | `shell.css` | open/closed/running | Core |
| **Cable inspector** | `cable-inspector.js` | Selected cable detail | body | `shell.css` | open/closed | Core |
| **Conductor panel** | `conductor-panel.js` | Kernel planning surface | body | `shell.css` z:~2191 | collapsed/expanded | Core |
| **Watchtower** | `watchtower-view.js` + inline in `renderer.js` | Shift+W ops/debug panel | `#watchtower-panel` | `shell.css` | tabs: events/agents/messages/alerts | Hidden |
| **Launch diagnostics** | `launch-diagnostics-view.js` | PTY restore failure UI | dynamic | `shell.css` | error state | Hidden |
| **Toasts** | `toast-controller.js` | Operational feedback | `.toast-host` | `shell.css` | success/error/info fade | Secondary |
| **Tooltips** | `tooltip.js` | `data-tooltip` hovers | body layer | `shell.css` z:300 token | show/hide | Secondary |
| **Add agent form** | `add-agent-form.js` | Spawn agent/tool form | modal | `shell.css` | open/submit | Secondary |
| **Panel manager** | `panel-manager.js` | Nav/agent width, collapse | `#panels` | inline widths + CSS | collapsed/dragging | Core |
| **Theme controller** | `theme-controller.js` | dark/light/system/hc | `document.documentElement` | `Theme.css`, prefs | theme modes | Core |
| **Density controller** | `density-controller.js` | comfortable/compact | `[data-density]` | `Theme.css` | compact/comfortable | Core |
| **Standalone terminal** | `windows/terminal/src/App.tsx` | Multi-tab terminal (legacy path) | registered in view-config | `terminal/.../App.css` | tab states | Legacy |
| **Terminal list** | `windows/terminal-list/src/App.tsx` | Terminal list UI | **not in view-config** | `terminal-list/App.css` | n/a | Legacy |
| **QFFlowCube** | `packages/components/src/brand/QFFlowCube.tsx` | Animated brand mark | watermark, loading, React surfaces | inline SVG + CSS vars | live/static sizes | Core |
| **QFWordmark / QFLockup** | `packages/components/src/brand/` | Brand typography lockups | brand surfaces | component props | static | Secondary |
| **TreeView / WorkspaceTree** | `packages/components/src/TreeView/` | File tree rows, DnD | nav App | `TreeView.css` | selected/hover/dragging/rename | Core |
| **Editor / CodeEditorView** | `packages/components/src/Editor/`, `CodeEditorView/` | Blocknote + Monaco | viewer App | Blocknote.css, CodeEditorView.css | editing/conflict | Core |
| **TerminalTab** | `packages/components/src/Terminal/TerminalTab.tsx` | xterm.js wrapper | terminal-tile, terminal | `TerminalTab.css`, theme.ts | focus/blink/running | Core |
| **WorkspaceGraph** | `packages/components/src/WorkspaceGraph/` | D3 force graph + replay | graph-tile | `WorkspaceGraph.css`, `ReplayTimeline.css` | playing/scrubbing | Core |
| **State Card projector** | `src/renderer/components/StateCardView/state-card-view.ts` | Flip-back card model | `tile-state-card.js` | `shell.css` `.tile-back` | flip front/back | Core |
| **Semantic string projector** | `src/renderer/components/StringOverlay/semantic-string-view.ts` | Cable semantic CSS map | `cable-renderer.js` | `shell.css` `.cable-semantic--*` | per semantic type | Core |
| **Workflow region projector** | `src/renderer/components/WorkflowRegion/workflow-region-view.ts` | Region presentation | `workflow-region-overlay.js` | SVG + CSS | mission status | Core |
| **Conductor view projector** | `src/renderer/components/ConductorTile/conductor-view.ts` | Conductor tile model | `conductor-panel.js` | `shell.css` | planning states | Core |
| **Lottie dev app** | `quantflow-lottie/src/App.tsx` | Animation preview tool | standalone Vite | Tailwind `index.css` | playback/scrub | Ancillary |

### Settings modal panes (dynamic from `NAV_ITEMS`)

| Pane ID | Label | Primary visuals |
| --- | --- | --- |
| `appearance` | Appearance | Theme picker, density, canvas opacity slider |
| `agents` | Agents | Legend recipe CRUD, add-agent flows |
| `health` | Health | Health probes, status cards |
| `capability` | Capability | Capability probe results |
| `logs` | Logs | Log tail viewer |
| `crashes` | Crashes | Crash report list |
| `launches` | Launches | PTY launch diagnostics |
| `terminal` | Terminal | Terminal prefs |
| `integrations` | Integrations | External service toggles |
| `controls` | Controls | Shortcut reference (mirrors shortcut panel) |

Models: `settings/health-model.ts`, `settings/diagnostics-panels-model.ts`

### Agent chat subcomponents

| Component | File | Role |
| --- | --- | --- |
| `App` | `agent-chat/src/App.tsx` | Thread shell |
| `AgentThread` | `AgentThread.tsx` | Message list |
| `ToolCallCard` | `ToolCallCard.tsx` | Tool invocation cards |
| `MarkdownText` | `MarkdownText.tsx` | Rendered agent text |

---

## C. Canvas Layer Map (render order)

**DOM order inside `#panel-viewer`** (back → front):

| Z-order | Layer | Element | Implementation | Notes |
| --- | --- | --- | --- | --- |
| 1 | Background grid | `#grid-canvas` | Canvas 2D (`canvas-grid.js`) | z:0; opacity from prefs |
| 2 | Watermark | `#canvas-watermark` | DOM + Flow Cube component | z:1; hidden when tiles exist |
| 3 | Workflow regions | `#region-layer` | SVG (`workflow-region-overlay.js`) | z:2 |
| 4 | Tiles | `#tile-layer` | DOM `.canvas-tile` + webviews | z:103 CSS; per-tile inline zIndex |
| 5 | Cables | `#cable-layer` | SVG groups (`cable-renderer.js`) | z:104 |
| 6 | Edge indicators | `#edge-indicators` | DOM dots | z:105 |
| 7 | Zoom badge | `#zoom-indicator` | DOM text | z:260 transient |
| 8 | Status bar | `#status-bar` | DOM strip | z:104 (same band as cables) |

**Per-tile stacking:** `canvas-state.js` assigns inline `zIndex`; `.canvas-tile.tile-focused` bumps to 999+.

**Canonical token map** (`packages/shared/src/styles/Theme.css`):

```
--z-canvas-bg: 0
--z-tile: 100
--z-tile-focused: 101
--z-cable-layer: 102
--z-port: 103
--z-edge-indicator: 104
--z-watchtower: 200
--z-tooltip: 300
--z-modal: 400
```

**Production drift:** `shell.css` uses hardcoded 9000–10001 for modals, loading, command palette, legend dock. Tokens are partially superseded.

**Above canvas (body level, approximate back → front):**

| Z (approx) | Surface |
| --- | --- |
| 210–320 | Legend dock, spawn ghost |
| 601 | New-tile btn |
| 2000 | Marquee selection (tile-interactions) |
| 2191 | Conductor panel |
| 9000–9600 | Settings overlay, command palette, cable inspector |
| 9700–10001 | Loading overlay |

**Viewport transform:** `#panel-viewer` children share a CSS transform from `canvas-viewport.js` (pan + zoom). Cables and regions render in **world coordinates** inside transformed layers.

---

## D. Tile System Map

### Canonical tile types (`canvas-state.js`)

`term | note | code | image | graph | browser | pdf`

### Visual subtypes (`getTileVisualType` in `tile-renderer.js`)

Derived from role metadata: `codex | generic | agent | worker | tool | graph | browser | note | code | image | pdf | memory`

### Default dimensions

| Type | W×H |
| --- | --- |
| term | 400×500 |
| note/code | 440×540 |
| image | 280×280 |
| graph | 600×500 |
| browser | 800×650 |
| pdf | 600×800 |

### Tile DOM structure (`.canvas-tile`)

```
div.canvas-tile[data-tile-type][data-tile-state][data-running]
├── .tile-title-bar [.tile-title-bar--role]
│   ├── .tile-type-glyph
│   ├── .tile-title-text (.tile-title-parent, .tile-title-name, .tile-route-handle)
│   ├── .tile-role-badge | .tile-shell-badge | .tile-status-badge | .tile-herdr-badge
│   ├── .tile-nav-group (browser tiles: back/forward/reload + .tile-url-input)
│   └── .tile-btn-group (.tile-flip-btn, .tile-close-btn, …)
├── .tile-content
│   ├── <webview> OR browser iframe OR .tile-back (State Card)
│   └── .tile-content-overlay
├── .tile-port (N/E/S/W) — cable attachment handles
└── .tile-resize-handle (corners/edges)
```

### Tile-related files

| File | Responsibility |
| --- | --- |
| `canvas-state.js` | `tiles[]`, z-index, type inference, grid snap |
| `canvas-grid.js` | Grid alignment, tidy/repack |
| `tile-manager.js` | Spawn/close/restore, Kernel sync, webview lifecycle |
| `tile-renderer.js` | DOM creation, badges, browser chrome, ports |
| `tile-interactions.js` | Drag, resize, marquee, port drag, selection |
| `tile-state-card.js` | State Card back face (Shift+F flip) |
| `tile-route-handles.js` | `@handle` routing labels |
| `role-tile-spawn.js` | Role-based spawn |
| `role-herdr-spawn.js` | Herdr/WSL spawn |
| `legend-spawn.js` | Legend click-to-place |
| `legend-dock.js` | Spawn rail UI |
| `legend-readiness.js` | Recipe readiness badges |
| `main/legend-recipes.ts` | Server legend recipe registry |
| `main/tile-session-registry.ts` | Main-process session map |
| `main/ipc-tile-registry.ts` | Live tile list IPC |
| `tile-list/tile-registry.ts` | Sidebar grouping/filter UI |
| `src/renderer/components/Tile/tile.ts` | Flip contract (front/back) |
| `src/renderer/components/TileBack/tile-back.ts` | State Card back model |

### Tile visual states (CSS + data attrs)

| State | Mechanism | Visual cue |
| --- | --- | --- |
| idle | default | rail color from `--rail-*` per type |
| focused | `.tile-focused` | elevated z-index, glow pseudo-elements |
| selected | `.tile-selected` | selection ring (`::before/::after`) |
| running | `[data-running="true"]` | `--sh-tile-running` shadow |
| queued | `[data-tile-state="queued"]` | muted styling |
| error/failed | `[data-tile-state="error"]` etc. | `--sh-tile-error` |
| edge highlight | `.edge-indicator-highlight` | pulsing when off-screen dot clicked |
| flipped | `.tile-flipped` / back face visible | State Card on reverse |
| dragging | inline transform during drag | reduced opacity (interactions) |
| resizing | handle active | live width/height inline |
| port hover | `.tile-port:hover`, cable draw mode | port glow `--sh-port-live` |
| compact density | `[data-density="compact"]` ancestor | reduced padding via tokens |

### Tile type registry

- **Content types:** hardcoded in `canvas-state.js`
- **Spawn recipes:** `LEGEND_RECIPES` seed in `legend-dock.js` + runtime `shellApi.legendList()` → `legend-recipes.ts`
- **Webview routing:** `tile-manager.js` + `webview-factory.js` pick viewer/terminal-tile/graph-tile URL

---

## E. Cable / String System Map

### Files

| File | Role |
| --- | --- |
| `canvas-state.js` | `connections[]` CRUD |
| `cable-renderer.js` | SVG path render, class assignment, bundle groups |
| `cable-math.js` | Bezier geometry, port positions |
| `cable-draw-mode.js` | Shift+C hold-to-draw |
| `cable-drop.js` | Drop target resolution |
| `cable-inspector.js` | Selected cable detail panel |
| `cable-overlay.js` | Context relay formatting / HUD |
| `tile-interactions.js` | Port drag initiation |
| `semantic-string-view.ts` | Semantic type → CSS class + label |

### Drawing implementation

- **Technology:** SVG inside `#cable-layer > #cable-layer-content`
- **Coordinates:** World space (same transform as tiles)
- **Path:** Cubic Bezier via `cable-math.js` `bezierPath()`
- **Structure per connection group:**
  - `g[data-cable-id]` root
  - `.cable-hit` (wide invisible hit target, `--cable-w-hit`)
  - `.cable-glow`, `.cable-main`, `.cable-flow` (animated dash for live relay)
  - `.cable-endpoints` with `.cable-endpoint-marker/outer/inner`
  - `.cable-badge` (bundle count), `.cable-error-icon`
- **Preview:** `#cable-preview.cable-preview` during draw

### Cable CSS class taxonomy (`getCableClasses`)

**Kind:** `.cable-kind--pipe | context | trigger`  
**Semantic:** `.cable-semantic--delegation | context-flow | artifact-dependency | verification | receipt-handoff | blocker | manual-connection`  
**State:** `.cable-live`, `.cable-selected`, `.cable-blocker`, relay: `.cable-sending | sent | queued | error | failed`

### Semantic string palette (Kernel → CSS)

| Semantic type | CSS hook | Directional | Alert |
| --- | --- | --- | --- |
| delegation | `cable-semantic--delegation` | yes | no |
| context_flow | `cable-semantic--context-flow` | yes | no |
| artifact_dependency | `cable-semantic--artifact-dependency` | yes | no |
| verification | `cable-semantic--verification` | yes | no |
| receipt_handoff | `cable-semantic--receipt-handoff` | yes | no |
| blocker | `cable-semantic--blocker` + `.cable-blocker` | yes | yes (dashed coral) |
| manual_connection | `cable-semantic--manual-connection` | no | no |

### Cable visual states

| State | Trigger | Visual |
| --- | --- | --- |
| idle | no relay | `--cable-idle` stroke |
| live/active | relay running | `.cable-live`, flow animation `--t-cable-flow` |
| selected | click | `.cable-selected`, glow intensifies |
| hover | mouse over hit area | `--cable-hover` |
| sending/sent/queued | relay state machine | modifier classes on root |
| error/failed | relay failure | `.cable-error-icon`, `--cable-failed` |
| preview | drawing | `.cable-preview` dashed path |
| bundled | multiple connections same pair | badge count, `--cable-w-bundle` |

---

## F. Panel / Dock / Settings Map

### Left rail (dual mode)

| Mode | Webview | Toggle | Shortcut |
| --- | --- | --- | --- |
| Files | `nav/App.tsx` — WorkspaceTree | `#sidebar-mode-control` | Cmd+B panel |
| Tiles | `tile-list/App.tsx` — grouped registry | same | Cmd+Shift+B |

**Nav sub-surfaces:** `ImportWebArticleModal` in nav (context menu import)

### Legend / spawn dock (always visible)

| Section | Classes | Actions |
| --- | --- | --- |
| Header | `.lv1-dock__header`, Tidy, + Add | tidy grid, add agent |
| Mode toggle | `.lv1-mode-toggle__btn` spawn/connect | spawn vs route (connect disabled) |
| Recipe groups | `.lv1-group`, `.lv1-recipe` | click spawn |
| Readiness badges | `.lv1-recipe__badge--*` | ready/warn/missing |
| Templates | `.lv1-template` | workflow templates (e.g. RL Training) |
| Spawn ghost | `.lv1-spawn-ghost` | placement preview |

CSS: `legend-v1.css` + rail tokens in `shell.css` (`--rail-term`, `--rail-agent`, …)

### Right rail (agent panel)

| Pref-driven webview | Content |
| --- | --- |
| terminal-tile | Default PTY panel |
| agent-chat | ACP conversational UI |

Toggle: `#agent-toggle`, Opt+Cmd+B

### Bottom status strip

`#status-bar` groups: Workspace name, tile count, health LED (`#status-health-led` data-level), zoom mirror, version, Cmd+K hint

### Modals / overlays / command surfaces

| Surface | Trigger | File |
| --- | --- | --- |
| Settings | Cmd+, / `#settings-btn` | `#settings-overlay` + settings webview |
| Command palette | Cmd+K | `command-palette.js` |
| Shortcut panel | `?` | `shortcut-panel.js` |
| Workflow modal | Legend play / run | `workflow-modal.js` |
| Cable inspector | Cable select | `cable-inspector.js` |
| Canvas skill dialog | First run | `#canvas-skill-dialog` |
| Add agent form | Legend + / settings | `add-agent-form.js` |
| Watchtower | Shift+W | `#watchtower-panel` |
| Conductor panel | Kernel/shortcut | `conductor-panel.js` |
| Launch diagnostics | PTY failures | `launch-diagnostics-view.js` |

### Watchtower tabs (hidden operator UI)

`events | agents | messages | alerts` — filter bars, search, pause, copy snapshot, ack/retry actions

---

## G. Styling / Token Audit

### CSS file inventory (production)

| File | Scope |
| --- | --- |
| `shell/src/shell.css` | **Primary design system** (~4200 lines) |
| `shell/src/legend-v1.css` | Legend dock BEM |
| `packages/shared/src/styles/Theme.css` | Canonical tokens + z-index |
| `packages/theme/src/styles.css` | Theme package re-exports |
| `windows/settings/src/settings.css` | Settings shell |
| `windows/nav/src/styles/App.css` | Nav panel |
| `windows/viewer/src/styles/App.css`, `Theme.css` | Viewer tile |
| `windows/terminal-tile/src/styles/App.css` | Terminal tile chrome |
| `windows/terminal/src/styles/App.css` | Standalone terminal |
| `windows/terminal-list/src/App.css` | Orphaned terminal list |
| `windows/tile-list/src/App.css` | Tiles sidebar |
| `windows/graph-tile/src/styles/App.css` | Graph tile |
| `windows/agent-chat/src/styles.css` | Agent chat (Tailwind-heavy) |
| `packages/components/src/**/*.css` | TreeView, Terminal, Editor, Graph, Markdown, … |
| `quantflow-lottie/src/index.css` | Tailwind v4 (dev tool only) |

### Styling approaches

- **Primary:** Plain CSS + CSS custom properties (no CSS modules in shell)
- **Secondary:** Tailwind in settings + agent-chat (via `@tailwindcss/vite`)
- **Inline:** Tile geometry (`left/top/width/height/zIndex`), panel widths, viewport transform
- **Canvas draw:** `#grid-canvas` 2D context colors from CSS vars
- **SVG:** Cable + region layers styled via classes + CSS

### Theme modes

`dark | light | system | high-contrast` — `theme-controller.js` + settings Appearance pane  
Density: `comfortable | compact` — `density-controller.js`, `[data-density="compact"]`

### Fonts (shell HTML)

Geist (sans), IBM Plex Mono (terminal/mono), Space Grotesk (display) — Google Fonts

### Key token families (`Theme.css` + `shell.css` extensions)

**Colors:** `--bg`, `--canvas-bg`, `--tile-bg`, `--fg`, `--muted`, `--accent` (Live Green oklch), `--failed`, `--armed`, `--coral` (design rail)  
**Status:** `--running`, `--idle`, `--selected`, `--error`  
**Cables:** `--cable-pipe/context/trigger/default/hover/selected/failed/idle`, widths `--cable-w-*`  
**Rails (tile type accent):** `--rail-term`, `--rail-codex`, `--rail-agent`, `--rail-worker`, `--rail-tool`, `--rail-graph`, `--rail-memory`, `--rail-generic`  
**Typography:** `--fs-xxs` through `--fs-2xl`, `--lh-body`, `--lh-terminal`, `--ls-eyebrow`  
**Spacing:** `--space-1` … `--space-8`, `--tile-pad-*`, `--toolbar-height`, `--nav-inset`  
**Radii:** `--r-tile`, `--r-card`, `--r-button`, `--r-modal`, `--r-pill`, `--r-input`  
**Shadows:** `--sh-tile`, `--sh-tile-running`, `--sh-tile-error`, `--sh-floating`, `--sh-port-live`  
**Motion:** `--t-port-show`, `--t-cable-flow`, `--t-cursor-blink`  
**Item type colors:** `--item-type-note/doc/bookmark/pdf/concept/skill/default`  
**Brand (DESIGN.md):** Live Green `#B7FF00`, teal `#2fe6cf`, violet `#c79bff`, dark `#0a0d12`, ivory `#f2f0ec`

### Registries affecting visuals

| Registry | Location |
| --- | --- |
| Shortcuts | `windows/shared/shortcut-registry.ts` |
| Legend recipes | `legend-dock.js` + `main/legend-recipes.ts` |
| Semantic string styles | `semantic-string-view.ts` |
| Watchtower filters | `watchtower-view.js` constants |
| Shell view config | `main/index.ts` `shell:get-view-config` |
| Terminal themes | `packages/components/src/Terminal/theme.ts` |

---

## H. Unknowns / Suspicious Areas

| Issue | Path | Why manual review needed |
| --- | --- | --- |
| **Missing drag-drop overlay** | `renderer.js` refs `#drag-drop-overlay` | Element absent from `index.html`; no CSS — DnD feedback may be silently disabled |
| **terminal-list orphaned** | `windows/terminal-list/` | Full React app built but **not** in `shell:get-view-config` |
| **terminal webview usage** | `windows/terminal/` | Registered in view-config but primary term tiles use `terminal-tile` — confirm if still mounted |
| **Z-index drift** | `Theme.css` vs `shell.css` | Tokens say 0–400; production uses 9000–10001 — consolidation unclear |
| **renderer.js monolith** | `shell/src/renderer.js` | ~3800 lines mixing boot, watchtower UI, IPC, overlays — hard to trace all visual branches |
| **Watchtower split** | `renderer.js` + `watchtower-view.js` | Template inline in renderer; render fns in separate file |
| **PDF tile path** | `canvas-state.js` type + `viewer/App.tsx` | Confirm PDF rendering vs browser fallback |
| **quantflow-lottie relationship** | `quantflow-lottie/` | Separate Vite app; unclear if production branding derives from it |
| **Connect mode disabled** | `legend-dock.js` | Route mode toggle present but `disabled` — intentional or WIP? |
| **IPC message map** | webview ↔ shell | Full channel list not enumerated; hidden UI may trigger via undocumented messages |
| **PostHog overlay** | `windows/shared/PostHogProvider.tsx` | Error telemetry wrapper — no visible UI unless error boundary fires |

---

## I. Redesign Risk Notes

### Safest to redesign first (visual-only, bounded coupling)

| Target | Rationale |
| --- | --- |
| `canvas-watermark.js` + `#canvas-watermark` | Empty-state only; no interaction authority |
| `flow-cube-watermark.js`, brand components | Projector-only brand; swap SVG/CSS freely |
| `#status-bar` styling | Read-only display; avoid changing element IDs wired in renderer |
| `legend-v1.css` | Isolated BEM; dock HTML stable if class hooks preserved |
| Settings **Appearance** pane | Tailwind-isolated; prefs API stable |
| `@collab/components/brand/*` | Pure presentation |
| Toast/tooltip styling | Ephemeral; controller API separate from look |

### Highest risk (state + interaction + kernel coupled)

| File | Risk | Coupling |
| --- | --- | --- |
| `renderer.js` | **Critical** | Boot order, all overlays, watchtower inline, IPC, panel lifecycle |
| `tile-interactions.js` | **Critical** | Drag/resize/port/cable draw hit targets — pixel-perfect expectations |
| `tile-renderer.js` | **High** | DOM contract for webviews, ports, badges — class renames break spawn |
| `cable-renderer.js` | **High** | SVG structure + semantic classes tied to Kernel relay states |
| `canvas-state.js` | **High** | Truth arrays; visual changes often need coordinate/z-index logic |
| `tile-manager.js` | **High** | Webview lifecycle + Kernel sync |
| `canvas-viewport.js` | **High** | Pan/zoom transform — cables/regions depend on same space |
| `shell.css` | **High** | 4200 lines, z-index soup, tile+cable+overlay intertwined |
| `panel-manager.js` | **Medium** | Panel widths persist to prefs; resize handles |
| `webview-factory.js` | **Medium** | DevTools, preload, partition — not visual but tile content depends on it |

### Thermo-nuclear / maintainability findings (structural)

- **1k-line rule violations:** `renderer.js`, `shell.css`, `settings/App.tsx`, `tile-renderer.js`, `tile-interactions.js` — redesign should extract, not patch in place.
- **Dual styling systems:** Theme tokens + hardcoded z-index + per-window CSS + Tailwind islands — any redesign needs a token consolidation pass first.
- **Monolith orchestrator:** Most overlays are created from `renderer.js` init — hidden surfaces easy to miss (watchtower template is 400+ lines inside renderer).
- **Projector spine:** `src/renderer/` contracts are the intended stable boundary — prefer restyling via class hooks defined there (`semantic-string-view.ts`, `state-card-view.ts`).

### Ponytail-review lens (complexity to cut before/at redesign — not applied, inventory only)

| Location | Tag | Note |
| --- | --- | --- |
| `renderer.js` | yagni/shrink | Watchtower inline DOM + handlers could live entirely in `watchtower-view.js` |
| `Theme.css` vs `shell.css` z-index | delete/shrink | Two stacking systems — pick one |
| `terminal-list/` window | delete | Orphan webview — remove or wire |
| `#drag-drop-overlay` ref | delete | Dead reference or missing HTML — fix or remove |
| `legend-dock.js` connect mode | yagni | Disabled UI ships complexity |
| Dual terminal windows | yagni | `terminal` + `terminal-tile` + orphaned `terminal-list` |

`net:` Consolidating shell orchestration + z-index + orphan windows could shed significant surface area before visual redesign.

---

## Appendix: `@collab/components` full export map

| Package folder | Components |
| --- | --- |
| `brand/` | QFFlowCube, QFWordmark, QFLockup |
| `TreeView/` | TreeView, FolderRow, FileRow, WorkspaceTree, SearchSortControls + hooks |
| `Terminal/` | TerminalTab + darkTheme/lightTheme |
| `Editor/` | Editor (Blocknote), WikiLink, WikiLinkAutocomplete, ImageBlock, EditorConflictBanner |
| `CodeEditorView/` | CodeEditorView (Monaco) |
| `Markdown/` | Markdown |
| `ImageView/` | ImageView |
| `FolderTableView/` | FolderTableView |
| `ItemDetailView/` | ItemDetailView |
| `SourceList/` | SourceList |
| `ExcerptDisplay/` | ExcerptDisplay |
| `ConceptList/` | ConceptList |
| `WorkspaceGraph/` | WorkspaceGraph, ForceDirectedGraph, ReplayTimeline |

---

## Appendix: Shell JS module index (visual relevance)

All under `quantflow-electron/src/windows/shell/src/`:

`renderer.js` · `canvas-state.js` · `canvas-viewport.js` · `canvas-grid.js` · `canvas-rpc.js` · `canvas-watermark.js` · `flow-cube-watermark.js` · `tile-manager.js` · `tile-renderer.js` · `tile-interactions.js` · `tile-state-card.js` · `tile-route-handles.js` · `cable-renderer.js` · `cable-math.js` · `cable-draw-mode.js` · `cable-drop.js` · `cable-inspector.js` · `cable-overlay.js` · `workflow-region-overlay.js` · `workflow-modal.js` · `legend-dock.js` · `legend-spawn.js` · `legend-readiness.js` · `role-tile-spawn.js` · `role-herdr-spawn.js` · `role-startup.js` · `panel-manager.js` · `workspace-manager.js` · `webview-factory.js` · `command-palette.js` · `shortcut-panel.js` · `shortcut-registry.js` · `conductor-panel.js` · `watchtower-view.js` · `launch-diagnostics-view.js` · `add-agent-form.js` · `edge-indicators.js` · `toast-controller.js` · `tooltip.js` · `theme-controller.js` · `density-controller.js` · `dark-mode.js` · `operational-event-log.js`

---

## Summary (operator quick reference)

### Top 10 most important visual components

1. **Canvas viewport + layer stack** (`#panel-viewer`, grid → tiles → cables)
2. **`.canvas-tile` chrome + webview host** (`tile-renderer.js`, `tile-interactions.js`)
3. **Cable SVG layer** (`cable-renderer.js`, semantic string classes)
4. **Legend spawn dock** (`legend-dock.js`, `legend-v1.css`)
5. **Left nav / tile-list panels** (nav + tile-list webviews)
6. **Terminal tile surface** (`terminal-tile/App.tsx`, `TerminalTab`)
7. **Settings modal** (`settings/App.tsx` — 10 panes)
8. **Command palette** (`command-palette.js`)
9. **Status bar + health LED** (`#status-bar`)
10. **Flow Cube brand/watermark** (`QFFlowCube`, `flow-cube-watermark.js`)

### Top 5 highest-risk files to modify

1. `quantflow-electron/src/windows/shell/src/renderer.js`
2. `quantflow-electron/src/windows/shell/src/tile-interactions.js`
3. `quantflow-electron/src/windows/shell/src/shell.css`
4. `quantflow-electron/src/windows/shell/src/cable-renderer.js`
5. `quantflow-electron/src/windows/shell/src/tile-renderer.js`

### First 3 subsystems to prototype separately

1. **Tile chrome subsystem** — title bar, badges, ports, resize handles, rail colors (CSS + DOM contract in `tile-renderer.js` / `shell.css` §`.canvas-tile`)
2. **Cable / semantic string subsystem** — SVG paths, semantic palette, live relay animation (`cable-renderer.js` + `semantic-string-view.ts`)
3. **Legend dock + empty canvas watermark** — spawn rail, recipe cards, Flow Cube empty state (`legend-dock.js`, `legend-v1.css`, watermark modules) — visually isolated from tile interaction logic
