# QuantFlow v4 — Territory Map & Build Constitution

**Status:** Territory reference · scope only · **nothing here is authorized build work**
**Captured:** 2026-06-18
**Revision:** r3 — approved territory. r2 incorporated five review edits (nullable `run_id`, staged permission enforcement, preflight-report-not-Settings for Rung 0, secret-leakage hard problem, reserved research-provenance fields). r3 adds the **Attention Profile** governance concept + the principle *parallelize low-attention work, serialize high-attention work*, and reserves domain-extensible artifact kinds. Treat as the locked reference all rung promotions are checked against. *(Product positioning — "attention-aware OS, not agent-swarm software" — deliberately kept out; it belongs in a separate positioning doc.)*
**Purpose:** The full scope of the v3 → v4 transition, the cross-cutting objects it introduces, and the discipline that keeps it from becoming a swamp. This is the document we sequence rungs against. Detailed per-rung goal shapes are a *separate* deliverable, promoted one at a time into the v4 build plan.
**Read after:** `KERNEL_CONSTITUTION.md`, `BUILD_PLAN_V3.md`, `docs/v3/INCOMING_GOALS.md`.
**Post-spine phase (2026-06-22):** the v4 spine (R0–R8.5) is complete; the next phase is the **Surface / Canvas Reflection Layer** (project the spine onto the canvas, rungs S0–S6) — authoritative plan: `docs/v4/SURFACE_LADDER.md`. This map still governs spine territory; the Surface plan is self-sufficient for S-rung work.

---

## 0. How to read this

This map describes a *territory*, not a route. It names every system, object, and hard problem the transition touches so a builder can see the whole thing before drilling in. It does **not** authorize work. Promotion discipline (§12) still governs what actually gets built.

The single planning principle this whole document serves:

> **The atom is not timidity. It is de-risking the organism.**
> Prove one real task end-to-end before growing anything multi-agent. Every rung is independently shippable and verifiable, with the Kernel Constitution intact at each step.

---

## 1. The transition in one frame

**v3 is** a governed orchestration surface that is *operator-driven*: the task lifecycle, receipts, verification gates, State Cards, and canvas visibility all work — but a human clicks the buttons and **no real work happens**.

**v4 is** a *research-run operating system*: many real agents doing real work, artifacts flowing between them, humans steering at checkpoints, runs lasting minutes to overnight, and output you can trust.

**It is not a rewrite.** The v3 backbone — Kernel owns truth, Conductor plans, Harness adapts, Workers execute, Receipts prove, State Cards summarize, Vault mirrors, Evals judge — is correct and survives intact. v4 adds four bands of new surface onto that backbone:

| Band | Adds | One-line job |
| --- | --- | --- |
| **A — Execution** | the missing runtime seams | make work *real* |
| **B — Flow** | context + orchestration | make research runs *possible* |
| **C — Control** | a runtime control plane v3 lacks | make runs *survivable* |
| **D — Judgment & Compounding** | trust + the learning loop | make runs *valuable over time* |

The gap in one sentence:

> **v3 proved the courthouse works. v4 has to run real trials — many at once, overnight — with verdicts you trust.**

Difficulty weighting: **A must happen first** and is the most important proof, but it is the *smallest* piece. The real difficulty concentrates in **C and D** (reliability under non-determinism, durability, verification that means something). Those are weeks-to-months, not days.

---

## 2. v4 constitutional additions

The v3 **One Rule is unchanged**: *Kernel owns truth. Everything else derives from that.* Two new lines are added for v4, plus one decision-authority rule.

### New line 1 — Authority consolidation
> **Kernel decides. Envoy mirrors, bridges, exports, or displays.**

This is elevated above any single rung because the Envoy/Kernel split touches task state, worker assignment, artifact ownership, checkpoint state, run status, and verification status *all at once*. If two systems can both say whether a task is complete, DAG orchestration becomes unreliable. The rule must be in force **before** dependency graphs get complex.

### New line 2 — The anti-swamp rule
> **Every new system attaches to the atom or to the next rung.**

The map is big enough that a builder could accidentally start everywhere. The antidote is that no system gets built at full size — only its smallest atom-adjacent version (see §3).

### Decision-authority rule (mirror of the One Rule)
> **Kernel is terminal authority on *truth*. The human is terminal authority on *decisions*.**

