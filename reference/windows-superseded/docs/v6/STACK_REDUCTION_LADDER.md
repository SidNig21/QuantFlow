# STACK_REDUCTION_LADDER.md — ⛔ RETIRED (2026-07-09)

> **This ladder is NO LONGER the plan.** The single execution authority for the Dock/runtime
> restructure is now **`docs/v7/DOCK_RUNTIME_REWORK_SPEC.md`** (founder decision 2026-07-09:
> "rework spec = sole authority; do not let both docs claim to be the plan"). `CONTEXT.md` is the
> supporting glossary. This file is kept only as a historical record.
>
> **What carried forward:** R0 + R1 landed and are committed/pushed (`6abe527`, `09c3cc9` — the
> dock split into catalog + launch profiles is durable and still correct). The still-valid cleanup
> targets from R2–R5 (rebuild RuntimeHandle, remove `legacyRuntimeTarget` fallbacks, demote
> `runtime-state/`, registry-as-cache, legibility sweep) were **folded into the rework spec's
> "Cleanup & Deletion Targets" section**. The R2 live proof was superseded by the rework spec's
> AgentOS proof ladder (P0–P3). Everything below is history — do not execute from it.
>
> Original creation: 2026-07-07 · Branch: `quantflow-v6-actors`

---

## 1. Why this ladder exists

The product goal (locked): **an infinite canvas where every tile is a real terminal running a real
CLI agent (`claude`, `codex`), and tiles collaborate — one agent messages another over a cable and
gets a reply.**

As of 2026-07-07 the founder reports agent-to-agent still does not work live, even with the
readiness fix at `95d6a5a`. The diagnosis (deep-research report + `DOCS_PRODUCT_ARCHITECTURE_AUDIT.md`)
is not a missing engine — the Kernel is good — it is **too many places pretending to own the same
fact** (`runtime-state/`, `tile-session-registry.ts`, `dock-actors.ts`, the relay seam), plus a repo
layout that is hard to read. This ladder tightens ownership walls and legibility, rung by rung,
and only counts as done when the product moment is seen working.

## 2. Non-goals (guard rails — re-read these before every rung)

- **NOT a rebuild.** Kernel, terminals, PTY, cables, adapters all stay. We re-wall, we don't replace.
- **NO new runtimes or frameworks.** No Mastra, no Rivet, no Omnigent, no Temporal, no Durable
  Objects, no ACP client. v7 (`docs/v7/V7_MISSION.md`) is a separate track, gated behind this
  ladder's exit gate.
- **No renderer redesign.** UI changes only where a rung's seam demands it.
- **No drive-by refactors.** Each rung touches its named files. Legibility improvements ride along
  only inside files a rung already touches.

## 3. The target stack (corrected diagram — this wording is canonical)

```text
QF Dock            → launch catalog / actor cards
Canvas             → visual projection / xterm / cables / timeline (projector, never a database)
Kernel + Receipts  → official truth / commands / events / replay / proof
TileActor (future) → durable lifecycle wrapper for one tile-bound worker/session (v7; this ladder
                     only leaves a clean seam for it — NOT grouped with Dock/Canvas)
Execution lanes    → windows-pty / herdr-wsl / agentos (Runtime Lifecycle Layer; the existing
                     src/harness/runtime-manager/ is the Worker Recovery Manager — a different job)
Tool layer         → MCP / custom tools (external adapter, never the internal control plane)
Agent brains       → claude / codex / hermes / eve
ACP                → optional FUTURE agent-session protocol boundary. Not built here.
```

## 4. Ownership matrix (the enforceable version of KERNEL_CONSTITUTION.md)

| Fact | Sole owner | Everyone else |
|---|---|---|
| Tiles, workers, tasks, connections, receipts, artifacts, approvals | **Kernel (SQLite)** | project / cache / report |
| Kernel events | `emitKernelEvent` (sole fan-out; frozen taxonomy) | listen only |
| Receipts | `postReceipt` (only write path; append-only) | read only |
| What appears in the dock | dock catalog (R1) | render it |
| How an actor launches | launch profile (R1) | consume it |
| Live session handles / byte transport | execution lanes behind the RuntimeHandle (R2) | call the interface |
| `runtime-state/` contents | derived mirror ONLY (R3) | never first read for canonical nouns |
| `tile-session-registry.ts` contents | projection cache of Kernel truth (R5) | never a second graph |

