# QuantFlow Agent Entry

## Active branch routing

- On **`quantflow-v4`**: the active execution plan is **`BUILD_PLAN_V4.md`**
  (per-rung goal shapes R0–R7) with **`docs/v4/V4_TERRITORY_MAP.md`** as the
  locked territory reference and **`docs/v4/AGENTS.md`** as the subtree contract.
  v4 is an **extension** of v3, not a rewrite — the v3 authority docs below
  (`KERNEL_CONSTITUTION.md`, `docs/v3/*`, the goal-shape convention) remain
  **fully binding**. Promote and build one rung at a time.
- On **`quantflow-v3`**: `BUILD_PLAN_V3.md` is the execution plan (v3 is in the
  dogfooding phase; the ladder Goals 0–9 are shipped).

The v3 Authority section below applies on both branches as the constitutional
base; v4 only adds the three constitutional lines documented in `BUILD_PLAN_V4.md`.

## v3 Authority

Constitutional base for all branches (current working branch: `quantflow-v4`,
which extends — does not replace — everything in this section).

QuantFlow v3 is an authority refactor, not a rewrite.

Read in order before editing:

1. `AGENTS.md` chain for the target files (this file first, then the child `AGENTS.md` for the target folder)
2. The active plan for the current branch — on `quantflow-v4`: `BUILD_PLAN_V4.md` + the promoted rung in `docs/v4/` (`SURFACE_LADDER.md` / `PERFORMANCE_LADDER.md`); on `quantflow-v3`: `reference/v3-superseded/BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md` + `docs/v3/{AUTHORITY_RULES,KERNEL_SCHEMA_V1,GLOSSARY}.md` — authority rules (binding on all branches)
4. Current goal scope from that active plan
5. Relevant repo files (`PRODUCT.md`, `REPO_MAP.md`, `DESIGN.md`)
6. For UI/UX work: `PRODUCT.md` (product taste) and `DESIGN.md` (visual rails) — shared taste rails, not runtime deps; they never override the build plan or Kernel Constitution
7. Superseded context under `reference/` only when the active plan explicitly references it (`reference/v2-shipped-context/` for shipped v2 behavior)
8. Old vault notes as context only, never as marching orders

Do not build from loose vault notes. Do not execute old v2/v3 goal ladders unless the active build plan explicitly points to them.

Do not create new vocabulary when canonical primitives already exist in `docs/v3/GLOSSARY.md` and the active build plan.

Do not bypass Kernel commands.

## v3 Non-Negotiables

- Kernel owns truth.
- Canvas renders truth.
- Conductor plans.
- Workers execute.
- Receipts prove.
- State Cards summarize.
- Harnesses adapt runtimes.
- MCP remains an external adapter, not the internal fast path.
- Vault is a durable knowledge mirror, not live state.

## DOX framework

DOX is a highly performant AGENTS.md hierarchy installed here. Reference: https://github.com/agent0ai/dox

Agent must follow DOX instructions across any edits. DOX has no runtime dependency, no package install, no service — it is documentation discipline only.

### Core Contract

- AGENTS.md files are binding work contracts for their subtrees.
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it.

### Read Before Editing

1. Read the root AGENTS.md.
2. Identify every file or folder you expect to touch.
3. Walk from the repository root to each target path.
4. Read every AGENTS.md found along each route.
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there.
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules.
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX.

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

### Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

### Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index.
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index.
- Each parent explains what its direct children cover and what stays owned by the parent.
- The closer a doc is to the work, the more specific and practical it must be.

### Child Doc Shape

Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards.

Default section order:

- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

### Style

- Keep docs concise, current, and operational.
- Document stable contracts, not diary entries.
- Put broad rules in parent docs and concrete details in child docs.
- Prefer direct bullets with explicit names.
- Do not duplicate rules across many files unless each scope needs a local version.
- Delete stale notes instead of explaining history.
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist.

### Closeout

1. Re-check changed paths against the DOX chain.
2. Update nearest owning docs and any affected parents or children.
3. Refresh every affected Child DOX Index.
4. Remove stale or contradictory text.
5. Run existing verification when relevant.
6. Report any docs intentionally left unchanged and why.

### User Preferences

Operator works one v3 goal at a time. Do not start the next goal until the current one passes acceptance or the operator explicitly approves.

### Child DOX Index

Durable `AGENTS.md` boundaries in this repo:

```text
AGENTS.md                        ← this file (root)
docs/v3/AGENTS.md                ← v3 authority/planning docs
docs/v4/AGENTS.md                ← v4 territory + per-rung plan (BUILD_PLAN_V4.md)
src/kernel/AGENTS.md             ← sole truth owner; all state mutations
src/renderer/AGENTS.md           ← visual projector; no canonical state
src/main/conductor/AGENTS.md     ← in-process planner; native Kernel tools only
src/harness/AGENTS.md            ← worker/runtime adapter boundary
run-templates/AGENTS.md          ← v4 R6 saved run configs; config only
tools/quantflow-mcp/AGENTS.md    ← external adapter interface
src/vault/AGENTS.md              ← knowledge mirror; OKF exports
```

