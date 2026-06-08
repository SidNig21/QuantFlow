# Layer 5 - Legend Palette + Templates

Status: evolve from v1.

Owner: QuantFlow native.

Layer rule: Legend owns operator-facing tile definitions, template composition, custom registration, and Commence flow. It delegates WSL runtime creation to Layer 2 and communication to Layer 3.

Known current anchors:
- `src/windows/shell/src/legend-dock.js`
- `src/windows/shell/src/legend-spawn.js`
- `src/windows/shell/src/legend-v1.css`
- `src/main/role-service.ts`
- `src/main/profiles/*`

## 5A - Config Format Lock

```text
Goal: QuantFlow V2 Layer 5A - Config format lock
Layer: 5 - Legend Palette + Templates
Depends on: 2E Windows fallback isolation passed; 2F identity model preferred.
Scope: Define and lock a single JSON schema for all tile definitions. Built-in and custom tiles must use the same format so future Legend changes do not require reformatting. This goal lands schema, validation, migration/default loading, and tests before adding or changing built-in tiles.
Acceptance criteria:
- Create a versioned tile definition schema covering id, name, group, icon, color, runtimeTarget, command/profile, capabilities, agentCard defaults, env, cwd policy, status parser, and UI metadata.
- Built-in definitions and custom definitions load through the same parser/validator.
- Invalid definitions produce actionable errors visible in diagnostics.
- Existing Legend recipes can be expressed in the new format without losing current behavior.
- Schema docs include examples for agent tile, dumb tile, Python tile, and native shell tile.
- Tests: schema validation, built-in load, custom load, invalid definitions, migration/default compatibility.
Out of scope:
- Adding all final built-in tiles.
- Custom registration form.
- Commence flow.
- Herdr spawn wiring beyond fields needed by schema.
Retirement: None.
```

## 5B - Built-in Tiles

```text
Goal: QuantFlow V2 Layer 5B - Built-in tile definitions
Layer: 5 - Legend Palette + Templates
Depends on: 5A Config format lock passed.
Scope: Define the v2 built-in tiles using the locked config format: Hermes, Codex, Claude Code, Factory Droid, PufferLib, Python, Generic CLI, and Generic Shell.
Acceptance criteria:
- All eight required built-ins exist in the shared tile definition config.
- Each built-in has runtimeTarget, command/profile, capabilities, Agent Card defaults where applicable, status parser hints, icon/color/group, and safe defaults.
- Agent-capable tiles are distinguishable from dumb/process tiles and native shell tiles.
- Legend UI renders all built-ins without hardcoded recipe duplication.
- Proof: each built-in appears in the Legend and can be selected without schema errors.
- Tests: built-in config load, expected IDs, grouping, runtime target mapping, Agent Card default mapping.
Out of scope:
- Custom tile registration form.
- RL Training multi-tile template.
- Commence start behavior.
Retirement: Hardcoded built-in recipe arrays may be retired only after the config-driven Legend proof passes.
```

## 5C - Template Tiles

```text
Goal: QuantFlow V2 Layer 5C - Template tiles
Layer: 5 - Legend Palette + Templates
Depends on: 5B Built-in tile definitions passed and 3D string-to-A2A mapping available for string definitions.
Scope: Define template tiles/workflows, starting with RL Training as a multi-tile template with planned tiles, layout, strings, and Commence-controlled worker start. The template format must be extensible for future workflows.
Acceptance criteria:
- Add a versioned template schema covering template id/name, tile instances, layout positions, connection/string definitions, startup policy, Commence requirements, and optional notes.
- RL Training template creates at least Hermes plus PufferLib with one defined string/connection and stable layout positions.
- Applying a template creates visual tiles/strings in an inspectable pre-start state.
- Template application does not start workers automatically.
- Proof: arm/apply RL Training, inspect planned layout, confirm no worker started before Commence.
- Tests: template schema, layout generation, connection generation, no-autostart guarantee, invalid template errors.
Out of scope:
- Custom template editor.
- Commence worker start; that is 5E.
- Envoy posting unless used only as future metadata.
Retirement: None.
```

