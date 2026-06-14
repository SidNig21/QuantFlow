# src/harness — Agent Guide

The Harness Layer is the worker/runtime adapter boundary for QuantFlow v3.

## What This Subtree Owns

- `WorkerHarness` interface definition.
- Harness adapter implementations: `local-shell`, `herdr-shell`, `pi`, and future adapters.
- Harness registry.
- Worker spawn/send/stop contracts.
- Per-adapter receipt and StateCard production logic.

## Authority Rules

```text
role ≠ harness ≠ model.
Harness-specific assumptions must not leak into Kernel.
Each adapter must produce receipts/state-card updates through the same contract.
Do not make Pi, Codex, Claude Code, or Hermes profiles mandatory for the core architecture.
```

## What This Subtree Must Not Do

- Define canonical task/receipt/StateCard schemas (those belong in `src/kernel/`).
- Bypass the task `submitted → verifying` gate.
- Fuse role, harness, and model into a single profile object.
- Make any one harness a required dependency for the core app.
- Post receipts outside the Kernel/Envoy path.
- Import renderer state.

## Interface Shape (Goal 6)

```ts
interface WorkerHarness {
  kind: string;
  spawn(input: SpawnWorkerInput): Promise<WorkerHandle>;
  send(handle: WorkerHandle, message: WorkerMessage): Promise<void>;
  readState(handle: WorkerHandle): Promise<PartialStateCard>;
  collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]>;
  stop(handle: WorkerHandle): Promise<void>;
}
```

All adapters implement this interface. The Kernel does not know which adapter is in use.

## Read Order Before Editing This Subtree

1. Root `AGENTS.md`
2. `BUILD_PLAN_V3.md`
3. `KERNEL_CONSTITUTION.md`
4. `docs/v3/GLOSSARY.md`
5. This file
6. Relevant harness source files

## DOX Rule

Before editing: walk this chain.

After meaningful changes: update this file if local rules or owned scope changed.
