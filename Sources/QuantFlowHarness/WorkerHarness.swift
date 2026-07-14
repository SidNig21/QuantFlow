import Foundation
import QuantFlowCore
import QuantFlowRuntime

/// Runtime adapter fence. A harness may create a runtime session and return
/// evidence, but it never receives the Kernel owner and therefore cannot commit
/// workflow truth on its own.
public struct HarnessSession: Equatable, Sendable {
    public let actorID: String
    public let sessionID: String
    public let promptable: Bool
}

public struct HarnessEndpoint: Equatable, Sendable {
    public let workflowID: KernelID
    public let tileID: KernelID
    public let sessionID: String
    public init(workflowID: KernelID, tileID: KernelID, sessionID: String) { self.workflowID = workflowID; self.tileID = tileID; self.sessionID = sessionID }
}

/// A real PTY belongs to one runtime session. Its byte stream is deliberately
/// transient UI data, not a second workflow store.
public struct HarnessTerminal: Equatable, Sendable {
    public let shellID: String
    public let cursor: Int
}

public struct HarnessTerminalRead: Equatable, Sendable {
    public let shellID: String
    public let start: Int
    public let cursor: Int
    public let data: String
    public let reset: Bool
    public let closed: Bool
}

public protocol WorkerHarness: Sendable {
    func attach(workflowID: KernelID, tileID: KernelID) async throws -> HarnessSession
    func prompt(endpoint: HarnessEndpoint, text: String) async throws -> String
    func openTerminal(endpoint: HarnessEndpoint, columns: Int, rows: Int) async throws -> HarnessTerminal
    func readTerminal(endpoint: HarnessEndpoint, terminal: HarnessTerminal, cursor: Int) async throws -> HarnessTerminalRead
    func writeTerminal(endpoint: HarnessEndpoint, terminal: HarnessTerminal, data: String) async throws
    func relay(from: HarnessEndpoint, to: HarnessEndpoint, text: String) async throws -> String
}

public struct NativeEveHarness: WorkerHarness {
    private let runtime: RuntimeClient

    public init(runtime: RuntimeClient = RuntimeClient()) { self.runtime = runtime }

    public func attach(workflowID: KernelID, tileID: KernelID) async throws -> HarnessSession {
        let session = try await runtime.createAgentOSEveSession(workflowID: workflowID, tileID: tileID)
        return HarnessSession(actorID: session.actorID, sessionID: session.sessionID, promptable: session.promptable)
    }

    public func prompt(endpoint: HarnessEndpoint, text: String) async throws -> String {
        return try await runtime.promptEve(workflowID: endpoint.workflowID, tileID: endpoint.tileID, sessionID: endpoint.sessionID, text: text).text
    }

    public func openTerminal(endpoint: HarnessEndpoint, columns: Int, rows: Int) async throws -> HarnessTerminal {
        let terminal = try await runtime.openEveTerminal(workflowID: endpoint.workflowID, tileID: endpoint.tileID, sessionID: endpoint.sessionID, columns: columns, rows: rows)
        return .init(shellID: terminal.shellID, cursor: terminal.cursor)
    }

    public func readTerminal(endpoint: HarnessEndpoint, terminal: HarnessTerminal, cursor: Int) async throws -> HarnessTerminalRead {
        let result = try await runtime.readEveTerminal(workflowID: endpoint.workflowID, tileID: endpoint.tileID, sessionID: endpoint.sessionID, shellID: terminal.shellID, cursor: cursor)
        return .init(shellID: result.shellID, start: result.start, cursor: result.cursor, data: result.data, reset: result.reset, closed: result.closed)
    }

    public func writeTerminal(endpoint: HarnessEndpoint, terminal: HarnessTerminal, data: String) async throws {
        try await runtime.writeEveTerminal(workflowID: endpoint.workflowID, tileID: endpoint.tileID, sessionID: endpoint.sessionID, shellID: terminal.shellID, data: data)
    }

    public func relay(from: HarnessEndpoint, to: HarnessEndpoint, text: String) async throws -> String {
        return try await runtime.exchangeEveCable(
            from: .init(workspaceID: from.workflowID, tileID: from.tileID, sessionID: from.sessionID),
            to: .init(workspaceID: to.workflowID, tileID: to.tileID, sessionID: to.sessionID),
            text: text
        ).text
    }
}
