import Observation
import SwiftUI
import QuantFlowCore
import QuantFlowCanvas
import QuantFlowRuntime
import QuantFlowConductor
import QuantFlowHarness

@MainActor
@Observable
final class AppSession {
    let kernel: KernelStore
    let projection: CanvasProjection
    let conductor: ConductorProjection
    private let harness = NativeEveHarness()
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
            self.conductor = try ConductorProjection(kernel: kernel, workflowID: workflowID)
            projection.activate()
            conductor.activate()
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
                    let attached = try await harness.attach(workflowID: projection.workflowID, tileID: tile.subjectID)
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
        return try await harness.prompt(endpoint: .init(workflowID: worker.workflowID, tileID: worker.tileID, sessionID: sessionID), text: text)
    }

    /// A Canvas connection is the operator's explicit permission for a peer
    /// exchange. The runtime never discovers or persists Kernel connections.
    func exchangeEveCable(connectionID: KernelID, fromWorkerID: KernelID, text: String) async throws -> String {
        guard let connection = projection.snapshot.connections.first(where: { $0.id == connectionID }) else {
            throw KernelError.missing(connectionID)
        }
        guard let from = projection.snapshot.workers.first(where: { $0.id == fromWorkerID }),
              let fromSessionID = from.runtimeSessionID,
              from.tileID == connection.fromTileID || from.tileID == connection.toTileID else {
            throw RuntimeError.rejected("The source worker is not a bound endpoint of this cable.")
        }
        let targetTileID = from.tileID == connection.fromTileID ? connection.toTileID : connection.fromTileID
        guard let target = projection.snapshot.workers.first(where: { $0.tileID == targetTileID && $0.model == "eve" }),
              let targetSessionID = target.runtimeSessionID else {
            throw RuntimeError.rejected("The target cable endpoint has no bound Eve session.")
        }
        // Sessions are validated above so the harness is given only Kernel-
        // authorized runtime endpoints.
        return try await harness.relay(
            from: .init(workflowID: from.workflowID, tileID: from.tileID, sessionID: fromSessionID),
            to: .init(workflowID: target.workflowID, tileID: target.tileID, sessionID: targetSessionID),
            text: text
        )
    }
}

struct MacShellView: View {
    @Bindable var session: AppSession
    @State private var showingEveSession = false

    var body: some View {
        NavigationSplitView {
            DockCatalogueSidebar(session: session)
        } detail: {
            HStack(spacing: 0) {
                WorkflowCanvas(projection: session.projection)
                Divider()
                ConductorInspectorView(conductor: session.conductor)
            }
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
        .preferredColorScheme(.dark)
    }
}

private struct DockCatalogueSidebar: View {
    @Bindable var session: AppSession

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 4).fill(QuantFlowTheme.lime.opacity(0.16))
                    Image(systemName: "point.3.connected.trianglepath.dotted").font(.caption).foregroundStyle(QuantFlowTheme.lime)
                }
                .frame(width: 24, height: 24)
                VStack(alignment: .leading, spacing: 1) {
                    Text("QUANTFLOW").font(.caption.weight(.bold)).tracking(1.8)
                    Text("LOCAL OPERATOR BUILD").font(.system(size: 8, weight: .medium)).tracking(0.8).foregroundStyle(.secondary)
                }
                Spacer()
                Text("V8").font(.caption2.monospaced()).foregroundStyle(QuantFlowTheme.cyan)
            }
            .padding(14)

            Divider().overlay(QuantFlowTheme.line)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    sidebarHeading("DOCK CATALOGUE", detail: "01 PROMOTED SPECIES")
                    Button(action: session.spawnEve) {
                        HStack(spacing: 10) {
                            ZStack {
                                Circle().fill(QuantFlowTheme.lime.opacity(0.14))
                                Image(systemName: "sparkles").foregroundStyle(QuantFlowTheme.lime)
                            }
                            .frame(width: 32, height: 32)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Eve").font(.subheadline.weight(.semibold))
                                Text(session.canSpawnEve ? "AGENTOS · READY" : "AGENTOS · STANDBY")
                                    .font(.system(size: 8, weight: .bold)).tracking(0.8)
                                    .foregroundStyle(session.canSpawnEve ? QuantFlowTheme.lime : .secondary)
                            }
                            Spacer()
                            Circle().fill(session.canSpawnEve ? QuantFlowTheme.lime : Color.secondary.opacity(0.5)).frame(width: 5, height: 5)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(QuantFlowTheme.panelRaised, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 8).stroke(QuantFlowTheme.line, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .disabled(!session.canSpawnEve)

                    sidebarHeading("TEMPLATES", detail: "FUTURE WORKFLOW RECIPES")
                    VStack(alignment: .leading, spacing: 7) {
                        Label("No saved templates yet", systemImage: "rectangle.stack.badge.plus")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Field-tested workflows will appear here after they earn a place in the catalogue.")
                            .font(.caption2)
                            .foregroundStyle(.secondary.opacity(0.8))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(10)
                    .background(QuantFlowTheme.canvas.opacity(0.45), in: RoundedRectangle(cornerRadius: 8))

                    sidebarHeading("KERNEL", detail: "LIVE TRUTH")
                    HStack(spacing: 8) {
                        kernelMetric("TILES", "\(session.projection.snapshot.tiles.count)")
                        kernelMetric("RECEIPTS", "\(session.projection.snapshot.receipts.count)")
                    }
                }
                .padding(14)
            }

            Spacer(minLength: 0)
            Divider().overlay(QuantFlowTheme.line)
            HStack(alignment: .top, spacing: 7) {
                Circle().fill(session.runtimePromptable ? QuantFlowTheme.lime : Color.orange).frame(width: 5, height: 5).padding(.top, 4)
                Text(session.runtimeNotice ?? "Starting native runtime…").font(.caption2).foregroundStyle(.secondary).lineLimit(3)
            }
            .padding(12)
        }
        .frame(minWidth: 236, idealWidth: 252, maxWidth: 280, maxHeight: .infinity, alignment: .topLeading)
        .background(QuantFlowTheme.panel)
    }

    private func sidebarHeading(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 9, weight: .bold)).tracking(1.3).foregroundStyle(QuantFlowTheme.cyan)
            Text(detail).font(.system(size: 8, weight: .medium)).tracking(0.7).foregroundStyle(.secondary)
        }
    }

    private func kernelMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 16, weight: .medium, design: .monospaced)).foregroundStyle(.primary)
            Text(label).font(.system(size: 8, weight: .bold)).tracking(0.7).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(QuantFlowTheme.canvas.opacity(0.45), in: RoundedRectangle(cornerRadius: 6))
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
        .background(QuantFlowTheme.canvas)
        .preferredColorScheme(.dark)
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
