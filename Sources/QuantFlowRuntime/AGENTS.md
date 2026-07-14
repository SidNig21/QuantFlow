# Runtime Client Guide

`RuntimeClient` is a typed localhost HTTP boundary only. It must never import
or mutate `QuantFlowCore`; the native application commits product truth through
Kernel commands before or after runtime actions as the relevant M-rung defines.

M3 exposes health and attachment/probe calls. Do not put tile transcript,
prompt-queue, cable, or UI ownership into this module before their acceptance
rungs.
