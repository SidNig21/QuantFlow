# QuantFlow Visual Manifest

**Status:** Planning contract — **no runtime implementation yet**  
**Authority chain:** `KERNEL_CONSTITUTION.md` → `BUILD_PLAN_V4.md` → `PRODUCT.md` → `DESIGN.md` → **this file** → implementation  
**Companion:** `VISUAL_COMPONENT_INVENTORY.md` (what exists today)  
**Audience:** Operator, Claude Design, Cursor, Codex — any agent or tool doing visual work

---

## Purpose

This document is the **single visual authority** for QuantFlow. It defines allowed tokens, component recipes, rollout phases, and safety rules **before** any CSS/JS redesign lands.

**Goal:** One cohesive operator console — not patches of creativity per screen.

```text
DESIGN.md / VISUAL_MANIFEST.md   ← you are here (contract)
        ↓
Theme.css token spine            ← Phase 1 (after approval)
        ↓
Tile chrome → Cables → Legend dock → Panels → Overlays
```

External tools (Figma, Efecto, Claude Design) produce **reference artboards** against this manifest. They do not override it.

---

## 1. Current Visual Problem

QuantFlow already has taste (`DESIGN.md`, `PRODUCT.md`) and a partial token file (`Theme.css`). The product still feels patchy because **visual authority is fragmented across six styling layers**:

| Layer | Location | Problem |
| --- | --- | --- |
| **Shell monolith** | `quantflow-electron/.../shell.css` (~4200 lines) | Redefines most `:root` tokens; hardcodes 40+ z-index values (40 → 999999); owns tile, cable, overlay, modal styling |
| **Shared tokens** | `packages/shared/src/styles/Theme.css` | Intended canonical spine; **partially imported**; z-index scale (0–400) mostly ignored by shell |
| **Per-webview CSS** | `nav`, `viewer`, `terminal-tile`, `graph-tile`, `tile-list`, `terminal`, `terminal-list` each have `App.css` | Same semantic roles (surface, border, text) re-declared with local values |
| **Tailwind islands** | `settings/App.tsx`, `agent-chat/` | Utility-class styling diverges from CSS-var surfaces |
| **Component library CSS** | `packages/components/src/**/*.css` | TreeView, Terminal, Editor, Graph each carry own spacing/color choices |
| **Legend subsystem** | `legend-v1.css` | BEM-isolated but reads mixed token sources |

### Symptom checklist (why it reads as “multiple apps”)

- Shell canvas uses `--flow` / hex Live Green; `Theme.css` uses `oklch` accent aliases — same intent, different definitions.
- `Theme.css` `--canvas-gradient` ≠ `shell.css` `--canvas-gradient` (different purple depth).
- Settings modal looks like a modern SaaS panel; canvas tiles look like a terminal orchestrator; agent chat adds a third dialect.
- Z-index: one rule uses `var(--z-modal)` (400); loading overlay uses 9700; tooltips/ports use 999999 — stacking is learned by trial, not contract.
- `@collab/components` file-tree icons and editor chrome don’t share tile title-bar rhythm.

**Diagnosis:** Architecture problem, not taste problem. Fix the spine first; then polish subsystems.

---

## 2. Desired QuantFlow Visual Identity

Preserve existing direction from `DESIGN.md` + `PRODUCT.md`. Do **not** invent a new brand.

### What QuantFlow should feel like

| Attribute | Expression |
| --- | --- |
| **Canvas-first** | Infinite dark field; meaning on the canvas, not in dashboards |
| **Operator console** | Premium hedge-fund / trading-desk seriousness — dense, calm, provable |
| **Terminal orchestration** | Tiles are live participants; strings are relationships; receipts matter |
| **Restrained neon** | Live Green `#B7FF00` earns attention; structure stays graphite |
| **Semantic color** | Cables and blockers carry hue; chrome stays neutral |
| **Technical sharpness** | Crisp 8px rhythm, mono for handles/telemetry, sans for labels |

### What QuantFlow must NOT become

- Generic SaaS (rounded purple gradients, oversized hero whitespace)
- Cyberpunk overload (scanlines, glitch, rainbow glow on everything)
- Playful AI toy (bouncy motion, pastel cards, mascot energy)
- Dashboard replacement (Kanban panels, BI widgets, modal-first workflows)
- Per-screen creative direction (each webview “its own app”)

### Brand anchors (fixed)