Workers never self-complete; the Kernel verifies. Likewise agents never auto-decide: a Night Shift run produces a *briefing*, not a placed bet or a committed action. The human chooses. The policy fields `requires_human_approval` and `continue_unattended` (§5) operationalize this.

### Vocabulary impact (small and deliberate)
The amendment adds almost nothing to the vocab lock. Mapping each new noun to its constitutional status:

| New noun | Status | Notes |
| --- | --- | --- |
| **Run** | *Candidate new primitive* — **RESOLVE FIRST** | Either a new primitive or your existing **Workflow** used as an instance. Decide deliberately against the vocab lock (§10). |
| **Artifact record** | Already in vocab lock | Exists as a primitive; just not yet wired into submit/verify. |
| **Policy envelope** | Realizes existing **Permission** primitive | Fields, not a new concept. |
| **Run Replay** | Projection (not a primitive) | Read-path view, like State Cards / densifiers. |
| **Cost telemetry** | Receipt/run metadata (derived) | Not a primitive. |
| **Simulation harness** | A **Harness** implementation | Existing primitive, new driver. |
| **Context Envelope** | Read-path projection (not a primitive) | Derived view, like State Cards. |

Only **Run** requires a vocabulary decision. Everything else is a realization, projection, or implementation of a primitive that already exists.

---

## 3. The anti-swamp rule in practice

The risk: a correct-but-large map invites building all of it at once. Each band item below therefore carries a **smallest first version**. Three canonical examples:

- Proposal: *cost accounting* → first version is **add `estimated_tokens` and `estimated_cost` to receipts**, not a billing dashboard.
- Proposal: *context layer* → first version is **Context Envelope v0 passes upstream artifact metadata to the downstream worker**, not RAG/densification.
- Proposal: *durability* → first version is **reload the app and the worker/task/run state still exists**, not cloud infra.

If a proposed system cannot be reduced to an atom-adjacent first version, it is not ready to build.

---

## 4. The four bands

### Band A — Execution (make work real)

**Purpose:** one real task, executed by a real worker, producing a real artifact, verified for real. This is the keystone; everything else is multiplication.

| System | What it is | Layer | Smallest first version |
| --- | --- | --- | --- |
| **Task atom seam** | assign binds worker → task; instruction delivered via harness `send` (not paste); submit carries an artifact; verify reads it | conductor + harness + kernel | the Rung 1 seam (§8) |
| **`worker_instance` binding** | `tasks.owner_worker_id` set on assign; worker's `assigned_task_id` set | kernel | binding + persisted before assignment |
| **Artifact record** | first-class Kernel-owned record; vault path is just the `uri` | kernel (+ vault as storage) | record created on submit (§5) |
| **Mock + real harness** | deterministic mock = machine proof; real authed agent = product proof | harness | mock harness implementing the full contract |
| **Structural verification** | existence / allowed-root / hash / non-empty / verifier-receipt-gated | kernel | the structural checklist (§5) |

**Authority notes:** the file lives in the vault (storage / mirror, derived); the **Artifact record is the truth** and lives in the Kernel. Verify is structural only here — *semantic* judgment is Band D. Task may not reach `complete` without a verification receipt.

**Deferred from A:** anything multi-task, multi-worker, or semantic.

---

### Band B — Flow (connect the work)

**Purpose:** turn one task into a pipeline — context flows in, artifacts flow downstream, a graph executes, and there is exactly one task authority.

| System | What it is | Layer | Smallest first version |
| --- | --- | --- | --- |
| **Run object** | the missing container between *workflow/template* and *tasks* — one execution instance | kernel (pending §10 resolution) | introduced when a DAG exists (Rung 3); aggregates references only |
| **Context Envelope v0** | structured context handed to a worker: role, task, permissions, upstream artifacts, expected output, verification rule | conductor + harness `send`, fed by kernel/queries | metadata of upstream artifact + acceptance criteria |
| **Artifact lineage** | `derived_from` links so an artifact knows its evidence ancestry | kernel | a `derived_from: artifact_ids[]` field |
| **DAG executor** | walks a task graph: gate downstream on upstream verify-complete; run independent branches in parallel | conductor (loop extended from single-action) | `collect → analyze → synthesize` with one parallel branch |
| **Kernel authority consolidation** | resolve Envoy vs Kernel to one truth; MCP gains Kernel reads | kernel + mcp adapter | enforce "Kernel decides; Envoy mirrors" (§2) |

