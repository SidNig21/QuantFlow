import SwiftUI

struct MacShellView: View {
    var body: some View {
        NavigationSplitView {
            List {
                Section("QUANTFLOW") {
                    Label("Operator Console", systemImage: "point.3.connected.trianglepath.dotted")
                }
                Section("BUILD") {
                    Label("M0 · Native shell", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Label("M1 · SQLite Kernel", systemImage: "circle")
                    Label("M2 · Canvas", systemImage: "circle")
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("QuantFlow")
        } detail: {
            ContentUnavailableView {
                Label("QuantFlow for Mac", systemImage: "point.3.connected.trianglepath.dotted")
            } description: {
                Text("The native shell is ready. M1 adds the SQLite Kernel; every visible workflow surface will project its truth.")
            }
            .background(Color(nsColor: .windowBackgroundColor))
        }
    }
}
