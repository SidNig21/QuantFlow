// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "QuantFlow",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "QuantFlow", targets: ["QuantFlowApp"])
    ],
    targets: [
        .executableTarget(
            name: "QuantFlowApp",
            path: "Sources/QuantFlowApp"
        )
    ]
)
