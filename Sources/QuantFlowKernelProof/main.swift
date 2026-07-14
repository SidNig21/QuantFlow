import Foundation
import Darwin
import QuantFlowCore
import QuantFlowCanvas
import QuantFlowConductor

@main
struct KernelProofMain {
    static func main() {
        do {
            let kernel = try KernelStore.inMemory()
            let workflow = try kernel.dispatch(.createWorkflow(name: "M1 proof", objective: "Prove the native Kernel"))
            let eve = try kernel.dispatch(.createTile(workflowID: workflow.subjectID, displayName: "Eve", kind: .worker, x: 20, y: 40))
            let worker = try kernel.dispatch(.createWorker(tileID: eve.subjectID, role: "agent", harness: "agentos", model: "eve"))
            _ = try kernel.dispatch(.bindWorkerRuntime(workerID: worker.subjectID, actorID: "actor-proof", sessionID: "session-proof", promptable: false))
            let evePeer = try kernel.dispatch(.createTile(workflowID: workflow.subjectID, displayName: "Eve peer", kind: .worker, x: 480, y: 40))
            let peerWorker = try kernel.dispatch(.createWorker(tileID: evePeer.subjectID, role: "agent", harness: "agentos", model: "eve"))
            _ = try kernel.dispatch(.bindWorkerRuntime(workerID: peerWorker.subjectID, actorID: "actor-peer-proof", sessionID: "session-peer-proof", promptable: false))
            let attached = try kernel.snapshot(workflowID: workflow.subjectID).workers.first { $0.id == worker.subjectID }
            guard attached?.runtimeActorID == "actor-proof", attached?.runtimeSessionID == "session-proof" else { throw KernelError.database("runtime binding was not queryable") }
            let projection = try CanvasProjection(kernel: kernel, workflowID: workflow.subjectID)
            let conductor = try ConductorProjection(kernel: kernel, workflowID: workflow.subjectID)
            projection.activate()
            conductor.activate()
            projection.move(try kernel.snapshot(workflowID: workflow.subjectID).tiles[0], to: CGPoint(x: 360, y: 240))
            let task = try kernel.dispatch(.createTask(workflowID: workflow.subjectID, title: "Verify the Kernel", objective: "Pass every task gate"))
            for status in [TaskStatus.claimed, .working, .submitted, .verifying] {
                _ = try kernel.dispatch(.transitionTask(taskID: task.subjectID, to: status))
            }
            do {
                _ = try kernel.dispatch(.transitionTask(taskID: task.subjectID, to: .complete))
                try require(false, "completion bypassed verification evidence")
            } catch KernelError.database {
                // Expected: the verification receipt is the required gate.
            }
            _ = try kernel.dispatch(.postReceipt(workflowID: workflow.subjectID, taskID: task.subjectID, type: .verificationPassed, summary: "Native SQLite proof passed."))
            _ = try kernel.dispatch(.transitionTask(taskID: task.subjectID, to: .complete))
            _ = try kernel.dispatch(.createConnection(workflowID: workflow.subjectID, fromTileID: eve.subjectID, toTileID: evePeer.subjectID, semantic: .contextFlow, label: "session cable"))

            let snapshot = projection.snapshot
            try require(snapshot.tiles.first?.x == 360 && snapshot.tiles.first?.y == 240, "tile move did not persist")
            try require(snapshot.workers.count == 2, "two bound Eve workers were not stored")
            try require(snapshot.tasks.first?.status == .complete, "task did not reach complete through verification")
            try require(snapshot.receipts.count == 7, "receipt chain is incomplete")
            try require(snapshot.connections.first?.semantic == .contextFlow, "session-scoped cable connection was not stored")
            try require((try kernel.events(workflowID: workflow.subjectID)).count == 16, "event chain is incomplete")
            try require(conductor.snapshot.tasks.first?.status == .complete, "read-only Conductor did not observe Kernel truth")
            print("M6 KERNEL PROOF PASSED · SQLite commands, runtime bindings, typed cable, projections, receipts, and task gates are live.")
        } catch {
            fputs("M1 KERNEL PROOF FAILED: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }

    private static func require(_ condition: Bool, _ message: String) throws {
        if !condition { throw ProofError(message: message) }
    }
}

private struct ProofError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
