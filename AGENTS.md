# QuantFlow Agent Entry

## v3 Authority

Current branch: `quantflow-v3`

QuantFlow v3 is an authority refactor, not a rewrite.

Read in order before editing:

1. `AGENTS.md` chain for the target files (this file first, then the child `AGENTS.md` for the target folder)
2. `BUILD_PLAN_V3.md` — the only execution plan for v3
3. `KERNEL_CONSTITUTION.md` — authority rules
4. Current goal scope from `BUILD_PLAN_V3.md`
5. Relevant repo files (`CONCEPT.md`, `REPO_MAP.md`, `VAULT.md`, `ENVOY.md`)
6. `BUILD_PLAN_V2.md` for shipped behavior only, when v3 explicitly references it
7. Old vault notes as context only, never as marching orders

Do not build from loose vault notes. Do not execute old v2 goal ladders unless `BUILD_PLAN_V3.md` explicitly points to them.

Do not create new vocabulary when canonical v3 primitives already exist in `BUILD_PLAN_V3.md` and `docs/v3/GLOSSARY.md`.

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
src/kernel/AGENTS.md             ← sole truth owner; all state mutations
src/renderer/AGENTS.md           ← visual projector; no canonical state
src/main/conductor/AGENTS.md     ← in-process planner; native Kernel tools only
src/harness/AGENTS.md            ← worker/runtime adapter boundary
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
C:\Users\rybow\Obsidian\Cursor Collab
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

## Current Setup State

Goal 0 complete. The following were installed for v3:

- `BUILD_PLAN_V3.md` — v3 execution plan
- `KERNEL_CONSTITUTION.md` — authority rules
- `V3_MIGRATION_NOTES.md` — v2→v3 vocabulary map
- `docs/v3/GLOSSARY.md` — canonical v3 term definitions
- `docs/v3/AGENTS.md` — DOX guard for v3 docs subtree
- `src/kernel/AGENTS.md` — Kernel authority rail
- `src/renderer/AGENTS.md` — renderer projector rail
- `src/main/conductor/AGENTS.md` — Conductor planner rail
- `src/harness/AGENTS.md` — harness adapter boundary rail
- `tools/quantflow-mcp/AGENTS.md` — external adapter rail
- `src/vault/AGENTS.md` — knowledge mirror rail
- DOX base contract incorporated into this file

Next: Goal 1 — Kernel Constitution and Canonical Schema (do not start until operator approves).
