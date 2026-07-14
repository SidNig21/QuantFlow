import Foundation
import QuantFlowRuntime

@main
struct RuntimeProofMain {
    static func main() async {
        let client = RuntimeClient()
        let supervisor = RuntimeSupervisor(client: client)
        let state = await supervisor.startIfNeeded()
        guard case .started = state else {
            fputs("M4 RUNTIME SUPERVISOR PROOF FAILED: expected a fresh launch, got \(state)\n", stderr)
            exit(1)
        }
        do {
            let health = try await client.health()
            guard health.ok, health.eve.state == "ready", health.agentos.state == "ready", !health.promptable else {
                fputs("M4 RUNTIME SUPERVISOR PROOF FAILED: unexpected health \(health)\n", stderr)
                exit(1)
            }
            print("M4 RUNTIME SUPERVISOR PROOF PASSED · Swift launched the native sidecar and observed an honest credentialless readiness state.")
        } catch {
            fputs("M4 RUNTIME SUPERVISOR PROOF FAILED: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
        await supervisor.stop()
    }
}
