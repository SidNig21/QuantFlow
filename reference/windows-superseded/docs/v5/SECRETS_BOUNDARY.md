# SECRETS_BOUNDARY.md — Stage F1

> **Authority:** `REBUILD_QUEUE.md` Stage F1 · `docs/v5/FABLED_MISSION.md` §2.5  
> **Accessor:** `src/vault/credentials.ts` — the **only** host-side env credential reader.

---

## Contract

| Rule | Detail |
| --- | --- |
| Single accessor | `getCredential(name)` in `src/vault/credentials.ts` reads `process.env` on the **host** only |
| No miss cache | Absent/empty env vars re-read every call — no negative caching |
| Never log values | Callers must not log return values; diagnostics report presence only |
| Typed names | `KnownCredentialName` union + `(string & {})` escape hatch for dynamic keys |
| Renderer ban | Preload/renderer **must not** read API keys or tokens — route through main-process IPC |
| VM boundary | AgentOS toolKit calls execute **host-side** so credentials never enter the WSL VM (mission §2.5) |
| QA gate | `bun qa/run.ts secrets-accessor` — no direct `process.env.<SECRET>` outside the accessor; no `sk-…` / `ghp_…` literals in tracked source |

### Electron safeStorage layer

`quantflow-electron/src/main/credentials/credential-accessor.ts` adds an **optional** encrypted file layer (`~/.quantflow/credentials/*.safe`) for operator-stored keys. It **delegates to** `getCredential()` from the vault accessor for env fallback. Env reads still centralize in `src/vault/credentials.ts`.

---

## Inventory (env var names only)

| File | Env var / source | Consumer | Runtime side |
| --- | --- | --- | --- |
| `src/vault/credentials.ts` | All `KnownCredentialName` keys | Canonical accessor | Host |
| `src/vault/credentials-core.js` | Same (Node/MCP import surface) | MCP relay, CJS scripts | Host |
| `quantflow-electron/src/main/credentials/credential-accessor.ts` | `OPENROUTER_API_KEY` (+ safeStorage file) | Capability preflight, OpenRouter/Eve probes | Main (host) |
| `quantflow-electron/src/main/diagnostics/capability-probes.ts` | via credential-accessor | Provider reachability checks | Main (host) |
| `tools/quantflow-mcp/relay-token.js` | `QUANTFLOW_RELAY_TOKEN`, `QUANTFLOW_RELAY_TOKEN_FILE`, `~/.quantflow/relay-token` | MCP → Electron JSON-RPC relay auth | Host (MCP adapter) |
| `tools/quantflow-mcp/server.js` | via `relay-token.js` | MCP server proxy | Host (MCP adapter) |
| `quantflow-electron/scripts/upload-to-github.cjs` | `GH_TOKEN`, `GITHUB_TOKEN` | Release upload script (operator-only) | Host script |
| `src/harness/eve/index.ts` | `QF_EVE_BASE_URL`, `QF_EVE_WORKSPACE` | Eve HTTP harness endpoint (**not secrets** — URLs/paths) | Host harness adapter |

### Not secrets (flags / paths — exempt from accessor routing)

| Env var | Purpose |
| --- | --- |
| `QF_ONE_TRUTH`, `QUANTFLOW_TRACE`, `QF_PERF_TRACE` | Feature flags |
| `QUANTFLOW_DIR`, `QF_PERF_DIR`, `QUANTFLOW_HOME` | Paths |
| `QF_EVE_BASE_URL`, `QF_EVE_WORKSPACE` | Eve harness config (non-secret) |
| `QUANTFLOW_RELAY_HOST`, `QUANTFLOW_RELAY_PORT` | Relay network config (non-secret) |
| `SHELL`, `HOME`, `LANG`, `NODE_ENV` | OS/runtime |

### Renderer finding (no action required)

| File | Note |
| --- | --- |
| `quantflow-electron/src/preload/shell.ts` | Reads **flags only** (`QUANTFLOW_TRACE`, `QF_ONE_TRUTH`) — no credential access |
| `quantflow-electron/src/main/analytics.ts` | `MAIN_VITE_POSTHOG_KEY` is build-time `import.meta.env` — not runtime secret accessor scope |

---

## F3 deferred (SDK adapter)

Stage F3 (A2A-shaped SDK adapter contract) is **DEFERRED past structure-freeze** per `REBUILD_QUEUE.md`. F1 delivers the accessor + boundary doc only; F3 will consume `getCredential()` when promoted — no duplicate secret paths.

---

## Verification

```text
bun qa/run.ts secrets-accessor
```
