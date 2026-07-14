# M8 proof: local macOS development app bundle

**Status:** passed on 2026-07-13

## What was proved

`scripts/assemble-development-app.sh` builds the native Swift `QuantFlow`
executable in release configuration and assembles it into
`.build/QuantFlow.app` with the app metadata in `Packaging/QuantFlow-Info.plist`.

The resulting bundle was launched through macOS and identified as
`com.sidnig.quantflow`. Accessibility inspection of its live window confirmed
the intended first-use structure:

- `DOCK CATALOGUE` is the primary left-side surface.
- The Eve / AgentOS catalogue card exposes its real readiness state and does
  not permit a fake-ready spawn.
- The `TEMPLATES` shelf exists for future saved workflow templates.
- Kernel metrics, the graph canvas, and the read-only Conductor panel are all
  visible in the desktop app.

## Acceptance commands

```bash
scripts/assemble-development-app.sh
plutil -lint .build/QuantFlow.app/Contents/Info.plist
open -n .build/QuantFlow.app
```

## Local-use boundary

This is deliberately a development bundle: it is unsigned and expects the
native Node sidecar to be supplied via `QUANTFLOW_RUNTIME_ROOT`. It embeds no
credential, Node runtime, or release-signing configuration. Those are
distribution concerns, intentionally deferred while this remains a personal
local test build.
