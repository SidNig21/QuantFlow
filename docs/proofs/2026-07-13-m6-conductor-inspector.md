# M6 Conductor and Inspector Proof

**Status:** passed locally on 2026-07-13

`QuantFlowConductor` is a separate read-only projection module. It subscribes
to Kernel events and refreshes its workflow snapshot through queries; it has no
command dispatch, planner database, or runtime mutation path.

The SwiftUI inspector displays the same task, worker, and receipt projections
beside the canvas. `QuantFlowKernelProof` creates and completes a task, then
asserts the Conductor projection observes that completed task through the
Kernel event stream.