**The rule in one line:** a runtime event may be useful immediately, but it is not product truth
until the Kernel accepts it.

## 5. The rungs

Protocol per rung: Fable writes the brief → Codex implements (`codex exec`, workspace sandbox,
never commits) → Fable reviews the full diff + runs gates → revisions via `codex exec resume` →
founder sees the verified result → commit. One rung in flight at a time.

| Rung | Work | Gate (all must pass) |
|---|---|---|
| **R0** | Authority cut: this doc created; ownership matrix written; `DOC_AUTHORITY_MAP.md` updated (branch/date header fixed, this ladder registered as CURRENT) | Docs committed; no code touched |
| **R1** | Split `dock-actors.ts` (~600 lines, 13 exports) into `dock-catalog.ts` (product cards: id/name/description/dockSubtitle/color/roleColor/icon/kind) + `launch-profiles.ts` (runtimeTarget/harness/agentos fields/commandTemplate/cwd resolvers/startupPrompt/modelHint/legacyRuntimeTarget/agentAdapter). `dock-actors.ts` stays as composing façade — all 13 exports identical in name/signature/output; consumers need zero import changes | `bun test` ≥1087 green · `bun run build` green · new equivalence test pins load-bearing fields (claude/codex `agentAdapter`, eve `commandTemplate`, per-actor `runtimeTarget`) as literals · diff review |
| **R2** | One narrow `RuntimeHandle` interface (start / attach / send / stop / report-lifecycle) over the existing lanes; `tile-relay-dispatcher.ts` + the spawn path call through it. Wraps `delegateWindowsPty`/`delegateHerdr`/`delegateAgentOs` — does not rewrite them | Tests + build green · **live-proof attempt #1**: two `claude` tiles, cable, message → reply. If it fails, the failure is in-scope for R2 and gets fixed here |
| **R3** | Demote `runtime-state/` to definitely-derived: no feature reads it as first source for tiles/tasks/connections/artifacts/events; keep `pty-sessions-repo` + diagnostics as operational stores; add a boundary test/lint that fails on canonical first-reads | Tests + build green · audit grep proves no canonical first-reads |
| **R4** | Cable/message semantics into the Kernel: `kernel.message.send` command; extend the frozen taxonomy **intentionally** with `tile.ready`, `message.sent`, `message.replied` (same 3 as V7_MISSION r2, so v7 lands cleanly later); receipts for message proof; relay dispatcher becomes plumbing under the command | Tests + build green · **live-proof attempt #2** with the message visible in Kernel events + receipts |
| **R5** | Registry-as-cache discipline for `tile-session-registry.ts` + repo legibility sweep: stale docs archived per `DOC_AUTHORITY_MAP.md` process, dead files quarantined to `reference/`, folder layout documented in `REPO_MAP.md` | Tests + build green · founder can navigate the tree from `REPO_MAP.md` alone |
| **EXIT** | **Founder-visible live proof:** founder personally spawns two `claude` tiles, cables them, sends a message, sees the reply — with the exchange visible in receipts. Screenshot to `docs/v6/reports/evidence/` | Founder says "seen it" |

## 6. Status log (update in the same change as the work — this table is the anti-stale-doc device)

| Date | Rung | Status | Evidence |
|---|---|---|---|
| 2026-07-07 | R0 | ✅ done (this commit) | This file + `DOC_AUTHORITY_MAP.md` diff |
| 2026-07-07 | R1 | ✅ built by Codex, verified by Fable | 1088 tests / 0 fail · build green · old-vs-new deep-compare: 7 actors, every field identical, order preserved · commit pending |
| — | R2–R5, EXIT | ⬜ pending | — |
