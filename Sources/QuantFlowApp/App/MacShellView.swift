import Observation
import SwiftUI
import QuantFlowCore
import QuantFlowCanvas
import QuantFlowRuntime

@MainActor
@Observable
final class AppSession {
    let kernel: KernelStore
    let projection: CanvasProjection
    private let runtime = RuntimeClient()
    private let runtimeSupervisor = RuntimeSupervisor()
    var runtimeNotice: String?
    var isSpawningEve = false
    var runtimePromptable = false
    var canSpawnEve: Bool { runtimePromptable && !isSpawningEve }

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

    func spawnEve() {
        guard canSpawnEve else {
            runtimeNotice = "Eve dock is unavailable until the native runtime is promptable. Set OPENCODE_GO_API_KEY and restart it."
            return
        }
        isSpawningEve = true
        runtimeNotice = "Creating Eve tile…"
        do {
            let position = CGPoint(x: 350 + Double(projection.snapshot.tiles.count * 40), y: 520)
            let tile = try kernel.dispatch(.createTile(workflowID: projection.workflowID, displayName: "Eve", kind: .worker, x: position.x, y: position.y))
            let worker = try kernel.dispatch(.createWorker(tileID: tile.subjectID, role: "agent", harness: "agentos", model: "eve"))
            Swift.Task {
                do {
                    let attached = try await runtime.createAgentOSEveSession(workflowID: projection.workflowID, tileID: tile.subjectID)
                    _ = try kernel.dispatch(.bindWorkerRuntime(workerID: worker.subjectID, actorID: attached.actorID, sessionID: attached.sessionID, promptable: attached.promptable))
                    runtimeNotice = attached.promptable
                        ? "Eve is attached and promptable."
                        : "Eve is attached. Set OPENCODE_GO_API_KEY, then restart the local runtime to prompt it."
                } catch {
                    runtimeNotice = "Eve tile exists, but runtime attachment failed: \(error.localizedDescription)"
                }
                isSpawningEve = false
            }
        } catch {
            isSpawningEve = false
            runtimeNotice = "Could not create Eve tile: \(error.localizedDescription)"
        }
    }

    func startRuntime() async {
        switch await runtimeSupervisor.startIfNeeded() {
        case let .alreadyRunning(promptable):
            runtimePromptable = promptable
            runtimeNotice = promptable ? "Native runtime is already promptable." : "Native runtime is ready; add OPENCODE_GO_API_KEY to make Eve promptable."
        case let .started(promptable):
            runtimePromptable = promptable
            runtimeNotice = promptable ? "Native runtime started and is promptable." : "Native runtime started; add OPENCODE_GO_API_KEY to make Eve promptable."
        case .configurationRequired:
            runtimePromptable = false
            runtimeNotice = "Set QUANTFLOW_RUNTIME_ROOT to tools/agentos-host-mac, or start the local runtime separately."
        case let .unavailable(message):
            runtimePromptable = false
            runtimeNotice = "Native runtime unavailable: \(message)"
        }
    }

    func latestEveWorker() -> WorkerInstance? {
        projection.snapshot.workers.last { $0.model == "eve" && $0.runtimeSessionID != nil }
    }

    func promptEve(_ worker: WorkerInstance, text: String) async throws -> String {
        guard let sessionID = worker.runtimeSessionID else { throw RuntimeError.rejected("This Eve tile has no runtime session.") }
        return try await runtime.promptEve(workflowID: worker.workflowID, tileID: worker.tileID, sessionID: sessionID, text: text).text
    }
}

struct MacShellView: View {
    @Bindable var session: AppSession
    @State private var showingEveSession = false

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
                Section("DOCK") {
                    Button(action: session.spawnEve) {
                        Label("Eve", systemImage: "sparkles")
                    }
                    .disabled(!session.canSpawnEve)
                }
                if let notice = session.runtimeNotice {
                    Section("RUNTIME") { Text(notice).font(.caption).foregroundStyle(.secondary) }
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("QuantFlow")
        } detail: {
            WorkflowCanvas(projection: session.projection)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: session.spawnEve) {
                    Label(session.isSpawningEve ? "Attaching Eve" : "Add Eve", systemImage: "plus")
                }
                .disabled(!session.canSpawnEve)
            }
            ToolbarItem(placement: .primaryAction) {
                Button { showingEveSession = true } label: {
                    Label("Eve Session", systemImage: "text.bubble")
                }
                .disabled(session.latestEveWorker() == nil)
            }
        }
        .sheet(isPresented: $showingEveSession) { EveSessionPanel(session: session) }
        .task { await session.startRuntime() }
    }
}

private struct EveSessionPanel: View {
    @Bindable var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var prompt = ""
    @State private var transcript: [String] = []
    @State private var isSending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading) {
                    Text("Eve session").font(.title3.weight(.semibold))
                    Text("Display-only runtime transcript; Kernel owns workflow truth.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if transcript.isEmpty { Text("Ready for a prompt.").foregroundStyle(.secondary) }
                    ForEach(Array(transcript.enumerated()), id: \.offset) { _, entry in
                        Text(entry).textSelection(.enabled).padding(9).frame(maxWidth: .infinity, alignment: .leading).background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
            HStack(alignment: .bottom) {
                TextField("Message Eve", text: $prompt, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(1...4)
                Button("Send") { send() }.disabled(isSending || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(minWidth: 540, minHeight: 380)
    }

    private func send() {
        guard let worker = session.latestEveWorker() else { return }
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        prompt = ""; isSending = true; transcript.append("Operator\n\(text)")
        Swift.Task {
            do { transcript.append("Eve\n\(try await session.promptEve(worker, text: text))") }
            catch { transcript.append("Runtime error\n\(error.localizedDescription)") }
            isSending = false
        }
    }
}
