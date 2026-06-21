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
    files — it auto-discovers into the dock (eve-packages discovery already exists).
  - Demote the R8 modal form to a fallback (dumb CLI/one-shot scripts only).
- **Open spike (do first):** Eve capability — does Eve support **multiple agents per
  app** vs **one project per agent**; how you scaffold a new agent; how tools/MCP
  attach. Determines scaffolding + discovery shape. (`quantflow-eve` is one-project-
  one-agent today.)
- **Depends on:** R8 (Mode-1 summon) landing first. Same band (extensibility), **no
  Kernel schema**.
- **Layer(s):** renderer (settings + dock) · main (role-service / legend-recipes /
  eve scaffolding) · harness (eve-harness already exists)
- **Priority:** high (operator's stated extensibility priority)
- **Status:** captured

### (note) R8 Mode-1 spawn correction — already in BUILD_PLAN_V4, not a candidate
The Eve-legend-click → terminal-tile fix is an **R8 scope clarification** recorded
directly in `BUILD_PLAN_V4.md` (§ "Operator spawn model — Mode 1 vs Mode 2" + the
R8 ledger row + R8 acceptance). It is authorized R8 work, not backlog intake.