| Element | Rule |
| --- | --- |
| **Insignia** | Flow Cube — wireframe corner-on cube, Live Green node on live surfaces |
| **Wordmark** | `QUANTFLOW` — unchanged |
| **Identity color** | Live Green `#B7FF00` (`--flow`) |
| **Packet spectrum (motion only)** | Live Green, teal `#2fe6cf`, violet `#c79bff` |
| **Base contrast** | QuantFlow dark `#0a0d12`, ivory `#f2f0ec` — no pure #000 / #FFF |
| **Fonts** | `--font-sans` (Geist), `--font-mono` (IBM Plex Mono), `--font-display` (Space Grotesk, sparing) |

---

## 3. Canonical Token Categories

**Rule for all implementation phases:** New visual work references **only** tokens below. No raw hex in feature PRs except additions to this manifest.

### 3.1 Background colors

| Token | Role | Proposed value / alias |
| --- | --- | --- |
| `--bg` | App shell chrome | `#0a0d12` |
| `--bg-rgb` | Overlays / alpha mixes | `10, 13, 18` |
| `--canvas-bg` | Canvas field base | `#0c1117` |
| `--canvas-bg-hi` | Grid line / subtle lift | `#0f141b` |
| `--canvas-gradient` | Canvas vertical atmosphere | shell current (see §4 merge note) |
| `--canvas-origin-glow` | Bottom-center live glow | radial Live Green 18% → transparent |
| `--canvas-opacity` | User pref overlay | `0.85` – `1` (settings slider) |

### 3.2 Surface colors

| Token | Role | Proposed value |
| --- | --- | --- |
| `--tile-bg` | Tile / card face | `#0f141b` |
| `--tile-bg-hi` | Title bar / elevated strip | `#131923` |
| `--surface-raised` | Dock, palette, inspector | `#0d1218` (alias `--popover`) |
| `--surface-sunken` | Inputs, terminal well | `#111720` (alias `--input`) |
| `--secondary` | Segmented control track | `#111720` |

### 3.3 Border colors

| Token | Role | Proposed value |
| --- | --- | --- |
| `--border` | Default 1px structural | `#1c232d` |
| `--tile-border` | Tile outline | `#1c232d` |
| `--tile-border-hi` | Hover/focus outline | `#2a3340` |
| `--ring` | Focus ring | `color-mix(in srgb, var(--flow) 55%, transparent)` |

### 3.4 Text colors

| Token | Role | Proposed value |
| --- | --- | --- |
| `--fg` | Primary text | `#e7ecf2` |
| `--foreground` | Alias for webviews | `var(--fg)` |
| `--muted` | Secondary labels | `#6b7686` |
| `--muted-2` | Tertiary / disabled | `#4a5466` |
| `--muted-foreground` | Alias | `var(--muted)` |
| `--text-secondary` | Design-doc alias | `var(--muted)` |
| `--text-tertiary` | Design-doc alias | `var(--muted-2)` |

### 3.5 Accent colors

| Token | Role | Proposed value |
| --- | --- | --- |
| `--flow` | Live Green identity | `#b7ff00` |
| `--flow-bright` | Hover / selected accent | `#caff4d` |
| `--flow-dim` | Muted accent | `oklch(0.62 0.13 145)` |
| `--flow-glow` | Glow alpha | `oklch(0.78 0.16 145 / 0.18)` |
| `--accent` | Semantic alias | `var(--flow)` |
| `--accent-dim` | | `var(--flow-dim)` |
| `--accent-glow` | | `var(--flow-glow)` |
| `--selected` | Selection highlight | `var(--flow-bright)` |
| `--ivory` | Light contrast on dark accent | `#f2f0ec` |
| `--cyan` | Codex / tool rail | `oklch(0.72 0.13 210)` |
| `--blue` | Agent / graph rail | `oklch(0.70 0.14 240)` |
| `--amber` | Worker / armed | `oklch(0.80 0.14 80)` |
| `--violet` | Memory / receipt | `oklch(0.62 0.16 295)` |
| `--coral` | Alert / blocker | `oklch(0.68 0.19 25)` |

### 3.6 Semantic cable colors (Kernel `semantic_type`)

Map 1:1 to `src/renderer/components/StringOverlay/semantic-string-view.ts` and `DESIGN.md`.

