# QuantFlow for Mac

QuantFlow is a native macOS operator console for autonomous work. Its canvas
makes workflows, workers, connections, decisions, and evidence visible without
turning the UI into a second source of truth.

This branch is the Mac rebuild. The Windows/Electron/WSL implementation is
preserved under [`reference/windows-superseded/`](reference/windows-superseded/)
for archaeology only.

## Architecture

```text
Swift Kernel (SQLite) → SwiftUI Canvas → Conductor / Inspector
                              ↕
                    native macOS Node sidecar
                    (Rivet AgentOS + shared Eve server)
```

- **Kernel** — the only durable workflow truth; commands mutate, queries read,
  receipts and events prove transitions.
- **Canvas** — a SwiftUI projection of Kernel snapshots. It does not own tiles,
  tasks, or connections.
- **Conductor** — read-only planning and operator-triggered actions through the
  Kernel command boundary.
- **Harness** — the sole runtime adapter boundary.

## Status

The active build ladder is [the Mac-native rebuild plan](docs/plans/2026-07-13-002-arch-quantflow-mac-native-rebuild-plan.md).
M0 provides the native app shell and archived Windows execution material. M1 is
complete: `QuantFlowCore` provides one SQLite Kernel with command audit rows,
query snapshots, append-only receipts/events, and the enforced task gate. M2
adds the native pan/zoom SwiftUI canvas: drag operations refresh through the
event-driven `QuantFlowCanvas` projection rather than local tile state.

## Development

Open `Package.swift` in Xcode 16+ and run the `QuantFlow` executable, or use:

```bash
swift run QuantFlow
swift run QuantFlowKernelProof
```

The full read order is in [START_HERE_MAC.md](START_HERE_MAC.md).
