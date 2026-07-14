// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "QuantFlow",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "QuantFlow", targets: ["QuantFlowApp"]),
        .executable(name: "QuantFlowKernelProof", targets: ["QuantFlowKernelProof"]),
        .library(name: "QuantFlowCore", targets: ["QuantFlowCore"])
    ],
    targets: [
        .systemLibrary(name: "CSQLite", path: "Sources/CSQLite"),
        .target(
            name: "QuantFlowCore",
            dependencies: ["CSQLite"],
            path: "Sources/QuantFlowCore",
            exclude: ["AGENTS.md"]
        ),
        .executableTarget(
            name: "QuantFlowApp",
            dependencies: ["QuantFlowCore"],
            path: "Sources/QuantFlowApp"
        ),
        .executableTarget(
            name: "QuantFlowKernelProof",
            dependencies: ["QuantFlowCore"],
            path: "Sources/QuantFlowKernelProof"
        )
    ]
)
