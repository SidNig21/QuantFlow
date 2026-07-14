import SwiftUI

@main
struct QuantFlowApp: App {
    var body: some Scene {
        WindowGroup("QuantFlow") {
            MacShellView()
                .frame(minWidth: 1_100, minHeight: 700)
        }
        .windowStyle(.titleBar)
    }
}
