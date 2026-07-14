# Mac Runtime Guide

This folder is the clean native runtime boundary. Keep it localhost-only and
small: Eve process readiness, AgentOS actor identity, and session attachment.

- Never write Kernel SQLite, canvas state, or any runtime mirror here.
- Never log, return, or persist model credentials.
- Do not reintroduce Electron routes, WSL checks, ports as identity, pools,
  or a second runtime store.
- Mode-1 dock summons own a native macOS PTY bound to an AgentOS Eve session.
  Raw terminal bytes are ephemeral display data for that tile only; they never
  mutate Kernel or canvas truth.
- A listening process is not promptable. Health must distinguish Eve readiness,
  AgentOS readiness, and actual credential readiness.
- `[workspaceID, tileID]` is the durable AgentOS actor address. Eve session IDs
  belong to turns; ports are implementation detail only.

M3 ends at native runtime and attachment proof. M4 adds the dock and the
prompt/read-only event surface after actual credentials can be validated.
The terminal surface is a narrow Harness route: open, read, write, resize,
and close are all authorized by workspace, tile, and session identity.
