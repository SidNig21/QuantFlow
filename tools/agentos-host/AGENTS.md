# tools/agentos-host — Agent Guide

WSL-only Node sidecar that runs `@rivet-dev/agentos-core` in-process and exposes
the localhost wire protocol consumed by `src/harness/agentos/http-transport.ts`.

## Purpose

- Hold AgentOS deps **outside** the QuantFlow root `package.json`.
- Execute `AgentOs.create({ software, toolKits })` with the QuantFlow `quantflow`
  toolKit bridge (`receipt-emit`, `approval-request`).
- Keep API keys in the **host process env** (inherited from Windows spawn) — never
  in the VM, never logged, never echoed in HTTP responses.

## Ownership

| File | Role |
| --- | --- |
| `host.js` | HTTP + SSE server; session lifecycle; credential-order session env |
| `package.json` | Pinned AgentOS deps (exact versions) |

## Wire protocol (127.0.0.1:`AGENTOS_HOST_PORT`, default 7430)

Host binds `0.0.0.0` (override via `AGENTOS_HOST_BIND`) so Windows can reach the sidecar
via WSL IP when localhost mirroring is unavailable. Windows client auto-resolves via
`resolveAgentOsHostAddress()` in `host-lifecycle.ts`.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/health` | — | `{ ok: true }` — **no credential required** |
| POST | `/session` | `{ software }` (hint; host picks from env order) | `{ sessionId, software }` |
| POST | `/session/:id/prompt` | `{ text }` | blocks until turn complete `{ ok: true }` |
| GET | `/session/:id/events` | — | SSE: `session-event` + `permission-request` payloads |
| POST | `/session/:id/permission` | `{ requestId, approved }` | `{ ok }` |
| GET | `/file` | `?path=` | raw bytes |
| POST | `/dispose` | — | `{ ok: true }` |

SSE `data:` JSON shapes:

- `{ kind: "session-event", event: <raw ACP session/update> }`
- `{ kind: "permission-request", requestId, action, source, toolCallId?, raw? }`

`approval-request` hostTool **blocks** until `POST .../permission` arrives.

## Credential order (session create only)

1. `OPENCODE_API_KEY` / `OPENCODE_ZEN_API_KEY` / `OPENCODE_GO_API_KEY` → software `pi`
   with a custom OpenCode provider written to `~/.pi/agent/{models.json,settings.json}`
   before `createSession`. **Default:** OpenCode Go (`https://opencode.ai/zen/go/v1`,
   model `glm-5.2`). Override model via `AGENTOS_MODEL`; set `AGENTOS_PROVIDER=zen`
   for legacy Zen free tier (`big-pickle` on `https://opencode.ai/zen/v1`).
   The `opencode` software is deliberately NOT used: its bundled ACP adapter
   hardcodes an Anthropic catalog and ignores `OPENCODE_CONFIG_CONTENT` for
   provider selection (verified 2026-07-03).
2. `OPENROUTER_API_KEY` → software `pi` + `ANTHROPIC_BASE_URL=https://openrouter.ai/api`
3. `ANTHROPIC_API_KEY` → software `pi`

First present wins. Boot (`/health`) never reads credentials. Note: pi appends
`/v1/messages` to `ANTHROPIC_BASE_URL`, so Anthropic-compat base URLs must omit
the `/v1` suffix.

## Version pins

Exact npm versions in `package.json` (from spike lockfile):

- `@rivet-dev/agentos-core` **0.2.4**
- `@agentos-software/pi` **0.2.1**
- `@agentos-software/opencode` **0.2.1**
- `zod` **4.4.3**

Bump only with a deliberate churn review; adapter stays behind `AgentOsTransport`.

## Setup (one-time, WSL)

```bash
wsl -e bash -lc "cd /mnt/c/Users/rybow/QuantFlow/tools/agentos-host && npm install"
```

## Verification

```bash
# Boot without credentials (health only)
wsl -e bash -lc "cd /mnt/c/Users/rybow/QuantFlow/tools/agentos-host && AGENTOS_HOST_PORT=7430 node host.js" &
curl http://127.0.0.1:7430/health

bun qa/run.ts agentos-live   # SKIP or live run
bun test src/harness/agentos/http-transport.test.ts
```

Windows lifecycle: `src/harness/agentos/host-lifecycle.ts`.

## Child DOX Index

None.
