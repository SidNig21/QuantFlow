# src/harness — Agent Guide

The Harness Layer is the worker/runtime adapter boundary for QuantFlow v3.

## What This Subtree Owns

- `WorkerHarness` interface definition.
- Harness adapter implementations: `local-shell`, `herdr-shell`, `pi`, and future adapters.
- Harness registry.
- Worker spawn/send/stop contracts.
- Per-adapter receipt and StateCard production logic.

### Built (Goal 6A — minimal registry/config)

- `local-shell/index.ts`, `herdr-shell/index.ts` descriptors; `registry.ts`
  `HARNESS_DESCRIPTORS` + `resolveHarnessKind`. The Kernel seeds the `harnesses`
  table from these descriptors and references harness ids — never execution code.

### Built (Goal 6 — full WorkerHarness contract)

- `types.ts` — full `WorkerHarness` (spawn/send/readState/collectReceipts/stop),
  `SpawnWorkerInput` (role/harness/model + permissions/skills/env/cwd/activation,
  all separate), `WorkerHandle`, `WorkerMessage`, `PartialStateCard`,
  `ReceiptDraft`, and `HarnessRuntimeOps` — the single injected runtime seam.
- `shell-harness.ts` — `createShellHarness(kind, ops)`: one implementation of the
  contract for both shell kinds, parameterized by kind; differences live in ops.
- `local-shell/index.ts`, `herdr-shell/index.ts` — `createLocalShellHarness(ops)`
  / `createHerdrShellHarness(ops)` factories over the shared impl.
- `registry.ts` — `createHarness(kind, ops)` builds a live adapter; throws for
  unknown/deferred kinds.

Adapters import NO Electron/renderer code: the live ops wrap the approved shell
role-spawn path (gated by `kernel.worker.spawn`), PTY/herdr send, and Kernel
queries/commands; tests inject fakes (see `scripts/harness-interface-smoke.ts`).

The live `HarnessRuntimeOps` binding lives in the app layer, not here:
`quantflow-electron/src/main/harness-ops.ts` (`createLiveHarnessOps(deps)`, pure
DI) + `harness-service.ts` (`getWorkerHarness(kind)` wiring the real bindings).
The `getWorkerHarness(kind)` seam is **wired and unit-proven** by
`harness-ops.test.ts`, but no Conductor action path calls `send` yet —
`conductor-actions.ts` only does Kernel task transitions. **v4 Goal R1 is what
actually wires `assign → harness.send`.** Until then, treat the send seam as
available-but-uncalled (do not assume the live delegation flow uses it).
`readState` reads the Kernel State Card (never log scraping); `collectReceipts`
returns drafts the caller posts via `kernel.receipt.post`.

**Pi is deferred.** A stable, approved Pi programmatic spawn/send/read contract
is not available in this increment, so `pi` is NOT registered (no `src/harness/pi`).
Adding it later must not make Pi mandatory for the core app. Codex/Claude-code
adapters remain out of scope until their local contracts are stable.

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
- Post receipts outside the Kernel receipt path. Envoy may be wrapped/bridged only as legacy transport, not as a second authority.
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