**Authority notes:** the **Run aggregates references** (task_ids, artifact_ids, receipt_ids) and instance fields (mode, objective, budget, checkpoint_state) — it must **never copy** task/artifact/receipt truth, or it becomes a second store. The Context Envelope is a **read-path projection**, never authoritative for mutations.

**Deferred from B:** densification (instrument only), multi-run concurrency, durability.

---

### Band C — Control (govern the work)

**Purpose:** make runs *survivable* — many concurrent workers, bounded cost and time, recoverable from failure, pausable for humans, and testable without real agents.

| System | What it is | Layer | Smallest first version |
| --- | --- | --- | --- |
| **Worker Runtime Manager** | the control plane: track many workers; timeout, cancel, restart, mark stale, recover task | harness + kernel (status truth stays in Kernel) | status + cancel/timeout on top of Goal 6A identity |
| **Policy / permission envelope** | declared capabilities per run/worker/harness/task (§5) | kernel-enforced seam | declare fields, run permissive, enforce through Kernel |
| **Budgets / stop conditions** | max workers / wall-clock / spend / tool-calls / retries; requires-checkpoint | conductor + runtime manager | budget fields on Run, checked by the executor |
| **Crash / reload recovery** | worker/task/run state survives reload; stale tasks recoverable | kernel persistence + renderer restore | reload → state still exists |
| **Human checkpoint state** | a run can pause, surface a candidate set, take a selection, resume | conductor + kernel | pausable/resumable run status |
| **Simulation harness** | a Harness that *fakes* outcomes to test Bands B/C deterministically | harness | failure-injection catalog (§5, §7) |
| **Idempotency / exactly-once** | submit/verify/complete keyed so retry/recovery can't double-write or double-complete | kernel command seams | attempt-keyed commands (designed in A/B, enforced here) |
| **Attention Profile** | per-phase touch level (high / medium / low) that bounds *useful* parallelism | conductor + run-template (plan layer) | a phase attribute on run templates; **not** a primitive |

**Authority notes:** the Runtime Manager is a **control layer, not a truth store** — worker *status* truth stays in Kernel (State Cards / worker status). Policy **declaration** ≠ **enforcement**: declare fields early; the enforcement point must route through the Kernel (`request → validate → execute → receipt`) so flipping it on for distribution is not a retrofit. **Engineering reality:** the Kernel is SQLite (single-writer) — concurrent receipt writes from many workers need a write strategy or they contend.

**Governance principle — parallelize low-attention work, serialize high-attention work.** The real bottleneck is human attention, not agent count; more workers ≠ more throughput in a high-touch phase. Each run phase declares an **Attention Profile** (high-touch: spec / clarification / final decision · medium-touch: plan review / candidate selection / verifier objections · low-touch: collection / analysis / report generation). Run one human-led high-attention lane plus one or more low-attention execution lanes, with artifact handoff between them — never several high-attention agents interrogating the operator at once. Plan-layer attribute, never a Kernel primitive.

**Deferred from C:** production/cloud durability (driver seams only), broad permission enforcement (R0 axis — see §5 Policy envelope for the minimal-now vs broad-later split).

---

### Band D — Judgment & Compounding (trust + improve)

**Purpose:** make output *trustworthy* and make the system *get smarter across runs*.

| System | What it is | Layer | Smallest first version |
| --- | --- | --- | --- |
| **Run Replay** | readable "story of this run" projection over events/receipts | renderer + conductor (derived) | timeline view (needs replayable events — see note) |
| **Semantic verification** | did the evidence actually support the claim? verifier role + evals | conductor (verifier role) + evals | escalation from structural verify |
| **Typed research artifacts** | `evidence / candidate / skeptic_note / thesis / decision_log / outcome` | kernel (`kind` field) + vault | markdown + artifact metadata; no new DB |
| **Decision log** | what the human chose and why | kernel + vault | a `decision_log` artifact kind |
| **Outcome log** | what actually happened after a decision | kernel + vault | an `outcome` artifact kind |
| **Lesson cards** | reusable knowledge distilled from a run | vault (OKF export) + evals | a `lesson` artifact + vault mirror |
| **Eval / RL trajectory** | runs feed evaluation; outcomes feed future learning | evals (derived) | outcome/eval schema prep only |

