# Evaluation Layer Spec (v3 Goal 9 gate)

This document unblocks Goal 9. It defines concrete evaluation units, evidence
inputs, rubric dimensions, a fixed scoring scale, output shape, determinism and
anti-gaming rules, human-review rules, storage options (decision deferred), and
acceptance scenarios.

**This is a spec, not an implementation.** No scoring code, schema, UI, Conductor
change, or model call is authorized by this document. Read with
`KERNEL_CONSTITUTION.md`, the Goal 9 section of `BUILD_PLAN_V3.md`, and
`docs/v3/VAULT_OKF_SPEC.md` (evals score from Kernel receipts/evidence, not raw
logs).

---

## 1. Authority Model

```text
Kernel receipts / tasks / artifacts / State Cards = evidence (truth)
Evaluations                                        = derived analysis (not truth)
```

- Kernel receipts, tasks, artifacts, and State Cards are the **only** primary
  evidence. Evals read them; they never write them.
- An evaluation is derived analysis. It is **not** a source of truth and confers
  no authority. Nothing in the runtime may read an eval to decide task state.
- Evals **must not** mutate task state, post lifecycle receipts, complete or
  verify work, or advance a workflow. An eval may *recommend* a follow-up; only
  the operator/Conductor (through approved Kernel commands) can act on it.
- Vault/Obsidian exports (`docs/v3/VAULT_OKF_SPEC.md`) may be used as
  *evaluation context/convenience*, but the authoritative evidence is the Kernel
  row the export was derived from. When in doubt, cite the Kernel id, not the
  vault path.
- Raw terminal logs are **not** evidence (see Anti-Gaming). State Cards are the
  compressed Kernel reality; logs are not.

---

## 2. Evaluation Units

Each unit is scored independently and references the Kernel evidence it used.

| Unit | Scope | Primary key references |
| --- | --- | --- |
| `workflow_eval` | one workflow end-to-end | `workflow_id` |
| `task_eval` | one task's lifecycle + outcome | `task_id`, `workflow_id` |
| `worker_eval` | one worker/harness instance's output quality | `worker_id`, `workflow_id` |
| `conductor_decision_eval` | one Conductor planning/decision receipt | `receipt_id` (planning), `workflow_id` |
| `verification_eval` | the integrity of a verification outcome | `task_id`, verification `receipt_id` |

A `workflow_eval` may aggregate child unit evals but must still cite the
underlying receipt evidence; it may not invent a workflow-level claim unsupported
by child evidence.

---

## 3. Required Evidence Inputs (per unit)

All inputs are Kernel reads. An eval that lacks a required input scores the
relevant dimension `not_applicable` or low with explicit `limitations` — never a
fabricated pass (see Anti-Gaming).

### 3.1 `task_eval`
- Task row: `task_id`, `workflow_id`, `status`, lifecycle timestamps
  (`created_at`, `claimed_at`, `submitted_at`, `verified_at`, `completed_at`).
- Task-scoped receipt chain (receipt `id` + `type`), including:
  `task_created`, `task_claimed`, `task_started`, `progress`, `task_submitted`,
  `verification_started`, `verification_passed` / `verification_failed`,
  `task_blocked`, `task_completed` / `task_failed`.
- Artifact ids attached to the task (`artifact_created` receipts / artifact rows).
- State Card snapshot for the owning tile where relevant.

### 3.2 `verification_eval`
- The `task_submitted` receipt and the `verification_*` receipt chain.
- Verifier identity (`worker_id` on the verification receipt) vs. owner identity
  on the task — to detect self-verification.
- Artifact ids cited as verification evidence.

### 3.3 `worker_eval`
- `worker_instances` identity (role / harness / model) for the `worker_id`.
- Receipts authored by that worker; tasks owned by that worker and their outcomes.
- Artifacts produced by that worker.

### 3.4 `conductor_decision_eval`
- The Conductor `planning` receipt (`receipt_id`) and its metadata
  (`phase`, `proposedAction`, `proposalToken`, `requestApproval`).
