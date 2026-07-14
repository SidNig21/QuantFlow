import SwiftUI
import QuantFlowCore
import QuantFlowCanvas

struct WorkflowCanvas: View {
    @Bindable var projection: CanvasProjection
    @State private var viewport = CGSize(width: 120, height: 90)
    @GestureState private var pan = CGSize.zero
    @GestureState private var magnification = 1.0
    @State private var baseZoom = 1.0
    @State private var selectedTileID: KernelID?

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
                    CanvasTileView(tile: tile, isSelected: selectedTileID == tile.id, zoom: zoom) { point in
                        projection.move(tile, to: point)
                    }
                    .position(screenPoint(for: tile))
                    .onTapGesture { selectedTileID = tile.id }
                }

                VStack {
                    HStack {
                        Text(projection.snapshot.workflow.name.uppercased())
                            .font(.caption2.weight(.bold))
                            .tracking(1.8)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("KERNEL PROJECTION")
                            .font(.caption2.weight(.medium))
                            .tracking(1.1)
                            .foregroundStyle(QuantFlowTheme.cyan)
                    }
                    .padding(16)
                    Spacer()
                    HStack {
                        Text("PAN · ZOOM · DRAG COMMITS THROUGH KERNEL")
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
                if let error = projection.lastError {
                    Text(error).font(.caption).padding(8).background(.red.opacity(0.8), in: Capsule()).foregroundStyle(.white)
                }
            }
            .contentShape(Rectangle())
            .gesture(panGesture)
            .simultaneousGesture(magnifyGesture)
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
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(isSelected ? QuantFlowTheme.cyan : QuantFlowTheme.line, lineWidth: isSelected ? 1.5 : 1) }
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