**Authority notes:** Run Replay is a **projection, not a source of truth** (like State Cards). **Day-one implication:** replay is cheap *later* only if events/receipts are *timeline-reconstructable now* — ordered, linked, and complete. Make the event/receipt schema replayable from the start even though the Replay view is built late. RL stays **schema preparation only** until the run system produces real traces. **Typed evidence artifacts here extend the base Artifact record with external-provenance fields** (`source_refs · observed_at · source_kind · confidence · quote_or_snapshot_ref`) — reserved in §5, built at this band.

---

## 5. Cross-cutting objects — field shapes & authority

Shapes are illustrative, for scoping — not a schema spec.

### Run *(candidate primitive — resolve vs Workflow first, §10)*
```
run_id · workflow_id/template_id · mode(scout|research|deep|night_shift) ·
objective · status · started_at · ended_at ·
budget{max_workers,max_wallclock,max_spend,max_tool_calls,max_retries,requires_checkpoint} ·
checkpoint_state · policy(ref) · task_ids[] · artifact_ids[] · receipt_ids[] ·
human_decisions[] · cost(rollup) · outcome_id? · lesson_ids?
```
**Authority:** aggregates references + instance fields. Never duplicates task/artifact/receipt truth.

### Artifact record *(already a primitive — wire it)*
```
artifact_id · run_id? · workflow_id · task_id · worker_instance_id ·
kind(file|report|evidence|candidate|skeptic_note|thesis|decision_log|outcome|log) ·
uri · title · mime_type? · sha256? · created_at · receipt_id ·
sensitivity?(normal|private|secret) · derived_from: artifact_ids[]
```
**Authority:** Kernel-owned truth. `uri` points at storage (vault path v1; swappable to object store later). `derived_from` gives lineage.

> **`run_id` is nullable / omitted until the Run-vs-Workflow decision (§10) is resolved.** In Rung 1 the required links are `workflow_id`, `task_id`, `worker_instance_id` only — the atom must **not** be blocked by the Run vocab decision. Backfill `run_id` once Run exists (Rung 3).

> **Research provenance (reserved — not Rung 1).** Typed evidence/research artifacts later extend this record with external provenance: `source_refs? · observed_at? · source_kind? · confidence? · quote_or_snapshot_ref?`. Time-sensitive domains (odds, line movement, injuries, news, market data) need to know *where* evidence came from and *when* it was observed. See Band D typed research artifacts — reserve the shape now, build it then.

> **Domain-extensible kinds (reserved).** The same artifact-flow generalizes beyond research. A coding run is the spec→plan→task→implementation instantiation of it (`functional_spec → technical_design → implementation_plan → engineering_task_list → review_notes`). The `kind` enum is illustrative and extends *per domain when that domain is built* — do not enumerate a coding taxonomy now while the north star is research runs.

### Policy envelope *(realizes the Permission primitive)*
```
read_files · write_files · run_shell · network · use_provider_key · spawn_workers ·
read_vault · write_vault · open_browser · use_connector ·
continue_unattended · requires_human_approval · max_spend · max_time · artifact_root
```
**Authority:** policy is **declared** on every seam from the start, but **enforcement is staged**. Minimal, safety-critical enforcement begins immediately: `artifact_root` checked during structural verification, no task `complete` without a verification receipt, no `submit` without an `artifact_id`. **Broad** capability enforcement (shell / network / provider key / vault / browser / connectors) belongs to the distribution / R0 axis unless a runtime need promotes it earlier. All enforcement routes through the Kernel seam (`request → validate → execute → receipt`) so turning it on is never a retrofit. `artifact_root` is the allowed write root used by structural verification.

### Cost telemetry *(receipt/run metadata — derived)*
```
tokens_in · tokens_out · tool_calls · wallclock_ms · worker_runtime_ms ·
provider · estimated_cost · rate_limit_events · retry_count
```
**Authority:** metadata on receipts, rolled up onto the Run. Captured from the first **real** harness run (the mock path has no cost). Feeds Band D evals ("Scout: 80% of value for $1.20 / 25 min vs Deep: $18 / 4 h").

