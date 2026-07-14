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

### Surface / Canvas Reflection Layer (S0–S6, 7 rungs) — full scope in `docs/v4/SURFACE_LADDER.md`
- **Problem / friction:** the v4 spine is machine-verified but **not visible on the
  canvas** — R2/R4/R5/R6/R7 each still carry an open *"live-canvas product proof =
  operator"* item. The backend changes; the operator can't see what happened without
  logs/SQLite/DevTools.
- **Proposed scope:** a 7-rung **projection** ladder (no new Kernel truth) that closes
  those open proofs (consolidated from an earlier thin 10-rung draft). Two keystones:
  S0 event-taxonomy/live-projection (makes it *live*) · **S1 Müller-Brockmann Canvas Grid
  System** (makes it *neat* — tiles snap/align, overlay + alignment verification; source
  `QuantFlow Vault/S2 Grid Canvas.md`). Then: **S2 Live Run Projection** (region + agent
  tiles + artifact dock + lineage — closes R1 binding/R2/R3 in one proof) · S3 real template
  spawn + DAG/role auto-layout snapping to the S1 grid (R4/R6) · S4 Checkpoint surface (R5) ·
  S5 Run Replay view + local eval badges (R7) · S6 Conductor chat + model binding. Mostly a
  **rebind** of existing surfaces; genuinely new = grid, artifact dock, checkpoint card, DAG
  layout, replay view.
- **Off this ladder:** legend taxonomy cleanup → **R8.5 follow-on** (composes with the
  `roles/*.json` registry + Settings→Agents pane).
- **Parked:** Visual Manifest (fixed-dashboard-first when promoted); Braintrust (local
  eval badges only).
- **Status:** **PROMOTED — `docs/v4/SURFACE_LADDER.md` is now the authoritative build plan**
  for this phase (its own ledger + promotion discipline). Intake closed; promote one S-rung
  at a time into that doc's ledger. The v4 spine (R0–R8.5) record stays in `BUILD_PLAN_V4.md`.
- **Layer(s):** renderer (shell + `@qf-renderer`) · main (ipc-kernel-reads · run-template
  seam) · kernel (events audit, additive emissions only).
- **Priority:** high — operator's stated next ladder; closes the v4 live proofs.
- **Status:** **scoped (proposal) in `docs/v4/SURFACE_LADDER.md`** — not authorized;
  promote one S-rung at a time into `BUILD_PLAN_V4.md`. Frame locked by operator: spine =
  *close the open v4 proofs*; Braintrust deferred; real harness wired at S4.

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

### OKF vault export — built + smoke-proven, no live trigger (fold into R7)
- **RESOLVED by R7 (commit `d8a8296`, 2026-06-21):** R7 wired the live trigger —
  `vault:export-workflow` IPC in `ipc-vault.ts` + `mirrorLessonArtifactsToVault`
  reusing the existing OKF exporters; `smoke:judgment` asserts the vault output
  contains the lesson artifact id while the artifact row stays Kernel truth. The
  subsystem is no longer dark. (Remaining below = original intake, kept for history.)
- **Problem / friction:** the whole OKF export pipeline exists and is machine-proven
  (`src/vault/index.ts` `exportWorkflowToVault`/`collectVaultExport`/`renderVaultExport`,
  `src/vault/exporters/*.ts`, `okf/frontmatter.ts`, spec `docs/v3/VAULT_OKF_SPEC.md`,
  smoke `vault-export-smoke.ts`) — but it has **zero live callers**. No IPC, MCP, or
  menu path reaches it. `ipc-vault.ts` only does get/set-path + pick/read-file. So a
  finished subsystem is dark: the operator can *read* the vault but can never *trigger*
  an OKF workflow export from the app. (Distinct from `obsidian-envoy-mirror.ts`, the
  live polling task-feed writer — that one runs; OKF export does not.)
- **Evidence:** external-tooling audit (2026-06-21). Grep: `collectVaultExport` appears
  only in `src/vault/` + the smoke; nothing under `quantflow-electron/src/main` calls it.
- **Proposed scope:**
  - Wire **one** trigger — IPC/MCP "export workflow → vault" handler calling
    `exportWorkflowToVault(workflowId)`. ~one handler; subsystem is already done + tested.
  - **Fold into R7:** R7's lesson/judgment work needs the lesson→vault mirror seam on
    this exact path, so land the export trigger there rather than as a standalone fork.
- **Layer(s):** main (ipc-vault / MCP) · vault (already built)
- **Priority:** medium — completes built work; natural R7 companion.
- **Status:** captured — do NOT fork the rung chain; absorb into R7 unless operator
  wants the export button sooner.

### (cleanup) Cloudflare Workers is not a live dependency — doc prune
- **Problem / friction:** Cloudflare survives only as an aspirational comment
  (`src/main/conductor/model-provider.ts:5`) + stale roadmap mentions (`BUILD_PLAN_V3.md`,
  AGENTS.md) and the operator's "Outside Tooling" note. No `wrangler`, no `workers.dev`,
  no runtime — it was never built. Listing it as an "outside tool" implies a coupling
  that doesn't exist. It's the durable-cloud-runtime idea tied to the **parked** Eve/Vercel
  cloud gate, not a current tool.
- **Evidence:** external-tooling audit (2026-06-21). Grep `cloudflare|wrangler|workers.dev`
  → comments/docs only.
- **Proposed scope:** one-line doc prune — strike Cloudflare from the "outside tools"
  mental model; keep it only as explicitly-parked future strategy (Eve/Vercel durability gate).
- **Layer(s):** docs only.
- **Priority:** low — hygiene; prevents re-treating a non-dependency as live.
- **Status:** captured.

### (note) Envoy CLI is demoted, not dead — treat as mirror/spawn, not authority
- After R3c the Kernel owns task truth; the Envoy CLI is now (a) the WSL spawn-lifecycle
  wrapper (`herdr-envoy-wrap` posts Started/Completed/Failed) and (b) a downstream
  `envoy_tasks` mirror feeding the Obsidian board. Still load-bearing for Mode-2 spawn —
  **not** removable without redoing spawn — but no longer the bus. No code change; recorded
  so nobody re-treats `envoy_tasks` as a source of truth. (External-tooling audit 2026-06-21.)

### (decision) Legacy MCP `qf_task_complete` / Envoy complete — preserved, DAG-safe
- **Problem:** v4 review (C-01/X-04) flagged `qf_task_complete` → `kernel.task.complete`
  with `legacy:true` as an external bypass of structural verify.
- **Decision (2026-06-22):** **Keep** for Hermes/MCP compatibility. Receipts tag
  `legacy` + `bypassedVerification`. DAG/upstream gating requires `verification_passed`
  (`isUpstreamSatisfied`), so legacy-complete tasks do **not** unblock downstream `blocks`
  edges. Operators must use submit→verify for DAG/template runs.
- **Status:** documented; no retire/gate in v4. Revisit if MCP teaches submit→verify everywhere.

### (note) v4 review punch list — majors fixed 2026-06-22
- REF sensitivity column filter, R6 workflow completion gate, EO idempotency-after-recover
  (+ template attempt epoch). See `qa/v4-review-adjudication.md` consolidated list for
  remaining minors (queryRun.endedAt nit, runner split, etc.).

### (note) R8 Mode-1 spawn correction — already in BUILD_PLAN_V4, not a candidate
The Eve-legend-click → terminal-tile fix is an **R8 scope clarification** recorded
directly in `BUILD_PLAN_V4.md` (§ "Operator spawn model — Mode 1 vs Mode 2" + the
R8 ledger row + R8 acceptance). It is authorized R8 work, not backlog intake.
