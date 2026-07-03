# src/harness/agentos — Agent Guide

AgentOS harness-of-record adapter (P5). **Sim-first** in this repo: production
deps (`@rivet-dev/agentos-core`) live in the WSL **host process** (next chunk),
not here.

## Purpose

- Implement `WorkerHarness` for kind `agentos`.
- Translate ACP `session/update` events → milestone `ReceiptDraft`s only.
- Bridge toolkit `approval-request` and ACP `onPermissionRequest` through the
  same injected `ApprovalGate` (host wires to Kernel checkpoint + `human_decision`).
- Expose `AgentOsTransport` — the localhost JSON-RPC seam the host implements.

## Ownership

| File | Role |
| --- | --- |
| `transport.ts` | `AgentOsTransport` interface (createSession, prompt, events, permission, readFile, dispose, health) |
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
so npm churn is contained in the WSL host process.

## Verification

```bash
bun test src/harness/agentos
bun qa/run.ts agentos-atom
bun qa/run.ts runtime-fence
bun qa/run.ts kill-switch
```

## Host process (next chunk)

Thin Node process in WSL: `AgentOs.create({ software, toolKits })`, localhost
HTTP/JSON-RPC, toolKit bridge (`receipt-emit`, `artifact-put`, `approval-request`).
Electron main ↔ host same pattern as herdr/Eve.

## Child DOX Index

None.