| Semantic type | CSS class hook | Color token | Directional | Alert |
| --- | --- | --- | --- | --- |
| `delegation` | `.cable-semantic--delegation` | `--blue` | yes | no |
| `context_flow` | `.cable-semantic--context-flow` | `--cyan` (lighter blue family) | yes | no |
| `artifact_dependency` | `.cable-semantic--artifact-dependency` | `--amber` | yes | no |
| `verification` | `.cable-semantic--verification` | `--flow` (green family) | yes | no |
| `receipt_handoff` | `.cable-semantic--receipt-handoff` | `--violet` | yes | no |
| `blocker` | `.cable-semantic--blocker` + `.cable-blocker` | `--coral` dashed | yes | **yes** |
| `manual_connection` | `.cable-semantic--manual-connection` | `--cable-idle` | no | no |

**Cable kind (transport):** `--cable-pipe` (flow), `--cable-context` (blue), `--cable-trigger` (amber).

### 3.7 Status colors

| Token | Role | Use |
| --- | --- | --- |
| `--running` | Live work | `var(--flow)` — tile shadow, LED, cable flow |
| `--idle` | Resting | `var(--muted)` |
| `--armed` | Ready / trigger | `var(--amber)` |
| `--failed` / `--error` | Failure | `var(--coral)` |
| `--status-queued` | Queued tile/cable | muted + pulse (no new hue) |
| `--status-unknown` | Health LED default | `var(--muted-2)` |

**Tile rail accents (`data-tile-type`):** `--rail-term`, `--rail-codex`, `--rail-agent`, `--rail-worker`, `--rail-tool`, `--rail-memory`, `--rail-graph`, `--rail-generic` — map to accent palette above; never introduce new rail hues without manifest update.

### 3.8 Type scale

Max **3 sizes per surface** (DESIGN.md). Canonical scale:

| Token | Size | Weight | Use |
| --- | --- | --- | --- |
| `--fs-xxs` | 9.5px | 500 | Micro telemetry, LED labels |
| `--fs-xs` | 10.5px | 500 | Eyebrow, group labels, uppercase `--ls-eyebrow` |
| `--fs-sm` | 11.5px | 400–500 | Secondary body, descriptions |
| `--fs-md` | 12.5px | 400 | Default body |
| `--fs-lg` | 13px | 600 | Tile titles, panel headers |
| `--fs-xl` | 15px | 600 | Modal section titles ( sparing ) |
| `--fs-2xl` | 18px | 600 | Settings pane title only |

| Token | Value | Use |
| --- | --- | --- |
| `--lh-body` | 1.5 | Panels, settings |
| `--lh-terminal` | 1.65 | Terminal / mono blocks |
| `--ls-eyebrow` | 0.1em | Section labels |
| `--ls-pill` | 0.06em | Badge uppercase |

**Font stacks:** `--font-sans`, `--font-mono`, `--font-display` (display only for dock title / watermark).

### 3.9 Spacing scale

**Baseline rhythm:** 8px (`--space-3`). **Canvas grid:** 20px snap (spatial authority — see `SURFACE_LADDER.md` S0/S1).

| Token | px | Use |
| --- | --- | --- |
| `--space-1` | 4 | Tight inline gaps |
| `--space-2` | 6 | Compact density |
| `--space-3` | 8 | **Base unit** |
| `--space-4` | 10 | Inline groups |
| `--space-5` | 12 | Card padding compact |
| `--space-6` | 14 | Comfortable inline |
| `--space-7` | 18 | Section gaps |
| `--space-8` | 24 | Panel padding |

**Component spacing:** `--tile-pad-x/y`, `--tile-title-pad-x/y`, `--toolbar-height` (38px), `--nav-inset` (12px), `--status-bar-height`, `--panel-nav-min/max`, `--panel-agent-min/max`.

**Density:** `[data-density="compact"]` reduces tile/title padding per `Theme.css` — both densities must stay on-scale.

### 3.10 Radius scale

| Token | px | Use |
| --- | --- | --- |
| `--r-button` | 6 | Buttons, inputs, ports |
| `--r-card` | 7 | Inner cards, badges |
| `--r-tile` | 8 | Tile outer shell |
| `--r-input` | 6 | Fields |
| `--r-modal` | 12 | Modals, watchtower, conductor |
| `--r-pill` | 999px | Status chips, LEDs |

### 3.11 Shadow / elevation scale

| Token | Use |
| --- | --- |
| `--sh-tile` | Default tile at rest |
| `--sh-tile-running` | Live tile — accent ring + depth |
| `--sh-tile-error` | Error tile — coral ring hint |
| `--sh-floating` | Dock, palette, modals |
| `--sh-port-live` | Port glow when routing |

