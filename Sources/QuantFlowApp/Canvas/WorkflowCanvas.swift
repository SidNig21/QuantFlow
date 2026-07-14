import SwiftUI
import QuantFlowCore
import QuantFlowCanvas
import QuantFlowHarness

struct WorkflowCanvas: View {
    @Bindable var session: AppSession
    @State private var viewport = CGSize(width: 120, height: 90)
    @GestureState private var pan = CGSize.zero
    @GestureState private var magnification = 1.0
    @State private var baseZoom = 1.0
    @State private var selectedTileID: KernelID?

    private var projection: CanvasProjection { session.projection }
    private var zoom: Double { min(max(baseZoom * magnification, 0.45), 2.4) }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                QuantFlowTheme.canvas.ignoresSafeArea()
                Canvas { context, size in
                    drawGrid(in: &context, size: size)
                    drawConnections(in: &context)
                }
                .allowsHitTesting(false)

                ForEach(projection.snapshot.tiles) { tile in
                    tileSurface(for: tile)
                        .position(screenPoint(for: tile))
                }

                canvasOverlay
                if let error = projection.lastError {
                    Text(error).font(.caption).padding(8).background(.red.opacity(0.8), in: Capsule()).foregroundStyle(.white)
                }
            }
            .contentShape(Rectangle())
            .gesture(panGesture)
            .simultaneousGesture(magnifyGesture)
        }
    }

    @ViewBuilder
    private func tileSurface(for tile: Tile) -> some View {
        if tile.kind == .worker, let worker = projection.snapshot.workers.last(where: { $0.tileID == tile.id && $0.model == "eve" }) {
            EveTerminalTile(
                tile: tile,
                worker: worker,
                session: session,
                isSelected: selectedTileID == tile.id,
                zoom: zoom,
                select: { selectedTileID = tile.id },
                commitMove: { projection.move(tile, to: $0) }
            )
        } else {
            CanvasTileView(
                tile: tile,
                isSelected: selectedTileID == tile.id,
                zoom: zoom,
                commitMove: { projection.move(tile, to: $0) }
            )
            .onTapGesture { selectedTileID = tile.id }
        }
    }

    private var canvasOverlay: some View {
        VStack {
            HStack {
                Text(projection.snapshot.workflow.name.uppercased())
                    .font(.caption2.weight(.bold))
                    .tracking(1.8)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("KERNEL PROJECTION · PTY BY HARNESS")
                    .font(.caption2.weight(.medium))
                    .tracking(1.1)
                    .foregroundStyle(QuantFlowTheme.cyan)
            }
            .padding(16)
            Spacer()
            HStack {
                Text("PAN CANVAS · DRAG TILE HEADER · TERMINAL BYTES STAY IN TILE")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("−") { baseZoom = max(0.45, baseZoom - 0.15) }
                Text("\(Int(zoom * 100))%")
                    .font(.caption.monospacedDigit())
                    .frame(width: 42)
                Button("+") { baseZoom = min(2.4, baseZoom + 0.15) }
            }
            .padding(16)
        }
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 3)
            .updating($pan) { value, state, _ in state = value.translation }
            .onEnded { value in viewport.width += value.translation.width; viewport.height += value.translation.height }
    }

    private var magnifyGesture: some Gesture {
        MagnifyGesture()
            .updating($magnification) { value, state, _ in state = value.magnification }
            .onEnded { value in baseZoom = min(max(baseZoom * value.magnification, 0.45), 2.4) }
    }

    private func screenPoint(for tile: Tile) -> CGPoint {
        CGPoint(x: tile.x * zoom + viewport.width + pan.width, y: tile.y * zoom + viewport.height + pan.height)
    }

    private func drawGrid(in context: inout GraphicsContext, size: CGSize) {
        let spacing = 16.0 * zoom
        guard spacing > 0 else { return }
        var x = (viewport.width + pan.width).truncatingRemainder(dividingBy: spacing)
        var y = (viewport.height + pan.height).truncatingRemainder(dividingBy: spacing)
        while x < size.width {
            y = (viewport.height + pan.height).truncatingRemainder(dividingBy: spacing)
            while y < size.height {
                context.fill(Path(ellipseIn: CGRect(x: x - 0.55, y: y - 0.55, width: 1.1, height: 1.1)), with: .color(QuantFlowTheme.grid))
                y += spacing
            }
            x += spacing
        }
    }

    private func drawConnections(in context: inout GraphicsContext) {
        for connection in projection.snapshot.connections {
            guard let source = projection.snapshot.tiles.first(where: { $0.id == connection.fromTileID }),
                  let destination = projection.snapshot.tiles.first(where: { $0.id == connection.toTileID }) else { continue }
            let a = screenPoint(for: source); let b = screenPoint(for: destination)
            var path = Path(); path.move(to: a)
            path.addCurve(to: b, control1: CGPoint(x: a.x + 110, y: a.y), control2: CGPoint(x: b.x - 110, y: b.y))
            context.stroke(path, with: .color(connection.semantic.color.opacity(0.72)), style: StrokeStyle(lineWidth: 1.25, dash: connection.semantic == .blocker ? [4, 5] : []))
        }
    }
}

