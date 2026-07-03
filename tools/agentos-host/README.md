# AgentOS host (WSL sidecar)

Thin Node process that runs AgentOS in WSL and exposes localhost HTTP + SSE for the
QuantFlow harness adapter on Windows.

## One-time setup (WSL)

```bash
wsl -e bash -lc "cd /mnt/c/Users/rybow/QuantFlow/tools/agentos-host && npm install"
```

Uses the WSL login-shell `node` (e.g. `/home/rybowen21/.local/bin/node` v22+).

## Manual boot (health check)

```bash
wsl -e bash -lc "cd /mnt/c/Users/rybow/QuantFlow/tools/agentos-host && node host.js"
```

In another shell:

```bash
curl http://127.0.0.1:7430/health
```

Boot does **not** require API keys. Keys are read only on `POST /session`.

## Environment

| Variable | Purpose |
| --- | --- |
| `AGENTOS_HOST_PORT` | Listen port (default `7430`) |
| `OPENCODE_API_KEY` / `OPENCODE_ZEN_API_KEY` | Preferred — `opencode` software |
| `OPENROUTER_API_KEY` | `pi` + OpenRouter base URL quirk |
| `ANTHROPIC_API_KEY` | Direct `pi` |

Passed through from Windows when started via `host-lifecycle.ts`.

See `AGENTS.md` for the full wire protocol.
