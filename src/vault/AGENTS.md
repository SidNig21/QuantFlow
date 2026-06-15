# src/vault — Agent Guide

The vault integration is the knowledge mirror layer for QuantFlow v3.

## What This Subtree Owns

- OKF-style Markdown exporters for workflows, tasks, artifacts, receipts, and StateCards.
- Vault sync logic (writing to Obsidian vault paths).
- Export templates and frontmatter schemas.
- Vault path resolution (mapping Kernel IDs to vault note paths).

### Implemented (Goal 8)

Three layers, kept separate so formatting stays pure and testable:

- `index.ts` — `collectVaultExport(db, workflowId)` (Kernel read → bundle),
  `renderVaultExport(bundle)` (pure → `VaultExportFile[]`),
  `writeVaultExports(files, outDir, ops, join)` (thin, injectable fs boundary),
  and the `exportWorkflowToVault` convenience. `types.ts` defines the bundle +
  export types (Kernel snapshots imported type-only).
- `okf/frontmatter.ts` — deterministic YAML frontmatter + ISO/cell/one-line
  helpers. No clock: timestamps are Kernel-derived so exports are byte-stable.
- `exporters/` — pure formatters: `workflow-summary`, `task-summary`,
  `artifact-index`, `decision-log`, `receipt-chain`, `state-card-snapshot`,
  plus `shared.ts` (receipt classification). 
- Spec: `docs/v3/VAULT_OKF_SPEC.md`. Proof: `bun run smoke:vault-export`.

The exporter reads the Kernel only; it does **not** read from, depend on, or
extend the legacy Envoy Obsidian mirror.

## Authority Rules

```text
Vault is a knowledge mirror, not live state.
Do not make Obsidian Markdown the source of operational truth.
Vault exports must preserve workflow/task/receipt IDs.
```

## What This Subtree Must Not Do

- Read vault Markdown files as the source of task/workflow/receipt state.
- Use vault file paths as canonical IDs for Kernel state.
- Write vault exports that omit `workflow_id`, `task_id`, or `receipt_id`.
- Implement live coordination through vault files.
- Replace SQLite with vault files.

## Export Frontmatter Contract

Every vault export must include:

```yaml
---
type: <workflow_summary | task_summary | artifact_index | receipt_chain | state_card_snapshot | decision_log>
workflow_id: wf_...
task_id: task_...       # when applicable
receipt_count: <n>      # when applicable
created_at: <ISO 8601>
---
```

This ensures Kernel state and vault exports remain traceable to each other.

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. `VAULT.md` for vault pairing and path conventions
6. This file
7. Relevant vault source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
