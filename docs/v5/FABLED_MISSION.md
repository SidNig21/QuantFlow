# QUANTFLOW v5 "FABLED" — MISSION ORDER

> **Branch:** `quantflow-v5-fabled` (branched from `quantflow-v4` at A3 commit `a3025ec`)
> **Authorized:** founder directive 2026-07-03, executed while the founder is traveling.
> **Orchestrator/Verifier:** Fable (Cursor) · **Builders:** Composer sub-agents
> **This document is the mission's single source of authority for scope and order.**
> `START_HERE.md` still wins on *rules* (truth model, hard agent rules); this doc wins on *what next*.

---

## 0. RESUME PROTOCOL — every session starts here

1. Read this file top to bottom.
2. Read `docs/v5/reports/` — the highest-numbered `P*-REPORT.md` tells you where the last session stopped. No reports = start at Phase 0.
3. Read `START_HERE.md` §2 (truth model) + §8 (hard rules). They bind every phase.
4. Confirm you are on branch `quantflow-v5-fabled`. **Never commit to `quantflow-v4` or `main`. Push only `quantflow-v5-fabled`.**
5. Resume at the first phase whose exit gate is not proven green. One phase at a time.

## 1. The finish line (what "done" looks like)

One operator opens QuantFlow, clicks a legend entry, and a **real agent runs inside AgentOS** (WSL sidecar). Every meaningful transition lands as a **Kernel receipt**. The canvas tile updates **live from Kernel events only** — no parallel truth. Mid-run, the agent hits an **approval gate** and blocks until approved from the canvas. Afterward the operator **replays the run from receipts**. That is the smallest proof loop with AgentOS as harness-of-record, and it is Phase 6's product proof.

**What QuantFlow is:** a desktop visual operator console for governed autonomous workflows. Kernel owns truth; canvas is projection; receipts prove; Conductor plans; harnesses execute; AgentOS is the execution substrate — never a second brain, never a truth store.

## 2. Non-negotiables (violating any of these ends the session)

1. **The Kernel is the only truth.** No new stores, no AgentOS-session-as-state, no "temporary" caches that persist. AgentOS transcripts/sessions are evidence feeds, never authority.
2. **Receipts are append-only; the receipt schema is frozen** (A2 contract, `docs/v4/KERNEL_CONTRACT.md`).
3. **No self-approval:** the sub-agent that built a chunk never verifies it. Fable verifies every chunk by re-running its proof and auditing the diff.
4. **A gate that fails twice → stop the phase**, write the report, move to the next *independent* phase only if this doc marks it independent; otherwise end the session with a clear report.
5. **Secrets never enter the repo or the VM.** API keys come from the operator's environment / existing vault accessor at runtime. AgentOS toolKit calls execute host-side precisely so credentials stay out of the VM.
6. **Never push `quantflow-v4` or `main`. Never force-push anything.**
7. Ceiling for any self-assigned status is `Implemented-unverified` until its `qa/` command exists and passes; then Fable may mark `Implemented-verified` naming the command. Founder-reserved proofs are listed in §6.

## 3. Roles & cost discipline

- **Fable:** reads this doc, scopes each chunk into a short work order (files, must-not-change, proof command), dispatches a Composer sub-agent, then **verifies**: re-run proof, audit diff, commit. Fable writes the phase reports. Fable does NOT bulk-edit code when a Composer can.
- **Composer sub-agents:** one chunk each, smallest possible scope, return diff + proof output. They never commit; Fable commits after verification.
- Commit format: `<layer>(<phase.chunk>): <objective>`. One chunk = one commit. Push `quantflow-v5-fabled` after each phase's gate goes green.

## 4. PHASE LADDER

Phases must run in order (P0→P6). Chunk specs already written in-repo are cited, not duplicated — read them at execution time.

### P0 — Windows test baseline (unblocks everything; the prior two nights died here)
The Electron suite has **12 stable pre-existing failures on native Windows** (see `docs/v4/handoffs/NIGHT1-B1-RETRY-REPORT.md` for the exact list). Fix honestly, in three buckets:
- **Path-separator test bugs** (vault-relative pins, preview/compose, atomicWriteFileSync): normalize separators in expectations or the code under test's *test-facing* normalization — behavior-preserving.
- **POSIX-only** (tmux helpers, `ls`-dependent `files.test.ts`, tmux backend-default): `skipIf(process.platform === "win32")` with a named reason string. Truthful skips, not deleted tests.
- **Suspicious two** — "QuantFlow release identity > root README" and "obsidian envoy mirror": investigate before touching; these may be REAL drift. If real, fix the drift; report either way.
**Exit gate:** `cd quantflow-electron && bun test` fully green on native Windows, twice consecutively. `bun test src` at repo root green (it sweeps the same files). No production behavior change (diff audit confirms tests/skips only, except justified drift fixes).

