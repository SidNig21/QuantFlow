# Incoming Goals — v4 Backlog (intake, not authority)

A capture surface for candidate v4 goals discovered while **using** QuantFlow.
Items here are raw intake. **Nothing here is authorized work.** A candidate becomes
real only when the operator promotes it into `BUILD_PLAN_V4.md` as a numbered rung
with full scope and explicitly authorizes it (one rung at a time).

Entry shape:
```md
### <short title>
- **Problem / friction:** what felt missing or wrong while using the product
- **Evidence:** where you saw it
- **Proposed scope:** 1–3 bullets
- **Layer(s):** kernel / renderer / conductor / harness / vault / evals / shell
- **Priority:** low / medium / high
- **Status:** captured | discussed | promoted to BUILD_PLAN_V4 (R#) | dropped
```

## Candidates

### R8.5 — Settings agent inventory + Eve-first authoring
- **Problem / friction:** (1) Settings only does Canvas Skill install today — there
  is **no place to view/add/edit/remove all agents** (the legend recipe registry).
  (2) The R8 "+ Add" **modal form** is the wrong way to *author* an agent — the
  operator rejected hand-typing metadata; they want to add/customize agents the way
  you **build an Eve agent** (a package: `agent.ts` + `instructions.md` + a `tools/`
  dir + optional MCP connections/skills), like `C:\Users\rybow\quantflow-eve\agent\`.
- **Evidence:** R8 product proof (2026-06-20) — operator: "i dont really care for
  that method of adding… we should be incorporating how you build eve agents for
  everything." Liked Pi's easy tool-customization; Eve supersedes it.
- **Proposed scope:**
  - Settings pane reads/writes the **same `legend-recipes` registry** the dock uses
    (view all agents · readiness badge · add/remove/edit name/command/folder/icon).
  - **Eve-first authoring path:** "add agent" = **scaffold an Eve agent** from the
    proven template, then customize by editing `instructions.md` + dropping `tools/`
    files. It surfaces in the dock by writing a **`roles/*.json`** that points at the
    folder (`commandTemplate: npm run dev` + `cwd` + `runtimeTarget`). **NOTE (R8
    correction):** the old `eve-packages/manifest.json` discovery was **removed** — the
    registry is `roles/*.json` only, so the scaffolder must emit that.
  - **Fix the broken "+ Add" → Eve form** (found during R8 proof): it writes
    `harnessKind: eve-harness` with **no `commandTemplate`/`cwd`** → spawns a broken
    WSL shell, not Eve. Demote the modal to dumb CLI/one-shot scripts only.
  - **Gotcha to bake in:** never scaffold **empty** Eve capability folders — Eve
    discovery rejects them (even with `.gitkeep`) and refuses to boot. Node ≥24 required.
- **Open spike (do first):** Eve capability — **multiple agents per app** vs **one
  project per agent**; how you scaffold a new agent; how tools/MCP attach. Determines
  scaffolding shape. (`quantflow-eve` is one-project-one-agent today.)
- **Depends on:** R8 (Mode-1 summon) ✅ landed. Same band (extensibility), **no Kernel
  schema**.
- **Layer(s):** renderer (settings + dock) · main (role-service / legend-recipes /
  eve scaffolding) · harness (eve-harness already exists, Mode 2 only)
- **Priority:** high (operator's stated extensibility priority)
- **Status:** **IMPLEMENTED (slice A+B), pushed `38ab1e0`; Settings→Agents pane verified live.**
  Staged follow-on: auto-scaffold (`eve init`/`npm install` automation from Settings).

### Legend spawn → Run-Workflow context inject (multi-agent dogfood blocker)
- **Problem / friction:** a **legend-spawned** agent (Mode-1 terminal tile) opens a working
  terminal but receives **no workflow/task context**. Only the **Run Workflow → Hermes** path
  injects an activation line (via herdr). So when you summon Codex/Claude from the legend and
  expect it to join a DAG run, it has nothing telling it which task it owns or what the run is —
  it improvises (did `extract` instead of its assigned task), and the multi-agent demo **fails
  silently**. This is a *product wiring* bug, not an R2/R3 failure.
- **Evidence:** R3 product proof (2026-06-21, `wf-r3-proof`): Hermes (Run-Workflow-spawned) got
  context and worked; the legend-spawned Codex tile lacked context/MCP inject and did the wrong
  task. Noted in `R3-product-proof-operator.md`. Does NOT invalidate the DAG proof — but it's why
  multi-agent runs feel broken.
- **Proposed scope:**
  - Generalize the existing Run-Workflow inject (`buildWorkflowActivationLine` / the herdr
    activation path used for Hermes) so **any** legend-spawned tile can be *joined to a workflow
    + task* and receive its context. The spawn path already threads
    `workflowTaskId`/`workflowCorrelationId` for Hermes — extend it to the general legend spawn.
  - **Compose with R2:** once R2 builds the Context Envelope + delivers via `harness.send`, a
    legend-spawned worker assigned a task should receive **that envelope** — not a bare prompt.
    So this fix is the *delivery wiring*; R2 is the *payload*. Land them together where possible.
  - Minimal v0: a "summon into workflow" affordance (or an inject-context action on an existing
    tile) that sends the task objective + acceptance + (R2) upstream artifacts to the tile via
    `harness.send`. No Kernel schema change.
- **Layer(s):** renderer (legend spawn / tile action) · conductor (workflow-join + context build)
  · harness (`send` delivery)
- **Priority:** high — **Track A**, do before/with R2 so the next multi-agent run doesn't misfire.
- **Status:** captured (spec above) — small fix, high ROI; not a full rung.

### (note) R8 Mode-1 spawn correction — already in BUILD_PLAN_V4, not a candidate
The Eve-legend-click → terminal-tile fix is an **R8 scope clarification** recorded
directly in `BUILD_PLAN_V4.md` (§ "Operator spawn model — Mode 1 vs Mode 2" + the
R8 ledger row + R8 acceptance). It is authorized R8 work, not backlog intake.