### Context Envelope v0 *(read-path projection)*
```
run{run_id,mode,objective} · role · task{objective,acceptance_criteria,expected_artifact,verification_rule} ·
permissions(policy summary) · upstream_artifacts[{artifact_id,title,uri,kind,verification_status,produced_by_task}] ·
relevant_state_cards · recent_receipts(densified later) ·
instrumentation{context_tokens_estimate,raw_receipt_count}
```
**Authority:** projection only. The `instrumentation` block is the densification *measurement* — capture now, build densifiers later only if measured pain appears. **Sensitive artifacts (`sensitivity != normal`) are not injected into the envelope by default** — the worker must be explicitly granted them.

### Structural verification checklist *(Band A / Rung 1)*
```
[ ] Artifact record exists and is linked (run/task/worker)
[ ] uri is under the allowed artifact_root (policy)
[ ] file exists and is non-empty
[ ] sha256 matches (if provided)
[ ] a verification receipt was emitted
[ ] task reached complete ONLY after the verification receipt
```

### Worker registry / Runtime Manager record
```
worker_instance_id · harness_id · role_id · model_id ·
status(spawning|idle|assigned|working|blocked|stale|stopped|failed) ·
assigned_task_id · run_id · tile_id · pid/session_id · cwd · last_seen · auth_status · policy(ref)
```
**Authority:** status truth stays in Kernel; the manager drives harness verbs and reports.

---

## 6. Cross-cutting hard problems (why it's hard)

- **Non-determinism.** Real agents replace deterministic operator clicks. Without the mock/sim vs real split, nothing is testable.
- **Partial failure is the norm.** In many-agent long-running systems, something always fails. Design around retry / recovery / degradation, not the happy path.
- **Context explosion.** Deep runs generate receipt/artifact/state volume that drowns the next agent. Compression must never drop a blocker, verification, or failure signal.
- **Authority discipline under 10× surface area.** Every new system is a fresh chance to create a second truth store, let the canvas mutate, let a worker self-complete, or skip the gate. The discipline that made v3 clean is most at risk exactly when the parts multiply.
- **Auth / economics wall.** Real agents need credentials and cost money; long runs burn budget. Environmental, unglamorous, and it both gates and bounds everything.
- **Observability / trust.** When 8 agents run for 4 hours you must be able to see, debug, and trust what happened. Receipts + dense views + canvas + Run Replay are the difference between a trusted system and a black box.
- **Idempotency / exactly-once.** Retries and reload-recovery can double-write artifacts or double-complete tasks unless commands are attempt-keyed. Design into the seams in A/B; it bites in C.
- **Secret / sensitive-data leakage.** Receipts, artifacts, terminal logs, context envelopes, and diagnostic exports can capture provider keys, tokens, `.env` values, private vault paths, or sensitive research. Redaction and `sensitivity` flags must exist before distribution, and **sensitive artifacts (`sensitivity != normal`) are not injected into worker context by default**.
- **Storage write-concurrency.** SQLite is single-writer; concurrent receipt writes from many workers need a strategy.

---

## 7. Testing philosophy (non-negotiable)

Two proof tracks, always:

- **Sim / mock harness = machine proof.** Deterministic, CI-safe, no auth, no cost. Implements the *same* `WorkerHarness` contract (spawn / send / readState / collectReceipts / stop) so it is a true drop-in.
- **Real authed harness = product proof.** One real agent, dogfooded end-to-end.

The simulation harness must be able to fake the full **failure catalog**:
```
worker succeeds · submits bad artifact · times out · is rate-limited ·
returns a blocker · verifier rejects · human checkpoint waits ·
downstream receives a missing artifact · app reloads mid-run
```

**Rule:** no rung's acceptance may depend *solely* on real-agent auth. The machine is proven by simulation; the product is proven by one real run.

---

## 8. The rung spine (sequencing skeleton)

One line each. Detailed goal shapes (Why / scope / out-of-scope / acceptance / failure signals) are promoted **one at a time** into the v4 build plan — they are not in this document.

