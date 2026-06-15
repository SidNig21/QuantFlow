# Vault OKF Export Spec (v3 Goal 8)

How QuantFlow turns Kernel receipt chains and workflow outcomes into durable,
OKF-style Obsidian Markdown. Read with `KERNEL_CONSTITUTION.md`, `src/vault/AGENTS.md`,
and the Goal 8 section of `BUILD_PLAN_V3.md`.

## Export Authority Model

```text
Kernel / SQLite = live truth
Vault Markdown  = durable knowledge mirror (read-only projection of truth)
```

- The exporter **reads** Kernel state and **writes** Markdown. It never reads
  vault files as truth and never writes Kernel state.
- The vault is not a source of truth. Nothing in the app reads these files back
  to drive coordination.
- The exporter does **not** read from, depend on, or extend the legacy Envoy
  Obsidian mirror. Envoy is shipped-behavior reference only; Goal 8 exports the
  Kernel receipt chain, not the Envoy mirror.
- No live coordination through Markdown, no RL trajectory export, no cloud /
  DuckDB / MotherDuck, no evaluation scoring (Goal 9).

## Layering

1. `collectVaultExport(db, workflowId)` → reads Kernel queries into a
   `VaultExportBundle` (workflow, region, tasks, receipts, artifacts, state
   cards, workflow timestamps). Lists are sorted deterministically here.
2. `renderVaultExport(bundle)` → **pure**: bundle → `VaultExportFile[]`. No DB,
   no fs, no clock.
3. `writeVaultExports(files, outDir, ops, join)` → thin file-write boundary with
   an injectable `{ mkdir, writeFile }` so the write path is testable.

`exportWorkflowToVault(...)` chains all three.

## Output Directory and File Naming

Exports are written under an export root, one folder per workflow:

```text
<root>/<workflow_id>/workflow_summary.md
<root>/<workflow_id>/receipt_chain.md
<root>/<workflow_id>/artifact_index.md
<root>/<workflow_id>/decision_log.md
<root>/<workflow_id>/state_card_snapshot.md
<root>/<workflow_id>/tasks/<task_id>.md      # one task_summary per task
```

Paths are derived from canonical Kernel ids, so re-export overwrites the same
files (idempotent).

## Frontmatter Schema

Every file opens with a YAML frontmatter block. Key order is fixed (never
sorted) for stable diffs; `null`/absent fields are omitted.

```yaml
---
type: <workflow_summary | task_summary | artifact_index | decision_log | receipt_chain | state_card_snapshot>
workflow_id: <wf id>
task_id: <task id>          # task_summary only
status: <status>           # workflow_summary, task_summary
receipt_count: <n>         # when applicable
artifact_count: <n>        # artifact_index, workflow_summary
created_at: <ISO 8601 UTC> # Kernel-derived, never wall-clock
updated_at: <ISO 8601 UTC> # when applicable
---
```

### Timestamps and Determinism

All timestamps derive from Kernel rows (`created_at`, `updated_at`, task
lifecycle stamps). The exporter contains **no wall-clock generation time**, so
re-running over unchanged Kernel state yields byte-identical files. This is a
hard requirement: exports must be deterministic and easy to diff.

## ID Preservation Rules

- `workflow_id`, `task_id`, `receipt_id`, and `artifact_id` appear verbatim in
  frontmatter and/or body — never renamed, hashed, or replaced by vault paths.
- Every derived claim (decision, verification result, artifact) cites the Kernel
  receipt/artifact id that backs it.
- Vault file paths are an output convenience, never canonical ids.

## Receipt-Chain Mapping

- `receipt_chain.md` lists all workflow receipts **chronologically (oldest
  first)**, tie-broken by id. It is append-only in meaning: a faithful mirror of
  the immutable Kernel chain, never reordered or edited after the fact.
- Each entry renders: ISO timestamp, receipt `type`, receipt `id`, summary, and
  references (task id, parent receipt id, artifact refs).
- Receipt vocabulary follows the Goal 3 task lifecycle plus the Goal 5A
  Conductor `planning` receipt.

## Export Shapes

### workflow_summary.md
Sections: Goal (objective), Status (+ task/receipt/artifact counts), What
happened (receipt-type breakdown), Key decisions (decision receipts), Receipts
(count + pointer to chain), Artifacts (count + pointer to index), Blockers
(blocked task ids + State Card blocker text), Verification results
(verification receipts), Lessons learned (derived only from failed
verifications + standing blockers; "None recorded." when empty), Open follow-ups
(non-terminal tasks).

### task_summary (one per task)
Frontmatter preserves `task_id`, `workflow_id`, `status`, lifecycle stamps.
Body: objective, timeline, the **task-scoped receipt chain**, and task artifacts.

### artifact_index.md
Table of artifacts: artifact id, kind, summary, task id, receipt id, uri.

### decision_log.md
Chronological decisions — Conductor `planning` receipts plus
verification/block/complete/fail receipts — each citing its receipt id and any
`phase`/`proposedAction` metadata.

### receipt_chain.md
See "Receipt-Chain Mapping".

### state_card_snapshot.md
Per-tile Kernel State Cards: status, current task, worker, blocker, next action,
last meaningful update, last receipt id, caveman summary, updated_at. Reflects
the Kernel State Card (compressed current reality), **not** raw terminal logs.

## What Is Explicitly Not Exported

- Raw terminal logs / scrollback.
- Live Envoy mirror state or any Envoy-sourced data.
- Wall-clock export time or other non-deterministic content.
- Evaluation scores / RL trajectories (Goal 9+).
- Anything that would let an agent treat the vault as live coordination state.

## Acceptance

A fresh agent can open the exported Markdown and understand what happened in a
workflow without reading raw terminal logs, while still tracing every claim back
to Kernel ids and receipt evidence. Re-running the export is deterministic.