## 5D - Custom Tile Registration

```text
Goal: QuantFlow V2 Layer 5D - Custom tile registration
Layer: 5 - Legend Palette + Templates
Depends on: 5A Config format lock passed and 5B built-in rendering passed.
Scope: Build a custom tile registration flow that writes custom definitions to the same config format used by built-ins. The form should validate before save and make the new tile available in the Legend without app restart if feasible.
Acceptance criteria:
- UI form supports name, group, icon/color, runtime target, command/profile, cwd policy, env, capabilities, status parser hints, and description.
- Saved custom tile definitions use the exact same schema as built-ins with a custom namespace/id policy.
- Validation errors are shown before write and in diagnostics.
- Custom tile appears in Legend and can be spawned through the correct runtime path.
- Custom definitions can be edited/disabled/deleted without affecting built-ins.
- Proof: create a custom Generic CLI tile, spawn it, restart app, confirm it persists.
- Tests: validation, save/load, duplicate id handling, edit/delete, Legend refresh.
Out of scope:
- Custom multi-tile template registration.
- Marketplace/import/export.
- A2A implementation beyond schema capability fields.
Retirement: None.
```

## 5E - Commence Flow

```text
Goal: QuantFlow V2 Layer 5E - Commence flow
Layer: 5 - Legend Palette + Templates
Depends on: 5C Template tiles passed and 2G startup sequence passed.
Scope: Implement the operator-controlled Commence flow: template layout appears first, operator inspects, manual Commence starts workers, and startup results become visible without ambiguity.
Acceptance criteria:
- Applying a template creates planned tiles/strings in a pending/armed state.
- Commence button is enabled only when the template has required runtime readiness and valid tile definitions.
- Pressing Commence starts the planned workers through Layer 2 runtime APIs and records startup results per tile.
- Partial failures are visible and retryable without duplicating successfully started workers.
- Commence cannot be triggered twice for the same armed template without idempotent behavior.
- Proof: RL Training layout appears, no workers running; press Commence; Hermes/PufferLib start as configured; statuses update.
- Tests: armed state, readiness gating, idempotence, partial failure, retry, no autostart.
Out of scope:
- A2A task delegation behavior beyond creating configured strings.
- Envoy flow.
- Custom template authoring.
Retirement: None.
```

## 5F - Legend-to-Herdr Wiring

```text
Goal: QuantFlow V2 Layer 5F - Legend-to-herdr wiring
Layer: 5 - Legend Palette + Templates
Depends on: 5B Built-in tiles passed and 2G startup sequence passed.
Scope: Finalize the direct operator flow from clicking a Legend tile to herdr agent.start, then canvas tile creation with identity. This goal closes the Legend/runtime seam for all WSL built-ins.
Acceptance criteria:
- Clicking an agent-capable WSL Legend tile calls the Layer 2 herdr spawn API and creates a canvas tile with herdrPaneId and herdrAgentName.
- Clicking dumb/process WSL tiles uses the approved Layer 2 herdr path or explicitly supported process runtime policy, not hidden legacy node-pty WSL ownership.
- Native Windows Generic Shell/PowerShell uses node-pty fallback by explicit runtimeTarget.
- Legend disabled/ready states reflect herdr readiness from 2G.
- Proof: spawn Hermes, Codex, Claude Code, PufferLib, Python, Generic CLI, and Generic Shell according to their runtime target; verify identity/status for each.
- Run each tile spawn as an independent proof step. Record pass/fail per tile separately. A partial pass is acceptable as long as each failure is documented with the specific error.
- Tests: click-to-spawn routing matrix, UI disabled state, identity persistence, failed spawn display.
Out of scope:
- Adding new built-ins beyond 5B list.
- A2A delegation.
- Envoy memory.
Retirement: Retire hardcoded spawn paths or old recipe-specific WSL node-pty paths after this proof passes.
```
