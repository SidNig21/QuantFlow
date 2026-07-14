# Kernel

The Kernel is QuantFlow's one durable source of truth.

- All mutations enter through `KernelStore.dispatch(_:)`.
- `workflows`, `tiles`, `worker_instances`, `tasks`, `receipts`, `events`,
  `connections`, and `commands` are Kernel-owned SQLite rows.
- Receipts and events are append-only; SQLite rejects updates and deletes.
- The task state machine lives here, not in SwiftUI or a runtime adapter.
- Queries return projections. Callers may not create an authoritative cache.

Run `swift test` after changing this directory.
