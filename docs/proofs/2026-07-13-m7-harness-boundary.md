# M7 Harness Boundary Proof

**Status:** passed locally on 2026-07-13

`QuantFlowHarness` is the only Swift boundary that adapts the native runtime.
It returns session or relay evidence; it does not receive the Kernel owner,
dispatch commands, or persist workflow/runtime mirror state.

`QuantFlowHarnessProof` starts the native runtime, uses `NativeEveHarness` to
attach two Eve sessions, prompts one, and relays from it to the other. The live
proof passed with the expected `HARNESS_OK` and `HARNESS_CABLE_OK` replies.

```bash
OPENCODE_GO_API_KEY="…" \
QUANTFLOW_RUNTIME_ROOT="/Users/r/Documents/QuantFlow Mac/tools/agentos-host-mac" \
swift run QuantFlowHarnessProof
```
