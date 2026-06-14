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

Goals 0-5A are complete and approved.

The back half has been refined:

```text
Goal 6A - Worker Spawn Reconciliation and Minimal Harness Registry
Goal 5C - Conductor Native Actions
Goal 5D - Conductor Loop
Goal 6 - Harness Interface and First Worker Adapters
```

`WORKER_RECONCILIATION.md` is binding before Conductor spawn/assign actions. See `BUILD_PLAN_V3.md` for current scope. Do not start the next goal until the operator approves.
