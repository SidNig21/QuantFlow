import Foundation
import QuantFlowHarness
import QuantFlowRuntime

@main
struct HarnessProofMain {
    static func main() async {
        let supervisor = RuntimeSupervisor()
        let state = await supervisor.startIfNeeded()
        guard case let .started(promptable) = state, promptable else {
            fputs("M7 HARNESS PROOF FAILED: runtime is not freshly promptable: \(state)\n", stderr)
            exit(1)
        }
        do {
            let harness = NativeEveHarness()
            let workflowID = "m7-harness-proof"
            let a = try await harness.attach(workflowID: workflowID, tileID: "eve-a")
            let b = try await harness.attach(workflowID: workflowID, tileID: "eve-b")
            guard a.promptable, b.promptable else { throw RuntimeError.rejected("Harness attached a non-promptable session") }
            let endpointA = HarnessEndpoint(workflowID: workflowID, tileID: "eve-a", sessionID: a.sessionID)
            let endpointB = HarnessEndpoint(workflowID: workflowID, tileID: "eve-b", sessionID: b.sessionID)
            let reply = try await harness.prompt(endpoint: endpointA, text: "Reply with exactly HARNESS_OK.")
            let cableReply = try await harness.relay(from: endpointA, to: endpointB, text: "Reply with exactly HARNESS_CABLE_OK.")
            let plain = { (value: String) in value.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "**", with: "") }
            guard plain(reply) == "HARNESS_OK", plain(cableReply) == "HARNESS_CABLE_OK" else {
                throw RuntimeError.rejected("Unexpected Harness response")
            }
            print("M7 HARNESS PROOF PASSED · Harness attached, prompted, and relayed without Kernel mutation authority.")
        } catch {
            fputs("M7 HARNESS PROOF FAILED: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
        await supervisor.stop()
    }
}
