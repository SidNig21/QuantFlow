# QuantFlow — repo entry (Cursor / agents)

**Vault is authority.** This file only routes you there.

## Canonical read order (every session)

1. `C:\Users\rybow\Obsidian\Cursor Collab\Projects\QuantFlow\Start Here.md`
2. `...\Projects\QuantFlow\Build Plan.md` — **only execution doc**
3. `...\Projects\QuantFlow\How the pieces fit.md` — architecture guardrails

Never implement from vault `Projects/QuantFlow/reference/` or `reference/archive/`.

## This repo

| | |
|---|---|
| Root | `C:\Users\rybow\QuantFlow` |
| App | `quantflow-electron/` |
| Branch | `QuantFlow` — pull/push `origin` only |
| MCP relay | port **9811** (app must be running) |
| Git rules | `Obsidian/Cursor Collab/Specs/Github-repos-and-workflow-rules.md` |

## Current slice (see Build Plan)

**0a next** — herdr install in WSL + `herdr-client.sock` attach spike.

Do not rewire spawn or strings until **0a** and **0b** pass.

## Guardrails (summary)

Details in vault **How the pieces fit** and **Build Plan** settled decisions.

- herdr → WSL session authority (after spike); node-pty sidecar → Windows shell fallback only
- Strings → event pings, not stdout firehose
- Envoy → one canvas-scoped space; dumb processes never call Envoy directly
- `connections[]` canonical; `connection_id` + `correlation_id` for Watchtower/Envoy proof
- Legend/templates build canvas; Hermes orchestrates **after** manual **Commence**

## Before coding

```bash
git pull origin QuantFlow
git status --short --branch
```

Read **Build Plan** for acceptance criteria for the active slice.
