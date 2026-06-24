# QuantFlow Repo Map

This repo is organized around **v4 execution** (active branch `quantflow-v4`).
v4 **extends** the shipped v3 backbone; it is not a rewrite. The root is kept lean —
only current authority docs and standard entrypoints live here; everything dated or
superseded is preserved under `reference/` (never deleted).

## Root files (durable authority + high-frequency entrypoints)

| File | Role |
| --- | --- |
| `README.md` | Public product overview |
| `AGENTS.md` | Agent read order + branch routing + constitutional base |
| `KERNEL_CONSTITUTION.md` | The One Rule (Kernel owns truth) — binding in v3 **and** v4 |
| `BUILD_PLAN_V4.md` | v4 spine record (R0–R8.5, complete) — active work is in `docs/v4/` |
| `PRODUCT.md` | Product definition (what we build + for whom) |
| `DESIGN.md` | Visual / UX rails |
| `TESTING.md` | Operator QA + proof guide |
| `WINDOWS_DEV_SETUP.md` | Windows dev environment setup |
| `REPO_MAP.md` | This file |
| `CONTRIBUTING.md` · `LICENSE.md` · `NOTICE.md` · `CLA.md` | Project / legal |
| `install.sh` | Setup entrypoint |

## Current build authority (where the live work is)

The active per-rung work plans live under `docs/v4/`, **not** at the root:

| Plan | Phase |
| --- | --- |
| `docs/v4/SURFACE_LADDER.md` | Surface / Canvas Reflection (rungs S0–S6) |
| `docs/v4/PERFORMANCE_LADDER.md` | Performance / "make it instant" (rungs PF0–PF7) |
| `docs/v4/PERF_STACK_AUDIT.md` | The audit the Performance ladder is derived from |
| `docs/v4/V4_TERRITORY_MAP.md` | Locked v4 territory reference |
| `docs/v4/AGENTS.md` | v4 subtree contract |

Build from the promoted rung in the relevant `docs/v4/` ladder, **one rung at a time**.
Consult root `BUILD_PLAN_V4.md` only for a specific named R-rung's spine record.

## Reference / archive (historical — never deleted)

Non-current context is preserved under `reference/`:

| Path | Holds |
| --- | --- |
| `reference/v2-shipped-context/` | v2 shipped behavior — `BUILD_PLAN_V2.md`, `CONCEPT.md` (v2-era), the v2 simplified plan |
| `reference/v3-superseded/` | v3 root authority superseded on v4 — `BUILD_PLAN_V3.md`, `V3_MIGRATION_NOTES.md`, `VAULT.md`, `ENVOY.md` (Envoy retired), + old v3 pointer stubs (`SCOPE`/`ARCHITECTURE`/`RETIREMENT`) |
| `reference/v4-parked-analysis/` | Parked v4 analysis — `VISUAL_MANIFEST.md`, `VISUAL_COMPONENT_INVENTORY.md` |
| `reference/archive/` | Older phase / layer-charter archaeology |

The still-binding v3 **constitutional** docs were *not* archived: `KERNEL_CONSTITUTION.md`
(root) + `docs/v3/{AUTHORITY_RULES,KERNEL_SCHEMA_V1,GLOSSARY}.md`.

## Current build rule

Build from the promoted rung in `docs/v4/`. Use `reference/` only for archaeology, and
only when the active plan explicitly points to it.
