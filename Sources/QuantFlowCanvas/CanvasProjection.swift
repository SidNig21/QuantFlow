import Foundation
import Observation
import QuantFlowCore

/// A disposable read model. This is not a second state store: it refreshes only
/// from Kernel query snapshots after a committed Kernel event.
@Observable
public final class CanvasProjection {
    private let kernel: KernelStore
    public let workflowID: KernelID
    public private(set) var snapshot: WorkflowSnapshot
    public private(set) var lastError: String?
    private var subscriptionID: UUID?

    public init(kernel: KernelStore, workflowID: KernelID) throws {
        self.kernel = kernel
        self.workflowID = workflowID
        self.snapshot = try kernel.snapshot(workflowID: workflowID)
    }

    public func activate() {
        guard subscriptionID == nil else { return }
        subscriptionID = kernel.subscribe { [weak self] event in
            guard event.workflowID == self?.workflowID else { return }
            self?.refresh()
        }
    }

    public func refresh() {
        do { snapshot = try kernel.snapshot(workflowID: workflowID); lastError = nil }
        catch { lastError = error.localizedDescription }
    }

    /// The drag gesture calls this after its temporary visual translation ends.
    /// The node's durable position changes only once the Kernel accepts the command.
    public func move(_ tile: Tile, to canvasPoint: CGPoint) {
        do { _ = try kernel.dispatch(.moveTile(tileID: tile.id, x: canvasPoint.x, y: canvasPoint.y)) }
        catch { lastError = error.localizedDescription }
    }

    public func addEve() {
        do {
            let position = CGPoint(x: 350 + Double(snapshot.tiles.count * 40), y: 520)
            let tile = try kernel.dispatch(.createTile(workflowID: workflowID, displayName: "Eve", kind: .worker, x: position.x, y: position.y))
            _ = try kernel.dispatch(.createWorker(tileID: tile.subjectID, role: "agent", harness: "runtime-pending", model: "eve"))
        } catch { lastError = error.localizedDescription }
    }

    deinit {
        if let subscriptionID { kernel.unsubscribe(subscriptionID) }
    }
}
