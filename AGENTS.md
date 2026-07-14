# QuantFlow Mac Agent Guide

## Read order

1. `START_HERE_MAC.md` — Mac front door and current scope.
2. `docs/plans/2026-07-13-002-arch-quantflow-mac-native-rebuild-plan.md` — active M0–M7 ladder.
3. `KERNEL_CONSTITUTION.md` — state ownership and mutation rules.
4. `docs/v3/{GLOSSARY,AUTHORITY_RULES,KERNEL_SCHEMA_V1}.md` — canonical primitives and schema.
5. The nearest `AGENTS.md` for the path being changed.

`reference/windows-superseded/` and the Windows anchor branch are archaeological
reference only. Do not execute their plans or revive Electron, WSL, a second
runtime database, actor lanes, or warm-pool workarounds.

## Mac architecture

```text
Kernel owns truth → Canvas projects → Conductor plans → Harness adapts → Receipts prove
```

- The Swift Kernel owns the SQLite database, commands, queries, events, and receipts.
- SwiftUI views render Kernel query snapshots and submit only Kernel commands.
- Conductor is read-only except for explicit operator actions routed through Kernel commands.
- The native Node sidecar is a runtime adapter. It never writes product truth.
- Eve uses a shared, prewarmed server and durable per-tile sessions. Cables identify sessions, never ports.

## Working agreement

- Work one M-rung at a time, with a runnable proof and a commit at the end of each rung.
- Keep macOS support at 14 or later.
- Never mutate a receipt or event after it is written.
- Do not add optimistic canvas state; wait for the Kernel command result/event.
- Keep external runtimes behind the Harness/RuntimeClient boundary.

## Active structure

```text
Sources/QuantFlowCore/
  KernelModels.swift, KernelStore.swift, SQLiteDatabase.swift
Sources/QuantFlowApp/
  App/          SwiftUI application composition and future Canvas projection
Sources/QuantFlowKernelProof/
  standalone M1 command/query acceptance proof
tools/agentos-host-mac/
  native macOS Node runtime sidecar (M3)
```
