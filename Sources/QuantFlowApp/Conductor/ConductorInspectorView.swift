import SwiftUI
import QuantFlowConductor

struct ConductorInspectorView: View {
    @Bindable var conductor: ConductorProjection

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("CONDUCTOR", systemImage: "point.3.connected.trianglepath.dotted")
                .font(.caption.weight(.bold)).tracking(1.4).foregroundStyle(QuantFlowTheme.cyan)
            Text("READ-ONLY KERNEL ASSESSMENT").font(.caption2.weight(.medium)).tracking(0.9).foregroundStyle(.secondary)
            metric("Open tasks", conductor.openTasks.count, tint: QuantFlowTheme.cyan)
            metric("Blocked", conductor.blockers.count, tint: .red)
            metric("Active workers", conductor.activeWorkers.count, tint: QuantFlowTheme.lime)
            Divider()
            Text("Tasks").font(.subheadline.weight(.semibold))
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 9) {
                    ForEach(conductor.snapshot.tasks) { task in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(task.title).font(.caption.weight(.medium)).lineLimit(2)
                            Text(task.status.rawValue.uppercased()).font(.caption2.monospaced()).foregroundStyle(task.status == .blocked ? .red : .secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            Divider()
            Text("Receipts: \(conductor.snapshot.receipts.count)").font(.caption).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(width: 240, alignment: .topLeading)
        .background(QuantFlowTheme.panel)
        .overlay(alignment: .leading) { Rectangle().fill(QuantFlowTheme.line).frame(width: 1) }
    }

    private func metric(_ label: String, _ value: Int, tint: Color) -> some View {
        HStack { Text(label).font(.caption); Spacer(); Text("\(value)").font(.title3.monospacedDigit()).foregroundStyle(tint) }
    }
}
