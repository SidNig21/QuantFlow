import SwiftUI

@main
struct QuantFlowApp: App {
    @State private var session = AppSession()

    var body: some Scene {
        WindowGroup("QuantFlow") {
            MacShellView(session: session)
                .frame(minWidth: 1_100, minHeight: 700)
        }
        .windowStyle(.titleBar)
    }
}
