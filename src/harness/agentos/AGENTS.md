# src/harness/agentos — Agent Guide

AgentOS harness-of-record adapter (P5). Production deps (`@rivet-dev/agentos-core`)
live in the WSL **host process** (`tools/agentos-host/`), not in this repo root.

## Purpose

- Implement `WorkerHarness` for kind `agentos`.
- Translate ACP `session/update` events → milestone `ReceiptDraft`s only.
- Bridge toolkit `approval-request` and ACP `onPermissionRequest` through the
  same injected `ApprovalGate`. The production gate lives in Electron main
  (`quantflow-electron/src/main/agentos-approval.ts`): it surfaces the blocker on
  the tile state card (`kernel.state_card.update`), posts `approval.requested`
  progress + `human_decision` receipts, and resolves via `agentos:approve` IPC.
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

## Actor address threading

- `createSession` accepts `workspaceId` + `tileId`; together they are the
  durable actor address. The TypeScript seam keeps them optional for sim/legacy
  adapters, but the production durable host rejects an unkeyed session loudly.
- The harness carries spawn `workspaceId` separately from cwd/artifact workspace
  paths and forwards the exact spawn identity to session creation.
- VM artifact reads may include `sessionId` so a multi-actor host can select the
  actor that owns the file without changing artifact paths.

## Translator rules

- **Tool calls:** one `progress` receipt at first `in_progress` (`metadata.milestone = tool.started`), one at terminal `completed`/`failed` (`tool.completed` / `tool.failed`), keyed by stable `toolCallId`.
- **Chunks:** never one receipt per `agent_message_chunk`; coalesce to at most one `transcript.summary` progress receipt per turn.
- **Agent reply:** one `progress` receipt after `prompt()` returns meaningful text (`metadata.milestone = agent.reply`). This proves the Agent send-to-reply readiness bar.
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
`startAgentOsHost()` spawns WSL through `bash -lc`, sources `~/.profile` and
`~/.nvm/nvm.sh` when present, prefers `nvm use 24`, then runs
`tools/agentos-host/host.js`. Keep this profile/NVM step: live Eve/AgentOS
proofs depend on the same WSL credential and Node setup used by manual probes.

## Live wiring (Electron main, P6)

- `quantflow-electron/src/main/agentos-service.ts` — lazy singleton behind
  `getWorkerHarness('agentos')`. V0.1: `prewarmAgentOsHost()` fire-and-forgets
  WSL host start after app boot (non-blocking; kill-switch invariant preserved).
  V0.2: cold-WSL health budget default 90s (`resolveAgentOsHealthTimeoutMs`).
  V0.3: `error-messages.ts` — three distinct user-facing failure classes.
  V1: `getAgentOsTransport()` + terminal bridge via `agentos-terminal-bridge.ts`.
  `QF_AGENTOS_SIM=1` swaps in the sim transport (scripted proofs).
- `quantflow-electron/src/main/agentos-run.ts` — fire-and-forget run driver
  (`agentos:run` IPC): spawn → send → collectReceipts → `kernel.receipt.post`.
- Scripted proof: `bun qa/run.ts loop-proof` (see
  `quantflow-electron/src/main/agentos-loop-proof.ts`).

## Child DOX Index

None.
