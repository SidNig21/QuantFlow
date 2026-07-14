import Observation
import SwiftUI
import QuantFlowCore
import QuantFlowCanvas

@MainActor
@Observable
final class AppSession {
    let kernel: KernelStore
    let projection: CanvasProjection

    init() {
        do {
            let location = try Self.databaseLocation()
            let kernel = try KernelStore(path: location.path)
            let workflowID: KernelID
            if let existing = try kernel.workflows().first {
                workflowID = existing.id
            } else {
                workflowID = try kernel.dispatch(.createWorkflow(
                    name: "QuantFlow for Mac",
                    objective: "Operate autonomous work with visible evidence."
                )).subjectID
            }
            if try kernel.snapshot(workflowID: workflowID).tiles.isEmpty {
                try Self.seed(kernel: kernel, workflowID: workflowID)
            }
            self.kernel = kernel
            self.projection = try CanvasProjection(kernel: kernel, workflowID: workflowID)
            projection.activate()
        } catch {
            fatalError("QuantFlow could not open its Kernel: \(error.localizedDescription)")
        }
    }

    private static func databaseLocation() throws -> URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "QuantFlow")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root.appending(path: "kernel.sqlite")
    }

    private static func seed(kernel: KernelStore, workflowID: KernelID) throws {
        let conductor = try kernel.dispatch(.createTile(workflowID: workflowID, displayName: "Conductor", kind: .conductor, x: 180, y: 190))
        let eve = try kernel.dispatch(.createTile(workflowID: workflowID, displayName: "Eve", kind: .worker, x: 510, y: 280))
        let evidence = try kernel.dispatch(.createTile(workflowID: workflowID, displayName: "Evidence", kind: .viewer, x: 820, y: 410))
        _ = try kernel.dispatch(.createWorker(tileID: eve.subjectID, role: "agent", harness: "runtime-pending", model: "eve"))
        _ = try kernel.dispatch(.createTask(workflowID: workflowID, title: "Build the Mac canvas", objective: "Project Kernel truth without a second store."))
        _ = try kernel.dispatch(.createConnection(workflowID: workflowID, fromTileID: conductor.subjectID, toTileID: eve.subjectID, semantic: .delegation, label: "plan"))
        _ = try kernel.dispatch(.createConnection(workflowID: workflowID, fromTileID: eve.subjectID, toTileID: evidence.subjectID, semantic: .receiptHandoff, label: "prove"))
    }
}

struct MacShellView: View {
    @Bindable var session: AppSession

    var body: some View {
        NavigationSplitView {
            List {
                Section("QUANTFLOW") {
                    Label("Operator Console", systemImage: "point.3.connected.trianglepath.dotted")
                        .font(.headline)
                }
                Section("KERNEL") {
                    Label("SQLite truth", systemImage: "cylinder.split.1x2")
                    Label("\(session.projection.snapshot.tiles.count) tiles", systemImage: "square.grid.2x2")
                    Label("\(session.projection.snapshot.receipts.count) receipts", systemImage: "checkmark.seal")
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("QuantFlow")
        } detail: {
            WorkflowCanvas(projection: session.projection)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: session.projection.addEve) {
                    Label("Add Eve", systemImage: "plus")
                }
            }
        }
    }
}
