import Foundation
import QuantFlowRuntime

@main
struct RuntimeProofMain {
    static func main() async {
        let client = RuntimeClient()
        let supervisor = RuntimeSupervisor(client: client)
        let state = await supervisor.startIfNeeded()
        guard case .configurationRequired = state else {
            fputs("M9 RUNTIME SUPERVISOR PROOF FAILED: credentialless app must not launch a standby host, got \(state)\n", stderr)
            exit(1)
        }
        print("M9 RUNTIME SUPERVISOR PROOF PASSED · Swift refused to launch a credentialless standby host.")
    }
}
