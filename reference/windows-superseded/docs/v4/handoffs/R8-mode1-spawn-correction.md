# v4 Rung Handoff — R8 (correction) — Eve legend click = Mode-1 terminal summon

**For:** Cursor (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R8 engine (`98c32bf`, verified) · R1 `eve-harness` (`6026971`, keep).

## 0. Authoritative scope
This is an **R8 scope clarification, not a rewrite.** Binding refs in
`BUILD_PLAN_V4.md`: § "Operator spawn model — Mode 1 vs Mode 2", the **R8 ledger
row**, and the **R8 "Product proof (manual) — Mode 1"** acceptance. If brief and
plan disagree, the plan wins — flag it.

**The mistake being fixed:** R8 wired an **Eve legend click → Mode 2**
(`harnessKind: eve-harness` → an idle, headless tile). A legend click must be
**Mode 1 — a terminal tile the operator drives** — for **all** agents, Eve
included (Eve = its `eve dev` TUI running in its package folder, exactly like a
CLI recipe). `eve-harness` is **Mode 2** (Conductor automation) and must be
**kept**, just never triggered by a dock click.

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → child `AGENTS.md` for folders you touch.
- `BUILD_PLAN_V4.md` § "Operator spawn model — Mode 1 vs Mode 2" + R8 ledger + R8 acceptance.
- `docs/v4/EVE_SETUP.md` (how the Eve TUI is launched: `npm run dev` / `eve dev`, port/workspace).
- Seam files:
  - `quantflow-electron/src/windows/shell/src/role-tile-spawn.js` — has the
    `isEveHarness` branch (added in R8) that early-returns an idle tile. **This is
    the Mode-2 leak in the UI spawn path.**
  - `quantflow-electron/src/windows/shell/src/legend-spawn.js` — `spawnLegendRecipeViaRolePath`, recipe→role synthesis.
  - `quantflow-electron/src/main/legend-recipes.ts` — registry assembly:
    `readCustomLegendRoles` (`roles/*.json`) **and** `readEveManifestRecipes`
    (`eve-packages/*/manifest.json`) + `manifestToLegendRecipe`. **The manifest path
    is being collapsed away (see §2.1).**
  - `quantflow-electron/src/main/conductor/conductor-actions.ts` + `harness-service.ts` — the **Mode-2** path (leave intact).
  - `src/harness/eve/index.ts` (repo-root `src/`, **not** under `quantflow-electron/`) — the Mode-2 harness; reads `QF_EVE_BASE_URL` env. Leave intact.

## 2. Build (the correction — keep it minimal)

> **Key insight (operator, 2026-06-20):** for Mode-1 a single Eve persona is **just a
> `role.json` that runs `npm run dev` in a folder** — there is nothing special about
> it vs a CLI row. So collapse the registry to **one shape (`roles/*.json`)** and
> drop the `eve-packages/manifest.json` split from the legend. Multiple
> provider/model combos = **multiple Eve folders = multiple `role.json` rows**, each
> with its own `.env.local`. QuantFlow does **not** route models — each row points at
> a process; the process brings its keys.

1. **Collapse the legend registry to `roles/*.json` only.** Remove the
   `eve-packages/*/manifest.json` discovery from `legend-recipes.ts`
   (`readEveManifestRecipes` / `manifestToLegendRecipe` / `EvePackageManifest`) so
   `roles/*.json` is the **single** source for dock recipes. An **Eve persona** is a
   normal role row:
   ```json
   {
     "id": "research-opencode",
     "name": "Research",
     "description": "Eve · OpenCode deepseek-v4-pro",
     "commandTemplate": "npm run dev",
     "cwd": "C:\\Users\\rybow\\agents\\research-opencode",
     "runtimeTarget": "windows-pty",
     "icon": "hermes", "color": "#6366f1",
     "showInLegend": true, "legendType": "agent",
     "modelHint": "deepseek-v4-pro"
   }
   ```
   `modelHint` is a **dock label only** (real model/provider lives in that folder's
   `agent.ts` + `.env.local`). `endpoint`/`harnessKind`/manifest are **not** part of
   the legend recipe anymore. (Mode-2 per-recipe endpoint routing for multiple Eve
   agents is deferred to **R4**; today Mode-2 uses the single `QF_EVE_BASE_URL`.)
2. **Remove the Mode-2 fork from the dock spawn.** In `role-tile-spawn.js`, drop the
   `isEveHarness` early-return (idle tile + `status_update`) entirely. Every recipe —
   built-in, CLI, or Eve — flows through the **same terminal path**; `runtimeTarget`
   alone decides PTY (`windows-pty` → local-shell) vs herdr (`herdr-wsl`). No
   `harnessKind` fork in the UI spawn.
3. **Make the recipe's `cwd` reach the spawn.** The PTY path already honors
   `options.cwd ?? getTerminalCwd()` — ensure `spawnLegendRecipeViaRolePath` /
   `legend-spawn` passes the recipe's `cwd` into `options.cwd` so `npm run dev` runs
   in the Eve folder.
4. **Multiple Eve tiles = multiple ports.** Each `eve dev` binds one port. Support
   recipes whose `commandTemplate` runs a port-specific script (e.g.
   `npm run dev:research` → `eve dev --port 3001`). No special handling needed beyond
   honoring `commandTemplate` verbatim — just don't hardcode a single port.
5. **Keep `eve-harness` (Mode 2) untouched.** Do **not** delete/alter
   `src/harness/eve/*` or the Conductor `assign_task`/`harness.send` path. Mode 2 is
   invoked only by the Conductor, never by a legend click. (It reads `QF_EVE_BASE_URL`
   from env, so removing the manifest discovery does not affect it.)
6. **Update R8 tests** to the corrected behavior: an Eve `role.json` spawns a
   **terminal tile** (assert `commandTemplate`/`cwd`/`runtimeTarget` reach the spawn),
   **not** a headless early-return. Remove/replace the `eve-packages` manifest
   discovery tests in `legend-recipes.test.ts`; fix any `legend-spawn`/role-tile-spawn
   test asserting the old idle behavior.

## 3. Hard guardrails — do NOT
- Make a **legend click** open a headless / idle tile for any agent. Legend = Mode 1.
- Trigger `eve-harness` from the dock spawn path, or pass `harnessKind: eve-harness`
  into `role-tile-spawn` for a click.
- Delete or weaken `eve-harness` / the Conductor Mode-2 path (R1 depends on it).
- Add a third "lane" / new vocabulary. Mode 1 / Mode 2 only.
- Keep the `eve-packages/manifest.json` discovery in the legend — collapse to one
  registry shape (`roles/*.json`). (The `EvePackageManifest` type may be removed or
  left dormant; it must no longer feed the dock.)
- Make QuantFlow "route models" — each row points at a process that brings its own
  keys (`.env.local` + `agent.ts`). `modelHint` is a label only.
- Touch Kernel or schema. No registry → Kernel truth (roles stay config).
- Build the Settings inventory or Eve-first *authoring* scaffolding — that's R8.5
  (`docs/v4/INCOMING_GOALS.md`), a separate pass.
- One correction only. Commit locally. **Do NOT push. Do NOT self-approve.**

## 4. Definition of done (acceptance)
**Machine proof (CI):**
- R8 tests updated + green: an Eve `role.json` resolves to a **terminal spawn** with
  the right `commandTemplate`/`cwd`/`runtimeTarget` (assert via fake spawn); no
  headless early-return remains. Built-ins + CLI recipes spawn unchanged.
- The registry reads **`roles/*.json` only** (the `eve-packages` manifest discovery
  is gone); `legend-recipes.test.ts` reflects the single shape.
- The shared spawn path still has **no harnessKind fork in the UI** (one path), and
  the recipe `cwd` reaches the spawn.

**Product proof (operator, manual — Mode 1):**
- Legend click **Eve recipe** → a **terminal tile** opens running the `eve dev` TUI
  in the Eve folder; the operator can chat in it. (Not an idle/empty tile.)
- Legend click a **CLI recipe** (e.g. Odds Scraper) → terminal tile, unchanged.
- Readiness badge still shows green/amber/red.
- Capture: a shot of the live Eve TUI tile spawned from the legend.

**Regression guard (must stay green — cumulative, Appendix A):**
```text
cd quantflow-electron
bun run smoke:kernel-task && bun run smoke:state-card && bun run smoke:conductor && \
bun run smoke:conductor-actions && bun run smoke:conductor-loop && bun run smoke:worker-harness && \
bun run smoke:harness-interface && bun run smoke:workflow-region && bun run smoke:vault-export && \
bun run smoke:eval && bun run smoke:capability-preflight && bun run smoke:task-atom && \
bun test src/windows/shell/src/legend-dock.test.ts && bun test src/windows/shell/src/legend-spawn.test.ts && \
bun test src/main/legend-recipes.test.ts && bun test src/main/harness-ops.test.ts && \
bun test src/main/diagnostics/health-runner.test.ts && bun run build
cd ../tools/quantflow-mcp && node --test
```
- **`smoke:task-atom` must stay green** — it proves the Mode-2 `eve-harness` path is
  untouched. If it regresses, you broke Mode 2.

## 5. Verification handoff — paste THIS back
1. **Diff** — `git diff 6defed0..HEAD` (or changed-files list + full contents).
2. **Command outputs** — full real output of every §4 command, pass/fail, no trimming.
3. **Self-assessment** — table: each §4 criterion → met/not-met → evidence.
4. **Notes** — where the Eve recipe's Mode-1 launch spec comes from (manifest field
   vs derived); confirmation `smoke:task-atom`/eve-harness untouched; any test that
   asserted the old headless behavior and how you changed it. **Scrub any API key.**

> Verifier rule: approved only when a legend click yields a Mode-1 terminal tile for
> Eve (no headless fork in the UI), `eve-harness`/Mode-2 is provably untouched
> (`smoke:task-atom` green), and no third lane/vocabulary crept in.