## Branch Rule

Before coding:

```bash
git branch --show-current
git status --short --branch
```

Expected branch for v3 work:

```text
quantflow-v3
```

If the branch is not `quantflow-v3`, stop and ask the operator before editing.

## Vault Pairing

This repo is paired with the Obsidian vault at:

```text
C:\Users\rybow\Obsidian\QuantFlow Vault
```

Current vault source:

| Vault doc | Use |
| --- | --- |
| `V3 Official.md` | Operator-facing source copy of `BUILD_PLAN_V3.md` |
| `Cursor Roadmap.md` | Fresh strategic reference |
| `Fable URL List.md` | Fresh URL/tool reference |
| `QuantFlow_Integration_Map.md` | Fresh integration reference |
| `QuantFlow Constructor Theory.md` | Fresh theory/reference |
| `Projects/QuantFlow/reference/` | Relevant but older dated context |
| `Projects/QuantFlow/QUANTFLOW_CANVAS_SKILL.md` | Hermes/Codex delegation on canvas |
| `Projects/QuantFlow/Envoy/` | Live task mirror |

Repo docs win for code scope. Vault root reference files can inform decisions, but they are not execution authority.

## Current v3 State

> **Note:** the v3 root authority docs (`BUILD_PLAN_V3.md`, `V3_MIGRATION_NOTES.md`) were
> archived to `reference/v3-superseded/` on 2026-06-24 when the root was refreshed for v4.
> References to them below mean that archived copy; the binding v3 base stays at
> `KERNEL_CONSTITUTION.md` + `docs/v3/`.

**The v3 build ladder is functionally complete (Goals 0–9).** Goal 10
(cloud/remote tier) is intentionally parked — planning-only until explicitly
authorized. The project is in the **dogfooding** phase: run the product, capture
gaps in `docs/v3/INCOMING_GOALS.md`, then promote them into `BUILD_PLAN_V3.md`.

For full current state + per-goal history, read **`docs/v3/STATUS.md`** first.
Authoritative completion/approval status is the `BUILD_PLAN_V3.md` ledger
(verifier-owned).

Do not start new build work from `docs/v3/INCOMING_GOALS.md` — it is intake, not
authority. A candidate becomes real only when promoted into `BUILD_PLAN_V3.md`
and authorized (one goal at a time).

The following authority docs are installed for v3:

- `reference/v3-superseded/BUILD_PLAN_V3.md` - v3 execution plan (archived; on v4 build from `BUILD_PLAN_V4.md` + `docs/v4/`)
- `KERNEL_CONSTITUTION.md` - authority rules
- `reference/v3-superseded/V3_MIGRATION_NOTES.md` - v2-to-v3 vocabulary map (archived)
- `docs/v3/STATUS.md` - current state + per-goal history (read first for orientation)
- `docs/v3/INCOMING_GOALS.md` - dogfooding backlog/intake (not authority)
- `docs/v3/GLOSSARY.md` - canonical v3 term definitions
- `docs/v3/KERNEL_SCHEMA_V1.md` - canonical table definitions
- `docs/v3/AUTHORITY_RULES.md` - mutation rules, invariants, violation signals
- `docs/v3/WORKER_RECONCILIATION.md` - worker spawn/status authority spec (Goal 6A)
- `docs/v3/VAULT_OKF_SPEC.md` - Kernel→Obsidian OKF export spec (Goal 8)
- `docs/v3/EVALS_SPEC.md` - evaluation-layer rubrics/scoring spec (Goal 9)
- `PRODUCT.md` / `DESIGN.md` - product + visual taste rails for UI work
- `docs/v3/AGENTS.md` - DOX guard for v3 docs subtree
- `src/kernel/AGENTS.md` - Kernel authority rail
- `src/renderer/AGENTS.md` - renderer projector rail
- `src/main/conductor/AGENTS.md` - Conductor planner rail
- `src/harness/AGENTS.md` - harness adapter boundary rail
- `tools/quantflow-mcp/AGENTS.md` - external adapter rail
- `src/vault/AGENTS.md` - knowledge mirror rail
- DOX base contract incorporated into this file

Next (on `quantflow-v4`): the v4 rung ladder (R0–R7) is scoped in `BUILD_PLAN_V4.md`; build one rung at a time, only after the operator promotes and authorizes it. On `quantflow-v3`: dogfooding — capture findings in `docs/v3/INCOMING_GOALS.md`; do not start v3 goals until promoted into `BUILD_PLAN_V3.md` and approved.
