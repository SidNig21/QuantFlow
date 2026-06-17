# QuantFlow v3

`BUILD_PLAN_V3.md` is the execution plan for v3.

Vault `V3 Official.md` is the operator-facing source copy that seeded the repo plan. If the vault plan changes, update `BUILD_PLAN_V3.md` before coding against the change.

## Source Freshness

Fresh root vault references:

- `Cursor Roadmap.md`
- `Fable URL List.md`
- `QuantFlow_Integration_Map.md`
- `QuantFlow Constructor Theory.md`

Relevant but dated context:

- `Projects/QuantFlow/reference/`
- `Projects/QuantFlow/reference/root-cleanup-2026-06-13/`
- older v2/v1 goal and design notes

## Build Discipline

- Work one v3 goal at a time.
- Keep v2 behavior as reference, not execution scope.
- Make replacement work separate from retirement/deletion work.
- Do not bypass Kernel authority once Goal 1 defines it.
- Do not treat the vault as live state.

## Goal 0 — Complete

Goal 0 (`Branch, Freeze v2 Truth, Create v3 Plan Files, Install DOX Rails`) is complete.

Installed:

- `BUILD_PLAN_V3.md` — v3 execution plan
- `KERNEL_CONSTITUTION.md` — authority rules
- `V3_MIGRATION_NOTES.md` — v2→v3 vocabulary map
- `docs/v3/GLOSSARY.md` — canonical v3 term definitions
- DOX base contract in root `AGENTS.md`
- Child `AGENTS.md` rails at all durable repo boundaries

## Current Plan State

**The v3 build ladder (Goals 0–9) is functionally complete.** Goal 10
(cloud/remote tier) is intentionally parked. The project is dogfooding, capturing
gaps in `INCOMING_GOALS.md` for promotion into `BUILD_PLAN_V3.md`.

Read **`STATUS.md`** for current state + per-goal history. The `BUILD_PLAN_V3.md`
ledger is the authoritative completion record. `WORKER_RECONCILIATION.md`,
`VAULT_OKF_SPEC.md`, and `EVALS_SPEC.md` remain binding for their layers. Do not
start new build work until the operator promotes a candidate and approves it.

## v3 docs in this directory

- `STATUS.md` — current state + per-goal history (orientation)
- `INCOMING_GOALS.md` — dogfooding backlog/intake (not authority)
- `GLOSSARY.md` — canonical v3 terms
- `KERNEL_SCHEMA_V1.md` — canonical tables/fields
- `AUTHORITY_RULES.md` — mutation rules + invariants
- `WORKER_RECONCILIATION.md` — worker spawn/status authority (Goal 6A)
- `VAULT_OKF_SPEC.md` — Kernel→Obsidian export spec (Goal 8)
- `EVALS_SPEC.md` — evaluation-layer spec (Goal 9)
- `AGENTS.md` — DOX guard for this subtree
