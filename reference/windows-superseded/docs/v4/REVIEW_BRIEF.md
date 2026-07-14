# v4 Independent Review Brief

**Purpose:** Two reviewers — **Claude** and **Cursor** — independently review the complete
QuantFlow v4 rung work, then a comparison pass reconciles the notes. This file is the *single
shared rubric*. Both reviewers read this and only this for scope + format.

**Read this framing carefully:** Your job is to **find what is wrong, weak, or unproven** — not
to confirm that it passed. The per-rung verifications already concluded "passed"; those
conclusions are deliberately **excluded** from this brief so they don't anchor you. Approach the
code as a skeptic seeing it for the first time. A review that finds nothing is a review that
didn't look hard enough — but do not invent problems; every finding must cite evidence.

---

## 1. Scope

**Branch:** `quantflow-v4` · **HEAD:** `e30cc82`
**v4 starts at:** `804459b` (parent `b381bcb`). Everything before `b381bcb` is v3 and is **out of
scope** — do not review v3 cable/relay/watchtower work. (`main..quantflow-v4` is misleading: main
is far behind and includes all of v3.)

**Code delta under review:** `b381bcb..quantflow-v4` restricted to `src/`,
`quantflow-electron/src/`, `tools/` ≈ **112 files / +9295**.

### Rung → commit map
| Rung | What | Anchor commit(s) |
|---|---|---|
| R0 | auth/capability preflight | (in early v4 docs+code) |
| R1 | one real task atom (structural verify) | `06f626c..6026971` |
| R2 | context envelope + artifact lineage | `8676faa` |
| R3 | DAG + authority consolidation | `018a388..bf62afc`, `72cd6c6` |
| R4 | durable pod runtime | `f399554`→`07fc8e2`→`35d8c51`→`ae55611` |
| R5 | human checkpoint / deepen loop | `355b623` |
| R6 | run templates (Scout/Research/Deep) | `95b26f6` |
| R7 | judgment & compounding (replay/semantic verify/evals) | `d8a8296` |
| R8 | legend bar onboarding + Mode-1 correction | `e244be5`, `4a1cb3b` |
| R8.5 | settings/authoring (Eve-first) | `38ab1e0` |

### Load-bearing files (review hardest)
- **Kernel truth/state machine:** `src/kernel/tasks/index.ts`, `src/kernel/tasks/state-machine.ts`,
  `src/kernel/tasks/verification-stages.ts`, `src/kernel/receipts/index.ts`,
  `src/kernel/artifacts/verify.ts`, `src/kernel/schema/types.ts`, `src/kernel/database.ts`
- **Workflow-as-run / queries:** `src/kernel/workflows/index.ts`, `src/kernel/queries/index.ts`,
  `src/kernel/commands/workflow-commands.ts`
- **Context envelope (R2):** `src/kernel/context/envelope.ts`
- **Conductor / orchestration:** `src/main/conductor/dag-scheduler.ts`,
  `src/main/conductor/conductor-loop.ts`, `src/main/conductor/run-template-runner.ts`,
  `src/main/conductor/run-replay.ts`, `src/main/conductor/conductor-actions.ts`
- **Runtime (R4):** `src/harness/runtime-manager/index.ts`, `src/harness/sim/index.ts`,
  `src/harness/mock/index.ts`, `src/harness/types.ts`, `src/harness/registry.ts`
- **Evals/judgment (R7):** `src/kernel/evals/auto-trigger.ts`, `src/evals/semantic-verification.ts`,
  `src/vault/index.ts`, `src/vault/exporters/*`
- **Migrations:** `src/kernel/migrations/00{3,4,5,6,7}-*.sql`
- **Electron seam:** `quantflow-electron/src/main/ipc-kernel-reads.ts`,
  `quantflow-electron/src/main/ipc-vault.ts`, `quantflow-electron/src/main/workflow-service.ts`,
  `quantflow-electron/src/main/envoy-kernel-bridge.ts`
- **MCP:** `tools/quantflow-mcp/tool-definitions.js`
- **Smokes (treat as executable claims — do they prove what they assert?):**
  `quantflow-electron/scripts/smoke-{task-atom,dag,context-flow,checkpoint,pod,authority,run-template,judgment}.ts`

---

## 2. Depth — review BOTH dimensions

1. **Correctness bugs** — read the diffs/files for real defects: logic errors, missing await,
   off-by-one, unhandled nulls, race conditions, idempotency holes, SQL injection / unescaped
   input, error paths that swallow real failures, type lies (`as any` hiding a wrong shape).