No arbitrary `box-shadow` in feature work — pick a tier above.

### 3.12 Glow scale

| Token | Use |
| --- | --- |
| `--flow-glow` / `--accent-glow` | Live tiles, cable flow, canvas origin |
| `--sh-port-live` | Port hover during cable draw |
| `--canvas-origin-glow` | Empty canvas atmosphere |

**Rule:** Glow = signal (live, routing, blocker). Never glow static chrome.

### 3.13 Opacity scale

| Token / pattern | Use |
| --- | --- |
| `--canvas-opacity` | User-controlled canvas wash |
| `color-mix(..., transparent)` | Soft fills (preferred over rgba literals) |
| Watermark / hints | 40–60% of `--muted` |
| Disabled controls | 0.45 opacity on `--muted-2` |
| Drag ghost | 0.85 opacity tile clone |

### 3.14 Motion / animation timing

| Token | Duration | Use |
| --- | --- | --- |
| `--t-port-show` | 0.12s | Port reveal on tile hover |
| `--t-cable-flow` / `--cable-flow-duration` | 1.6s | Live string dash animation |
| `--cable-queue-duration` | 0.85s | Queued relay pulse |
| `--cable-pulse-duration` | 0.65s | Send pulse |
| `--led-breathe-duration` | 2s | Status LED idle breathe |
| `--tile-entrance` | 240ms | Tile spawn |
| `--t-cursor-blink` | 1.1s | Terminal cursor |

**Rule:** Motion carries signal (relay, spawn, blocker). No decorative loops on panels.

### 3.15 Z-index stack (proposed unified)

Replace scattered 9000+ literals with **named layers**. Shell modals must use these names in Phase 1.

| Token | Value | Layer |
| --- | --- | --- |
| `--z-canvas-bg` | 0 | Grid canvas |
| `--z-watermark` | 1 | Empty-state lockup |
| `--z-region` | 2 | Workflow regions |
| `--z-tile` | 100 | Tile layer base |
| `--z-tile-focused` | 101 | Focused tile |
| `--z-marquee` | 110 | Selection marquee |
| `--z-cable-layer` | 102 | Cables (above tiles in DOM order; tune in impl) |
| `--z-port` | 103 | Tile ports |
| `--z-edge-indicator` | 104 | Off-screen dots |
| `--z-status-bar` | 105 | Bottom strip |
| `--z-zoom-badge` | 120 | Transient zoom |
| `--z-legend-dock` | 200 | Spawn rail |
| `--z-conductor` | 210 | Conductor panel |
| `--z-watchtower` | 220 | Watchtower |
| `--z-floating-controls` | 250 | New-tile btn, panel toggles |
| `--z-tooltip` | 300 | Tooltips |
| `--z-panel-resize-shield` | 350 | `#resize-overlay` |
| `--z-modal` | 400 | Base modal tier |
| `--z-modal-settings` | 410 | Settings overlay |
| `--z-command-palette` | 420 | Cmd+K |
| `--z-cable-inspector` | 430 | Cable detail |
| `--z-toast` | 500 | Toasts |
| `--z-loading` | 600 | Boot splash (top) |

**Unsafe today:** `.tile-port` and drag layers use `999999` — must map to `--z-port` + interaction pass without shrinking hit targets.

---

## 4. Current → Proposed Token Map

### 4.1 Keep canonical (merge into `Theme.css` spine)

These are already correct in intent — **shell.css should import, not redefine**:

- Structural: `--bg`, `--canvas-bg*`, `--tile-bg*`, `--border`, `--tile-border*`, `--fg`, `--muted*`
- Status: `--running`, `--idle`, `--failed`, `--armed`, `--error`
- Layout: `--space-*`, `--tile-pad-*`, `--toolbar-height`, `--panel-*-min/max`
- Shape: `--r-*`, `--sh-*`
- Theme modes: `.theme-light`, `.theme-high-contrast`, `[data-density="compact"]` in `Theme.css`
- Item types: `--item-type-*` (nav tree)
- Shadcn-compat aliases: `--background`, `--foreground`, `--primary`, `--card`, `--popover`, `--ring`

### 4.2 Merge duplicates (pick one winner)