/// A Mode-1 terminal summon. The tile contains a real AgentOS PTY, but its
/// raw stream remains transient presentation data rather than Kernel state.
private struct EveTerminalTile: View {
    let tile: Tile
    let worker: WorkerInstance
    @Bindable var session: AppSession
    let isSelected: Bool
    let zoom: Double
    let select: () -> Void
    let commitMove: (CGPoint) -> Void

    @GestureState private var translation = CGSize.zero
    @State private var terminal: HarnessTerminal?
    @State private var cursor = 0
    @State private var transcript = ""
    @State private var command = ""
    @State private var isOpening = false
    @State private var isWriting = false
    @State private var terminalError: String?

    private var isAttached: Bool { worker.runtimeSessionID != nil }
    private var terminalTitle: String { "eve@quantflow · \(worker.runtimeActorID?.prefix(8) ?? "attaching")" }

    var body: some View {
        VStack(spacing: 0) {
            terminalHeader
            Divider().overlay(QuantFlowTheme.line)
            terminalBody
            Divider().overlay(QuantFlowTheme.line)
            terminalInput
        }
        .frame(width: 318, height: 252, alignment: .topLeading)
        .background(Color.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .stroke(isSelected ? QuantFlowTheme.lime : QuantFlowTheme.lime.opacity(0.58), lineWidth: isSelected ? 1.45 : 0.9)
        }
        .shadow(color: QuantFlowTheme.lime.opacity(0.14), radius: 16, y: 7)
        .offset(translation)
        .task(id: worker.runtimeSessionID) { await openTerminalIfNeeded() }
        .task(id: terminal?.shellID) { await streamTerminal() }
    }

    private var terminalHeader: some View {
        HStack(spacing: 6) {
            Circle().fill(QuantFlowTheme.lime).frame(width: 5, height: 5)
            Text(terminalTitle)
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundStyle(QuantFlowTheme.lime.opacity(0.94))
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(terminal == nil ? (isAttached ? "OPENING" : "ATTACHING") : "PTY")
                .font(.system(size: 8, weight: .bold, design: .monospaced))
                .tracking(0.8)
                .foregroundStyle(terminal == nil ? .secondary : QuantFlowTheme.cyan)
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 9)
        .frame(height: 28)
        .background(QuantFlowTheme.panel.opacity(0.88))
        .contentShape(Rectangle())
        .onTapGesture(perform: select)
        .gesture(
            DragGesture(minimumDistance: 2)
                .updating($translation) { value, state, _ in state = value.translation }
                .onEnded { value in
                    commitMove(CGPoint(x: tile.x + value.translation.width / zoom, y: tile.y + value.translation.height / zoom))
                }
        )
    }

