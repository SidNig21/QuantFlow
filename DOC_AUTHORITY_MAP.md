# DOC_AUTHORITY_MAP.md

> **The "is this doc current?" answer key.** If you are ever unsure whether a file is live, dated, or dead — this map decides. It is a companion to `START_HERE.md` (the front door). If this map and another doc disagree about a doc's status, this map wins.
> Last updated: 2026-07-07 · Branch: `quantflow-v6-actors`

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
| `START_HERE.md` | Front door; overrides any conflict | tracked |
| `DOC_AUTHORITY_MAP.md` | This file; doc-status answer key | tracked |
| `docs/v7/DOCK_RUNTIME_REWORK_SPEC.md` | **THE active Dock/runtime rework authority (2026-07-09)** — Agent/Worker doctrine, AgentOS-preferred runtime adapter, proof ladder P0–P3, cleanup/deletion targets. Sole plan for restructure + runtime work. | tracked |
| `CONTEXT.md` | Supporting glossary/reference for the rework spec (not itself the plan) | tracked |
| `docs/adr/0003-agentos-preferred-agent-runtime.md` | Decision record: AgentOS = preferred agent runtime adapter (not the core) | tracked |
| `docs/plans/2026-07-07-001-architecture-layer-routing-plan.md` | Routing discipline (proof-pinned spawn, no silent fallbacks) — informs the rework spec | tracked |
| `docs/v6/STACK_REDUCTION_LADDER.md` | ⛔ **RETIRED 2026-07-09** — superseded by the rework spec above; kept as history only (R0/R1 landed; cleanup targets folded into rework spec) | tracked |
| `REBUILD_QUEUE.md` | Ordered execution queue (Stage A→H) from the v4 structure-freeze era — historical reference; the rework spec above is the active marching order | tracked |
| `KERNEL_CONSTITUTION.md` | The one rule (Kernel owns truth) | tracked |
| `docs/v3/AUTHORITY_RULES.md` | Mutation rules, invariants, violation signals | tracked |
| `docs/v3/KERNEL_SCHEMA_V1.md` | Canonical Kernel table definitions | tracked |
| `docs/v4/GLOSSARY.md` | **Canonical v4 vocabulary** — live for structure-freeze work; wins on resolved terms (`run`, `harness`, `pause`) | tracked |
| `docs/v4/KERNEL_CONTRACT.md` | **Frozen Kernel command/query/event/IPC/MCP contract** (strangler fixed point; structure-freeze) | tracked |
| `docs/v3/GLOSSARY.md` | v3 base vocabulary — still binding for terms not superseded by v4 resolutions | tracked |
| `docs/v4/PERFORMANCE_LADDER.md` | Performance execution authority (PF0/PF1 active in the queue; PF2+ parked) | tracked |
| `docs/v4/PERF_STACK_AUDIT.md` | Performance diagnosis (the perf source of truth) | tracked |
| `docs/v4/AGENTS.md` | v4 subtree contract | tracked |
| `AGENTS.md` (root) + all subtree `AGENTS.md` | DOX work contracts per subtree | tracked |
| `PRODUCT.md`, `DESIGN.md` | Product + visual taste rails (not runtime authority) | tracked |

---

## 3. REFERENCE — informs, not execution authority

| Doc / group | Why reference, not authority |
|---|---|
| `REBUILD_STRATEGY_AUDIT.md` | The rebuild **decision** + §F boundary map + §L agent rules — the *why*. Execute from `REBUILD_QUEUE.md`, not from this. |
| `QUANTFLOW_STABILIZATION_PLAN.md` | Phasing **governance/rationale** (P0–P5, gates, risk register). The reconciled order now lives in `REBUILD_QUEUE.md`. |
| `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md` | Original diagnosis (background; several findings now resolved or queued). |
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

## 5. Version-control gap — RESOLVED (2026-06-24)

The foundational docs that were untracked are now committed (`4154ac0`), and
`REBUILD_QUEUE.md` is committed alongside this update. The rebuild foundation is
durable in git on `quantflow-v4`. Local agent tooling and generated binaries are
deliberately git-ignored (see `.gitignore`).

---

## 6. Drift already corrected (2026-06-24)

- `ARCHITECTURE.md` retired from root → archived to `reference/v3-superseded/`. References calling it "the root `ARCHITECTURE.md`" are stale.
- Receipt/event vocabulary aligned across the four rebuild docs (receipts = proof, not an event-sourcing truth store).
- `REBUILD_QUEUE.md` created as the single **active execution queue** (reconciles the three phase numberings into Stage A→H); `REBUILD_STRATEGY_AUDIT.md` + `QUANTFLOW_STABILIZATION_PLAN.md` demoted to REFERENCE (*why/governance*); a `G-safe` gate added to `START_HERE.md` §9.
- `docs/v4/GLOSSARY.md` promoted (chunk A1) as canonical v4 vocabulary; founder approved rename map 2026-06-25 (A2/A3/Stage D split documented in glossary).
- `docs/v4/KERNEL_CONTRACT.md` added (chunk A2) as frozen Kernel strangler contract.

*Keep this map short. When a doc's status changes, update the row here in the same change.*
