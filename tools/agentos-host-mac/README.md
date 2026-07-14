# QuantFlow Mac runtime

The native runtime binds to `127.0.0.1` only. It starts one local Eve server
and an AgentOS/Rivet runtime, but owns no workflow state and never exposes
credentials. Swift remains the Kernel owner.

Before starting it, build and pack the paired Eve checkout once:

```bash
cd /Users/r/Documents/quantflow-eve
npm ci
node node_modules/eve/bin/eve.js build
npm run pack:agentos  # produces agentos/dist/package.aospkg for the runtime

cd /Users/r/Documents/QuantFlow\ Mac/tools/agentos-host-mac
npm ci
npm start
```

`GET /v1/health` distinguishes a live runtime from a **promptable** one. The
latter additionally requires `OPENCODE_GO_API_KEY` (or its documented alias).
`POST /v1/eve/probe-session` is a measurement endpoint: a `202` proves Eve
accepted a durable session, not that the model turn completed. The first real
AgentOS actor-session route is `POST /v1/agentos/eve-session` with
`workspaceID` and `tileID`; M4 owns prompt and transcript routes.

`npm run proof:m3` uses the default runtime ports and requires that no other
QuantFlow runtime is running first.

For the Swift-package development app to launch this sidecar itself, set this
in the Xcode scheme or shell that starts `QuantFlow`:

```bash
export QUANTFLOW_RUNTIME_ROOT="/Users/r/Documents/QuantFlow Mac/tools/agentos-host-mac"
```