### P1 — Stage B: proof machinery (G-measure)
Execute `docs/v4/handoffs/NIGHT1-A3-stageB.md` §3–§7 (B1→B5) exactly, with this **gate policy update**: B1's seeds are `contract-nouns`, `unit-kernel` (scoped: `bun test src/kernel src/harness src/main/conductor src/evals`), `unit-kernel-full` (`bun test src`), `unit-shell` (`cd quantflow-electron && bun test`) — after P0, ALL are blocking-green. PF0 spec: `docs/v4/PERFORMANCE_LADDER.md` § PF0 + its Handoff Block, verbatim.
**Exit gate:** `bun qa/run.ts --list` shows all checks green incl. `golden` twice consecutively; `smoke:perf-trace` green; `qa/perf-baseline.json` committed with B1/B3/B4 p50/p95×5 incl. snapshot-refetch count.

### P2 — Stage C: thin seam extraction + PF1 router (canvas starts getting smooth)
`REBUILD_QUEUE.md` Stage C (C1→C3): carve `renderer-event-router.js` then `projection.js` out of `renderer.js` (behavior-preserving), land the **PF1 incremental projection router** (`docs/v4/PERFORMANCE_LADDER.md` § PF1): event-kind dispatch to targeted surface refresh, ~50ms debounce, stop blanket snapshot refetches.
**Exit gate:** golden run identical; storm check — 100 `receipt.posted` → **0 full snapshot refetches** vs P1 baseline; all P1 qa checks still green.

### P3 — Stage D: collapse duplicate truth (THE CENTERPIECE — behind a flag)
`REBUILD_QUEUE.md` Stage D (D0→D5): tile-extension schema, boot from Kernel only, JSON save → export, retire `canvas-state.js` to read-through cache, runtime-state → derived mirror, **divergence test** in qa/. Phase it exactly as specced: demote-read before stop-write, everything behind a reversible flag (`QF_ONE_TRUTH=1` or equivalent).
**Exit gate (machine):** divergence qa check green with the flag ON in the test environment; golden preserved with flag OFF; both boot paths proven.
**Founder-reserved (§6):** flipping the flag to default-ON in the live app + the witnessed product proof. Do NOT default the flag on.

### P4 — Stage E + F: one event path + fences
Stage E (E1–E3): one event path, PTY raw stream out of projection, storm test stays 0-refetch. Stage F: secrets via single `getCredential()` accessor (F1); **external-runtime fence** (F2 generalized): conformance test — no Kernel-canonical fact originates outside the Kernel — plus kill switch proving the app runs fully with Eve AND AgentOS unreachable.
**Exit gate:** E3 storm green; fence conformance + kill-switch qa checks green.

### P5 — AgentOS harness-of-record (`src/harness/agentos/`)
The integration the mission exists for. Shape is proven — see `C:\Users\rybow\agentos-spike\SPIKE_VERDICT.md` (GO, 2026-07-02) and `tier2-bindings.ts` for working code.
- **Host process:** a thin Node "agentos-host" running in **WSL** (native Windows unsupported by AgentOS), using `@rivet-dev/agentos-core` directly: `AgentOs.create({ software, toolKits })`. Electron main ↔ host over localhost (same pattern as herdr). Lifecycle owned by the harness adapter (spawn/health/kill).
- **Adapter:** implements the existing `WorkerHarness` contract (`src/harness/types.ts`, register in `src/harness/registry.ts` as kind `agentos`). Harnesses report facts; they never write Kernel state directly.
- **toolKit bridge (host-side, creds never in VM):** `receipt-emit` → Kernel receipt command; `artifact-put` → content-addressed artifact command; `approval-request` → **blocks** on the Kernel checkpoint gate (`checkpoint_state`, `human_decision` receipt on resolution). Also wire `onPermissionRequest`/`respondPermission` (ACP-level) to the same checkpoint path.
- **Receipt translator:** ACP `session/update` events (`tool_call` lifecycle with stable `toolCallId`, `agent_message_chunk`) → milestone receipts + Kernel events for projection. Milestones only — never a receipt per chunk/stdout line.
- **Config — credential source, checked in this order (first present wins):**
  1. **`OPENCODE_API_KEY`** (alias `OPENCODE_ZEN_API_KEY`) — use AgentOS's `opencode` built-in software (`@agentos-software/opencode`, install alongside `pi`; not yet present in the spike). No base-URL override needed — Zen is OpenCode's own hosted router. **Preferred when present** — one env var, no quirks.
  2. **`OPENROUTER_API_KEY`** — use `pi` software per the spike, with `ANTHROPIC_BASE_URL=https://openrouter.ai/api` (NOT `/api/v1` — verified quirk, see `agentos-spike/spike-env.ts`).
  3. **`ANTHROPIC_API_KEY`** — use `pi` or `claude-code` software directly, no base-URL override.
  Adapter reads whichever is set from the operator's environment via the vault accessor at spawn; never hardcode a provider. If more than one is set, honor the order above (don't ask, don't guess further — proceed).
