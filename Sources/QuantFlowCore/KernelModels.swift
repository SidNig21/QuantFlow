import Foundation

public typealias KernelID = String

public enum WorkflowStatus: String, Codable, Sendable { case active, suspended, complete, archived }
public enum TileKind: String, Codable, Sendable { case worker, conductor, viewer, region }
public enum TileStatus: String, Codable, Sendable { case idle, active, blocked, complete, error }
public enum WorkerStatus: String, Codable, Sendable { case spawning, active, idle, stopped, error }
public enum TaskStatus: String, Codable, Sendable { case open, claimed, working, submitted, verifying, complete, blocked, failed }
public enum ReceiptType: String, Codable, Sendable {
    case taskCreated = "task_created", taskClaimed = "task_claimed", taskStarted = "task_started", progress
    case taskBlocked = "task_blocked", taskSubmitted = "task_submitted", verificationStarted = "verification_started"
    case verificationPassed = "verification_passed", verificationFailed = "verification_failed"
    case taskCompleted = "task_completed", taskFailed = "task_failed", planning
}
public enum ConnectionSemantic: String, Codable, Sendable {
    case delegation, contextFlow = "context_flow", artifactDependency = "artifact_dependency"
    case verification, blocker, receiptHandoff = "receipt_handoff", manualConnection = "manual_connection"
}

public struct Workflow: Identifiable, Equatable, Sendable {
    public let id: KernelID; public let name: String; public let objective: String; public let status: WorkflowStatus
}
public struct Tile: Identifiable, Equatable, Sendable {
    public let id: KernelID; public let workflowID: KernelID; public let displayName: String; public let kind: TileKind
    public let x: Double; public let y: Double; public let width: Double; public let height: Double; public let status: TileStatus
}
public struct WorkerInstance: Identifiable, Equatable, Sendable {
    public let id: KernelID; public let tileID: KernelID; public let workflowID: KernelID; public let role: String; public let harness: String; public let model: String; public let status: WorkerStatus
}
public struct Task: Identifiable, Equatable, Sendable {
    public let id: KernelID; public let workflowID: KernelID; public let correlationID: String; public let title: String; public let objective: String; public let status: TaskStatus
}
public struct Receipt: Identifiable, Equatable, Sendable {
    public let id: KernelID; public let workflowID: KernelID; public let taskID: KernelID?; public let type: ReceiptType; public let summary: String
}
public struct Connection: Identifiable, Equatable, Sendable {
    public let id: KernelID; public let workflowID: KernelID; public let fromTileID: KernelID; public let toTileID: KernelID; public let semantic: ConnectionSemantic; public let label: String?
}
public struct KernelEvent: Identifiable, Equatable, Sendable {
    public let id: KernelID; public let workflowID: KernelID; public let taskID: KernelID?; public let tileID: KernelID?; public let kind: String; public let createdAt: Int64
}
public struct WorkflowSnapshot: Equatable, Sendable {
    public let workflow: Workflow; public let tiles: [Tile]; public let workers: [WorkerInstance]; public let tasks: [Task]; public let connections: [Connection]; public let receipts: [Receipt]
}

public enum KernelCommand: Sendable {
    case createWorkflow(name: String, objective: String)
    case createTile(workflowID: KernelID, displayName: String, kind: TileKind, x: Double, y: Double)
    case moveTile(tileID: KernelID, x: Double, y: Double)
    case createWorker(tileID: KernelID, role: String, harness: String, model: String)
    case createTask(workflowID: KernelID, title: String, objective: String)
    case transitionTask(taskID: KernelID, to: TaskStatus)
    case postReceipt(workflowID: KernelID, taskID: KernelID?, type: ReceiptType, summary: String)
    case createConnection(workflowID: KernelID, fromTileID: KernelID, toTileID: KernelID, semantic: ConnectionSemantic, label: String?)

    var type: String {
        switch self {
        case .createWorkflow: "kernel.workflow.create"
        case .createTile: "kernel.tile.create"
        case .moveTile: "kernel.tile.move"
        case .createWorker: "kernel.worker.create"
        case .createTask: "kernel.task.create"
        case .transitionTask: "kernel.task.transition"
        case .postReceipt: "kernel.receipt.post"
        case .createConnection: "kernel.connection.create"
        }
    }
}

public struct KernelCommandResult: Equatable, Sendable { public let commandID: KernelID; public let subjectID: KernelID; public let event: KernelEvent }

public enum KernelError: Error, Equatable, LocalizedError {
    case missing(KernelID)
    case invalidTransition(TaskStatus, TaskStatus)
    case database(String)
    public var errorDescription: String? {
        switch self {
        case let .missing(id): "Kernel record not found: \(id)"
        case let .invalidTransition(from, to): "Invalid task transition: \(from.rawValue) → \(to.rawValue)"
        case let .database(message): message
        }
    }
}

enum KernelIDs {
    static func make() -> KernelID { UUID().uuidString.lowercased() }
    static func timestamp() -> Int64 { Int64(Date().timeIntervalSince1970 * 1_000) }
}
