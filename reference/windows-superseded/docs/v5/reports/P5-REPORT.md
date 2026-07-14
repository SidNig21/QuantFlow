# P5 Report — AgentOS harness-of-record (`src/harness/agentos/`)

Branch: `quantflow-v5-fabled` · Phase gate: **GREEN** (`agentos-atom` + fence conformance + kill-switch) · Live slice: **PROVEN** (`agentos-live` PASS against OpenCode Zen)

## Commits

| Commit | Chunk | Summary |
| --- | --- | --- |
| `c02caf4` | P5.A | AgentOS adapter — injected `AgentOsTransport` seam, ACP `session/update` → milestone `ReceiptDraft` translator (start → tool milestones → approval → artifact → complete), blocking ApprovalGate bridge, `sim-transport.ts` + trimmed tier2 ACP fixture, `agentos-atom` qa (receipt chain + O(1) chunk coalescing), kill-switch extended to AgentOS-down |
| (this commit) | P5.B | WSL `tools/agentos-host/` sidecar (HTTP+SSE wire protocol, credential-order session env, pinned `@rivet-dev/agentos-core` 0.2.4), Windows `http-transport.ts` client + `host-lifecycle.ts` (WSLENV credential passthrough, health poll, WSL-IP fallback), `credential-order.ts`, `agentos-live` qa (non-blocking live smoke) |

## P5.A — adapter (headless, CI-safe)

- `src/harness/agentos/index.ts` registers harness kind `agentos`; construction **requires** an injected `AgentOsTransport` — no ambient network, no Electron imports. Sim transport replays a trimmed real tier2 ACP event stream for `agentos-atom`.
- Translator coalesces per-chunk `session/update` noise into O(1) milestones; approval requests block on the ApprovalGate bridge until granted/denied; drafts are returned to callers who post via Kernel commands (adapter never calls `kernel.*` — same fence as Eve).
- `agentos-atom` qa: scripted session through the adapter yields the expected receipt chain and passes `runtime-fence` conformance. `kill-switch` qa proves app paths run with the AgentOS sidecar unreachable (graceful `agentos unavailable` errors, boot never blocked).

## P5.B — WSL host + live transport

- **Host** (`tools/agentos-host/host.js`, WSL-only Node): runs `AgentOs.create` in-process, exposes `127.0.0.1:7430` wire protocol (`/health`, `/session`, `/prompt`, SSE `/events`, `/permission`, `/file`, `/dispose`). Deps pinned outside the QuantFlow root package.json.
- **Windows side**: `http-transport.ts` implements `AgentOsTransport` over fetch + SSE stream parse; `host-lifecycle.ts` spawns `wsl node host.js`, polls health, and passes credentials via `WSLENV` (`/u` flags) — the fix for Windows env vars not crossing the WSL boundary.
- **Credential order** (mission §P5, one adjustment): `OPENCODE_API_KEY` → **`pi` software with a custom `zen` provider**, then `OPENROUTER_API_KEY` → `pi` + base-URL override, then `ANTHROPIC_API_KEY` → `pi` direct. First present wins; keys stay in the host process env, never logged.

### Live-slice finding: the `opencode` software cannot route Zen

The mission's original P5 order said `OPENCODE_API_KEY` → `opencode` software. Verified impossible with the pinned versions (2026-07-03): the `@agentos-software/opencode` ACP adapter hardcodes an Anthropic catalog, ignores `OPENCODE_CONFIG_CONTENT` for provider selection, and its in-VM models.dev catalog is stale/unreachable (`OPENCODE_MODELS_PATH` injection ineffective). Every route ended in `Anthropic API key is missing`.

Working route instead: `pi` software + custom provider. The host writes `~/.pi/agent/{models.json,settings.json}` into the VM before `createSession`, registering a `zen` provider (`https://opencode.ai/zen/v1`, OpenAI-compat, `apiKey: "OPENCODE_API_KEY"` env indirection) with default model `big-pickle` (free tier — the operator's Zen workspace has zero paid credits; paid models return `CreditsError`). Override via `AGENTOS_MODEL`. Note for future base-URL work: pi appends `/v1/messages` to `ANTHROPIC_BASE_URL`, so Anthropic-compat bases must omit `/v1`.

## Gate verification (Fable re-ran, exits 0)

```
agentos-atom 0 · agentos-live PASS (OPENCODE_API_KEY, blockedMs=1997)
all 21 blocking qa checks 0: contract-nouns · unit-kernel · unit-kernel-full · unit-shell
  perf-baseline(+present) · taxonomy-sync · golden-capture · golden · storm · pty-flood
  one-truth-boot · one-truth-save · connection-round-trip · canvas-cache-discipline
  divergence · one-event-path · secrets-accessor · runtime-fence · kill-switch
bun test src/harness: 19 pass / 0 fail
```

## Named findings deferred

- Paid Zen models blocked by workspace balance (`CreditsError`) — live slice runs on free tier (`big-pickle`); switching to a paid model is founder-reserved (add credits or set `AGENTOS_MODEL`).
- `claude-code` software path (mission P5 order #3 alternate) untested — no `ANTHROPIC_API_KEY` in environment.
- AgentOS v0.2.x churn risk contained behind `AgentOsTransport`; version bumps require deliberate review (pins in `tools/agentos-host/package.json`).

## Risks

- `agentos-live` is non-blocking (SKIP without credential) by design — CI stays hermetic; live regressions surface only when a key is present.
- The VM `~/.pi/agent` config write happens per session-create; if AgentOS changes VM home-dir layout, the zen provider silently falls back to pi defaults (would fail loudly with `Anthropic API key is missing`).
