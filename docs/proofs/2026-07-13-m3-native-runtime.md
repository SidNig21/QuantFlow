# M3 Native Runtime Proof

**Status:** passed locally on 2026-07-13

The M3 sidecar is a fresh macOS implementation in
`tools/agentos-host-mac/`; it does not carry forward the Windows HTTP
compatibility, terminal, WSL, lane/pool, runtime-database, or cable code.

## Observed result

- Paired `quantflow-eve` adapter tests: **8/8 passed**.
- Eve production build: passed using the locally pinned Eve `0.11.8` CLI.
- AgentOS package: `npm run pack:agentos` emitted
  `agentos/dist/package.aospkg`.
- Sidecar health: Eve and AgentOS both reported `ready` on `127.0.0.1`.
- Shared warm Eve session create: **52.1 ms**, returning HTTP `202` and a
  durable Eve session ID (under the M3 `<100 ms` target).
- AgentOS actor attachment: HTTP `201`, creating an Eve ACP session addressed
  by `["m3-proof", "eve-tile-a"]`.

Run the repeatable proof after building and packing the paired checkout:

```bash
cd /Users/r/Documents/quantflow-eve
npm ci
node node_modules/eve/bin/eve.js build
npm run pack:agentos

cd /Users/r/Documents/QuantFlow\ Mac/tools/agentos-host-mac
npm ci
# Ensure no other QuantFlow runtime is already running on port 7430.
npm run proof:m3
```

## Readiness distinction

The local proof intentionally has no `OPENCODE_GO_API_KEY`. It proves the
native server and actor-attachment paths, but reports `promptable: false`.
The Eve stream then fails honestly with `Missing API key`; it is not a green
prompt test. M4 must validate a dock click and an actual reply only with an
operator-provided credential.

## Discovery retained as guardrails

1. `eve build` must use the paired repo's local CLI directly on this Mac:
   `node node_modules/eve/bin/eve.js build`. npm did not create a `.bin/eve`
   shim in this install.
2. `agentos-toolchain pack` produces both `package.tar` and
   `package.aospkg`. Native AgentOS requires **`package.aospkg`**; passing the
   tarball fails with `EINVAL: invalid .aospkg magic`.
3. AgentOS 0.2.7's default common shell bundle currently fails package
   resolution during native VM boot. M3 turns off `defaultSoftware` because
   Eve ACP does not need a terminal rail. M4 must revisit that only if a real
   required Eve capability needs it, not by importing Windows terminal code.

## Environment note

The paired repo declares Node `24.x`; this Mac has Node `25.7.0`. The adapter
tests, Eve build, native Eve server, AgentOS runtime, and actor attachment all
passed here, but Node 24 remains the supported baseline for a release setup.