- The subsequent receipt(s) showing whether the proposed action executed and its
  outcome (the loop's decision/execution chain).

### 3.5 `workflow_eval`
- Workflow row + region aggregate (task counts, blocked task ids, receipt count,
  semantic connection counts).
- The full workflow receipt chain and artifact index.
- Child `task_eval` / `verification_eval` / `conductor_decision_eval` results
  when available.

---

## 4. Rubric Dimensions

Each dimension is scored on the scale in §5. Each dimension lists the evidence it
must cite. Dimensions that do not apply to a unit are omitted (not scored 0).

| Dimension | Applies to | Evidence it must cite | Definition |
| --- | --- | --- | --- |
| `task_completion_correctness` | task, workflow | task status, `task_completed`, artifact ids | Did the task reach a correct, evidence-backed completion? |
| `verification_integrity` | verification, task, workflow | `verification_*` receipts, verifier vs owner identity | Was completion gated by a genuine, independent verification? |
| `evidence_completeness` | all | receipt chain coverage vs lifecycle | Are the expected receipts present for the claimed outcome? |
| `delegation_quality` | conductor_decision, workflow | planning receipts, resulting task assignment outcomes | Were the right tasks created/assigned to the right workers? |
| `blocker_handling` | task, workflow | `task_blocked` + resolution receipts, State Card blocker | Were blockers surfaced, attributed, and resolved (not hidden)? |
| `artifact_usefulness` | task, worker, workflow | artifact rows (kind, summary), referencing receipts | Are produced artifacts real, referenced, and relevant? |
| `conductor_decision_quality` | conductor_decision | planning receipt + execution outcome | Was the decision sound, in-scope, and approval-gated where required? |
| `workflow_efficiency` | workflow | lifecycle timestamps, human-intervention/blocked counts | Did the workflow reach outcome without excess churn/intervention? |

Notes:
- `workflow_efficiency` uses Kernel-stored timestamps only (durations derived
  from lifecycle stamps); it must not depend on wall-clock at eval time.
- "Human intervention count" is derived from approval/operator-action receipts,
  not inferred from prose.

---

## 5. Scoring Scale

A single fixed integer scale **0–4** for every dimension:

| Score | Label | Meaning |
| --- | --- | --- |
| 0 | failing | Evidence shows the dimension was not met (e.g. completion with no verification). |
| 1 | poor | Major gaps; outcome largely unsupported by evidence. |
| 2 | adequate | Met with notable gaps or weak evidence. |
| 3 | good | Met with complete, consistent evidence. |
| 4 | exemplary | Met with complete evidence **and** clear positive signals (independent verification, useful artifacts, clean blocker handling). |

Special values:
- `not_applicable` — the dimension does not apply to this unit, **or** the
  required evidence inputs do not exist for a legitimate reason (e.g. a workflow
  with no delegation has no `delegation_quality`). `not_applicable` is distinct
  from score 0 and must carry a `limitations` note explaining why.
- Missing evidence where the outcome *claims* success is **not** `not_applicable`
  — it scores low (0–1) with a limitation, because absence of required evidence
  for a claimed pass is a failure signal, not an exemption.

### Confidence (separate from score)
Confidence is reported independently on **0.0–1.0**:
- `>= 0.8` high — deterministic rubric fully satisfied by present evidence.
- `0.5–0.79` medium — some model-assisted judgment or partial evidence.
- `< 0.5` low — significant judgment, ambiguous or sparse evidence.

Score answers "how good"; confidence answers "how sure". They never collapse
into one number.

---

## 6. Required Output Shape

Every eval result is a structured record (format TBD in §9), with these fields:

```yaml
eval_id:        # stable id (see determinism §7)
eval_type:      # workflow_eval | task_eval | worker_eval | conductor_decision_eval | verification_eval
workflow_id:    # always when in scope
task_id:        # when applicable
worker_id:      # when applicable
receipt_id:     # the focal receipt when applicable (e.g. conductor_decision_eval)
dimensions:     # list of { dimension, score (0-4|not_applicable), confidence (0.0-1.0), evidence_refs[], rationale, limitations }
overall_score:  # derived from dimension scores (rule defined by implementation; must be reproducible)
overall_confidence:
evidence_refs:  # union of all cited Kernel ids (receipt_id / task_id / artifact_id / worker_id)
rationale:      # plain-language justification, each claim tied to an evidence ref
limitations:    # what was missing / uncertain / not evaluated
created_at:     # see §7 (Kernel-sourced or stored-by-Kernel only)
```

- `evidence_refs` must be non-empty for any non-`not_applicable` dimension.
- `rationale` must reference evidence ids; prose with no ids is a failure signal.
- `overall_score` aggregation must be a documented, reproducible rule (e.g.
  evidence-weighted mean over applicable dimensions, `not_applicable` excluded) —
  the exact rule is chosen at implementation time and recorded in code + tests.

---

## 7. Determinism Rules

- **Deterministic-first.** Each rubric dimension must define a deterministic
  scoring path from evidence wherever possible (e.g. `verification_integrity = 0`
  when a `task_completed` exists with no matching `verification_passed`). The same
  Kernel state must always yield the same deterministic score.
- **Model-assisted judgment** (for dimensions that genuinely need it, e.g.
  `artifact_usefulness`) must: cite the evidence ids it used, produce a score +
  confidence, and be reproducible enough to diff. It must **not** emit hidden
  chain-of-thought; rationale is a concise, evidence-referenced justification.
- **No wall-clock-dependent output.** `created_at` and any duration are derived
  from Kernel-stored timestamps, or from an eval-run id/timestamp **only if the
  Kernel persists it as a row** (so re-derivation is stable). A bare
  `Date.now()` in output is forbidden — same rule as the vault exporter.
- Re-running an eval over unchanged Kernel state must be stable: deterministic
  dimensions byte-identical; model-assisted dimensions stable in score band and
  cited evidence (tolerance defined per implementation, with a fixed seed/temperature where a model is used).

---

## 8. Anti-Gaming Rules

- **Do not reward verbosity.** Longer/more receipts or longer summaries are not
  higher `evidence_completeness`; completeness is measured against the *expected*
  receipt set for the lifecycle, not raw volume.
- **Do not reward completion without verification.** A task that reached
  `complete` without a `verification_passed` (outside the documented legacy
  bypass) scores `verification_integrity = 0`, and that caps `task_completion_correctness`.
- **Self-verification is not verification.** A verification receipt authored by
  the task owner scores `verification_integrity <= 1`.
- **Terminal logs are not primary evidence.** Scores must derive from
  receipts/tasks/artifacts/State Cards. If a claim only exists in logs, it is
  unverified and must not raise a score.
- **Missing evidence is not success.** Absence of a required receipt for a
  claimed outcome lowers the score; it is never silently treated as a pass or as
  `not_applicable`.
- **No evidence ref → no credit.** A model rationale without evidence ids cannot
  raise any dimension above score 1.

---

## 9. Storage / Implementation Guidance (decision DEFERRED to Goal 9)

Three candidate homes for eval results — **the choice requires verifier/operator
approval before any Goal 9 runtime work**:

1. **Kernel receipts** (`type: evaluation`): pros — append-only, traceable,
   reuses receipt-chain queries; cons — receipts are evidence of *what happened*,
   evals are derived analysis, so this slightly overloads receipt semantics.
2. **New Kernel table** (`evaluations`): pros — clean separation of derived
   analysis from evidence, queryable; cons — new schema + migration + commands.
3. **Vault Markdown export only** (e.g. `eval_report.md`): pros — zero Kernel
   surface, pure read-side; cons — not queryable in-app, weaker traceability than
   a Kernel-owned record.

Recommendation to weigh (not a decision): a **new `evaluations` table** keeps the
authority model clean (derived analysis is not evidence and is not a receipt),
with an optional vault export for human reading. Whatever is chosen must preserve:
evals never mutate task/receipt/State-Card state, and evals are never read by the
runtime to decide task state.

Open decisions requiring approval before Goal 9 implementation:
- storage home (above).
- `overall_score` aggregation rule.
- whether/which dimensions use model-assisted judgment and the exact
  determinism/reproducibility tolerance and provider abstraction.
- whether evals run on demand, on workflow completion, or both.

---

## 10. Human Review Rules

- An eval with `overall_confidence < 0.5` **requires operator review** before it
  is treated as anything more than a draft.
- A **high-impact** eval (e.g. `verification_integrity = 0` on a completed task,
  or a `workflow_eval` marking a shipped workflow as failing) **requires operator
  review** regardless of confidence.
- Evals may **recommend** follow-up tasks/actions, surfaced to the operator, but
  may **never** create/mutate tasks or post lifecycle receipts themselves.
- Operator review is recorded by the operator through normal Kernel commands, not
  written by the eval layer.

---

## 11. Acceptance Scenarios (for future Goal 9 implementation)

Each scenario lists setup and the expected eval outcome. Goal 9 tests must cover
at least these.

1. **Happy path.** Task: create→claim→start→submit→verify(begin)→verification_passed→complete,
   with an artifact. Expected: `task_completion_correctness` 3–4,
   `verification_integrity` 3–4, `evidence_completeness` 3–4, high confidence,
   `evidence_refs` cite the verification + artifact receipt ids.

2. **Completion without verification (legacy bypass).** Task forced
   working→complete via legacy flag, no `verification_passed`. Expected:
   `verification_integrity = 0`, `task_completion_correctness` capped low,
   limitation notes the bypass; high confidence (deterministic).

3. **Missing artifact.** Task completed + verified but cites an artifact that has
   no `artifact_created`/artifact row. Expected: `artifact_usefulness` low or
   `evidence_completeness` lowered, limitation names the missing artifact id;
   not scored as success.

4. **Blocked task.** Task reaches `task_blocked` and is never resolved. Expected:
   `blocker_handling` reflects unresolved blocker, `task_completion_correctness`
   not high, `workflow_eval` surfaces the blocked task id; recommends follow-up,
   mutates nothing.

5. **Poor delegation.** Conductor planning receipt proposes a high-risk action
   that is denied/stale or assigns to a worker that then fails. Expected:
   `conductor_decision_quality` / `delegation_quality` low, citing the planning
   receipt id and the failed/denied outcome receipt.

6. **High-confidence vs low-confidence.** (a) A purely deterministic dimension
   (verification integrity) over complete evidence → confidence `>= 0.8`.
   (b) A judgment dimension (artifact usefulness) over a sparse/ambiguous artifact
   → confidence `< 0.5` and **requires operator review** per §10.

7. **Self-verification.** Verification receipt authored by the task owner.
   Expected: `verification_integrity <= 1` with a limitation naming the identity
   collision.

8. **Determinism.** Running the eval twice over unchanged Kernel state yields
   identical deterministic-dimension scores and identical `evidence_refs`.

---

## 12. Failure Signals

- Vague scores not anchored to a rubric level.
- Scores not tied to receipt/task/artifact ids.
- Evals treated as authority, or read by the runtime to decide task state.
- Evals reading raw terminal logs as primary evidence.
- Evals mutating tasks, posting lifecycle receipts, or completing work.
- Model judgment without `evidence_refs`, or with exposed chain-of-thought.
- Missing evidence scored as success, or verbosity rewarded.
- Wall-clock-dependent / non-deterministic output that cannot be diffed.

---

## 13. Definition of Done (for this spec)

Goal 9 runtime work can be handed off without ambiguity: a future implementer
knows the units, evidence inputs, rubric dimensions, the 0–4 scale +
confidence, output shape, determinism/anti-gaming/human-review rules, the
acceptance scenarios to satisfy, and exactly which storage/aggregation decisions
still need verifier/operator approval before coding begins.