| Concept | Theme.css today | shell.css today | **Proposed winner** |
| --- | --- | --- | --- |
| Accent / Live Green | `--accent: oklch(...)` | `--flow: #b7ff00` + aliases | **`--flow` hex + `--accent: var(--flow)`** (design-doc literal) |
| Canvas gradient | Purple-heavy 4-stop | Slightly different 4-stop | **shell.css gradient** (operator-approved look) — move to Theme.css |
| Canvas origin glow | (missing) | `--canvas-origin-glow` | **Add to Theme.css** from shell |
| Font stacks | system-ui fallback | Geist / Plex / Space Grotesk | **shell.css stacks** → Theme.css |
| Semantic palette | cable tokens only | `--cyan`, `--blue`, `--amber`, `--violet`, `--coral` | **Add semantic palette block to Theme.css** |
| Rail colors | (missing) | `--rail-*` | **Move to Theme.css** |
| Motion | partial | full cable/tile durations | **Merge into Theme.css** |
| Z-index | 0–400 names | 40–999999 literals | **§3.15 proposed stack** — migrate shell incrementally |

### 4.3 Hardcoded values → tokenize (Phase 1 candidates)

| Location | Hardcoded | Proposed token |
| --- | --- | --- |
| shell.css z-index literals | `9000`, `9700`, `10001`, `999999` | `--z-modal-*`, `--z-loading`, `--z-port` |
| shell.css / webviews | `#13191f`, `#1a2129` | `--new-tile-btn-bg`, `--new-tile-btn-bg-hover` (exist) |
| settings Tailwind | `text-muted-foreground`, arbitrary spacing | Map to `--muted`, `--space-*` via CSS vars |
| agent-chat Tailwind | ad hoc grays/greens | Import Theme.css; wrap in token aliases |
| `@collab/components` | local border colors | Reference `--border`, `--tile-border` |

### 4.4 Unsafe token replacement zones

Do **not** change these during a pure visual pass without interaction QA:

| Area | Why |
| --- | --- |
| `--cable-w-hit` (14px) | Cable click target |
| `--cable-w-default` / bundle width | Hit overlap with ports |
| Tile port size / `--z-port` stacking | Cable draw + drop detection |
| `.canvas-tile` inline `zIndex` from JS | Focus order / webview stacking |
| Marquee / drag ghost opacity | Selection UX |
| Terminal theme in `Terminal/theme.ts` | xterm color contract — sync, don’t fork |
| Webview `pointer-events` overlays | `.tile-content-overlay` blocks clicks when needed |

---

## 5. Component Recipes

Each recipe: **anatomy**, **allowed tokens**, **states**, **do/don’t**, **file hooks**.

---

### 5.1 Canvas background / grid

**Anatomy:** `#grid-canvas` (2D) + `#panel-viewer` gradient/glow + optional watermark.

| Allowed tokens | `--canvas-bg`, `--canvas-gradient`, `--canvas-origin-glow`, `--canvas-opacity`, grid line = `--canvas-bg-hi` at ~8% alpha |
| **States** | empty (watermark visible), populated (watermark hidden), panning, zoomed |
| **Do** | Keep grid subtle; 20px major / 4px minor feel; glow only at bottom origin |
| **Don’t** | High-contrast grid; animated background; new gradient hues |
| **Hooks** | `canvas-grid.js`, `#grid-canvas`, `#canvas-watermark`, `shell.css` |

---

### 5.2 Terminal / agent tile chrome (`.canvas-tile`)

**Anatomy:**

```text
.canvas-tile[data-tile-type][data-tile-state][data-running]
├── ::before / ::after          ← selection/focus rails
├── .tile-title-bar
├── .tile-content + webview
├── .tile-port (N/E/S/W)
└── .tile-resize-handle
```

| Allowed tokens | `--tile-bg`, `--tile-border`, `--rail-*`, `--sh-tile*`, `--r-tile`, `--fs-lg` title, `--font-mono` handles |
| **States** | idle, `.tile-focused`, `.tile-selected`, `[data-running="true"]`, `[data-tile-state="queued|error"]`, `.tile-flipped`, dragging, resizing, `.edge-indicator-highlight` |
| **Do** | Left rail color = role type; title bar `--tile-bg-hi`; running = `--sh-tile-running` only |
| **Don’t** | Full-tile neon fill; per-tile custom borders; drop rails for note/code tiles |
| **Hooks** | `tile-renderer.js`, `tile-interactions.js`, `shell.css` `.canvas-tile*` |

