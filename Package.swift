// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "QuantFlow",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "QuantFlow", targets: ["QuantFlowApp"]),
        .executable(name: "QuantFlowKernelProof", targets: ["QuantFlowKernelProof"]),
        .executable(name: "QuantFlowRuntimeProof", targets: ["QuantFlowRuntimeProof"]),
        .library(name: "QuantFlowCore", targets: ["QuantFlowCore"]),
        .library(name: "QuantFlowRuntime", targets: ["QuantFlowRuntime"])
    ],
    targets: [
        .systemLibrary(name: "CSQLite", path: "Sources/CSQLite"),
        .target(
            name: "QuantFlowCore",
            dependencies: ["CSQLite"],
            path: "Sources/QuantFlowCore",
            exclude: ["AGENTS.md"]
        ),
        .target(
            name: "QuantFlowCanvas",
            dependencies: ["QuantFlowCore"],
            path: "Sources/QuantFlowCanvas",
            exclude: ["AGENTS.md"]
        ),
        .target(name: "QuantFlowRuntime", path: "Sources/QuantFlowRuntime", exclude: ["AGENTS.md"]),
        .executableTarget(
            name: "QuantFlowApp",
            dependencies: ["QuantFlowCore", "QuantFlowCanvas", "QuantFlowRuntime"],
            path: "Sources/QuantFlowApp"
        ),
        .executableTarget(
            name: "QuantFlowKernelProof",
            dependencies: ["QuantFlowCore", "QuantFlowCanvas"],
            path: "Sources/QuantFlowKernelProof"
        ),
        .executableTarget(
            name: "QuantFlowRuntimeProof",
            dependencies: ["QuantFlowRuntime"],
            path: "Sources/QuantFlowRuntimeProof"
        )
    ]
)
