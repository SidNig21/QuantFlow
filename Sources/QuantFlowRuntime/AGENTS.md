# Runtime Client Guide

`RuntimeClient` is a typed localhost HTTP boundary only. It must never import
or mutate `QuantFlowCore`; the native application commits product truth through
Kernel commands before or after runtime actions as the relevant M-rung defines.

M3 exposes health and attachment/probe calls. Do not put tile transcript,
prompt-queue, cable, or UI ownership into this module before their acceptance
rungs.

`RuntimeSupervisor` may launch the Node sidecar but is never allowed to own
workflow state. During Swift-package development it needs
`QUANTFLOW_RUNTIME_ROOT` pointing at `tools/agentos-host-mac`; release
packaging will replace that development locator with an app-bundled runtime.

M5 cable exchange accepts two session-scoped endpoints only. The App layer
must authorize their relationship from a Kernel `Connection` before it calls
this adapter; ports never identify a peer.