| Rung | Name | Bands | Objects introduced | Key dependency | Done when |
| --- | --- | --- | --- | --- | --- |
| **0** | Auth / capability preflight *(parallel track)* | A (env) | preflight status | — | one real worker is reliably authed + ready; an operator-visible preflight report shows tool/provider/harness status (Settings UI stays R0) |
| **1** | One real task atom | A | Artifact record, worker binding, structural verify, mock+real harness | 0 (for the real half) | a Conductor task is executed by a worker, produces an artifact, and verify provably opens it; mock green in CI, real green in dogfood |
| **2** | Upstream artifact → downstream context | B | Context Envelope v0, artifact lineage | 1 | worker B consumes worker A's verified artifact via the envelope |
| **3** | Small DAG + authority consolidation | B | **Run object**, DAG executor, Kernel-decides rule | 2 | `collect→analyze→synthesize` with one parallel branch; Envoy resolved to mirror/bridge |
| **4** | Durable pod runtime | C | Runtime Manager, policy fields, budgets, sim failure-injection, recovery, idempotency | 3 | multiple workers, reload survival, stale/cancel/timeout, budget-bounded |
| **5** | Human checkpoint / deepen loop | C | candidate-set artifact, pause/resume | 4 | run pauses, surfaces candidates, human picks, deepening tasks spawn |
| **6** | Run templates | B/C plan layer | Scout / Research / Deep as saved Conductor plans (DAG + roles + budgets + stop + artifact expectations + per-phase attention profiles) | 5 | a named run mode executes the full loop |
| **7** | Judgment & compounding | D | Run Replay, semantic verify, typed artifacts, decision/outcome log, lesson cards, eval/RL prep | 6 | a completed run has a readable replay, a decision log, and an outcome→lesson trace |

Night Shift = Rungs 1–7 **plus** unattended reliability (Rung 4 recovery + Rung 6 budgets) and a morning-briefing artifact.

---

## 9. Deferred-hard (and their early seam)

These are real but must **not** block the runtime ladder. Each gets only its seam now:

| Deferred | Early seam only |
| --- | --- |
| Full RL | outcome / eval schema preparation |
| Cloud / Night Shift production infra | driver seams (interface, no cloud code) |
| Heavy context densification | instrumentation (`context_tokens_estimate`, `raw_receipt_count`) |
| **Distribution / R0** (capability registry, credential provider, packaging, signing, **broad** permission *enforcement*) | a **separate axis**, gated behind "the runtime actually works" — same interfaces, swapped drivers |

The "one product, swappable drivers" promise is kept by **adopting interfaces early and deferring implementations** — not by building local + production drivers now. Three cheap seams secure it: Kernel owns the Artifact record (storage can swap), credentials go through one accessor (safeStorage today), workers go through the existing harness contract.

---

## 10. Open design decisions (resolve at promotion, not before)

1. **Run vs Workflow.** Is `Run` a new primitive, or is your existing `Workflow` the instance (extended with mode/budget/checkpoint)? Resolve against the vocab lock before naming it. *This is the one place the amendment moved fast.*
2. **Envoy resolution.** Bridge, migrate, or retire? "Kernel decides; Envoy mirrors" is the rule; the mechanism is the decision.
3. **Artifact storage root.** Where artifacts physically live and the `artifact_root` policy convention.
4. **Where budget / checkpoint state live.** Fields on Run, or separate objects?
5. **Idempotency keying scheme.** What makes submit/verify/complete attempt-safe.
6. **Verification escalation path.** The trigger from structural (Band A) to semantic (Band D).

---

## 11. Glossary delta (for `docs/v3/GLOSSARY.md`)

- **Add (pending §10):** `Run` — one execution instance of a workflow/template.
- **Confirm already present:** `Artifact`, `Permission` (Policy envelope realizes it).
- **Mark as derived (not primitives):** `RunReplay`, `CostTelemetry`, `ContextEnvelope` — read-path projections / metadata.
- **Mark as implementation:** `SimulationHarness` — a `Harness` driver.

---

## 12. Promotion discipline

Nothing in this document is authorized work. To build:

1. Operator promotes **one rung at a time** into the v4 build plan with full goal shape (Why / repo scope / out-of-scope / acceptance / failure signals).
2. Confirm it respects the Kernel Constitution (no new authority outside the Kernel; canvas stays a projector; evals/vault stay derived).
3. Each rung ships and verifies independently, on both proof tracks (sim + real).
4. Mark the corresponding `INCOMING_GOALS` item promoted.

> Prove the atom. Then the chain. Then the pod. Then the human-deepen loop. Then package it as Scout / Research / Deep.