---

### 5.3 Tile title bar

**Anatomy:** `.tile-title-bar` → `.tile-type-glyph`, `.tile-title-text`, badges (`.tile-role-badge`, `.tile-status-badge`, `.tile-herdr-badge`), `.tile-btn-group` (flip, close, copy, view).

| Allowed tokens | `--tile-title-pad-*`, `--fs-lg` name, `--fs-xs` badges, `--rail-*` glyph accent, `--muted` secondary |
| **States** | default, browser (`.tile-nav-group`), role (`.tile-title-bar--role`), rename (`.tile-rename-input`) |
| **Do** | Name → status → actions left-to-right; mono for `@handle` (`.tile-route-handle`) |
| **Don’t** | Multi-line titles; icon-only title bar without tooltip |
| **Hooks** | `tile-renderer.js`, `tile-route-handles.js` |

---

### 5.4 Tile body

**Anatomy:** `.tile-content` → webview / browser / `.tile-back` (State Card).

| Allowed tokens | `--tile-bg`, `--tile-pad-*`, `--font-mono` for terminal content |
| **States** | front, flipped back, loading overlay (`.tile-content-overlay`) |
| **Do** | Edge-to-edge terminal; State Card uses `--r-card`, `--fs-sm` hierarchy |
| **Don’t** | Inner padding on terminal webview (let TerminalTab handle) |
| **Hooks** | `tile-state-card.js`, `state-card-view.ts`, viewer/terminal-tile webviews |

---

### 5.5 Tile ports

**Anatomy:** `.tile-port` on N/E/S/W edges.

| Allowed tokens | `--r-button`, `--border`, `--flow-glow` on active, `--t-port-show`, `--z-port` |
| **States** | hidden, hover, draw-source, draw-target, connected |
| **Do** | Show on tile hover or cable-draw mode; live glow only when routing |
| **Don’t** | Shrink below current hit area; change port DOM positions without `cable-math.js` QA |
| **Hooks** | `tile-renderer.js`, `tile-interactions.js`, `cable-draw-mode.js`, `cable-math.js` |

---

### 5.6 Resize handles

**Anatomy:** `.tile-resize-handle` corners/edges.

| Allowed tokens | `--muted-2` idle, `--flow` active, 8px min touch target |
| **States** | idle, hover, dragging |
| **Do** | Low contrast until hover |
| **Don’t** | Large visible grips at rest |
| **Hooks** | `tile-interactions.js`, `shell.css` |

---

### 5.7 Role / status badges

**Anatomy:** `.tile-role-badge`, `.tile-shell-badge`, `.tile-status-badge`, `.tile-herdr-badge`, `.tile-type-glyph`.

| Allowed tokens | `--fs-xxs` / `--fs-xs`, `--ls-pill`, `--r-pill`, status colors §3.7, `--rail-*` |
| **States** | idle, running, error, queued, readiness (legend: `.lv1-recipe__badge--*`) |
| **Do** | Uppercase micro-labels; color = meaning |
| **Don’t** | Badge per random metadata field |
| **Hooks** | `tile-renderer.js`, `legend-readiness.js` |

---

### 5.8 Status chips (global)

**Anatomy:** Small pill for task/status in conductor, watchtower, tile-list.

| Allowed tokens | `--r-pill`, `--fs-xs`, `--ls-pill`, `--secondary` fill, semantic status colors |
| **States** | idle, running, success, error, blocked |
| **Do** | Text + optional LED dot; max 1 accent color |
| **Don’t** | Full-width colored banners for non-blockers |
| **Hooks** | `conductor-panel.js`, `watchtower-view.js`, `tile-list/App.tsx` |

---

### 5.9 Cables / semantic strings

**Anatomy:** SVG `g[data-cable-id]` → `.cable-hit`, `.cable-glow`, `.cable-main`, `.cable-flow`, `.cable-endpoints`, `.cable-badge`, `.cable-error-icon`.

| Allowed tokens | §3.6 semantic colors, `--cable-w-*`, `--t-cable-flow`, `--coral` for blocker dash |
| **States** | idle, `.cable-live`, `.cable-selected`, `.cable-sending|sent|queued`, `.cable-error|failed`, preview `.cable-preview` |
| **Do** | Semantic hue from Kernel type; motion on live relay only; blocker = dashed coral |
| **Don’t** | Rainbow cables; animation on manual links; glow on idle strings |
| **Hooks** | `cable-renderer.js`, `semantic-string-view.ts`, `shell.css` `.cable-*` |

