import Foundation

/// HTTP boundary to the local runtime. It deliberately has no access to the
/// Kernel database; callers turn any operator action into Kernel commands.
public actor RuntimeClient {
    public struct Health: Codable, Equatable, Sendable {
        public struct Component: Codable, Equatable, Sendable { public let state: String; public let error: String? }
        public let ok: Bool
        public let state: String
        public let promptable: Bool
        public let credentialConfigured: Bool
        public let eve: Component
        public let agentos: Component
    }

    public struct EveProbeSession: Codable, Equatable, Sendable {
        public let sessionId: String
        public let continuationToken: String
        public let acceptedInMilliseconds: Double
    }

    public struct AgentOSEveSession: Codable, Equatable, Sendable {
        public let actorID: String
        public let sessionID: String
        public let workspaceID: String
        public let tileID: String
        public let promptable: Bool
    }

    public struct EvePrompt: Codable, Equatable, Sendable { public let ok: Bool; public let text: String }
    public struct EveTerminal: Codable, Equatable, Sendable {
        public let shellID: String
        public let cursor: Int
    }
    public struct EveTerminalRead: Codable, Equatable, Sendable {
        public let shellID: String
        public let start: Int
        public let cursor: Int
        public let data: String
        public let reset: Bool
        public let closed: Bool
    }
    public struct Acknowledgement: Codable, Equatable, Sendable { public let ok: Bool }
    public struct EveCableEndpoint: Codable, Equatable, Sendable {
        public let workspaceID: String
        public let tileID: String
        public let sessionID: String
        public init(workspaceID: String, tileID: String, sessionID: String) { self.workspaceID = workspaceID; self.tileID = tileID; self.sessionID = sessionID }
    }
    public struct EveCableExchange: Codable, Equatable, Sendable { public let ok: Bool; public let fromTileID: String; public let toTileID: String; public let text: String }

    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL = URL(string: "http://127.0.0.1:7430")!, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func health() async throws -> Health {
        try await request(path: "/v1/health", method: "GET", body: Optional<String>.none)
    }

    /// A timing probe only: `202` means Eve accepted a durable session, not
    /// that a model turn completed. The dock's actual prompt route belongs to M4.
    public func createEveProbeSession(message: String) async throws -> EveProbeSession {
        try await request(path: "/v1/eve/probe-session", method: "POST", body: ProbeRequest(message: message))
    }

    public func createAgentOSEveSession(workflowID: String, tileID: String) async throws -> AgentOSEveSession {
        try await request(path: "/v1/agentos/eve-session", method: "POST", body: ActorRequest(workspaceID: workflowID, tileID: tileID))
    }

    public func promptEve(workflowID: String, tileID: String, sessionID: String, text: String) async throws -> EvePrompt {
        try await request(path: "/v1/agentos/eve-session/\(sessionID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionID)/prompt", method: "POST", body: PromptRequest(workspaceID: workflowID, tileID: tileID, text: text))
    }

    /// Opens the AgentOS PTY owned by this exact Eve tile. Shell output is
    /// display-only data; it is never written into the Kernel projection.
    public func openEveTerminal(workflowID: String, tileID: String, sessionID: String, columns: Int = 80, rows: Int = 24) async throws -> EveTerminal {
        try await request(
            path: terminalPath(sessionID: sessionID),
            method: "POST",
            body: TerminalOpenRequest(workspaceID: workflowID, tileID: tileID, cols: columns, rows: rows)
        )
    }

    public func readEveTerminal(workflowID: String, tileID: String, sessionID: String, shellID: String, cursor: Int) async throws -> EveTerminalRead {
        var components = URLComponents(url: baseURL.appending(path: terminalPath(sessionID: sessionID, shellID: shellID, action: "read")), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            .init(name: "workspaceID", value: workflowID),
            .init(name: "tileID", value: tileID),
            .init(name: "cursor", value: String(cursor)),
        ]
        guard let url = components?.url else { throw RuntimeError.invalidResponse }
        return try await request(url: url, method: "GET", body: Optional<String>.none)
    }

    public func writeEveTerminal(workflowID: String, tileID: String, sessionID: String, shellID: String, data: String) async throws {
        let _: Acknowledgement = try await request(
            path: terminalPath(sessionID: sessionID, shellID: shellID, action: "write"),
            method: "POST",
            body: TerminalWriteRequest(workspaceID: workflowID, tileID: tileID, data: data)
        )
    }

    /// The caller must first authorize the relationship against a Kernel
    /// `Connection`. This localhost adapter accepts only session-scoped IDs;
    /// a port is never a cable endpoint.
    public func exchangeEveCable(from: EveCableEndpoint, to: EveCableEndpoint, text: String) async throws -> EveCableExchange {
        try await request(path: "/v1/cables/exchange", method: "POST", body: CableRequest(from: from, to: to, text: text))
    }

    private func terminalPath(sessionID: String, shellID: String? = nil, action: String? = nil) -> String {
        let session = sessionID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sessionID
        guard let shellID, let action else { return "/v1/agentos/eve-session/\(session)/terminal" }
        let shell = shellID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? shellID
        return "/v1/agentos/eve-session/\(session)/terminal/\(shell)/\(action)"
    }

    private func request<Response: Decodable, Body: Encodable>(path: String, method: String, body: Body?) async throws -> Response {
        try await request(url: baseURL.appending(path: path), method: method, body: body)
    }

    private func request<Response: Decodable, Body: Encodable>(url: URL, method: String, body: Body?) async throws -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw RuntimeError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(RuntimeFailure.self, from: data).error) ?? "Runtime returned HTTP \(http.statusCode)"
            throw RuntimeError.rejected(message)
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }

    private struct ProbeRequest: Encodable { let message: String }
    private struct ActorRequest: Encodable { let workspaceID: String; let tileID: String }
    private struct PromptRequest: Encodable { let workspaceID: String; let tileID: String; let text: String }
    private struct TerminalOpenRequest: Encodable { let workspaceID: String; let tileID: String; let cols: Int; let rows: Int }
    private struct TerminalWriteRequest: Encodable { let workspaceID: String; let tileID: String; let data: String }
    private struct CableRequest: Encodable { let from: EveCableEndpoint; let to: EveCableEndpoint; let text: String }
    private struct RuntimeFailure: Decodable { let error: String }
}

public enum RuntimeError: Error, Equatable, LocalizedError, Sendable {
    case invalidResponse
    case rejected(String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse: "Runtime returned a non-HTTP response."
        case let .rejected(message): message
        }
    }
}