    @ViewBuilder
    private var terminalBody: some View {
        if let terminalError {
            VStack(alignment: .leading, spacing: 8) {
                Text("terminal attach failed").foregroundStyle(.red)
                Text(terminalError).foregroundStyle(.secondary)
            }
            .font(.system(size: 10, design: .monospaced))
            .padding(10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else if !isAttached || isOpening || terminal == nil {
            VStack(alignment: .leading, spacing: 7) {
                Text("quantflow terminal") .foregroundStyle(QuantFlowTheme.lime)
                Text(isAttached ? "opening AgentOS PTY…" : "waiting for Eve session attachment…")
                    .foregroundStyle(.secondary)
                Text("this tile is the terminal; no separate session window.")
                    .foregroundStyle(.secondary.opacity(0.72))
            }
            .font(.system(size: 10, design: .monospaced))
            .padding(10)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            ScrollViewReader { reader in
                ScrollView {
                    Text(displayTranscript)
                        .font(.system(size: 10, weight: .regular, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.9))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .padding(10)
                        .id("terminal-end")
                }
                .onChange(of: transcript) { _, _ in
                    withAnimation(.linear(duration: 0.12)) { reader.scrollTo("terminal-end", anchor: .bottom) }
                }
            }
        }
    }

    private var terminalInput: some View {
        HStack(spacing: 6) {
            Text("›").foregroundStyle(QuantFlowTheme.lime)
            TextField("type a shell command", text: $command)
                .textFieldStyle(.plain)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.white)
                .disabled(terminal == nil || isWriting)
                .onSubmit(sendCommand)
            if isWriting { ProgressView().controlSize(.small).tint(QuantFlowTheme.lime) }
        }
        .padding(.horizontal, 10)
        .frame(height: 31)
        .background(QuantFlowTheme.panel.opacity(0.7))
    }

    private var displayTranscript: String {
        let stripped = transcript
            .replacingOccurrences(of: "\u{001B}\\[[0-?]*[ -/]*[@-~]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "")
        return stripped.isEmpty ? "waiting for PTY output…" : stripped
    }

    private func openTerminalIfNeeded() async {
        guard terminal == nil, !isOpening, isAttached else { return }
        isOpening = true
        terminalError = nil
        do {
            let opened = try await session.openTerminal(for: worker)
            terminal = opened
            cursor = opened.cursor
        } catch {
            terminalError = error.localizedDescription
        }
        isOpening = false
    }

    private func streamTerminal() async {
        guard let terminal else { return }
        while !Swift.Task.isCancelled {
            do {
                let update = try await session.readTerminal(for: worker, terminal: terminal, cursor: cursor)
                if update.reset { transcript = update.data } else if !update.data.isEmpty { transcript += update.data }
                cursor = update.cursor
                if update.closed { return }
            } catch {
                terminalError = error.localizedDescription
                return
            }
            do { try await Swift.Task.sleep(nanoseconds: 250_000_000) } catch { return }
        }
    }

    private func sendCommand() {
        let text = command
        guard !text.isEmpty, let terminal else { return }
        command = ""
        isWriting = true
        Swift.Task {
            do { try await session.writeTerminal(for: worker, terminal: terminal, data: text + "\r") }
            catch { terminalError = error.localizedDescription }
            isWriting = false
        }
    }
}

private struct CanvasTileView: View {
    let tile: Tile
    let isSelected: Bool
    let zoom: Double
    let commitMove: (CGPoint) -> Void
    @GestureState private var translation = CGSize.zero

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Image(systemName: tile.kind.symbol).foregroundStyle(tile.kind.color)
                Spacer()
                Circle().fill(tile.status.color).frame(width: 8, height: 8)
            }
            Text(tile.displayName).font(.subheadline.weight(.semibold)).lineLimit(1)
            Text(tile.kind.rawValue.uppercased()).font(.caption2.weight(.medium)).tracking(0.9).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(width: 190, height: 112, alignment: .topLeading)
        .background(QuantFlowTheme.panelRaised.opacity(0.96), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10).stroke(isSelected ? QuantFlowTheme.cyan : QuantFlowTheme.line, lineWidth: isSelected ? 1.5 : 1) }
        .shadow(color: tile.kind.color.opacity(0.12), radius: 14, y: 8)
        .offset(translation)
        .gesture(
            DragGesture(minimumDistance: 2)
                .updating($translation) { value, state, _ in state = value.translation }
                .onEnded { value in
                    commitMove(CGPoint(x: tile.x + value.translation.width / zoom, y: tile.y + value.translation.height / zoom))
                }
        )
    }
}

private extension TileKind {
    var symbol: String { switch self { case .worker: "sparkles"; case .conductor: "point.3.connected.trianglepath.dotted"; case .viewer: "checkmark.seal"; case .region: "rectangle.3.group" } }
    var color: Color { switch self { case .worker: QuantFlowTheme.lime; case .conductor: QuantFlowTheme.cyan; case .viewer: QuantFlowTheme.violet; case .region: .orange } }
}

private extension TileStatus {
    var color: Color { switch self { case .idle: .secondary; case .active: .mint; case .blocked: .red; case .complete: .green; case .error: .orange } }
}

private extension ConnectionSemantic {
    var color: Color { switch self { case .delegation: .blue; case .contextFlow: .cyan; case .artifactDependency: .orange; case .verification: .green; case .blocker: .red; case .receiptHandoff: .purple; case .manualConnection: .gray } }
}