---

### 5.10 Legend dock / spawn rail

**Anatomy:** `.lv1-dock` → header, `.lv1-mode-toggle`, `.lv1-group`, `.lv1-recipe`, `.lv1-template`, spawn ghost.

| Allowed tokens | `--sh-floating`, `--surface-raised`, `--fs-xs` labels, `--flow` active recipe, `--rail-*` on discs |
| **States** | compact/comfortable density, recipe hover/active/disabled, readiness badge, spawn ghost |
| **Do** | Match tile rail semantics; compact default on canvas |
| **Don’t** | Compete with canvas for accent saturation; enable disabled Route mode visually before behavior exists |
| **Hooks** | `legend-dock.js`, `legend-v1.css`, `legend-spawn.js` |

---

### 5.11 Conductor panel

**Anatomy:** `#conductor-panel` — planner reads/plan/decisions.

| Allowed tokens | `--surface-raised`, `--r-modal`, `--fs-sm/md`, `--sh-floating`, `--flow` for active plan step |
| **States** | collapsed, expanded, planning, awaiting approval |
| **Do** | Soft panel — not a second dashboard; receipt links visible |
| **Don’t** | Full-screen takeover; new typography scale |
| **Hooks** | `conductor-panel.js`, `conductor-view.ts`, `shell.css` |

---

### 5.12 Settings modal shell

**Anatomy:** `#settings-overlay` → `#settings-modal` webview; left nav + pane (`settings/App.tsx`).

| Allowed tokens | Theme.css shadcn aliases; **migrate Tailwind to var() references** in Phase 5 |
| **States** | pane switch (10 panes), focus, esc close |
| **Do** | Same dark surfaces as tiles; mono for shortcuts display |
| **Don’t** | Bright SaaS white cards in dark mode; one-off button styles |
| **Hooks** | `settings/App.tsx`, `settings.css`, `#settings-overlay` |

---

### 5.13 Command palette

**Anatomy:** `createCommandPalette()` — filter input + action list.

| Allowed tokens | `--z-command-palette`, `--surface-raised`, `--sh-floating`, `--fs-md`, `--flow` selection |
| **States** | open, filter active, empty results |
| **Do** | Match keyboard-first density |
| **Don’t** | Center-screen hero modal styling |
| **Hooks** | `command-palette.js`, `shell.css` |

---

### 5.14 Toast / tooltip

**Toast:** `.toast-host` — `--z-toast`, `--surface-raised`, `--fs-sm`, semantic border for error/success.

**Tooltip:** `data-tooltip` — `--z-tooltip`, `--fs-xs`, `--popover` bg, delay 400ms.

| **Do** | Brief copy; no icons unless error |
| **Don’t** | Stacked toast spam styling; tooltip on every icon |
| **Hooks** | `toast-controller.js`, `tooltip.js` |

---

### 5.15 Bottom status strip

**Anatomy:** `#status-bar` — workspace, tile count, `#status-health-led`, zoom, version, palette hint.

| Allowed tokens | `--fs-xs`, `--muted` labels, `--fg` values, `--flow` LED running, `--coral` unhealthy |
| **States** | health `data-level`: unknown | ok | warn | error |
| **Do** | Calm telemetry strip; mono for version |
| **Don’t** | Animated marquee; large logos |
| **Hooks** | `index.html`, `renderer.js`, `shell.css` `#status-bar` |

---

## 6. Implementation Phases

| Phase | Scope | Code changes? | Exit criteria |
| --- | --- | --- | --- |
| **0 — Manifest** | This document + operator approval | **No** | Signed token tables + recipes |
| **1 — Token spine** | Merge `Theme.css` ← shell `:root`; shell imports Theme; webviews import Theme; unified z-index names | Yes, CSS only | Zero duplicate `:root` in shell; all z-index use `--z-*` |
| **2 — Tile chrome** | `.canvas-tile`, title bar, badges, ports, handles | CSS + class tweaks | All tile states match manifest screenshots |
| **3 — Cables** | SVG classes, semantic colors, motion | CSS + minimal class renames | 7 semantic types + live relay QA |
| **4 — Legend + watermark** | `legend-v1.css`, empty canvas lockup | CSS | Dock matches tile rail language |
| **5 — Webview shells** | nav, tile-list, settings chrome, agent-chat token pass | CSS + Tailwind→var | Side panels indistinguishable from canvas family |
| **6 — Overlays / polish** | palette, conductor, watchtower, toasts, inspector | CSS | Full-app screenshot cohesion |

