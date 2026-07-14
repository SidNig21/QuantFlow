import Foundation

/// Starts the local Node runtime for development builds when it is not already
/// healthy. Production packaging will place the same runtime directory inside
/// the app bundle; until then the developer supplies `QUANTFLOW_RUNTIME_ROOT`.
public actor RuntimeSupervisor {
    public enum State: Equatable, Sendable {
        case alreadyRunning(promptable: Bool)
        case started(promptable: Bool)
        case configurationRequired
        case unavailable(String)
    }

    private let client: RuntimeClient
    private var process: Process?

    public init(client: RuntimeClient = RuntimeClient()) { self.client = client }

    public func startIfNeeded() async -> State {
        if let health = try? await client.health(), health.ok {
            return .alreadyRunning(promptable: health.promptable)
        }
        guard let root = ProcessInfo.processInfo.environment["QUANTFLOW_RUNTIME_ROOT"], !root.isEmpty else {
            return .configurationRequired
        }
        let directory = URL(fileURLWithPath: root, isDirectory: true)
        guard FileManager.default.fileExists(atPath: directory.appending(path: "host.js").path) else {
            return .unavailable("QUANTFLOW_RUNTIME_ROOT does not contain host.js")
        }
        do {
            let child = Process()
            child.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            child.arguments = ["node", "host.js"]
            child.currentDirectoryURL = directory
            try child.run()
            process = child
            let deadline = ContinuousClock.now + .seconds(120)
            while ContinuousClock.now < deadline {
                if let health = try? await client.health(), health.ok {
                    return .started(promptable: health.promptable)
                }
                try? await Task.sleep(for: .milliseconds(250))
            }
            stop()
            return .unavailable("Runtime did not become healthy within 120 seconds")
        } catch {
            return .unavailable(error.localizedDescription)
        }
    }

    public func stop() {
        guard let process else { return }
        if process.isRunning { process.terminate() }
        self.process = nil
    }
}
