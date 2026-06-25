# DOC_AUTHORITY_MAP.md

> **The "is this doc current?" answer key.** If you are ever unsure whether a file is live, dated, or dead — this map decides. It is a companion to `START_HERE.md` (the front door). If this map and another doc disagree about a doc's status, this map wins.
> Last updated: 2026-06-24 · Branch: `quantflow-v4`

---

## 0. The one principle that resolves most confusion

**A folder named `v3` does NOT mean "old." It is a layer name, not a freshness date.**

- `quantflow-v4` **extends** `quantflow-v3`; it does not replace it.
- The v3 docs in `docs/v3/` are the **constitutional foundation** — the truth rules, the schema, the vocabulary. They are **still binding on v4.**
- Think of it as a building: `v3` is the foundation and plumbing (still load-bearing); `v4` is the new rooms built on top.

So: **a file living in `docs/v3/` can be fully current and binding.** Location ≠ authority. This map ≠ folder names is how you tell.

---

## 1. How to read this map

Every doc is exactly one of:

- **CURRENT — binding.** Live authority. Follow it. Changing it is a deliberate decision.
- **REFERENCE — informs, not authority.** True/useful context, but you do **not** execute from it (paused feature ladders, goal-area specs, parked analysis, process templates).
- **ARCHIVE — do not follow.** Historical or superseded. Read only for "how did we get here," never as marching orders.

`⚠ uncommitted` = exists on disk but **not yet in git**. Durable only after it is committed.

---

## 2. CURRENT — binding authority

| Doc | Role | Git |
|---|---|---|
| `START_HERE.md` | Front door; overrides any conflict | ⚠ uncommitted |
| `DOC_AUTHORITY_MAP.md` | This file; doc-status answer key | ⚠ uncommitted (new) |
| `KERNEL_CONSTITUTION.md` | The one rule (Kernel owns truth) | tracked |
| `docs/v3/AUTHORITY_RULES.md` | Mutation rules, invariants, violation signals | tracked |
| `docs/v3/KERNEL_SCHEMA_V1.md` | Canonical Kernel table definitions | tracked |
| `docs/v3/GLOSSARY.md` | Canonical vocabulary (already carries v4 terms; formal promotion to `docs/v4/GLOSSARY.md` pending) | tracked |
| `REBUILD_STRATEGY_AUDIT.md` | The rebuild decision: finish the strangler | ⚠ uncommitted |
| `QUANTFLOW_STABILIZATION_PLAN.md` | Phased execution + gates | ⚠ uncommitted |
| `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md` | Original diagnosis (binding background; some findings now resolved) | ⚠ uncommitted |
| `docs/v4/PERFORMANCE_LADDER.md` | Performance execution authority (PF0-first) | ⚠ uncommitted |
| `docs/v4/PERF_STACK_AUDIT.md` | Performance diagnosis (the perf source of truth) | ⚠ uncommitted |
| `docs/v4/AGENTS.md` | v4 subtree contract | tracked (modified) |
| `AGENTS.md` (root) + all subtree `AGENTS.md` | DOX work contracts per subtree | tracked |
| `PRODUCT.md`, `DESIGN.md` | Product + visual taste rails (not runtime authority) | tracked |

---

## 3. REFERENCE — informs, not execution authority

| Doc / group | Why reference, not authority |
|---|---|
| `BUILD_PLAN_V4.md` | The big v4 rung ledger. **Feature work is paused** by structure-freeze; treat ledger rows as claims until a `qa/` command reproduces them. |
| `docs/v4/SURFACE_LADDER.md` | Feature ladder (S0–S2). Paused until the structure gates pass. |
| `docs/v4/V4_TERRITORY_MAP.md` | v4 territory + open decisions. Locked reference. |
| `docs/v4/SPAWN_MODEL.md`, `docs/v4/EVE_SETUP.md` | Subsystem references (spawn model, Eve setup). |
| `docs/v4/handoffs/R0–R8*` | Per-rung feature handoffs. **Paused feature work** — do not pick one up during structure-freeze. |
| `docs/v3/STATUS.md`, `docs/v3/README.md` | v3 state + index; orientation only. |
| `docs/v3/WORKER_RECONCILIATION.md`, `VAULT_OKF_SPEC.md`, `EVALS_SPEC.md` | Goal-area specs (binding *within* their goal area; background for the rebuild). |
| `reference/v4-parked-analysis/VISUAL_MANIFEST.md`, `VISUAL_COMPONENT_INVENTORY.md` | Visual analysis; parked until the token-spine stage. |
| `docs/v4/ADJUDICATION_BRIEF.md`, `REVIEW_BRIEF.md`, `HANDOFF_TEMPLATE.md` | Process templates. |
| `qa/v4-review-*.md` | Historical review records. |
| `REPO_MAP.md`, `TESTING.md`, `WINDOWS_DEV_SETUP.md`, `README.md`, `CONTRIBUTING.md` | Operational reference / onboarding. |

> **Intake, NOT authority:** `docs/v3/INCOMING_GOALS.md` and `docs/v4/INCOMING_GOALS.md` are backlog capture. A candidate becomes real only when promoted into the active plan and authorized.

---

## 4. ARCHIVE — do not follow

| Group | Status |
|---|---|
| `reference/v2-shipped-context/**` (incl. `BUILD_PLAN_V2.md`, `CONCEPT.md`) | Shipped v2 context. Read-only history. |
| `reference/v3-superseded/**` (incl. `BUILD_PLAN_V3.md`, `ARCHITECTURE.md`, `V3_MIGRATION_NOTES.md`, `ENVOY.md`, `SCOPE.md`, `VAULT.md`, `RETIREMENT.md`) | Superseded v3 root docs. The old `ARCHITECTURE.md` lives here now — it is **not** at repo root anymore. |
| `reference/archive/**` (v2 layer charters, superpowers plans/specs, `phase-7.5-orchestration-spine.md`) | Deep archive. |

**Never execute from `reference/**`.** It is the morgue, not the workshop.

---

## 5. Version-control gap (resolve before relying on the platform)

These CURRENT-binding docs are **not yet in git** and must be committed to be durable:

```
START_HERE.md
DOC_AUTHORITY_MAP.md
REBUILD_STRATEGY_AUDIT.md
QUANTFLOW_STABILIZATION_PLAN.md
DOCS_PRODUCT_ARCHITECTURE_AUDIT.md
docs/v4/PERFORMANCE_LADDER.md
docs/v4/PERF_STACK_AUDIT.md
docs/v4/SURFACE_LADDER.md   (reference, but should also be tracked)
```

Until committed, the rebuild's foundation lives only in the working tree.

---

## 6. Drift already corrected (2026-06-24)

- `ARCHITECTURE.md` retired from root → archived to `reference/v3-superseded/`. References calling it "the root `ARCHITECTURE.md`" are stale.
- Receipt/event vocabulary aligned across the four rebuild docs (receipts = proof, not an event-sourcing truth store).

*Keep this map short. When a doc's status changes, update the row here in the same change.*
