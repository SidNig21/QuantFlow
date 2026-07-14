import Foundation
import Observation
import QuantFlowCore

/// Read-only operational assessment. It owns no plan, task state, or mutation
/// API: every displayed value is a fresh Kernel query snapshot.
@Observable
public final class ConductorProjection {
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

    public var openTasks: [QuantFlowCore.Task] { snapshot.tasks.filter { $0.status != .complete && $0.status != .failed } }
    public var blockers: [QuantFlowCore.Task] { snapshot.tasks.filter { $0.status == .blocked } }
    public var activeWorkers: [WorkerInstance] { snapshot.workers.filter { $0.status == .active } }

    deinit {
        if let subscriptionID { kernel.unsubscribe(subscriptionID) }
    }
}
