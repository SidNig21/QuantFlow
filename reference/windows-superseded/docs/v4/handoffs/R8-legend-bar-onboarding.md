# v4 Rung Handoff — R8 — One-Click Agent/Tool Onboarding (the legend bar)

**For:** Cursor (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R0 (readiness badge) ✅, R1 (a freshly-added agent can run the atom;
`eve-harness` kind already shipped) ✅.

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R8 — One-Click Agent/Tool Onboarding"
— read it as binding. This brief front-loads essentials + the verification
contract. If brief and plan disagree, **the plan wins — flag the discrepancy,
don't silently pick.**

R8 makes adding an agent/tool to the **legend bar (QF Dock spawn rail)** a
**one-click UI action** (no source edit + rebuild), with a **live R0 readiness
badge** on every entry. It is an **extensibility seam, not new runtime authority** —
no Kernel/schema changes, no orchestration changes.

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → child `AGENTS.md` for every folder you
  touch.
- `BUILD_PLAN_V4.md` § "Goal R8" **and** § "Eve Integration" R8 delta (per-recipe
  model routing + eve-harness as a runtime target).
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` (for the
  `role ≠ harness ≠ model` rule and "roles are config, not Kernel truth").
- Seam files (all currently exist):
  - `quantflow-electron/src/windows/shell/src/legend-dock.js` — exports
    `LEGEND_RECIPES` (7 built-ins, line 6), `ICONS` map (line 94), `createLegendDock`.
  - `quantflow-electron/src/windows/shell/src/legend-spawn.js` — the spawn path
    (`recipe → roleId → kernel.worker.spawn`).
  - `quantflow-electron/src/windows/shell/src/renderer.js` — wires
    `createLegendDock({...})` (~line 335) and imports `legend-v1.css`.
  - `quantflow-electron/src/main/role-service.ts` — `listRoles()` already merges
    built-ins + `roles/*.json` with `commandAvailable` diagnostics; **no
    create/update/remove yet** — you add them.
  - The R0 capability report (`capability:snapshot` IPC + the diagnostics
    `capability` group from R0) — the **source of the readiness badge**.

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)

**1. Data-drive the dock (built-ins become seed, not source of truth).**
- `legend-dock.js` renders recipes from a **registry list** (`listRoles()` +
  user-added), not the hardcoded `LEGEND_RECIPES` array. The 7 built-ins stay as
  **seed data** and must still render + spawn unchanged.
- `legend-dock.test.ts`: render from an **injected registry list** (not the
  module-level array) + the readiness-badge mapping.

**2. The "+ Add" affordance (no rebuild).**
- `add-agent-form.*` (NEW): a small form in the dock header — `id`, `name`,
  `commandTemplate`, `runtimeTarget` (`herdr-wsl` / `windows-pty`), `icon` (pick
  from the existing `ICONS` set — **no hand-SVG**), `color`, `startupPrompt`,
  `type`. Saving writes a role and refreshes the bar **without a rebuild**.
- `role-service.ts`: add **create / update / remove** for custom roles — they write
  `roles/*.json` (the dir `listRoles()` already reads). Keep `listRoles()`'s merge
  behavior intact.
- IPC (`ipc-*.ts`): **read** = list recipes incl. custom + readiness; **write** =
  create/update/remove a custom agent/tool. (Write IPC is config, not Kernel.)

**3. Per-recipe R0 readiness badge (real, not cosmetic).**
- Each row shows green/amber/red derived from the **R0 capability result**
  (`healthy|degraded|down → green|amber|red`). CLI row checks `role:<id>`
  present/authed; an Eve row checks `/eve/v1/info` + key (reuse R0's Eve lane).
- A not-ready agent is **spawnable-but-flagged** (or gated — operator's choice),
  so a dead agent is never silently dropped into a pod.

**4. One spawn path — no special-casing.**
- A custom recipe resolves to its `roleId` and spawns through the **same**
  `legend-spawn.js → roleId → kernel.worker.spawn` path as built-ins. Eve rows
  target the **`eve-harness`** kind (already shipped in R1 — you do **not** rebuild
  the harness; you make it *selectable* from the dock).

**5. Agent inventory = CLI roles + Eve packages (the extensibility contract).**
Two recipe shapes feed the same row UI + the same badge:
- **CLI role** — a thin `role.json` (`commandTemplate`, `runtimeTarget`), spawned
  via PTY/herdr. Exists today.
- **Eve package** — a **directory** (`agent/agent.ts`, instructions, channels) +
  a **`manifest.json`** supplying dock-row metadata, spawned via `eve-harness`.
  **One folder = one manifest = one dock entry = one harness target.**

`manifest.json` contract (config the dock consumes — **not Kernel truth**):
```jsonc
{
  "id": "qf-research-eve",
  "name": "QF Research (Eve)",
  "roleId": "eve-researcher",
  "harnessKind": "eve-harness",
  "icon": "...", "color": "#...",
  "endpoint": "http://127.0.0.1:3000",   // eve-local now; deployed base URL later (R4)
  "modelHint": "deepseek-v4-pro",         // bare OpenCode Go model id
  "type": "agent"
}
```
"+ Add" writes **either** a `role.json` (CLI) **or** an Eve `manifest.json`; the
dock discovers, renders, and badges it — no rebuild. The proven `quantflow-eve`
package (`docs/v4/EVE_SETUP.md`) is the first real Eve recipe. The Eve row's
endpoint/workspace honor the R1 env vars (`QF_EVE_BASE_URL` / `QF_EVE_WORKSPACE`).

**Files (plan § Direct Repo Scope is exhaustive):** `legend-dock.js`,
`legend-dock.test.ts`, `add-agent-form.*` (NEW), `role-service.ts` (create/update/
remove), `ipc-*.ts` (read + write), `legend-spawn.js` (custom → shared path),
`renderer.js` + `legend-v1.css` (wire the data-driven dock + badge/form styling).

## 3. Hard guardrails — do NOT
- Leave recipes hardcoded — the "+ Add" button must **not** write source or need a
  rebuild. Built-ins are seed, not the source of truth.
- Spawn a custom agent through a **special path** — it must go through the shared
  `legend-spawn → roleId → kernel.worker.spawn` (CLI) or `eve-harness` (Eve).
- Make the readiness badge **cosmetic** — it must be wired to the real R0 capability
  status.
- Let role/agent definitions become **Kernel run-state truth** — they are a config
  **registry** (`roles/*.json` / `manifest.json`). **No Kernel schema change.**
- Let a not-ready agent be spawned into a pod with **no** readiness signal.
- Rebuild the `eve-harness` — R1 already shipped it; R8 only makes it dock-selectable
  and discovers Eve packages via `manifest.json`.
- Scope creep: **no** orchestration/DAG changes (R3), **no** domain-specific
  connectors / data tools (separate pack), **no** MCP-server onboarding (sibling
  seam — note as follow-up only), **no** run-template authoring UI (R6). R8 adds
  **agents**, not templates — keep the dock's Spawn (top) / Templates (bottom) split.
- One rung only. Commit locally. **Do NOT push. Do NOT self-approve.**

## 4. Definition of done (acceptance)

**Machine proof (CI):**
- `legend-dock` renders recipes from an **injected registry list** (not the
  hardcoded array); the 7 built-ins still render + spawn.
- Adding a recipe via the add path makes it appear **without a rebuild**; removing
  it removes it — round-trips through `role-service` create/remove.
- The readiness badge maps `healthy|degraded|down → green|amber|red`
  **deterministically** from an **injected** R0 capability result.
- A custom recipe resolves to its `roleId` and spawns through the **shared**
  role-spawn path (asserted with a **fake spawn**) — no special path.
- Deterministic (no timestamps/uuids in compared bodies).

**Product proof (manual — capture evidence):**
Click **"+ Add"**, define a new agent/tool (e.g. a `python` "odds-scraper" script
tile, or a second `researcher`); it appears in the bar with a readiness badge and
spawns a working tile — **no source edit, no rebuild**. Capture: the new
`roles/*.json` (or `manifest.json`), a screenshot/description of the badged row,
and the spawned tile. Bonus: add the `quantflow-eve` package as an Eve row and show
its badge reflects `/eve/v1/info` reachability.

**Regression guard (must stay green — cumulative, Appendix A):**
```text
cd quantflow-electron
bun run smoke:kernel-task && bun run smoke:state-card && bun run smoke:conductor && \
bun run smoke:conductor-actions && bun run smoke:conductor-loop && bun run smoke:worker-harness && \
bun run smoke:harness-interface && bun run smoke:workflow-region && bun run smoke:vault-export && \
bun run smoke:eval && bun run smoke:capability-preflight && bun run smoke:task-atom && \
bun test src/windows/shell/src/legend-dock.test.ts && bun test src/windows/shell/src/legend-spawn.test.ts && \
bun test src/main/harness-ops.test.ts && bun test src/main/diagnostics/health-runner.test.ts && \
bun run build
cd ../tools/quantflow-mcp && node --test
```
- The 7 built-in recipes render + spawn unchanged; existing `legend-dock` /
  `legend-spawn` tests pass.
- No Kernel schema change; no new Kernel command for role config.

## 5. Verification handoff — paste THIS back (verifier needs no repo access)
1. **Diff** — `git diff <base-ref>..HEAD` (base SHA supplied with this handoff) or
   a changed-files list + full contents of every new/changed file.
2. **Command outputs** — the **full, real** output of every §4 command (each test,
   the regression stack, the build), showing pass/fail. Do **not** summarize or
   trim failures.
3. **Self-assessment** — a table: each §4 acceptance criterion → met / not-met →
   the evidence line.
4. **Notes** — the registry list shape the dock now consumes; how `role-service`
   create/update/remove writes `roles/*.json`; how the badge derives from the R0
   capability result; whether you implemented the `manifest.json` Eve-package
   discovery (and how) or deferred it (say so explicitly); any not-ready-agent
   gating choice (flagged vs gated); any file the plan didn't anticipate. **Scrub
   any API key.**

> Verifier rule: approved only when the diff matches scope, the §4 commands are
> green in the pasted output, no guardrail is tripped (recipes are data-driven,
> shared spawn path, badge is real, roles stay config), and the built-ins still
> render+spawn. Builders never self-approve.
