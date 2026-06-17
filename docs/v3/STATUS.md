# QuantFlow v3 — Status & History (agent orientation)

Start here to understand **what v3 is, what already shipped, and where we are
now.** This is a living snapshot, not authority — `BUILD_PLAN_V3.md` (scope) and
`KERNEL_CONSTITUTION.md` (rules) remain the authority documents.

## What v3 is

An **authority refactor, not a rewrite.** The runtime Kernel (SQLite, `kernel.db`)
is the single source of truth; the infinite canvas projects it.

```text
intent → Kernel command → Kernel write → Kernel event → renderer re-renders
```

Kernel owns truth · Canvas renders · Conductor plans · Workers execute ·
Receipts prove · State Cards summarize · Harnesses adapt runtimes · MCP is an
external adapter · Vault is a durable mirror.

## Where we are now (2026-06)

**The v3 build ladder is functionally complete.** Goals 0–9 are implemented; the
only remaining rung, Goal 10 (cloud/remote tier), is **intentionally parked**
(planning-only until explicitly authorized). The project is pivoting from
goal-by-goal building to **dogfooding** — running the product to find what's
missing — after which new build plans are written.

New ideas/gaps discovered while using the product go in
[`INCOMING_GOALS.md`](INCOMING_GOALS.md) (a backlog, not authority). They become
real work only when promoted into `BUILD_PLAN_V3.md` and authorized.

## What shipped, goal by goal

| Goal | What it delivered |
| --- | --- |
| 0 | Branch, v3 plan files, DOX `AGENTS.md` rails. |
| 1 | Kernel Constitution + canonical schema (`docs/v3/KERNEL_SCHEMA_V1.md`, `migrations/001`). |
| 2 | Kernel command boundary; canvas mutations gate through awaited Kernel commands. |
| 3 | Task state machine with `submitted`/`verifying` gates + verification receipts. |
| 4 | Kernel-owned State Cards + flip-tile UI (terminal front / State Card back). |
| 5A | Read-only embedded Conductor (reads Kernel, posts only `planning` receipts). |
| 6A | Worker spawn reconciliation: `worker_instances` is authoritative identity. |
| 5C | Conductor single-step native actions (create/assign/verify/spawn/connect). |
| 6 | WorkerHarness interface + local-shell / herdr-shell adapters + live ops seam. |
| 5D | Approval-gated Conductor loop with proposal-token binding. |
| 7 | Workflow regions + semantic strings on the canvas (Kernel-backed projection). |
| 8 | Vault OKF export: Kernel receipt chains → deterministic Obsidian Markdown. |
| 9 | Evaluation Layer v1: `evaluations` table + pure deterministic evaluator. |
| 10 | Cloud/remote tier — **parked.** |

Authoritative completion/approval status lives in the `BUILD_PLAN_V3.md` ledger
(verifier-owned). Goals 0–9 are approved and pushed.

## Where things live

| Layer | Path | Role |
| --- | --- | --- |
| Kernel (truth) | `src/kernel/` | schema, commands, queries, tasks, receipts, state-cards, watchers, worker-instances, conductor, workflows, evals, `database.ts` (migrations) |
| Renderer (projector) | `src/renderer/` | framework-agnostic view contracts (`@qf-renderer`) |
| Conductor (planner) | `src/main/conductor/` | reader, actions, loop, IPC |
| Harness (adapters) | `src/harness/` | local-shell / herdr-shell, registry, types |
| Vault (mirror) | `src/vault/` | OKF exporters (Goal 8) |
| Evals (derived) | `src/evals/` | pure evaluator + rubrics (Goal 9) |
| Live app | `quantflow-electron/` | Electron shell, IPC, smokes under `scripts/` |
| MCP (external) | `tools/quantflow-mcp/` | external agent adapter |

## Verification surface

Smokes live in `quantflow-electron/scripts/` and are wired as
`bun run smoke:<name>` (kernel-task, state-card, conductor, conductor-actions,
conductor-loop, worker-harness, harness-interface, workflow-region,
vault-export, eval). Plus `bun test src/main/harness-ops.test.ts`, MCP
`node --test` in `tools/quantflow-mcp`, and `bun run build` in
`quantflow-electron`.

## Authority vs reference (so you don't read the wrong thing)

- **Authority:** `BUILD_PLAN_V3.md`, `KERNEL_CONSTITUTION.md`, `docs/v3/*`, the
  `AGENTS.md` chain. UI taste: `PRODUCT.md`, `DESIGN.md`.
- **Reference only:** `BUILD_PLAN_V2.md`, `ENVOY.md`, and everything under
  `reference/` (archived v2 charters, shipped-context, superseded planning,
  GoalBuddy run notes). Never execute from `reference/`.
