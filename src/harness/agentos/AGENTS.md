# src/harness/agentos — Agent Guide

AgentOS harness-of-record adapter (P5). Production deps (`@rivet-dev/agentos-core`)
live in the WSL **host process** (`tools/agentos-host/`), not in this repo root.

## Purpose

- Implement `WorkerHarness` for kind `agentos`.
- Translate ACP `session/update` events → milestone `ReceiptDraft`s only.
- Bridge toolkit `approval-request` and ACP `onPermissionRequest` through the
  same injected `ApprovalGate` (host wires to Kernel checkpoint + `human_decision`).
- Expose `AgentOsTransport` — the localhost HTTP/SSE seam the WSL host implements.

## Ownership

| File | Role |
| --- | --- |
| `transport.ts` | `AgentOsTransport` interface (createSession, prompt, events, permission, readFile, dispose, health) |
| `http-transport.ts` | Windows-side HTTP + SSE client (`createHttpAgentOsTransport`) |
| `host-lifecycle.ts` | WSL spawn, health poll, stop (`startAgentOsHost` / `stopAgentOsHost`) |
| `credential-order.ts` | Credential precedence helper for live runs |
| `translator.ts` | Pure ACP → ReceiptDraft mapping; milestones only |
| `approval-gate.ts` | `ApprovalGate` types + `createSimApprovalGate` for tests |
| `sim-transport.ts` | Deterministic replay transport (CI / qa) |
| `index.ts` | `createAgentOsHarness({ transport, approvalGate?, ... })` |
| `fixtures/tier2-events-trimmed.jsonl` | Anonymized subset of spike `tier2-events.jsonl` |

## Translator rules

- **Tool calls:** one `progress` receipt at first `in_progress` (`metadata.milestone = tool.started`), one at terminal `completed`/`failed` (`tool.completed` / `tool.failed`), keyed by stable `toolCallId`.
- **Chunks:** never one receipt per `agent_message_chunk`; coalesce to at most one `transcript.summary` progress receipt per turn.
- **Turn boundaries:** `task_started` (session/turn start), `task_completed` (turn complete).
- **Approval:** `approval.requested` (progress) then `human_decision` with `blockedMs` on grant.
- **Artifact:** `task_submitted` with content hash (same convention as Eve/mock).
- Receipt **types** use the frozen `ReceiptType` vocabulary; milestone detail is in `metadata.milestone`.

## Fence

- Never call `emitKernelEvent`, `handle*Command`, or write Kernel SQLite.
- Return `ReceiptDraft` only; callers post via `kernel.receipt.post`.
- Unreachable transport → `agentos-harness unavailable: …` (never block app boot).

## Version pin policy

AgentOS is **v0.2.x pre-1.0**. All AgentOS API shapes stay behind `AgentOsTransport`
and the WSL host package (`tools/agentos-host/package.json` exact pins).

## Verification

```bash
bun test src/harness/agentos
bun qa/run.ts agentos-atom
bun qa/run.ts agentos-live    # non-blocking; SKIP without credential
bun qa/run.ts runtime-fence
bun qa/run.ts kill-switch
```

## Host process

WSL sidecar: `tools/agentos-host/host.js` — see `tools/agentos-host/AGENTS.md`.
Electron main ↔ host over localhost (same pattern as herdr). Lifecycle:
`startAgentOsHost()` spawns `wsl -e bash -lc "cd …/tools/agentos-host && node host.js"`.

## Child DOX Index

None.
