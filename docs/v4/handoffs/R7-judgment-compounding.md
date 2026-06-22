# v4 Rung Handoff — R7 — Judgment & Compounding

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R6 (run templates) — and all of R1–R5. **Draft note:** written against the
plan; confirm the latest migration number + the R5/R6 surfaces at promotion.

> **The trust + learning rung (the other heavy one).** Make a completed run **trustworthy**
> (readable Run Replay, semantic verification, decision/outcome logs) and make the system
> **compound** (lesson cards + eval auto-trigger). **Replay is a PROJECTION, not truth; evals
> stay NON-AUTHORITATIVE; RL is schema prep only — no training.**

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R7 — Judgment & Compounding" + § "Eve Integration"
(R7 row). Binding. **If brief and plan disagree, the plan wins — flag it.**

## 1. Read before coding (in order)
- `AGENTS.md` chain → `docs/v4/AGENTS.md` → child `AGENTS.md` for folders you touch.
- `BUILD_PLAN_V4.md` § "Goal R7" + § "Eve Integration".
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` ("events are ephemeral coordination
  signals") + `docs/v3/KERNEL_SCHEMA_V1.md` + `docs/v3/GLOSSARY.md`.
- **What's shipped that R7 builds ON:**
  - **The receipt chain (R1 obligation, F2)** — every transition posts a receipt;
    `correlation_id` chains are intact; `artifact_refs` on submit/verify. **Replay reconstructs
    the timeline from this — first VERIFY the chain is ordered/linked/complete.**
  - **`artifacts/verify.ts` (R1)** = structural verification. **Semantic verification ESCALATES
    from it as its own module** (do not inline into `taskVerify` — F15).
  - **Evals (Goal 9)** — `src/kernel/evals/`, `smoke:eval`. The auto-trigger fills the
    "evaluations had 0 rows" gap. **Evals stay non-authoritative (F16).**
  - **Vault OKF exporters (Goal 8)** — `src/vault` (the `smoke:vault-export` path) mirror lesson
    cards to the vault.
  - **Migrations:** `006` (R2 artifact lineage) is the last *schema* migration; R5/R6 add none
    (R5 reused `checkpoint_state`, R6 is config). So R7's typed-artifacts migration is **likely
    `007`** — confirm the next free number at promotion. Wire it into `database.ts` + exec by
    name in the smoke.
- Seam files (plan § Direct Repo Scope is exhaustive):
  - **Run Replay** — a projection (renderer + conductor) over the **durable receipt chain +
    artifact rows + task timestamps** (NOT events — F1). Derived, never truth.
  - `src/main/conductor/` (verifier role) + `src/evals/` — semantic verification stage
  - `src/kernel/migrations/007-r7-typed-artifacts.sql` — additive: artifact `kind` enum +=
    `evidence|candidate|skeptic_note|thesis|decision_log|outcome|lesson`; provenance fields
    `source_refs|observed_at|source_kind|confidence|quote_or_snapshot_ref|sensitivity`
  - `src/kernel/schema/types.ts` + `docs/v3/KERNEL_SCHEMA_V1.md`
  - `decision_log` + `outcome` + `lesson` artifact kinds; lesson mirrored to vault (Goal 8 OKF)
  - eval **auto-trigger** on task/run complete
  - `quantflow-electron/scripts/smoke-judgment.ts` + `quantflow-electron/package.json` (`smoke:judgment`)

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)
- **Run Replay = RECEIPT-PRIMARY projection (F1/F8).** The `events` table is **not persisted**
  (`emitKernelEvent` is in-memory + `webContents.send` only). Reconstruct the timeline from
  **durable** evidence: the **receipt chain** (ordered by `correlation_id`, linked, complete) +
  **artifact rows** + **task lifecycle timestamps**. **Do NOT start writing the `events` table**
  to build a second timeline store. Replay is a projection like State Cards — never truth.
- **Semantic verification escalates from structural (R1):** its **own stage/module** invoked by
  the verify pipeline. `taskVerify` **calls stages** — it must NOT inline structural + semantic +
  eval in one function block (F15; `tasks/index.ts` is already large). Semantic verify never
  mutates state outside the **verification-receipt / eval path**; high-risk proposals still go
  through **human approval** (R5).
- **Typed research artifacts:** additive migration extends the artifact `kind` enum + adds the
  reserved provenance fields. The file/vault is storage; the **artifact row is truth**.
- **decision_log / outcome / lesson:** what the human chose and why (`decision_log`), what
  actually happened after (`outcome`), and a distilled `lesson` artifact **mirrored to the vault**
  via the Goal 8 OKF exporters.
- **Eval auto-trigger:** on task/run complete → produce an evaluation (fixes "evaluations 0
  rows"). **Fire-and-forget + non-authoritative (F16):** it must NOT be read back into any
  `claim`/`verify`/`complete` decision path. Add an explicit regression assertion that task
  progression does **not** gate on eval presence/score.
- **RL = schema preparation only** — no training, no GRPO, no fine-tuning.
- **Eve delta:** Run Replay = QF cross-agent receipt projection **+** Eve per-session replayable
  streams; `eve eval` may feed per-agent scoring, but QF evals stay non-authoritative + cross-run.

## 3. Hard guardrails — do NOT (the R7 Failure Signals as rules)
- Do NOT treat Run Replay as a source of truth — it's a projection.
- Do NOT let semantic verification mutate state outside the verification-receipt/eval path.
- Do NOT make an eval authoritative — no runtime path may read evals to decide task/workflow state.
- Do NOT build RL **training** — schema prep only.
- A decision/outcome/lesson must NOT live outside the Kernel artifact record + vault mirror.
- Do NOT persist the `events` table / build a second timeline store. Migration is **additive**.
- No cloud / Night-Shift production infra (driver seams only). No heavy context densification.
- **One rung only. Commit locally. Do NOT push. Do NOT touch the ledger. Do NOT self-approve.**

## 4. Definition of done (acceptance)

**Machine proof (CI, `sim` harness) — `bun run smoke:judgment`:**
- A completed run produces a **deterministic Run Replay** over its **receipt chain + artifact
  rows + task timestamps** (ordered by `correlation_id`, linked, complete — **not events**).
- A `decision_log` artifact, an `outcome` artifact, and a `lesson` artifact **mirrored to the
  vault**.
- A **semantic verification** escalates from structural and is recorded as a verification/eval
  receipt.
- An **evaluation is auto-produced** on run/task complete (rows present — the missing trigger).
- **Regression assertion (F16):** task progression does **not** gate on eval presence/score.
- Replay reconstructs the full timeline from **Kernel evidence alone** (no events).

**Product proof (LIVE CANVAS — the standing bar):**
> A real completed run has a **readable replay**, a **decision log**, and a traceable
> **outcome → lesson**. Capture the replay view + the decision/outcome/lesson artifacts.

**Regression guard (cumulative — Appendix A). From `quantflow-electron/`:** the full stack
through R6 (`...smoke:checkpoint smoke:run-template smoke:judgment`) + `smoke:eval` (evals still
work + stay non-authoritative) + `smoke:vault-export` + build + MCP. Migration additive.

## 5. Verification handoff — paste THIS back
1. **Diff** — `git diff <last-approved-ref>..HEAD` (or changed-files + full contents).
2. **Command outputs** — full real output of every §4 command, pass/fail, no trimming.
3. **Self-assessment** — table: each §4 criterion → met/not-met → evidence.
4. **Notes** — confirm: Replay is **receipt-primary** (no events written, reconstructs from
   durable evidence); semantic verify is a **separate stage** (not inlined in `taskVerify`); the
   **eval auto-trigger is fire-and-forget + non-authoritative** (+ the regression assertion);
   typed-artifact migration number + that it's additive; RL is schema prep only. Flag any deviation.

> Verifier rule: approved only when the diff matches scope, every §4 command is green in the
> pasted output, no guardrail is tripped (esp. *replay-is-projection*, *evals-non-authoritative*,
> *no-events-store*, *RL-schema-only*, *semantic-verify-its-own-stage*), and the live-canvas
> replay proof is witnessed. Workers never self-approve.