- AgentOS is **v0.2.x pre-1.0**: pin exact versions; wrap its API behind the adapter so churn stays contained.
**Exit gate:** qa check `agentos-atom` — scripted task through the adapter produces the expected receipt chain (start → tool milestones → approval blocked/granted → artifact → complete), passes the same fence conformance as Eve, and the kill switch still proves the app runs with the sidecar down. If no key from any of the three sources is available in the environment, mark the live-model slice `Deferred-founder` and prove with the mock/sim harness.

### P6 — The live proof loop + trip report
Wire the visible payoff using surfaces that already exist (S0 kernel-event bridge, state cards, watchtower kernel-live tab, checkpoint plumbing — this is a REBIND, not new UI systems):
legend/dock entry spawns an `agentos` WorkerInstance → tile state card updates live from Kernel events → approval checkpoint appears (canvas approve resumes the blocked agent) → replay timeline reads from receipts.
**Exit gate (machine):** Playwright/scripted run of the loop green + screenshots captured to `docs/v5/reports/evidence/`.
**Founder-reserved:** the witnessed run. Write `docs/v5/reports/FABLED_TRIP_REPORT.md`: per-phase status table (each row naming its qa command), the D-flag decision waiting for the founder, screenshots, and the exact 10-minute script for the founder's return demo.

## 5. Gate policy (learned from Night 1 — do not relearn it)

- Every blocking gate must be a command that can be green **on this machine**. If a gate is red for pre-existing host reasons, the fix is a **named chunk that repairs the baseline** (like P0) — never silently narrowing scope, never a permanently-red "non-blocking" check without a repair chunk scheduled.
- WSL is the authorized fallback lane for POSIX-only tooling (and the required lane for the AgentOS sidecar). Native Windows remains the lane for the Electron app and its suite.
- Phantom `M` entries on shell files with empty diffs are CRLF artifacts — ignore, never commit line-ending-only changes. `Rebuild Prompt.md` and `logs/` are operator files — never commit or delete.

## 6. DEFERRED TO FOUNDER (do not do these, list them in the trip report)

1. Defaulting the Stage D one-truth flag ON in the live app + the witnessed divergence product proof (constitutionally the founder's, `START_HERE.md` §7).
2. Deleting the Eve harness lane / `quantflow-eve` (fence it per P4; retirement is a founder decision after AgentOS proves out).
3. Merging `quantflow-v5-fabled` back to `quantflow-v4`/`main`.
4. Any spend beyond the operator's existing API keys; any new external service.
5. Stage G/H (bulk decomposition, token spine, QA closeout) — post-trip unless every phase above is green with time to spare, in which case G may begin under the same rules.

## 7. Reporting

Per phase: `docs/v5/reports/P<N>-REPORT.md` — same template as `docs/v4/handoffs/NIGHT1-A3-stageB.md` §9 (real pasted output, deviations with reasons, findings, verifier commands). Commit reports with the phase. The REBUILD_QUEUE.md STATUS rows are updated in the same commit that proves them.

## 8. Session end conditions

End the session (with report) when: a phase gate fails twice after an honest repair attempt · a non-negotiable would have to bend to proceed · anything requires a §6 founder decision to continue. Otherwise: keep going. The mission is done when P6's machine gate is green and the trip report is written.
