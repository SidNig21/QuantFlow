# AgentOS host (WSL sidecar)

Node sidecar that serves one durable AgentOS-backed RivetKit actor per
`[workspaceId, tileId]` and exposes QuantFlow's existing localhost HTTP/SSE
transport on Windows.

## Setup

```bash
wsl -e bash -lc "cd /mnt/c/Users/rybow/QuantFlow/tools/agentos-host && npm install"
```

The WSL login-shell Node must be v22 or newer.

## Manual boot

```bash
wsl -e bash -lc "cd /mnt/c/Users/rybow/QuantFlow/tools/agentos-host && node host.js"
curl http://127.0.0.1:7430/health
```

Boot and `/health` do not require a credential. `POST /session` requires both
`workspaceId` and `tileId`; the host resolves credentials only at that point.

## Environment

| Variable | Purpose |
| --- | --- |
| `AGENTOS_HOST_PORT` | Compatibility HTTP port (default `7430`) |
| `AGENTOS_RIVET_ACTOR_PORT` | Internal Rivet actor port (default host port + 1) |
| `AGENTOS_RIVET_ENGINE_PORT` | Internal Rivet Engine port (default host port + 2) |
| `AGENTOS_RIVET_START_TIMEOUT_MS` | Actor/envoy readiness budget (default `90000`) |
| `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY` / `OPENCODE_ZEN_API_KEY` | Preferred Pi provider credential |
| `OPENROUTER_API_KEY` | Pi via OpenRouter |
| `ANTHROPIC_API_KEY` | Direct Pi/Claude API credential |
| `CLAUDE_CODE_OAUTH_TOKEN` | Preferred Claude Code subscription credential |

See `AGENTS.md` for the full wire contract, the process-exit lifecycle
workaround, and the current `0.2.7` package-boundary findings.
