# QuantFlow — repo entry (Cursor / agents)

**Branch `quantflow-v2`:** repo root docs are authority. Do not execute from vault v1 Build Plan or archived layer charters.

## Canonical read order (`quantflow-v2`)

1. `CONCEPT.md` — what QuantFlow is
2. `SCOPE.md` — active gates, rejects (no A2A)
3. `BUILD_PLAN_V2.md` — **only execution doc**
4. `RETIREMENT.md` — what is dead / rejected
5. `ARCHITECTURE.md` — short pointer only

**Ignore:** `reference/archive/` (including old 7-layer charters), vault `Projects/QuantFlow/Build Plan.md` unless operator asks.

## This repo

| | |
|---|---|
| Root | `C:\Users\rybow\QuantFlow` |
| App | `quantflow-electron/` |
| Branch | `quantflow-v2` — pull/push `origin` only |
| MCP relay | port **9811** (app must be running) |

## Active slice

See `BUILD_PLAN_V2.md` — **Gate 3** (`events.subscribe`), then `retirement-herdr-cli`, then `envoy-obsidian`.

## Before coding

```bash
git pull origin quantflow-v2
git status --short --branch
```
