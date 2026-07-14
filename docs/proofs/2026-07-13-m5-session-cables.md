# M5 Session-Scoped Cable Proof

**Status:** passed locally on 2026-07-13

M5 adds a small native cable contract rather than porting Windows relay code.
The Swift app must authorize a relay from a Kernel `Connection`; the localhost
runtime receives only two durable endpoints:

```text
{ workspaceID, tileID, sessionID } → { workspaceID, tileID, sessionID }
```

Ports, Electron routing, runtime databases, lanes, pools, and terminal rails
are not cable identity and are not part of this implementation. The sidecar
serializes prompts per target tile while allowing independent tiles to work.

## Live result

`OPENCODE_GO_API_KEY="…" npm run proof:m5-live` starts an isolated native
runtime, creates two AgentOS Eve sessions, and relays one message each way.

- Eve A → Eve B: `B_ACK`
- Eve B → Eve A: `A_ACK`

The Kernel proof also now stores two bound Eve workers and a typed
`context_flow` connection between their tiles.
