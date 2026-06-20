# v4 Rung Handoff — R1 — One Real Task Atom

**For:** Codex (builder)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Claude
**Depends on:** R0 (Auth / Capability Preflight) — approved & merged.

## 0. Authoritative scope
Full goal shape = `BUILD_PLAN_V4.md` § "Goal R1 — One Real Task Atom" — read it as
binding. This brief front-loads essentials + the verification contract. If brief
and plan disagree, **the plan wins — flag the discrepancy, don't silently pick.**

R1 is the **keystone**: make ONE Conductor task do **real work, end to end, with
proof**, on two tracks — a deterministic **mock harness** in CI, and one **real
authed worker** in dogfood. It is deliberately the *smallest* important rung: no
second task, no DAG, no multi-worker, no semantic judgment. Just the atom.

## 1. Read before coding (in order)
- `AGENTS.md` (root) → `docs/v4/AGENTS.md` → child `AGENTS.md` for every folder you
  touch (especially `src/harness/AGENTS.md` — the harness boundary rule).
- `BUILD_PLAN_V4.md` § "Goal R1" **and** § "Eve Integration" (the R1 Eve delta).
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` + `docs/v3/KERNEL_SCHEMA_V1.md`
  (you add one additive column — schema doc must match).
- Seam files: `src/kernel/tasks/index.ts`, `src/kernel/tasks/validators.ts`,
  `src/kernel/receipts/index.ts` (`handleArtifactCommand` — already does the
  artifact insert + `artifact_created` + receipt backfill), `src/kernel/worker-instances/index.ts`,
  `src/harness/{types,registry}.ts`, `src/main/conductor/conductor-actions.ts`,
  `src/main/conductor/conductor-planner.ts` (the `assign_task` risk level — F23),
  `quantflow-electron/src/main/harness-service.ts`.

## 2. Build (essentials — plan § Direct Repo Scope is exhaustive)

> **OPERATOR BUILD DIRECTIVE — Option B (do not skip Eve).** Build the deterministic
> **mock** harness **and** a **minimal `eve-harness`** in this one pass. The
> `eve-harness` is an HTTP adapter to the operator's already-running local Eve agent
> `quantflow-eve` (`POST http://127.0.0.1:3000/eve/v1/session`) — it is the
> event-stream translator (Eve session output → `ReceiptDraft` + artifact file
> path), **not** a full build-out. **The product-proof target is the real Eve
> worker through `eve-harness`, NOT `local-shell`.** This supersedes the goal-body
> "Real harness = local-shell/herdr-shell" line and follows `BUILD_PLAN_V4.md`
> § Eve Integration → Per-rung delta → **R1** ("the real proof = an Eve worker;
> introduces the translator minimally; `artifact_root` for Eve = the Eve
> workspace"). This adds `eve-harness` files beyond the plan's listed Direct Repo
> Scope — it is an **operator-authorized scope extension**; note it in §5.

**Decide FIRST, before any verify code:**
- **`artifact_root` (F31, §10.3) — pick the smallest:** a single resolved root
  (the workflow's `vault_path` when set, else `<QUANTFLOW_DIR>/artifacts`), with
  `uri` required to resolve **under** it. **Eve exception (per Option B):** for an
  `eve-harness` worker the root is the **Eve workspace** — structural verify pulls
  the artifact bytes back **through the harness** from there. Record the chosen
  convention (incl. the Eve-workspace resolution) at the top of your goal result.
  **No** per-worker/per-run policy matrix beyond this (that's Band C).
- **`attemptId` (F32, §10.5) — lock the name/semantics now:** optional `attemptId`
  (string) on `kernel.task.submit` / `kernel.task.verify` payloads = "a stable id
  the caller reuses across retries of the same logical attempt." R1 only **threads
  it through and records it on receipt metadata.** No dedup table here (that's R4).

**Piece 1 — Task → worker delivery (bind + send).**
- **Audit every assign path first (F17).** `taskClaim` already binds
  `owner_worker_id` from `tileId`; the live-run `null` was a path that didn't carry
  `tileId`, not a missing mechanism. Guarantee a **non-null `owner_worker_id`** on
  every assign path, then add + set the reverse link `worker_instances.assigned_task_id`.
- Instruction is delivered through `getWorkerHarness(kind).send(handle, { text })`
  — **never** terminal paste / `terminal_write` / MCP. Payload = task objective +
  minimal context (full Context Envelope is R2; keep it a plain instruction).
- **Real `send` is approval-gated (F23).** `conductor-planner.ts` marks
  `assign_task` `risk: 'low'` (auto-runs in the loop). Delivering real work to a
  live, paid agent is **not** low-risk — gate the real send behind approval or an
  explicit operator step (or split "bind" from "send"). The **mock** path may stay
  low-risk/auto for CI.

**Piece 2 — Worker executes (two harnesses, same contract).**
- **Mock harness (NEW, registered `mock` kind):** deterministic, CI-safe, no auth,
  no cost. `spawn`→fake handle; `send` records the instruction; it **writes a real
  artifact file** at a deterministic path under `artifact_root` and **returns a
  `ReceiptDraft` + the artifact file path from `collectReceipts`**; `readState`
  reports scripted `working → done`; `stop` is a no-op. Full `WorkerHarness`
  contract — a true drop-in.
- **Harness boundary (F4 — load-bearing):** the harness **never** writes Kernel
  state. The mock (and real adapters) must **not** call `kernel.artifact.create`
  or any `kernel.*`. The harness produces a **file + draft**; the **caller** posts
  to the Kernel.
- **Real harness = minimal `eve-harness` (NEW, registered `eve-harness` kind) —
  Option B.** An HTTP adapter to the local `quantflow-eve` agent: `spawn` opens an
  Eve session (`POST /eve/v1/session`); `send` posts the instruction to that
  session; `readState` maps the Eve session state → `working → done`;
  `collectReceipts` reads the artifact the Eve agent wrote in its **workspace** and
  returns a `ReceiptDraft` + that file path. It is the **event-stream translator,
  minimal** — translate Eve's session output into one `ReceiptDraft`; do **not**
  build durability/recovery/session-mapping persistence (that's R4), subagents, or
  HITL (R5). Same `WorkerHarness` contract as mock — a true drop-in. **F4 still
  binds: `eve-harness` must not call any `kernel.*`** — it returns a draft + file
  path; the caller posts. (The legacy `local-shell`/`herdr-shell` kinds remain in
  the codebase untouched; R1's real proof simply targets `eve-harness`.)

**Piece 2b — One canonical orchestration path (F3) — mock and real share it.**
Exactly **one** code path turns "a worker did the work" into Kernel truth, in
`harness-service` / `conductor-actions`:
```text
assign(bind) → harness.send(instruction)
            → poll harness.readState / collectReceipts
            → caller posts kernel.artifact.create  (from draft + file path)
            → caller posts kernel.task.submit       (carrying the artifactId)
            → verify (structural)
```
No second submit/artifact path.

**Piece 3 — Report with proof (artifact-gated verify) — the heart of the goal.**
- **No submit without an artifact:** `taskSubmit` rejects a submit with no
  `artifactRefs`/`artifactId`.
- **Structural verify, not a rubber stamp:** before `taskVerify` posts
  `verification_passed`, run the checklist over the submitted artifact(s) and
  **fail** (→ `verification_failed`, back to `working`) if any check fails:
  ```text
  [ ] artifact record exists and is linked (workflow_id, task_id, worker_instance_id)
  [ ] uri is under the allowed artifact_root
  [ ] file exists and is non-empty
  [ ] sha256 matches content_hash when content_hash is provided
  [ ] a verification receipt was emitted
  [ ] task reaches complete ONLY after the verification_passed receipt
  ```
- Structural helpers in `src/kernel/artifacts/verify.ts` with an **injectable fs**
  (unit-tested without touching real disk).

**Receipt-primary obligation (F2 — pays off at R7):** the receipt chain must be
**self-sufficient** — the full chain queryable by `correlation_id` alone, and
`artifact_refs` recorded on `task_submitted` **and** `verification_passed`.

**Files (plan § Direct Repo Scope is exhaustive):** `src/kernel/artifacts/verify.ts`
(+`.test.ts`), `src/kernel/tasks/{index,validators}.ts`, the additive migration
`src/kernel/migrations/00X-r1-worker-task-binding.sql` (`worker_instances.assigned_task_id`),
`src/kernel/schema/types.ts`, `docs/v3/KERNEL_SCHEMA_V1.md`,
`src/kernel/worker-instances/index.ts`, `src/harness/types.ts` (`HarnessKind +=
'mock' | 'eve-harness'`), `src/harness/mock/index.ts` (+`.test.ts`),
`src/harness/eve/index.ts` (+`.test.ts` — **Option B, minimal eve-harness**),
`src/harness/registry.ts` (register **both** mock + eve-harness descriptors),
`src/main/conductor/conductor-actions.ts`,
`quantflow-electron/scripts/smoke-task-atom.*`, `quantflow-electron/package.json`
(`smoke:task-atom`), ENVOY.md note.

## 3. Hard guardrails — do NOT
- Let a task reach `complete` with **no artifact**, or with an artifact whose file
  is missing / empty / outside `artifact_root` / hash-mismatched. Verify is
  structural, not a rubber stamp — it must provably **open** the artifact.
- Deliver the instruction via terminal paste / `terminal_write` / MCP.
- Leave `owner_worker_id` null after assign.
- Store artifact **truth** anywhere but the Kernel `artifacts` table (the file on
  disk is *storage*; the row is *truth*).
- Let the harness write Kernel state directly (F4) — harness returns a draft + file
  path; the **caller** posts.
- Use the `legacy: true` bypass in the atom (F30) — reach `complete` via the
  structural `verification_passed` path. (The legacy bypass stays in the codebase
  for v3 compat, but the atom must not use it.)
- Auto-send **real** work without an approval token (F23).
- Scope creep: a second task, a DAG, a Context Envelope, a `Run` object, `run_id`
  on artifacts, semantic verification, Envoy migration, or new artifact provenance
  fields. R1 verify is **structural only**.
- Non-additive migration; new receipt type / event kind (reuse `artifact_created`,
  `verification_started/passed/failed`, `task_completed`); change the
  verifier-distinct guard or legacy-bypass semantics.
- **Do NOT claim "real work works" for the whole app (F5).** The live canvas /
  `workflow-service` path still creates tasks via the Envoy task bus; R1 proves the
  **Conductor→Kernel** atom only. Authority consolidation is R3.
- One rung only. Commit locally. **Do NOT push. Do NOT self-approve.**

## 4. Definition of done (acceptance)

**Machine proof (CI-safe, mock harness, no auth, no cost):**
`bun run smoke:task-atom` drives the full atom on the `mock` harness and asserts
the receipt chain in `kernel.db`:
```text
task_created → task_claimed → task_started → artifact_created → task_submitted
→ verification_started → verification_passed → task_completed
```
- After assign: `tasks.owner_worker_id` **non-null** and
  `worker_instances.assigned_task_id` points back at the task (live-run bug fixed).
- The instruction reached the worker via `send` (assert the mock recorded it) — no
  paste path exercised.
- `verify` **opened the artifact file** (structural pass) before completing.
- **Each negative case BLOCKS completion** (never reaches `complete`):
  submit with no artifact → rejected at submit; `uri` outside `artifact_root` →
  `verification_failed`; file missing → `verification_failed`; empty file →
  `verification_failed`; `content_hash` provided but sha256 mismatch →
  `verification_failed`.
- A worker may not verify its own task (`validateVerifierDistinct` holds).
- **Receipt-chain self-sufficiency (F2):** full chain queryable by `correlation_id`
  alone; `task_submitted` + `verification_passed` carry `artifact_refs`.
- **No legacy bypass (F30):** the atom reaches `complete` via `verification_passed`,
  never `kernel.task.complete` with `legacy: true`.
- `artifacts/verify.test.ts` covers the checklist over an injected fs;
  `mock/index.test.ts` covers the mock contract. Deterministic (no timestamps/uuids
  in compared bodies).

**Product proof (real Eve worker via `eve-harness` — Option B — manual, capture evidence):**
With the local `quantflow-eve` agent running (`npm run dev`, see `docs/v4/EVE_SETUP.md`),
run the atom once against the **`eve-harness`** kind: Conductor assigns a task, the
instruction is delivered to the Eve session **via `harness.send`** (HTTP, not paste),
the Eve agent produces a real artifact in its **workspace**, `collectReceipts`
translates that into a draft, the caller posts `artifact.create` + `submit`
(carrying the `artifactId`), `verify` pulls the bytes back **through the harness**
and passes the structural checklist, and the task completes.
Capture: the full receipt chain in `kernel.db`, non-null `owner_worker_id`, the
artifact row linking workflow/task/worker, the produced artifact path in the Eve
workspace, and the Eve `sessionId`. **Scrub any API key** before pasting.
> The machine proof does **not** depend on this real run. Scope the claim to the
> Conductor/Kernel path only (F5).

**Regression guard (must stay green — cumulative, Appendix A; includes R0's smokes):**
```text
cd quantflow-electron
bun run smoke:kernel-task && bun run smoke:state-card && bun run smoke:conductor && \
bun run smoke:conductor-actions && bun run smoke:conductor-loop && bun run smoke:worker-harness && \
bun run smoke:harness-interface && bun run smoke:workflow-region && bun run smoke:vault-export && \
bun run smoke:eval && bun run smoke:capability-preflight && bun run smoke:task-atom && \
bun test src/main/harness-ops.test.ts && bun test src/main/diagnostics/health-runner.test.ts && \
bun run build
cd ../tools/quantflow-mcp && node --test
```
- Migration is **additive**: existing `worker_instances` rows get
  `assigned_task_id = NULL`; no existing column changes. `KERNEL_SCHEMA_V1.md` +
  `schema/types.ts` updated to match.
> Note: `smoke:state-card` was confirmed pre-existing-broken on clean HEAD during
> R0. If it still fails identically (unrelated to your diff), say so in §5 notes
> and show it's unchanged by your work — do not "fix" it as part of R1.

## 5. Verification handoff — paste THIS back (verifier needs no repo access)
1. **Diff** — `git diff <the commit before your work>..HEAD` (or changed-files list
   + full contents of every new/changed file).
2. **Command outputs** — the **full, real** output of every §4 command (each test,
   the regression stack, the build), showing pass/fail. Do **not** summarize or
   trim failures.
3. **Self-assessment** — a table: each §4 acceptance criterion → met / not-met →
   the evidence line.
4. **Notes** — the chosen `artifact_root` convention (incl. Eve-workspace
   resolution); confirmation of `attemptId` field/semantics threaded; any
   assign-path you found carrying a null `owner_worker_id` and how you fixed it; the
   **`eve-harness` shape** (the Option B scope extension) — endpoint, how
   `collectReceipts` reads the workspace artifact, what you deliberately left out
   (durability/recovery/subagents/HITL); the `smoke:state-card` status; any other
   file the plan didn't anticipate. **Scrub any API key from all pasted output.**

> Verifier rule: approved only when the diff matches scope, the §4 commands are
> green in the pasted output, no guardrail is tripped, and the open decisions
> (`artifact_root`, `attemptId`) are resolved as specified. Workers never
> self-approve.