2. **Architecture / guardrail conformance** — do the invariants below actually hold *end-to-end
   across rungs*, not just inside one rung? This is where per-rung smokes are blind.

---

## 3. Invariant checklist (the shared rubric)

For each, state: **holds / violated / unproven**, with file:line evidence.

| ID | Invariant |
|---|---|
| **KT** | **Kernel owns truth.** Only Kernel command handlers mutate canonical state. No harness, conductor, MCP adapter, renderer, or runtime-manager writes kernel tables directly. |
| **F1** | **Run Replay is a projection, never truth.** `run-replay.ts` reconstructs from receipts/tasks/artifacts only; the `events` table is NOT persisted/read for replay. |
| **F14** | **One executor, not three.** R3 dag-scheduler + R4 runtime + R5 checkpoint + R6 template runner compose into a single execution path. The R6 runner is a compiler/driver that *asks* dag-scheduler for eligibility and routes checkpoints through the R5 controller — it does not re-implement scheduling or own task truth. |
| **F15** | **Semantic verify is its own escalating stage,** not inlined into structural `verifyTaskArtifacts`. Structural gates first; semantic cannot pass over a failed structural check. |
| **F16** | **Evals are non-authoritative.** Eval auto-trigger never gates claim/verify/complete; eval results are write-only and never read back into a state decision. |
| **NSS** | **No second store.** No `runs` table (Workflow IS the run, `run_id ≡ workflow_id`); Envoy is a mirror, not a second authority; vault is a mirror, artifact row is truth. |
| **MIG** | **Migrations are additive + sequential.** 004→007 add columns/tables only — no DROP/DELETE/destructive ALTER; each guards against missing columns / re-run; version rows correct. |
| **EO** | **Exactly-once / idempotency.** `attemptId` dedup (R4), proposalToken reuse (R5/R6), replay-safe eval inserts — re-delivery does not double-apply or corrupt. |
| **REF** | **Envelope is references-only + verified-only.** Context envelope (R2) passes artifact ids/uri/hash, never bodies; only `complete`+`verification_passed` upstream; sensitivity default-deny. |
| **AUTH** | **Decision authority.** Checkpoints never auto-decide; forged/drifted/replayed proposalTokens are rejected (→ stale), spawn nothing. Workers cannot self-complete without the verify gate (legacy bypass stays scoped/flagged). |

---

## 4. Output format (write findings in THIS shape so notes diff cleanly)

Write to your own file, blind to the other reviewer:
- Claude → `qa/v4-review-claude.md`
- Cursor → `qa/v4-review-cursor.md`

Each finding:
```
### [C-01]  <severity>  ·  <rung>  ·  <file>:<line>
**Claim:**  one sentence — what's wrong / weak / unproven.
**Evidence:**  the code/behavior that shows it (quote or path:line).
**Recommendation:**  what to do (or "needs decision: …").
```
- **ID prefix:** Claude uses `C-`, Cursor uses `X-`.
- **Severity:** `blocker` (ship-stopper / guardrail violated) · `major` (real bug, contained) ·
  `minor` (correctness nit) · `nit` (style/clarity) · `question` (can't tell from code; needs author).

End your file with two summary blocks:
1. **Invariant table verdict** — the §3 table with holds/violated/unproven + one-line note each.
2. **Per-rung + overall verdict** — for each rung: `clean / findings(n) / concerns`, then one
   overall line: is v4 machine-complete as claimed, with caveats.

---

## 5. Protocol (independence is the point)

1. Both reviewers work **only** from this brief. **Neither reads the other's review file until
   both exist.** No peeking — that's what makes the comparison meaningful.
2. Both review the same scope (§1), both dimensions (§2), against the same rubric (§3), in the
   same format (§4).
3. When both files exist, the comparison pass produces `qa/v4-review-comparison.md`:
   - **Agreements** (both found it) → high confidence, act.
   - **Conflicts** (disagree) → most valuable; adjudicate each with evidence.
   - **Unique-to-each** → blind-spot coverage.
   - **Consolidated punch list** → the actual to-do, severity-ordered.

**Out of scope:** v3 code (pre-`b381bcb`); the operator live-proof batch (that's product proof,
not code review); doc prose quality; the known-and-tracked R6 mock-harness live-wiring seam and the
verify-ownership gap (already logged — flag only if you find them *worse* than documented).
