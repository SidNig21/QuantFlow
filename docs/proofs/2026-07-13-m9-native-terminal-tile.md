# M9 proof: native terminal tile

**Status:** passed on 2026-07-13

## Product acceptance

A Dock summon is a Mode-1 terminal tile, not a modal transcript or secondary
detail screen.

```text
Dock click → Kernel worker tile → AgentOS Eve session → native macOS PTY tile
```

The SwiftUI canvas renders the terminal as a movable tile with a real input
line and scrolling byte stream. The terminal bridge passes an entered line to
the exact workspace/tile/session AgentOS Eve prompt endpoint. Raw terminal
bytes are held only in the native sidecar's bounded in-memory tile buffer;
they do not write Kernel SQLite or canvas projection state.

## Live native acceptance

With no model credential configured, the runtime still proved the terminal
mechanics without claiming a model response:

1. Created a real AgentOS Eve session for a fresh workspace/tile identity.
2. Opened a native `node-pty` macOS PTY bound to that session.
3. Wrote `:help` through the terminal route.
4. Read back the PTY banner, prompt, and help text (219 bytes).

The terminal route test also asserts that open/read/write calls always carry
the same workspace, tile, and session identity.

## Verification

```bash
swift build
swift run QuantFlowKernelProof
npm --prefix tools/agentos-host-mac run check
npm --prefix tools/agentos-host-mac test
```

The actual Eve prompt turn remains credential-gated on purpose. When
`OPENCODE_GO_API_KEY` is present, terminal input is sent to the already-bound
AgentOS Eve session; no key is stored in the app, bundle, or Kernel.