**Between phases:** Product proof on canvas — don’t start Phase 5 until Phases 2–4 pass operator review.

---

## 7. Safety Rules (strict)

1. **Do not** big-bang rewrite `renderer.js`.
2. **Do not** rewrite `shell.css` in one PR — subsystem slices only.
3. **Do not** rename DOM classes used by `tile-interactions.js`, `cable-renderer.js`, or `tile-manager.js` without full usage trace.
4. **Do not** change drag, resize, port, or `--cable-w-hit` geometry during visual-only work.
5. **Do not** introduce a new component library (shadcn wholesale, MUI, etc.).
6. **Do not** add new hex colors in feature PRs — extend this manifest first.
7. **Do not** let each webview define a separate design language.
8. **Do not** replace Kernel-driven semantic types with decorative cable colors.
9. **Do not** use external tool exports (Figma/Efecto/Claude Design) as runtime source — reference only.
10. **Do not** skip theme modes — light/high-contrast must remain coherent.

---

## 8. Practical Checklist

### First 10 tokens to standardize (Phase 1)

1. `--flow` / `--accent` (single Live Green authority)
2. `--bg`, `--canvas-bg`, `--canvas-gradient`, `--canvas-origin-glow`
3. `--tile-bg`, `--tile-border`, `--tile-bg-hi`
4. `--fg`, `--muted`, `--muted-2`
5. `--border`, `--ring`
6. `--rail-*` block (8 rails)
7. `--cable-*` + semantic palette (`--blue`, `--cyan`, `--amber`, `--violet`, `--coral`)
8. `--space-3` (8px) + `--space-*` full scale
9. `--z-modal` through `--z-loading` (§3.15 stack)
10. `--font-sans`, `--font-mono`, `--font-display`

### First 5 components to update (Phase 2–4)

1. `.canvas-tile` shell + title bar
2. `.tile-port` + resize handles
3. `.cable-root` + semantic classes
4. `.lv1-dock` / `.lv1-recipe`
5. `#canvas-watermark` + Flow Cube lockup

### Highest-risk files

1. `quantflow-electron/src/windows/shell/src/renderer.js`
2. `quantflow-electron/src/windows/shell/src/tile-interactions.js`
3. `quantflow-electron/src/windows/shell/src/shell.css`
4. `quantflow-electron/src/windows/shell/src/cable-renderer.js`
5. `quantflow-electron/src/windows/shell/src/tile-renderer.js`

### Safest files to modify first

1. `packages/shared/src/styles/Theme.css` (spine consolidation)
2. `legend-v1.css`
3. `canvas-watermark.js` / `flow-cube-watermark.js` (presentation)
4. `packages/components/src/brand/*`
5. `#status-bar` rules in `shell.css` (read-only display)

### Recommended Claude Design boards (after manifest approval)

Generate **subsystem boards only** — not full-app redesigns:

| Board | Must show states |
| --- | --- |
| **Tile chrome** | idle, focused, selected, running, error, queued, browser chrome, flipped State Card back |
| **Cables** | 7 semantic types + manual; live relay; selected; blocker dashed; bundle badge |
| **Legend dock** | compact + comfortable; recipe hover/active/disabled; readiness badges; spawn ghost on canvas |

Optional fourth board: **Settings shell chrome** (nav rail + appearance pane) — after tile/cable/dock approved.

---

## 9. Prompt template for downstream tools

Use this when briefing Claude Design, Efecto, or Cursor implementation:

```text
Implement only [SUBSYSTEM] for QuantFlow.
Authority: VISUAL_MANIFEST.md + DESIGN.md.
Use listed tokens only — no new hex colors.
Preserve DOM hooks in VISUAL_COMPONENT_INVENTORY.md.
Show all states listed in manifest §5.[N].
Do not redesign other subsystems.
```

---

## 10. Document maintenance

Update this manifest when:

- Adding a new semantic cable type (Kernel schema change)
- Adding a new tile rail / role color
- Adding a new global overlay layer (z-index table)
- Changing brand anchors (operator decision only)

Do **not** update for one-off screen experiments — those belong in external reference boards until promoted here.

---

*Phase 0 complete. Awaiting operator approval before Phase 1 (Theme.css consolidation).*
