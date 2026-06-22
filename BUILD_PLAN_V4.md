# QuantFlow v4 Build Scope Plan

Branch: `quantflow-v4`
Base branch: `quantflow-v3`
Planning mode: Goal Sessions (one rung at a time)
Execution rule: one goal at a time; no parallel architecture tracks unless explicitly approved.

---

## Authority & reading order

v4 does **not** replace the v3 authority documents — it extends them. Read, in order:

1. Applicable `AGENTS.md` chain (root first, then the child for the target folder).
2. `docs/v4/V4_TERRITORY_MAP.md` — the full v4 territory, the four bands, the rung
   spine, the anti-swamp rule, and the open decisions. **This build plan is the
   promotion target; the territory map is the locked reference every goal is
   checked against.**
3. `BUILD_PLAN_V3.md` — shipped v3 ladder (Goals 0–9) and the goal-shape convention.
4. `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md` + `docs/v3/KERNEL_SCHEMA_V1.md`
   + `docs/v3/GLOSSARY.md` — the One Rule, mutation/query paths, the 15 locked
   primitives, the task state machine. **All still binding in v4.**
5. This file's current goal.
6. Relevant repo files.

Nothing in this file or the territory map is authorized work until the operator
promotes a goal and explicitly authorizes it (one at a time). Workers never
approve their own goal completion.

---

## v4 in one frame

v3 is a governed, **operator-driven** orchestration surface: the task lifecycle,
receipts, verification gates, State Cards, and canvas visibility all work — but a
human clicks the buttons and **no real work happens**.

v4 is a **research-run operating system**: many real agents doing real work,
artifacts flowing between them, humans steering at checkpoints, runs lasting
minutes to overnight, output you can trust.

> v3 proved the courthouse works. v4 has to run real trials — many at once,
> overnight — with verdicts you trust.

It is **not a rewrite.** The v3 backbone (Kernel owns truth · Conductor plans ·
Harness adapts · Workers execute · Receipts prove · State Cards summarize · Vault
mirrors · Evals judge) survives intact. v4 adds four bands onto it — **A
Execution · B Flow · C Control · D Judgment & Compounding** — across an
8-rung spine. See territory map §1, §4, §8.

---

## v4 constitutional additions

The v3 **One Rule is unchanged**: *Kernel owns truth. Everything else derives.*
v4 adds three lines (territory map §2):

1. **Authority consolidation** — *Kernel decides. Envoy mirrors, bridges,
   exports, or displays.* Must be in force before dependency graphs get complex
   (by Rung 3).
2. **Anti-swamp rule** — *Every new system attaches to the atom or to the next
   rung.* No system is built at full size; only its smallest atom-adjacent
   version.
3. **Decision-authority rule** — *Kernel is terminal authority on truth. The
   human is terminal authority on decisions.* Workers never self-complete (Kernel
   verifies); agents never auto-decide (a run produces a briefing, not a committed
   action).

**Vocabulary impact is deliberately tiny.** Only `Run` is a candidate new
primitive and must be resolved against the vocab lock before it is named (open
decision §10.1). `Artifact` and `Permission` already exist in the lock;
`RunReplay`/`CostTelemetry`/`ContextEnvelope` are derived projections;
`SimulationHarness` is a `Harness` implementation. Do not coin new names for
existing concepts.

---

## Goal naming convention

v4 goals are named by their **rung number** to stay aligned with the territory
map (the authority), e.g. `Goal R0`, `Goal R1`. (This avoids the off-by-one trap
of "Goal 1 = Rung 0".) Detailed goal shapes are promoted **one rung at a time**;
they are written here, not in the territory map.

> **Name collision warning (F28):** territory map §9 labels the deferred
> distribution axis "**Distribution / R0**". That "R0" is **not** this rung
> **R0 (auth/capability preflight)**. In this build plan, `R0` always means the
> preflight rung; the deferred distribution work is called the **"distribution
> axis"** (never "R0"). Keep them separate when reading §9 alongside this file.

---

## The rung spine (orientation only — territory map §8 is authoritative)

| Rung | Name | Band | Done when (one line) |
| --- | --- | --- | --- |
| R0 | Auth / capability preflight *(parallel track)* | A (env) | one real worker reliably authed + ready; an operator-visible preflight report shows tool/provider/harness status |
| R1 | One real task atom | A | a Conductor task is executed by a worker, produces an artifact, verify provably opens it; mock green in CI, real green in dogfood |
| R2 | Upstream artifact → downstream context | B | worker B consumes worker A's verified artifact via a context envelope |
| R3 | Small DAG + authority consolidation | B | `collect→analyze→synthesize` with one parallel branch; Envoy resolved to mirror/bridge |
| R4 | Durable pod runtime | C | multiple workers, reload survival, stale/cancel/timeout, budget-bounded |
| R5 | Human checkpoint / deepen loop | C | run pauses, surfaces candidates, human picks, deepening tasks spawn |
| R6 | Run templates | B/C | a named run mode (Scout/Research/Deep) executes the full loop |
| R7 | Judgment & compounding | D | a completed run has a readable replay, a decision log, and an outcome→lesson trace |

Difficulty is back-loaded: R0–R1 are the smallest keystone; the real weight is
R4 and R7. Do not mistake "the atom works" for "v4 is done."

---

## Promotion discipline

```text
1. Operator promotes ONE rung at a time and explicitly authorizes it.
2. Worker implements only that goal's scope.
3. Worker submits the goal result + the verification evidence below.
4. Verifier checks the result against this goal's Acceptance Test and Regression Guard.
5. Verifier updates the ledger if approved, and pushes the approved branch state.
6. Operator authorizes the next rung.
```

Each rung ships and verifies independently on **both proof tracks**: a
deterministic sim/mock (machine proof, CI-safe, no auth, no cost) and one real
authed run (product proof). No rung's acceptance may depend *solely* on
real-agent auth (territory map §7).

---

# Eve Integration — v4 Worker Substrate (decided 2026-06-19)

This is the single source of truth for the Eve rescope. The affected goals below
carry a one-line "Eve delta" pointer back here.

## Decision

**Eve (Vercel's agent framework) is adopted as the durable worker substrate,
behind the `WorkerHarness` contract.** Verified against Eve's docs: `defineState`
is session-scoped working memory that "lives and dies with the session," and
anything that must "outlive the session, be shared across sessions or users, or be
queried independently of a turn belongs in an external store… or your own
database." Eve **defers persistent/cross-agent truth to your DB by design** — it
was built to sit *under* a higher authority. So there is no split-brain:
**Eve owns execution; the Kernel owns truth.**

## The boundary (what is and isn't Vercel)

- **QuantFlow stays an Electron desktop app.** Shell, canvas, and Kernel run
  local. "Host QuantFlow on Vercel" is a separate, future decision — out of scope.
- **Only the durable agent-execution lane is Vercel** (Eve agents run on Vercel
  Functions/Workflows/Sandbox).
- **The local lane stays first-class** (Codex/Claude/herdr/scripts) with *light*
  durability. **Durability is scoped to need:** heavy (park/resume/recover) = Eve
  only; local = reload-survive + restart-on-fail.
- Keep each Vercel piece (Workflows, Connect, xmcp) **behind a seam** so "leave
  Vercel later" is a harness/connection swap, not a rewrite — the same insulation
  that makes betting on beta-Eve safe.

## eve-harness = event-stream translator (F4)

A bounded adapter that drives Eve's HTTP API — POST `/eve/v1/session`, GET
`/eve/v1/session/<id>/stream`, POST `/eve/v1/session/<id>` with `continuationToken`
— and **translates Eve's NDJSON session events into Kernel receipt drafts the
caller posts.** Eve never writes Kernel state directly. Event mapping:

```text
result.completed / session.completed  → artifact + task_submitted drafts
step.completed / action.result        → progress drafts
input.requested / authorization.required → R5 checkpoint (park; QF takes the
                                          token-bound decision; resume via continuationToken)
subagent.called / subagent.completed  → INTRA-agent; stay BELOW the DAG line (not QF tasks)
session.failed / step.failed          → task_failed / task_blocked drafts
```

## Vocab locks

- **"harness" is overloaded** — Eve's intra-agent loop nests *inside* QuantFlow's
  runtime adapter. Never write "harness" unqualified.
- **"run" is overloaded — §10.1 RESOLVED: extend `Workflow`** (with
  mode/budget/checkpoint_state); do **not** introduce a "Run" primitive (Eve owns
  "run" at session scope; three "runs" = footgun).
- **Eve subagents (intra-agent) ≠ the QuantFlow DAG (cross-worker).** Don't merge.

## Model provider — OpenRouter, AI Gateway OUT

- Single **`OPENROUTER_API_KEY`** via the R0 credential accessor. **AI Gateway is
  removed from all scopes** (per-action tax). Default cheap-reasoning model
  `deepseek/deepseek-r1`; per-recipe model routing is an R8 legend config.
- **R0 spike (UNVERIFIED — do not lock until confirmed):** confirm `defineAgent`
  accepts a custom AI-SDK provider (OpenRouter, own key) *instead of* an AI-Gateway
  slug. Eve is AI-SDK-based and OpenRouter ships `@openrouter/ai-sdk-provider`, so
  it's likely — but Eve's documented default is AI Gateway. If Eve hard-requires
  gateway slugs, fall back to the cheapest non-gateway path Eve supports.

## Cloud → local reads

Cloud Eve agents cannot reach a local Kernel directly. **Front-load context via
the R2 Context Envelope in the session message** (Eve consumes it through
instructions/skills + its own compaction) — no callback needed. The **`xmcp`
Kernel-read connection** (Eve `connection_search` against a QuantFlow MCP
endpoint) is the **later** path, for when a Kernel-read endpoint is actually
hosted/reachable from Vercel. **One read surface** — `xmcp` must not become a
second MCP server beside `tools/quantflow-mcp`.

## Per-rung delta (build → integrate)

| Rung | Eve delta |
| --- | --- |
| **R0** | Two-lane preflight: local-CLI lane (safeStorage) + **Eve lane** (`/eve/v1/info` reachability + OpenRouter key present/valid). + the OpenRouter-provider spike. |
| **R1** | The "real" proof = an **Eve worker** (introduces the translator minimally). Eve artifact lands in the **Eve workspace** → structural verify pulls the bytes back **through the harness**; `artifact_root` for Eve = the Eve workspace. |
| **R2** | Unchanged build (cross-agent envelope is yours). Delivery = the envelope in the Eve session message. |
| **R3** | DAG stays; **Envoy dies**. §10.1 resolved → extend `Workflow`. `xmcp` Kernel-read endpoint = an Eve **connection** (later/hosted); R2-envelope-first for now. |
| **R4** | **Collapses.** Eve workers get durability/sandbox/recovery/park-resume from **Vercel Workflow** replay. Runtime Manager → thin control+mapping: persist `task↔sessionId`, drive Eve cancel/recover via API, consume `session.*` → Kernel worker status, restore the mapping on reload (the session survives on Vercel). Local lane keeps **light** durability only. |
| **R5** | Eve `input.requested` parks the session; the QF loop surfaces the candidate set + takes the **token-bound** selection (5D authority stays QF's); resume via `continuationToken`. |
| **R6** | A template role can target the **eve-harness** ("spawn N Eve research agents"). Structure unchanged. |
| **R7** | Run Replay = QF cross-agent receipt projection **+** Eve per-session replayable streams. `eve eval` may feed per-agent scoring; QF evals stay **non-authoritative + cross-run**. |
| **R8** | Legend onboarding adds **per-recipe model routing** (OpenRouter) and the eve-harness as a runtime target; directory-shaped Eve agent defs are onboardable. |

---

## Operator spawn model — Mode 1 vs Mode 2

> **Moved to its single source of truth: [`docs/v4/SPAWN_MODEL.md`](docs/v4/SPAWN_MODEL.md).**
> That file is canonical for the Mode-1 / Mode-2 decision, the
> role / harness / model vocabulary, the three verbs (author / summon / automate),
> and the R8 correction. Do not restate the decision here — link to it.

One-line recap (authoritative text lives in `SPAWN_MODEL.md`): an agent is just
**model + tools + harness**; the model is a swappable **API-key binding** (QF does
not route models), tools + orchestration are the owned asset, and there are **no
per-provider agent species**. **Mode 1** (terminal summon) is the default legend
path for *all* agents incl. Eve; **Mode 2** (`eve-harness`, headless) is the
Conductor/automation path only. R8 owns *summon*, R8.5 owns *authoring*, R1 owns
*automate*.

> **Sequencing:** promote **R8.5 only after R8 is Complete** (R8.5 changes the
> authoring front door; it presumes Mode-1 summon is already correct). **R2/R3
> snag:** R3's cross-worker context handoff depends on R2's Context Envelope — the
> R3 DAG structure can land first, but real cross-worker context-passing needs R2
> un-paused; R2 is deferred-until-R3-context, not droppable.

---

# v4 Goal Status

This section is the durable progress ledger for the v4 branch.

| Goal | Status | Worker | Verifier | Verified date | Notes |
| --- | --- | --- | --- | --- | --- |
| R0 — Auth / capability preflight | Complete / approved | Codex | Claude | 2026-06-19 | `capability` group on the diagnostics framework; read-only `getCredential()` accessor; genuine bounded non-interactive auth detection (present≠ready: unauthed→amber, authed→green, absent→down, no auto-spawn); `qf capability` + `capability:run/snapshot` IPC + report-only Settings pane; `smoke:capability-preflight`. R0-only diff `dab322f`, verified no `src/kernel`/schema/`auth_status`/AI-Gateway, single credential path, `preflight` script untouched. Full v3 regression + new smoke + harness-ops + health-runner + MCP + build green. OpenRouter custom-provider spike resolved positive. Pre-existing `smoke:state-card` failure fixed separately in `23e3b68` (isolated v3 Kernel guard; behavior unchanged when 002 loaded). |
| R1 — One real task atom | **Complete / approved** | Codex | Claude | 2026-06-20 | Structural artifact-gated verify (`src/kernel/artifacts/verify.ts`: record→link→under-root→exists→non-empty→sha256, injectable fs); submit requires an artifact; `verification_failed`→`working` on any structural miss. Additive migration `003` (`worker_instances.assigned_task_id`, column-guarded). Registered `mock` + minimal **`eve-harness`** (Option B). Diff `06f626c..6026971` (3 commits, 31 files) verified against code: F4 harness-never-writes-Kernel (no `kernel.*` in `harness/eve`+`harness/mock`), F30 no legacy bypass in atom (legacy path untouched for v3), F23 real send approval-gated (`conductor-actions.ts` rejects non-`mock` send without `approvalToken`; mock auto), `attemptId` threaded to receipt metadata (no dedup), bind set-on-assign/clear-on-complete. Machine proof `smoke:task-atom` (full chain + all negative cases block) + product proof on real Eve worker (session `wrun_01KVKVBR2CQ9HTFTNXAPD1MXMR`, 268-byte artifact, hash recorded). Full §4 regression green (381 PASS / 0 FAIL, `qa/r1-section5-regression-output.log`). `artifact_root` = workflow `vault_path` else `<QUANTFLOW_DIR>/artifacts`; Eve exception = `QF_EVE_WORKSPACE`. Minor: 8 existing smokes updated to accommodate the artifact-required gate (all green). |
| R2 — Upstream artifact → downstream context | **Machine-verified ✅ / approved · live-canvas product proof = operator** (commit `8676faa`, local, not pushed) | Codex | Claude | 2026-06-21 (machine) | Context Envelope v0 (read-path projection) + artifact lineage (`derived_from`). Verifier (Claude) **independently re-ran** `smoke:context-flow` + `task-atom`/`dag`/`authority`/`pod` + v3 base + build + MCP 24/24 — all green — and audited in code: **F19** `envelope.ts` imports only `kernel/queries`, zero mutation; **references-only** (artifact_id/uri/kind/content_hash, never the body); **verified-only** (`complete` + `verification_passed`) with the unverified-excluded negative proven; **sensitivity default-deny**; reuses `task_dependencies kind='context_from'` + `kernel.task.depend` (no new edge); delivery via `WorkerMessage.contextEnvelope` (object, not paste); migration **006** additive (`derived_from` default `[]`, legacy-guarded); downstream artifact records `derived_from:[A]`; **no DAG drift** in the smoke (A→B + 2 negatives). **Remaining for full Complete:** operator live-canvas proof (real downstream worker receives the envelope via `harness.send`). **Verify-ownership gap (expected at R2):** closing B in a live demo may still need operator verify — R5/R6 owns making that self-serve; not an R2 failure. Pairs with the Track-A *Legend→Run-Workflow context inject* intake. |
| R3 — Small DAG + authority consolidation | **Complete / approved** | Claude | Claude | 2026-06-21 | **§10.1 resolved → Workflow IS the run (`run_id ≡ workflow_id`; no `runs` table).** **R3a ✅** migration `004` + `queryRun` projection (references only). **R3b ✅** `dag-scheduler.ts` + Kernel claim-gate on `verification_passed`; `smoke:dag` green (collect→{analyze,extract}→synthesize). **R3c-a ✅** read-only Kernel query RPC + MCP tools (24/24). **R3c-b ✅** Envoy→Kernel bridge (`envoy-kernel-bridge.ts`); `task_id ≡ kernel.tasks.id`; `smoke:authority` 17 checks. Vault → canonical `QuantFlow Vault`; runbook `docs/v4/handoffs/R3-product-proof-operator.md`. **Machine proof** (2026-06-21): full stack green (`smoke:authority`, `smoke:dag`, `smoke:task-atom`, envoy/workflow/vault-paths tests, `smoke:envoy-task`, MCP, build). **Product proof** (operator-witnessed 2026-06-21): DevTools-seeded `wf-r3-proof` DAG; Hermes MCP claim/write + operator submit/verify per task; 4/4 tasks `complete`; artifacts `QuantFlow Vault/Projects/QuantFlow/R3-proof-artifacts/`. Commits `018a388`–`bf62afc`. **Deferred:** full `envoy_tasks` retirement; Legend-spawn worker context inject (Codex lacked Run Workflow MCP wiring — Hermes covered extract). **R4 prereq satisfied.** |
| R4 — Durable pod runtime | **Machine-verified ✅ / approved · live reload+kill product proof = operator** (committed local, not pushed) | Codex | Claude | 2026-06-21 (machine) | **Built in 4 commits `f399554`(R4a)→`07fc8e2`(R4b)→`35d8c51`(R4c)→`ae55611`(R4d), 22 files / +1428.** Verifier (Claude) **independently re-ran** the full cumulative stack — `smoke:pod` + `smoke:dag`/`smoke:authority`/`smoke:task-atom` + v3 base + capability-preflight + 11 focused R4 tests + build + MCP 24/24 — **all green**, and inspected the guardrail surfaces in code: **F12** Runtime Manager has zero direct SQL (dispatches `kernel.worker.status_update`/`task.recover`/`worker.stop` only); **F11** `sim` wraps `createMockHarness` (+ scenario injection); **F7** worker enum extended (no `working`/`blocked` on worker; reconciliation map in `KERNEL_SCHEMA_V1.md`); migration `005` additive (`auth_status`/`last_seen` only); **exactly-once** via `attemptId`/`findAttemptReceipt` (idempotent replay + reject-on-different-artifacts); **budget pause** (`budget-paused` phase reads `workflows.budget_json`, no silent overrun); **no cloud code** (local light-durability lane; Eve/WSL untouched). `smoke:pod` proves reload-survival + timeout→stale→recover + rate-limit/checkpoint blocks + 20 concurrent writes + budget pause. **Remaining for full Complete:** operator live product proof (real run survives app reload + worker kill); then push. |
| R5 — Human checkpoint / deepen loop | **Machine-verified ✅ / approved · live proof = operator batch** (commit `355b623`, pushed) | Codex | Claude | 2026-06-21 (machine) | Checkpoint phase added as a **sibling** to the 5D approval flow in `conductor-loop.ts` (existing loop untouched); **reuses `proposalToken`** (no second token scheme); candidate set = `kind='candidate'` artifact; selection records a `human_decision` receipt; deepening tasks spawn **only for the selected candidate** via `kernel.task.depend`; resumes. **No migration** (reused `checkpoint_state`; the `001` edit is a comment only, no DDL). Verifier (Claude) re-ran `smoke:checkpoint` + `conductor-loop` (5D unchanged) + dag/pod/context-flow/authority/task-atom + v3 base + build + MCP 24/24 — all green; audited the decision-authority negatives (never auto-decides; forged/drifted/replayed tokens → `stale`, spawn nothing). F13 pause-ownership stated. |
| R6 — Run templates | **Machine-verified ✅ / approved · live named-invocation proof = operator batch** (commit `95b26f6`, pushed) | Codex | Claude | 2026-06-21 (machine) | Scout / Research / Deep as `run-templates/*.json` plan-layer config (**NOT a primitive — 0 migrations, no table**); `run-template-runner.ts` is a **compiler/driver**, not a second orchestrator (F14): instantiates config → Kernel truth via `kernel.*` dispatch, asks the shared `readSchedulableTasks` (R3) for eligibility, executes through the injected `executeTask` atom, routes checkpoints through the R5 `checkpointLoop.step` (`awaiting-selection`/`proposalToken`/`human_decision`). **Reuses R5 exactly:** `taskIdForCheckpointCandidate` exported (same derivation, no fork) — the draft caveat ("confirm R5 API at promotion") is resolved against the real controller. **No auto-decide:** runner errors without an explicit human selection; `smoke:run-template` proves no-selection spawns no deepen task. Budgets declared on the Workflow-as-run (`mode`/`budget_json`, additive `hasWorkflowColumn`-guarded). Attention profile: `low` parallelized, `high` serialized via checkpoint (`deep.json`). Verifier (Claude) **independently re-ran** `smoke:run-template` + dag/checkpoint/conductor-loop/authority/context-flow/task-atom/pod + 10 v3 base smokes + harness-ops(10)/health-runner(4)/dag-scheduler(5)/capability-preflight(13) + build + MCP 24/24 — **all green**. **Live-wiring note for operator batch:** `instantiateTemplate` hardcodes `harnessKind:'mock'` for spawned tiles — correct for the smoke; a live named invocation needs a real harness wired at that seam (work still flows through injected `executeTask`). Depends on R5. |
| R7 — Judgment & compounding | **Machine-verified ✅ / approved · live replay/lesson proof = operator batch** (commit `d8a8296`, pushed) | Codex | Claude | 2026-06-21 (machine) | **Last v4 rung.** Run Replay (`run-replay.ts`) = **receipt-primary projection** — reads tasks/receipts/artifacts only, **zero events-table access** (`source:'receipt-primary'`, `usesEventsTable:false`); smoke asserts `eventCount===0` (F1). Semantic verify (`verification-stages.ts` + `src/evals/semantic-verification.ts`) = **own escalating stage**, not inlined — structural gates first, semantic can't pass over a broken artifact; recorded on the verification receipt metadata (F15). Eval **auto-trigger** (`evals/auto-trigger.ts`) fires at the *tail* of `taskVerify`/`taskComplete` in a swallowed `try/catch` (completion can't depend on it), writes eval rows only, **never read back** — write-only sink; smoke proves a task completes **despite a failing eval row** (F16). Typed artifacts via additive migration **007** (6 artifact provenance cols + 3 eval/RL-prep cols; RL = `rl_trajectory_json` schema-prep only, no training). decision_log/outcome/lesson artifact kinds; **lesson mirrored to vault** via existing OKF exporters + new `vault:export-workflow` IPC (lights up the previously-dark OKF export) — **artifact row stays truth, vault stays mirror**. Verifier (Claude) **independently re-ran** `smoke:judgment` + vault-export/eval/checkpoint/run-template/dag/context-flow/task-atom/pod/authority + 8 v3 base + capability-preflight(13) + build + MCP 24/24 — **all green**. **Remaining for full Complete:** operator live-canvas proof (Run Replay view + decision/outcome/lesson capture). Depends on R6. |
| R8 — One-click agent/tool onboarding (legend bar) | **Complete / approved** | Cursor (engine) · Claude (Mode-1 correction) | Claude (engine) · operator-witnessed (product proof) | 2026-06-21 | **Operator-added** (beyond the territory-map spine). **Engine verified** 2026-06-20 (diff `24f26db..98c32bf`): data-driven registry, "+ Add" disk write + refresh, real readiness badge, shared spawn path, machine proof green. **Mode-1 correction Complete 2026-06-21** (diff `e244be5`, canonical spawn doc `docs/v4/SPAWN_MODEL.md`): legend click = **Mode 1 terminal summon for all agents incl. Eve**; registry collapsed to `roles/*.json` (dropped `eve-packages/manifest.json`); `isEveHarness` headless fork removed (one terminal path; `runtimeTarget` alone forks PTY vs herdr); `role.cwd` threaded; `eve-harness` kept for **Mode 2 (Conductor) only**. Machine proof green (28 legend tests + all smokes incl. `smoke:task-atom` + build + MCP). **Product proof PASSED (operator-witnessed 2026-06-21):** legend-click QuantFlow Eve → Windows PowerShell tile running `npm run dev` → live `eve dev` TUI (eve v0.11.8, bound to opencode-go/deepseek-v4-pro). **Open follow-ons → R8.5:** the "+ Add" → Eve form still writes a broken `harnessKind: eve-harness` row (no `commandTemplate`/`cwd`); demote/replace it with Eve-first authoring + settings agent inventory. Handoff: `docs/v4/handoffs/R8-mode1-spawn-correction.md`. |
| R8.5 — Settings agent inventory + Eve-first authoring | **Implemented — awaiting product proof + verify** (operator-promoted 2026-06-21) | Claude | — | — | **Done:** (1) fixed the broken "+ Add" → Eve form (no more `harnessKind: eve-harness`/no-command rows — Eve kind = folder + `npm run dev` + windows-pty/powershell); (2) `cwd` + `defaultShell` threaded through `legend-recipes` create/update + IPC; (3) **Settings → Agents pane** (list roster + readiness dot · add Eve/CLI · remove) over the same `roles/*.json` registry; machine proof green (legend tests 29 + build + smokes + MCP). **Spike resolved:** Eve = one root agent per project (`eve init <name>` scaffolds a new dir), so one persona = one folder = one `roles/*.json`. **Staged follow-on:** auto-scaffold (`eve init`/`npm install` automation from Settings) — today the operator points a row at an existing Eve folder (or runs `npx eve init` once). No Kernel/schema. Goal shape drafted below (front door = *author a tool set, bind a key*, not the modal form). Settings "Agents" pane over the same `roles/*.json` registry; Eve-first scaffold path that emits a **`roles/*.json`** (eve-packages discovery is gone); fix/replace the broken "+ Add" → Eve form (it still writes `harnessKind: eve-harness` with no `commandTemplate`/`cwd`). Depends on R8 (✅). No Kernel/schema. |

> **Operator priority (reliability + extensibility over run-time):** the operator
> has set the focus on **reliable parallel orchestration** and **easy addition of
> tools/agents** — not on hitting specific run-time targets. Under that lens the
> **value rungs are R1 → R3 → R4** (structural verify · one task authority + DAG
> gating · durable/recoverable pod), with **R8** added so agents/tools are added
> at the click of a button (R0-readiness-gated). R7's *semantic verify* still
> matters (an edge-finder must not act on unchecked evidence); R7's *RL/lessons
> compounding* and any run-time/latency tuning are explicitly deprioritized.
> Suggested near-term order: **R0 → R1 → R8 → R3 → R4** (then R5/R6, R7-verify).
>
> **Dogfooding axis (updated 2026-06-20, after the Mode-1/Mode-2 clarification):**
> for *daily-use feel* the order is **finish R8 (Mode-1 Eve summon) → R8.5 (settings
> agent inventory + Eve-first authoring) → R3 (DAG/pods) → R4 (durability)**. **R2
> (Context Envelope) is paused** — it serves Mode-2 multi-worker handoffs and does
> **not** block legend summon. R1 stays Complete; this reorders only the dogfooding
> track, not the structural value rungs.

> **Eve substrate (decided 2026-06-19) — see the § Eve Integration section below.**
> Eve = the durable worker substrate behind the harness; Kernel still owns truth
> (Eve defers truth by design). R4 collapses onto Vercel Workflow durability;
> §10.1 resolved → extend `Workflow`; model provider = OpenRouter (AI Gateway
> out); QuantFlow stays an Electron desktop app (only the durable agent lane is
> Vercel). Each affected goal carries an "Eve delta" pointer.

---

# Goal R0 — Auth / Capability Preflight

> Band A (environment) · parallel track · territory map §8 rung 0, §5 (policy
> envelope — "preflight-report-not-Settings"), §7 (two proof tracks), §9
> (credential accessor seam).
>
> **Eve delta (see § Eve Integration):** two-lane preflight — local-CLI lane
> (safeStorage) **+ Eve lane** (`/eve/v1/info` reachability + `OPENROUTER_API_KEY`
> present/valid). Add the OpenRouter-provider **spike** (confirm Eve accepts a
> custom AI-SDK provider, not just an AI-Gateway slug). Credential accessor holds
> `OPENROUTER_API_KEY`; AI Gateway is out.

## Goal

Give the operator (and, later, the Conductor) a **truthful, at-a-glance answer to
"can this machine actually run a real worker right now, and with what?"** —
before any real task depends on it.

Today the app can tell whether an agent CLI is *installed*
(`role-service.ts` → `withRoleDiagnostics` sets `commandAvailable`). It cannot
tell whether that CLI is **authenticated and ready to run**, whether the
herdr/WSL spawn path is reachable, or whether a model provider has a working
credential. R0 closes that gap with a **capability preflight**: a set of probes
that classify each spawn-rail capability as present / reachable / authed / ready,
surfaced in an **operator-visible report**, and proven by getting **one real
worker reliably authed and ready** end-to-end.

R0 is a **derived, read-only report**. It does not spawn work, does not store a
new source of truth, and does not change spawn behavior.

## Why

The first live end-to-end runs (dogfooding sessions, `docs/v3/INCOMING_GOALS.md`)
found that the blocker for real autonomous work is **agent-side: CLI auth and
operator usage limits, plus intermittent herdr-wsl reachability** — *not* the
Kernel task spine. The territory map makes R0 the parallel track that R1's "real
half" depends on: you cannot prove "one real task executed by a real worker"
until at least one real worker is reliably authed and ready, and you cannot
debug that without a report that distinguishes *installed* from *authed* from
*reachable*. Presence ≠ readiness is the entire point of this rung.

R0 is also where two cheap, permanent seams from territory map §9 get adopted
early so they are never a retrofit:
- **credentials go through one accessor** (Electron `safeStorage` today);
- capability status is a **derived probe result**, never Kernel truth.

## Direct Repo Scope

Extend the **existing** diagnostics health-probe framework — do **not** invent a
parallel one.

Create or update:

```text
quantflow-electron/src/main/diagnostics/types.ts            (add "capability" to HealthGroup; capability result shape)
quantflow-electron/src/main/diagnostics/capability-probes.ts (NEW — the preflight probes)
quantflow-electron/src/main/diagnostics/capability-probes.test.ts (NEW — machine proof, injected fakes)
quantflow-electron/src/main/diagnostics/preflight.ts         (NEW — runPreflight() façade over runHealth for the capability group)
quantflow-electron/src/main/diagnostics/preflight.test.ts    (NEW — deterministic report aggregation/render)
quantflow-electron/src/main/credentials/credential-accessor.ts (NEW — single getCredential() seam over safeStorage)
quantflow-electron/src/main/credentials/credential-accessor.test.ts (NEW)
quantflow-electron/src/main/role-service.ts                  (reuse/export getRoleCommandName + commandExists; do not duplicate)
quantflow-electron/src/main/ipc-*.ts (or existing diagnostics IPC)  (expose preflight:run / preflight:snapshot, read-only)
quantflow-electron/src/windows/shell/...                     (a minimal read-only preflight report view/panel)
cli/qf.mjs (and wiring)                                      (OPTIONAL: `qf capability` prints the matrix — do NOT reuse the `preflight` name)
docs/v4/V4_TERRITORY_MAP.md                                  (no change — reference only)
BUILD_PLAN_V4.md                                             (ledger update on approval — verifier only)
```

### Capability model (illustrative shape, align to existing `ProbeCheckResult`)

Reuse `HealthProbe` / `runProbe` / `runHealth` and the `healthy|degraded|down`
levels. A capability probe's `detail` block carries the structured status:

```ts
// detail on a capability ProbeCheckResult
{
  capabilityId: string;        // e.g. "role:codex", "harness:herdr-wsl", "provider:claude"
  kind: "role" | "harness" | "provider";
  present: boolean;            // binary install/exists check
  reachable: boolean;          // runtime path (WSL/herdr/socket/network) responds
  authed: boolean | null;      // logged-in / credential valid; null = not auth-bearing
  ready: boolean;              // present && reachable && (authed !== false)
  checkedAt: string;           // ISO
}
// level mapping: ready -> healthy ; present-but-not-ready -> degraded ; absent/unreachable -> down
// `remediation` (already on HealthProbe) carries the one-line operator fix hint.
```

### Probes to implement (capability group)

1. **Agent-CLI readiness, one per spawn-rail role** that has a `commandTemplate`
   (`codex`, `claude-worker`/`claude-reviewer` → `claude`, `opencode`, `hermes`):
   - `present`: reuse `commandExists(getRoleCommandName(role))` from
     `role-service.ts` (covers `where.exe`/`which` + WSL `command -v` fallback).
   - `authed`: run a **bounded, non-interactive** readiness command per CLI
     (e.g. a `--version` / status / whoami that exits non-zero or prints a
     "not logged in" signal when unauthenticated). Where no clean non-interactive
     auth command exists, the documented fallback is a **bounded** interactive
     spawn that polls for the agent prompt via `isAgentPromptReady` /
     `waitForWorkflowAgentPrompt` (`workflow-agent-ready.ts`) and reports
     `ready`. Each CLI's probe config (command + how to classify authed) lives in
     a small per-CLI table, injectable for tests.
2. **herdr-wsl reachability** (`harness:herdr-shell`):
   - WSL present, herdr socket/pane RPC reachable, and the **UNC cwd path
     resolves** (the known intermittent `windows-node-proxy UNC` blocker from the
     dogfooding notes). Classify `reachable` / `down` with a remediation hint
     (normalize UNC → drive path). This probe makes the herdr blocker *visible*;
     it does not have to fully fix the spawn path — but R0's product proof (below)
     requires at least one real herdr-wsl worker to reach ready, so the minimal
     reachability fix needed to achieve that is in scope.
3. **local-shell / windows-pty** (`harness:local-shell`):
   - The always-available baseline. Should always report `ready` on a supported
     platform so the report is never empty and there is a guaranteed-green lane.
4. **Model provider readiness** (`provider:<id>`), behind the existing
   `ConductorModelProvider` abstraction (`src/main/conductor/model-provider.ts`):
   - `present`/`authed`: a credential exists via the **new `getCredential()`
     accessor** (safeStorage). `reachable`: a **cheap** reachability check (e.g. a
     lightweight models-list/ping) — explicitly avoid any call that consumes
     paid tokens or runs a real completion. The shipped `manual` provider (no
     network, no secret) always reports `ready`.

### Operator-visible report (not a Settings UI)

- A read-only `runPreflight()` façade (over `runHealth({ probeNames: capability… })`)
  returning a `ControllerHealth`-shaped result filtered to the capability group.
- An IPC entry (reuse the diagnostics IPC if present) `preflight:run` /
  `preflight:snapshot` — **read-only**, returns the report; never mutates.
- A **minimal in-app report view**: one row per capability with a status badge
  (green/amber/red mapped from `healthy|degraded|down`), the one-line message, and
  `remediation`. This is a *report*, not configuration — no credential editing,
  no provider setup forms.
- OPTIONAL but recommended: a `qf capability` CLI subcommand (the `qf` wrapper
  already ships via `cli-installer.ts`) that prints the same matrix — the
  cheapest operator-visible, scriptable report.

> **Naming guard (F21):** `quantflow-electron/package.json` already has a
> `"preflight"` npm script (the native-lock check). Do **not** reuse `preflight`.
> The new smoke is `smoke:capability-preflight`; the CLI verb is `qf capability`;
> the IPC channel is `capability:run` / `capability:snapshot`.

> **role ≠ harness (F34):** probes target **spawn-rail roles** (the CLI agents in
> `role-service.ts` — `codex`/`claude`/`opencode`/`hermes`) and, separately, the
> **harness descriptors** (`local-shell`/`herdr-shell` only). Do **not** register
> a CLI (e.g. `codex`) as a new harness kind — that fuses role and harness and
> violates the v3 separation. `capabilityId` namespacing (`role:` / `harness:` /
> `provider:`) is for the report only, not the harness registry.

> **Credential single-path (F20):** an audit confirms there is no existing
> credential/`safeStorage`/`keytar` read path in `quantflow-electron/src`, so
> `getCredential()` is genuinely the first and only accessor. Keep it that way —
> if any provider key is later read inline elsewhere, route it through this
> accessor instead of adding a second path.

## Out of Scope (defer to the R0 / distribution axis — territory map §9)

- No Settings UI for credentials, provider setup, or capability configuration.
- No credential **manager** (only the single `getCredential()` accessor seam).
- No capability **registry**, packaging, signing, or auto-install of CLIs.
- No **broad** permission enforcement (shell/network/provider-key/vault/browser).
- No `worker_instances.auth_status` column or any Kernel schema migration — auth
  status is a **derived probe result** here; the schema field is reserved for
  Band C (Runtime Manager, R4).
- No change to spawn behavior; the preflight never auto-spawns or auto-auths.
- No fixing usage-limit/billing economics (environmental; out of code scope).
- No Conductor consumption of the report yet (a later rung may add a read-tool;
  R0 only produces the report).

## Tool / URL Requirements

- Existing repo seams: `diagnostics/{types,probes,health-runner}.ts`,
  `role-service.ts`, `workflow-agent-ready.ts`, `conductor/model-provider.ts`,
  `harness-service.ts`, `cli-installer.ts`.
- Electron `safeStorage` API (credential accessor).
- The agent CLIs themselves for the real proof: WSL + at least one of
  `codex` / `claude` reachable and authenticatable by the operator.

## Acceptance Test (the completion signal)

R0 is complete only when **all** of the following hold.

### Machine proof (CI-safe, no auth, no network, no cost)

- `capability-probes.test.ts` drives every probe with **injected fakes** and
  asserts the full matrix:
  - present + authed + reachable → `ready` / `healthy`;
  - present + not authed → `degraded`, `authed:false`, `ready:false`, with a
    remediation hint;
  - absent command → `down`, `present:false`;
  - herdr unreachable / UNC unresolved → `down` with remediation;
  - non-auth-bearing capability (local-shell, manual provider) → `authed:null`,
    `ready:true`.
- `preflight.test.ts` asserts `runPreflight()` aggregates levels deterministically
  (worst-of, matching `aggregateLevel`) and the report render is stable
  (sorted, no timestamps in the compared body).
- `credential-accessor.test.ts` asserts get/has behavior over an injected
  storage fake (no real safeStorage in CI).

### Operator-visible report (verified live, capture evidence)

- Launching the app (or `qf preflight`) shows a capability row for **every**
  spawn-rail role + each harness + each configured provider, each with
  present/reachable/authed/ready and a remediation line where not ready.
- `local-shell` shows green on the dev machine (the guaranteed baseline).
- A CLI that is installed-but-not-logged-in shows **amber "present, not
  authenticated"** — NOT green. (This is the core proof that presence ≠ readiness.)

### Product proof (one real worker — capture evidence)

> **The real worker spawn is a manual verification action, not something the
> preflight performs.** For product proof only, the operator manually
> starts/authenticates one real worker using the normal worker path. The
> preflight report *observes* readiness; it never *initiates* the worker. This
> protects the read-only / never-auto-spawn rule above.

- The operator authenticates one real agent (recommend `claude-worker` or
  `codex` via herdr-wsl — session-2 confirmed a real herdr-wsl agent can come up
  `running`). That worker **spawns and reaches its interactive prompt**
  (`isAgentPromptReady` true), and its capability probe flips to
  `ready / healthy` in the report. Capture a screenshot/printout of the report
  before (amber) and after (green) auth.

> **Product-proof flexibility (F22):** product proof is satisfied by **any** one
> spawn rail reaching `ready` — the herdr-wsl agent is the *recommended* target,
> not a hard requirement. If the herdr UNC reachability issue blocks the chosen
> agent, fixing it is **optional** for R0 (the probe must still *report* it
> correctly); R0 is not a herdr-spawn-repair goal. The `local-shell` baseline
> reaching green is an acceptable product proof on its own.

### Regression Guard (do not break v3 — this is the "doesn't mess anything up" check)

All of these must still pass, unchanged, after R0:

```text
cd quantflow-electron
bun run smoke:kernel-task
bun run smoke:state-card
bun run smoke:conductor
bun run smoke:conductor-actions
bun run smoke:conductor-loop
bun run smoke:worker-harness
bun run smoke:harness-interface
bun run smoke:workflow-region
bun run smoke:vault-export
bun run smoke:eval
bun test src/main/harness-ops.test.ts
bun test src/main/diagnostics/health-runner.test.ts   # existing health framework intact
bun run build

cd ../tools/quantflow-mcp && node --test
```

- No change to `kernel.db` schema, `KERNEL_SCHEMA_V1`, or the task state machine.
- No new Kernel command, receipt type, or event kind.
- The existing 14 diagnostics probes and their results are unchanged; the new
  capability probes are additive under a new `capability` group.

## Failure Signals

- Preflight reports **green for a CLI that is installed but not authenticated**
  (presence mistaken for readiness) — defeats the rung's whole purpose.
- Preflight **mutates** Kernel/worker/task state, or writes any `kernel.*`
  command — it must be derived and read-only.
- An `auth_status` column or any new truth store is added — reserved for Band C.
- The work grows into a **Settings/credential-management UI** or a capability
  registry — scope creep into the deferred R0/distribution axis.
- A provider readiness check **spends paid tokens** or runs a real completion.
- Credentials are read from more than one place instead of the single
  `getCredential()` accessor.
- A second health/probe framework is created instead of extending
  `diagnostics/`.
- Any existing v3 smoke, the diagnostics health test, the MCP tests, or
  `bun run build` regresses.

## Handoff Block

```text
Branch quantflow-v4.
Read order: applicable AGENTS.md chain → docs/v4/V4_TERRITORY_MAP.md →
BUILD_PLAN_V3.md → KERNEL_CONSTITUTION.md + docs/v3/AUTHORITY_RULES.md →
this goal (R0).

Goal R0 is the auth/capability preflight (territory map rung 0). It is a DERIVED,
READ-ONLY report — it never writes Kernel truth, never adds schema, never spawns
or auto-auths.

Build by EXTENDING the existing diagnostics health-probe framework
(quantflow-electron/src/main/diagnostics/) with a new `capability` group. Reuse
role-service.ts (commandExists / getRoleCommandName), workflow-agent-ready.ts
(isAgentPromptReady) for the readiness signal, and the ConductorModelProvider
abstraction for the provider probe. Add ONE credential accessor (safeStorage).

Two proof tracks are mandatory:
- Machine proof: probes + report unit-tested with injected fakes (CI, no auth).
- Product proof: one real authed worker reaches its prompt and flips its
  capability to green in the report.

Presence is NOT readiness — an installed-but-unauthed CLI MUST show amber, not
green. That single behavior is the heart of this goal.

Do not: build a Settings/credential UI, a credential manager, a capability
registry, broad permission enforcement, an auth_status column, or any Kernel
schema migration. Do not spend paid tokens in a probe.

Run the full Regression Guard before submitting. Commit locally before handoff;
the verifier reviews the diff, updates the BUILD_PLAN_V4 ledger if approved, and
pushes.
```

---

# Goal R1 — One Real Task Atom

> Band A (execution) · the keystone · territory map §4 Band A, §5 (Artifact
> record + structural verification checklist), §8 rung 1, §10.3 (artifact storage
> root), §10.5 (idempotency seam — design now, enforce in C).
>
> **Eve delta (see § Eve Integration):** the *real* proof becomes an **Eve
> worker** driven through the event-stream-translator harness (mock harness still
> proves the atom first in CI). The Eve artifact lands in the **Eve workspace**, so
> structural verify pulls the bytes back **through the harness**; `artifact_root`
> for an Eve worker = the Eve workspace.

## Goal

Make **one** Conductor-driven task do **real work, end to end, with proof**: the
task is assigned to a real worker, the instruction is delivered to that worker
through the harness `send` seam (not terminal paste), the worker produces a real
**artifact**, the task is submitted **with** that artifact, and verification
**provably opens and checks the artifact** before the task is allowed to complete.

This is the keystone of v4. v3 proved the *process* (a task can move
`created → claimed → started → submitted → verifying → complete` with a full
receipt chain) but the operator clicked the buttons and **no work happened** —
the artifact plumbing exists but nothing flows through it, and `taskVerify`
rubber-stamps completion without ever reading an artifact. R1 closes that gap on
exactly one task, on two proof tracks (a deterministic mock harness in CI; one
real authed worker in dogfood).

R1 is deliberately the *smallest* important rung: no second task, no DAG, no
multi-worker, no semantic judgment. Just the atom.

## Why

From the first live end-to-end run (`docs/v3/INCOMING_GOALS.md`, headline
candidate): the Conductor drove a task through the full receipt chain, but
`tasks.owner_worker_id` was left `null` **on that path** (not because the Kernel
can't bind it — `taskClaim` already binds from `tileId`; that assign path simply
didn't carry one — see F17 in Direct Repo Scope), the worker sat idle, no artifact
was produced, and Submit/Verify carried no artifact. The territory map names three
fixes — task→worker delivery, worker executes, report-with-proof — and makes them
the keystone "everything else is multiplication."

The seams already exist, which is what keeps R1 an atom:
- `kernel.artifact.create` ([receipts/index.ts]) already inserts an artifact row
  + posts `artifact_created` and backfills `receipt_id`.
- `kernel.task.submit` already accepts `artifactRefs` (but does not require them).
- `WorkerHarness.send/readState/collectReceipts` ([src/harness/types.ts]) is a
  shipped contract.
- `tasks.owner_worker_id` and the `artifacts` table (`task_id`/`worker_id`/`uri`/
  `content_hash`/`kind`) already exist.

What is missing — and what R1 builds — is the **wiring and the gates**: bind the
worker and push the instruction through `send`; require an artifact on submit;
and make `taskVerify` **structural** instead of a rubber stamp.

## Direct Repo Scope

Create or update:

```text
src/kernel/artifacts/verify.ts            (NEW — structural verification helpers, fs injectable)
src/kernel/artifacts/verify.test.ts       (NEW — machine proof for the structural checklist)
src/kernel/tasks/index.ts                 (submit requires an artifact; verify runs the structural gate)
src/kernel/tasks/validators.ts            (add: no-submit-without-artifact; structural-pass-before-complete)
src/kernel/migrations/00X-r1-worker-task-binding.sql (NEW — additive: worker_instances.assigned_task_id)
src/kernel/schema/types.ts                (add assigned_task_id to the worker row type)
docs/v3/KERNEL_SCHEMA_V1.md               (document the new column + migration)
src/kernel/worker-instances/index.ts      (set assigned_task_id on assign; clear on complete/stop)
src/harness/types.ts                      (HarnessKind += 'mock')
src/harness/mock/index.ts                 (NEW — deterministic mock harness, full WorkerHarness contract)
src/harness/mock/index.test.ts            (NEW)
src/harness/registry.ts                   (register mock descriptor + createHarness('mock'))
src/main/conductor/conductor-actions.ts   (assign binds worker + delivers via harness.send; submit carries artifactId)
quantflow-electron/scripts/smoke-task-atom.* (NEW — end-to-end mock atom + negative cases)
quantflow-electron/package.json           (wire `smoke:task-atom`)
ENVOY.md / docs note                      (the atom uses Kernel task authority; full Envoy consolidation is R3, not here)
BUILD_PLAN_V4.md                          (ledger update on approval — verifier only)
```

### The three pieces (territory map §4 Band A)

**1. Task → worker delivery (bind + send).**
- **Audit the assign paths first (F17).** `taskClaim` **already** sets
  `tasks.owner_worker_id` from `tileId` via `ensureWorkerInstanceForTile`, and the
  Conductor planner already passes `tileId` — so the live-run `null` was a
  *specific* path (a manual/Conductor assign that did not carry `tileId`), not a
  missing Kernel mechanism. R1's job is to **audit every assign path** (Conductor
  action, planner, any manual/UI path) and guarantee a non-null `owner_worker_id`,
  then add and set the reverse link `worker_instances.assigned_task_id`.
- The task **instruction is delivered through `getWorkerHarness(kind).send(handle,
  { text })`** (`harness-service.ts` + the Goal 6 contract) — **never** terminal
  paste, `terminal_write`, or MCP. The send payload is the task objective plus
  minimal context (full structured context is R2's Context Envelope — keep it a
  plain instruction here).
- **Real `send` is not a low-risk auto-action (F23).** `conductor-planner.ts`
  marks `assign_task` as `risk: 'low'` (auto-executes in the loop). Delivering a
  real instruction to a live, paid agent is **not** low-risk. R1 must gate the
  **real** send behind approval or an explicit operator step (treat assign-that-
  sends as high-risk, or split "bind" from "send"); the **mock** path may stay
  low-risk/auto for CI. Do not let the loop auto-send real work without an
  approval token.

**2. Worker executes (two harnesses, same contract).**
- **Mock harness (NEW, registered `mock` kind)** — deterministic, CI-safe, no
  auth, no cost. `spawn` returns a fake handle; `send` records the instruction;
  the mock **writes a real artifact file** at a deterministic path under the
  artifact root and **returns a `ReceiptDraft` (+ the artifact file path) from
  `collectReceipts`**; `readState` reports a scripted `working → done`; `stop` is
  a no-op. It implements the **same** `WorkerHarness` interface so it is a true
  drop-in (territory map §7).
- **Harness boundary (F4): the harness never writes Kernel state.** The mock (and
  the real adapters) must **not** call `kernel.artifact.create` or any
  `kernel.*` command — that violates the Goal 6A rule (`src/harness/AGENTS.md`:
  *harness `collectReceipts` → caller posts via Kernel*). The harness produces an
  artifact **file** and **draft**; the **orchestration layer** (below) posts to
  the Kernel.
- **Real harness** — the existing `local-shell` / `herdr-shell`, driven via
  `send`, with the R0-authed worker producing a real artifact (e.g. a vault
  markdown file). `readState`/`collectReceipts` report progress.

**2b. One canonical orchestration path (F3) — mock and real share it.**
There must be **exactly one** code path that turns "a worker did the work" into
Kernel truth, so implementers do not scatter one-off bridges. In
`harness-service` / `conductor-actions`:

```text
assign(bind) → harness.send(instruction)
            → poll harness.readState / collectReceipts
            → caller posts kernel.artifact.create (from the draft + file path)
            → caller posts kernel.task.submit (carrying the artifactId)
            → verify (structural, below)
```

The mock harness exercises this *same* path in CI (it just produces its draft
deterministically); the real worker exercises it in dogfood. No second
submit/artifact path is permitted.

**3. Report with proof (artifact-gated verify).**
- **No submit without an artifact.** `taskSubmit` must reject a submit that
  carries no `artifactRefs`/`artifactId` (territory map §5 minimal enforcement).
- **Structural verification, not a rubber stamp.** Before `taskVerify` posts
  `verification_passed`, it runs the structural checklist over the submitted
  artifact(s) and **fails verification** (→ `verification_failed`, back to
  `working`) if any check fails. Completion stays impossible without a
  `verification_passed` receipt (already enforced):

  ```text
  [ ] artifact record exists and is linked (workflow_id, task_id, worker_instance_id)
  [ ] uri is under the allowed artifact_root (policy)
  [ ] file exists and is non-empty
  [ ] sha256 matches content_hash when content_hash is provided
  [ ] a verification receipt was emitted
  [ ] task reaches complete ONLY after the verification_passed receipt
  ```

- The structural helpers live in `src/kernel/artifacts/verify.ts` with an
  **injectable fs** so the checklist is unit-tested deterministically without
  touching the real disk.

### artifact_root convention (open decision §10.3 — pick the smallest)

R1 introduces one **allowed artifact write root** used by structural
verification. **Decide this FIRST, before writing the verify code (F31)** — the
structural checklist depends on it, and choosing it late forces rework. Smallest
version: a single resolved root (e.g. the workflow's `vault_path` when set, else a
configured `<QUANTFLOW_DIR>/artifacts` dir), with `uri` required to resolve
**under** it. Record the chosen convention in the goal result up front. Do **not**
build a per-worker/per-run policy matrix — that is Band C.

### Idempotency seam (open decision §10.5 — design now, enforce later)

Give `submit`/`verify` an optional **attempt key** so a retried submit/verify can
later be made exactly-once. **Lock the field name + semantics now (F32)** to avoid
churn at R4: the field is `attemptId` (string, optional) on the
`kernel.task.submit` / `kernel.task.verify` payloads, semantically "a stable id
the caller reuses across retries of the same logical attempt." R1 only
**threads the field through and records it on the receipt metadata**; full
exactly-once enforcement (dedup) is R4. Do not add a dedup table here.

### Receipt-primary timeline obligation (F2 — pays off at R7)

R7's Run Replay is **receipt-primary** (the `events` table is not persisted — see
R7/F1). For Replay to be cheap later, R1 must guarantee the **receipt chain is
self-sufficient**: every transition posts its receipt (already true), the
`correlation_id` chain stays intact end-to-end, and `artifact_refs` are recorded
on `task_submitted` and `verification_passed`. This is an explicit R1 acceptance
item below — not a vague future obligation.

## Out of Scope

- No second task, no `TaskDependency` execution, no DAG, no parallel branches (R3).
- No Context Envelope / structured upstream context (R2) — `send` carries a plain
  instruction.
- No `Run` object, no `run_id` on artifacts (reserved until §10.1 resolves, R3).
- No multi-worker, runtime manager, budgets, recovery, or reload-survival (R4).
- No **semantic** verification ("did the evidence support the claim") — R1 verify
  is **structural only** (Band D owns semantic).
- No Envoy retirement/migration — R1 simply uses Kernel task authority for the
  atom; "Kernel decides; Envoy mirrors" is enforced at R3.
- No new artifact provenance fields (`sensitivity`/`derived_from`/`source_refs`…)
  — reserved (territory map §5).
- No cost telemetry build-out (capturing tokens/cost is optional, not required).
- No permission enforcement beyond the three minimal gates (no submit without
  artifact; uri under artifact_root; no complete without verification receipt).

## Tool / URL Requirements

- Existing seams: `src/kernel/tasks/index.ts`, `src/kernel/receipts/index.ts`
  (`handleArtifactCommand`), `src/kernel/worker-instances/index.ts`,
  `src/harness/{types,registry}.ts`, `src/main/conductor/conductor-actions.ts`,
  `quantflow-electron/src/main/harness-service.ts`.
- Existing smokes under `quantflow-electron/scripts/` as the pattern for
  `smoke:task-atom`.
- For the real proof: one R0-green authed worker.

## Acceptance Test (the completion signal)

### Machine proof (CI-safe, mock harness, no auth, no cost)

`bun run smoke:task-atom` drives the full atom on the `mock` harness and asserts
the receipt chain in `kernel.db`:

```text
task_created → task_claimed → task_started → artifact_created → task_submitted
→ verification_started → verification_passed → task_completed
```

- After assign, `tasks.owner_worker_id` is **non-null** and
  `worker_instances.assigned_task_id` points back at the task (the live-run bug
  fixed).
- The instruction reached the worker via the harness `send` seam (assert the mock
  recorded it) — no terminal paste path is exercised.
- `verify` **opened the artifact file** (structural pass) before completing.
- **Negative cases each BLOCK completion** (task never reaches `complete`):
  - submit with no artifact → rejected at submit;
  - artifact `uri` outside `artifact_root` → `verification_failed`;
  - artifact file missing → `verification_failed`;
  - empty artifact file → `verification_failed`;
  - `content_hash` provided but sha256 mismatch → `verification_failed`.
- A worker may not verify its own task (`validateVerifierDistinct` still holds).
- **Receipt chain self-sufficiency (F2):** the full chain is queryable by
  `correlation_id` alone, and `task_submitted` + `verification_passed` carry
  `artifact_refs`. (This is what makes R7 receipt-primary Replay cheap.)
- **No legacy bypass in the atom (F30):** the atom smokes (and the real product
  proof) must reach `complete` via the structural `verification_passed` path —
  **never** via `kernel.task.complete` with `legacy: true`. (The legacy bypass
  stays in the codebase for v3 compat per the Regression Guard, but the atom must
  not use it.)
- `artifacts/verify.test.ts` covers the checklist over an injected fs;
  `mock/index.test.ts` covers the mock contract. Deterministic (no
  timestamps/uuids in compared bodies).

### Product proof (one real worker — manual, capture evidence)

> The real worker is started manually via the normal worker path (as in R0). The
> Kernel atom and structural verify do the gating; the machine proof above does
> **not** depend on this real run.

> **Honesty scope — Envoy duality persists until R3 (F5):** the live canvas/
> `workflow-service` path still creates tasks via the Envoy task bus. R1 proves
> the **Conductor→Kernel** atom; it does **not** make the app's default operator
> flow run on Kernel tasks. Do not claim "real work works" for the whole app on
> R1 — that honesty waits for R3's authority consolidation. The R1 product proof
> is scoped to the Conductor/Kernel path explicitly.

- Using an R0-green real worker, the operator runs the atom once: the Conductor
  assigns a task, the instruction is delivered to the real agent **via
  `harness.send`** (not paste), the agent produces a real artifact (e.g. a vault
  markdown file at a known path), submit carries the `artifactId`, `verify`
  opens the file and passes, and the task completes.
- The full receipt chain is present in `kernel.db`, `owner_worker_id` is
  non-null, and the artifact row links workflow/task/worker. Capture the chain +
  the produced artifact path.

### Regression Guard (do not break v3)

All must still pass, unchanged, after R1:

```text
cd quantflow-electron
bun run smoke:kernel-task
bun run smoke:state-card
bun run smoke:conductor
bun run smoke:conductor-actions
bun run smoke:conductor-loop
bun run smoke:worker-harness
bun run smoke:harness-interface
bun run smoke:workflow-region
bun run smoke:vault-export
bun run smoke:eval
bun run smoke:task-atom        # new
bun test src/main/harness-ops.test.ts
bun run build

cd ../tools/quantflow-mcp && node --test
```

- The migration is **additive**: existing `worker_instances` rows get
  `assigned_task_id = NULL`; no existing column changes. `KERNEL_SCHEMA_V1.md`
  and `schema/types.ts` are updated to match.
- No change to the verifier-distinct guard or the legacy-bypass semantics of
  `kernel.task.complete`.
- No new receipt type or event kind (reuse `artifact_created`,
  `verification_started/passed/failed`, `task_completed`).

## Failure Signals

- A task reaches `complete` with **no artifact**, or with an artifact whose file
  is missing / empty / outside `artifact_root` / hash-mismatched — verify must be
  structural, not a rubber stamp.
- The instruction is delivered via terminal paste, `terminal_write`, or MCP
  instead of `harness.send`.
- `tasks.owner_worker_id` is still null after assign.
- Artifact **truth** is stored anywhere other than the Kernel `artifacts` table
  (the vault file / disk is *storage*; the artifact row is *truth*).
- The mock harness writes Kernel state directly instead of going through Kernel
  commands / the `WorkerHarness` contract.
- `verify` reads the file but completion proceeds even on a structural failure.
- The migration is non-additive, or an existing smoke / the MCP tests /
  `bun run build` regresses.
- Scope creep: a second task, a DAG, a Context Envelope, a Run object, or
  semantic verification appears in the diff.

## Handoff Block

```text
Branch quantflow-v4.
Read order: applicable AGENTS.md chain → docs/v4/V4_TERRITORY_MAP.md →
BUILD_PLAN_V3.md → KERNEL_CONSTITUTION.md + docs/v3/AUTHORITY_RULES.md +
docs/v3/KERNEL_SCHEMA_V1.md → this goal (R1).

Goal R1 is the keystone: make ONE Conductor task do real work with proof, on two
tracks (deterministic mock harness in CI; one real authed worker in dogfood).

Three pieces:
1. Bind + send — AUDIT every assign path (taskClaim already binds owner_worker_id
   from tileId; the live null was a path without tileId), guarantee a non-null
   owner_worker_id, set worker_instances.assigned_task_id, and deliver the
   instruction through getWorkerHarness(kind).send(...) — NEVER paste. The REAL
   send is approval-gated / explicit operator step (NOT a low-risk auto-action);
   only the mock send may auto-run in CI.
2. Worker executes — add a registered `mock` harness (deterministic). The harness
   writes a real artifact FILE and returns a ReceiptDraft + file path from
   collectReceipts; it must NOT call kernel.artifact.create or any kernel.*. One
   canonical orchestration path (send → poll collectReceipts → CALLER posts
   kernel.artifact.create → kernel.task.submit) is shared by mock and the real
   local-shell/herdr path.
3. Artifact-gated verify — submit is REJECTED without an artifact; taskVerify runs
   the structural checklist (record linked, uri under artifact_root, file exists +
   non-empty, sha256 matches if provided, verification receipt emitted) and FAILS
   verification if any check fails. Completion stays impossible without a
   verification_passed receipt.

The structural artifact check is the heart of this goal — verify must provably
OPEN the artifact, not rubber-stamp it.

kernel.artifact.create already exists (receipts/index.ts) — WIRE it into the
atom, do not re-create it. The artifacts table and tasks.owner_worker_id already
exist. The only schema change is the additive worker_instances.assigned_task_id
migration (update KERNEL_SCHEMA_V1.md + schema/types.ts).

Do not: add a second task, a DAG, a Context Envelope, a Run object, semantic
verification, Envoy migration, or new artifact provenance fields. Verify is
STRUCTURAL only here.

Run the full Regression Guard (including the new smoke:task-atom) before
submitting. Commit locally before handoff; the verifier reviews the diff, updates
the BUILD_PLAN_V4 ledger if approved, and pushes.
```

---

# Goal R2 — Upstream Artifact → Downstream Context

> Band B (flow) · territory map §4 Band B, §5 (Context Envelope v0 + artifact
> lineage), §8 rung 2. Depends on R1.

## Goal

Make a **second** task consume the **verified** artifact of the first — the first
real link of a pipeline. The downstream worker receives a structured **Context
Envelope v0** (role, task, permissions summary, upstream verified artifacts,
expected output, verification rule) delivered through `harness.send`, and the
artifact it produces records its **lineage** (`derived_from`) back to the
upstream artifact.

R2 turns "one task does real work" (R1) into "work flows downstream." It is still
a straight line — no graph, no parallelism, no Run object yet.

## Why

R1 proved one task produces a verified artifact; a research run is worthless if
the next worker can't *use* it. The territory map's Band B smallest-first version
is exactly this: "Context Envelope v0 passes upstream artifact metadata to the
downstream worker" — not RAG, not densification. R2 also adopts the lineage seam
(`derived_from`) early so evidence ancestry is reconstructable later (Band D
Replay/lessons depend on it).

## Direct Repo Scope

```text
src/kernel/context/envelope.ts            (NEW — pure ContextEnvelope v0 builder over Kernel reads)
src/kernel/context/envelope.test.ts       (NEW — machine proof: projection shape + sensitivity rule)
src/kernel/queries/index.ts               (add queryUpstreamArtifacts(taskId): verified artifacts via task_dependencies kind='context_from')
src/kernel/migrations/00X-r2-artifact-lineage.sql (NEW — additive: artifacts.derived_from JSON array of artifact_ids)
src/kernel/schema/types.ts + docs/v3/KERNEL_SCHEMA_V1.md (document derived_from)
src/kernel/receipts/index.ts              (kernel.artifact.create accepts/records derived_from)
src/main/conductor/conductor-actions.ts   (assign builds the envelope and delivers it via harness.send for the downstream task)
quantflow-electron/scripts/smoke-context-flow.* + package.json (smoke:context-flow)
BUILD_PLAN_V4.md                          (ledger update on approval — verifier only)
```

### Context Envelope v0 (read-path projection — never authoritative)

Build from existing Kernel reads (`queryArtifactList`, `queryReceiptList`,
`queryStateCardList`, `queryTaskGet`). Shape (territory map §5):

```text
run{run_id?, mode?, objective?}            (run_id null until R3)
role
task{objective, acceptance_criteria, expected_artifact, verification_rule}
permissions(policy summary)
upstream_artifacts[{artifact_id, title, uri, kind, verification_status, produced_by_task}]
relevant_state_cards
recent_receipts                             (densified later — not now)
instrumentation{context_tokens_estimate, raw_receipt_count}
```

- The envelope **references** upstream artifacts by `artifact_id` + `uri`; it
  **never copies** artifact content/truth.
- `verification_status` is read from Kernel truth — only artifacts whose task
  reached `complete` via a `verification_passed` receipt are marked `verified`.
- **Sensitive artifacts (`sensitivity != normal`) are not injected by default.**
  The `sensitivity` field is reserved (R7); R2 defaults everything to `normal`
  but implements the exclusion hook so turning it on later is not a retrofit.
- The `instrumentation` block is the densification **measurement** (capture now,
  build densifiers only if measured pain appears — territory map §3).
- **Builder purity (F19):** `src/kernel/context/envelope.ts` is a **pure query
  projection** — it imports only `kernel/queries`, issues no mutation, and has
  **no imports from `conductor/` or `renderer/`**. Add this as an explicit scope
  rule so envelope logic can't drift into mutation helpers.
- **Assignment gate is weak until R3 (F18):** R2 does not yet block *assigning*
  task B before A is verified — the full claimable-only-when-upstream-verified
  gate is R3. R2's guarantee is narrower: the **envelope** only marks an upstream
  `verified` when its task truly completed via `verification_passed` (and excludes
  unverified upstreams). If cheap, R2 may add a minimal "warn/refuse to build a
  `verified` envelope from an unverified upstream" check; otherwise this is an
  acknowledged R2 limitation closed by R3, and must be stated in the handoff.

## Out of Scope

- No DAG / parallel branches / Run object (R3) — exactly one upstream → one
  downstream link.
- No densification/RAG — instrument only.
- No multi-run, no durability (R4).
- No new provenance fields beyond `derived_from` (the rest are R7).

## Acceptance Test

### Machine proof (mock harness, CI)

`bun run smoke:context-flow`:
- Task A (mock) produces a verified artifact (reuses the R1 atom).
- Task B is declared `context_from` A (`task_dependencies`). `assign_task` for B
  builds a Context Envelope whose `upstream_artifacts` contains A's artifact with
  `verification_status: verified`, `uri`, `produced_by_task: A`, and delivers it
  via `mock.send` (assert the mock received the envelope, not a bare string).
- B's produced artifact records `derived_from: [A.artifact_id]`.
- The envelope is a pure projection: building it issues **no** Kernel mutation.
- `instrumentation.context_tokens_estimate` / `raw_receipt_count` are present.
- **Negative:** an upstream task that is not yet `complete`/verified is **not**
  marked `verified` in the envelope (or is excluded); a `sensitivity != normal`
  artifact is **not** injected by default.

### Product proof (real, manual)

A real downstream worker receives A's verified artifact via the envelope in its
`send` payload and uses it to produce B's artifact, which records `derived_from`.

### Regression Guard

All R0/R1 acceptance + v3 smokes pass; `smoke:context-flow` added; migration is
additive (`derived_from` defaults `[]`/null).

## Failure Signals

- The envelope **copies** artifact content/truth instead of referencing by
  `artifact_id` + `uri` (a second store).
- An unverified/incomplete upstream artifact is passed as `verified` context.
- Building the envelope mutates Kernel state.
- A sensitive artifact is injected into context by default.
- Context delivered by paste/`terminal_write` instead of `harness.send`.

## Handoff Block

```text
Branch quantflow-v4. Read: AGENTS.md chain → docs/v4/V4_TERRITORY_MAP.md →
BUILD_PLAN_V3.md → KERNEL_CONSTITUTION.md + AUTHORITY_RULES.md + KERNEL_SCHEMA_V1.md
→ R1 (done) → this goal (R2).

R2 makes ONE downstream task consume ONE upstream VERIFIED artifact via a
Context Envelope v0 delivered through harness.send. The envelope is a read-path
PROJECTION — it references artifacts by id+uri, never copies truth, and only
marks an artifact `verified` when its task completed via verification_passed.
Add artifacts.derived_from (additive migration) and record it on the downstream
artifact. Sensitive artifacts are not injected by default (implement the hook;
sensitivity itself is R7). Capture context_tokens_estimate/raw_receipt_count but
build NO densifier. Do not add a DAG, Run object, or parallelism. Run the full
Regression Guard incl. smoke:context-flow before submitting.
```

---

# Goal R3 — Small DAG + Authority Consolidation

> Band B (flow) · territory map §4 Band B, §5 (Run object), §8 rung 3, §10.1
> (Run vs Workflow — RESOLVE FIRST), §10.2 (Envoy resolution). Depends on R2.

## Goal

Execute a small **task graph** — `collect → analyze → synthesize` with one
parallel branch — gating each downstream task on its upstream's verify-complete,
running independent branches concurrently. Introduce the **Run** object as the
execution-instance container that **aggregates references** to the tasks,
artifacts, and receipts of one run. And enforce the v4 authority line **Kernel
decides; Envoy mirrors** before graphs get complex.

## Why

A research run is a graph, not a line. The territory map makes R3 the rung where
the authority rule must already be in force: "if two systems can both say whether
a task is complete, DAG orchestration becomes unreliable." So R3 both builds the
DAG executor and consolidates task authority onto the Kernel.

## RESOLVE FIRST (territory map §10.1)

> **§10.1 IS NOW RESOLVED (see § Eve Integration): extend `Workflow`; do NOT
> introduce a "Run" primitive** — Eve owns "run" at session scope, so a QuantFlow
> "Run" would be the third meaning of the word. The memo below now governs *how*
> to extend Workflow (mode/budget/checkpoint_state), not *whether*.

**Gate zero — a one-page decision memo before any migration SQL (F6).** Decide
**Run vs Workflow** against the vocab lock and write the memo into the goal result
+ `docs/v3/GLOSSARY.md` + `KERNEL_SCHEMA_V1.md`. Either `Run` is a new primitive
(new `runs` table) **or** the existing `Workflow` is the instance (extended with
`mode`/`budget`/`checkpoint_state`).

Decision heuristics (the memo must address these):
- **Workflow already carries instance-ish semantics** — `objective`, `status`
  (`active|paused|complete|archived`), `vault_path`, `active_correlation_id`. The
  territory-map Run fields (`mode`, `budget`, `checkpoint_state`) overlap heavily.
- **The real question:** is "the persistent mission" (Workflow) the same thing as
  "one execution instance" (Run), or distinct? If a mission can have *many* runs
  over time, Run is a new primitive. If each mission = one run, extend Workflow.
- **Avoid two mission containers.** A new `runs` table that mostly duplicates
  Workflow is the failure mode; so is overloading Workflow until "mission" and
  "instance" blur. Pick the one that keeps a single clear owner for each concept.
- Whatever is chosen, the Run/instance **aggregates references only** (see below).

The atom (R1) and R2 deliberately left `run_id` nullable so this decision was not
pre-empted.

## Direct Repo Scope

```text
docs/v3/GLOSSARY.md + KERNEL_SCHEMA_V1.md  (record the Run-vs-Workflow decision)
src/kernel/runs/ (NEW if Run is a primitive) OR src/kernel/workflows/ (extension)
src/kernel/migrations/00X-r3-run.sql       (runs table OR workflow instance columns; backfill artifacts.run_id — nullable)
src/main/conductor/dag-scheduler.ts (NEW — returns schedulable tasks over task_dependencies kind='blocks'; the loop stays one-action-per-step and does NOT inline the graph walk — see DAG executor section / F9)
src/kernel/tasks/index.ts                  (a task is claimable only when all blocks-deps are complete+verified)
Envoy consolidation:
  quantflow-electron/src/main/envoy-task-service.ts (route through Kernel task commands OR make Envoy a read-only mirror)
  tools/quantflow-mcp/                      (add Kernel reads: kernel.canvas.snapshot / state_card / workflow.region / eval)
quantflow-electron/scripts/smoke-dag.* + package.json (smoke:dag)
```

### Run object (aggregates references — NEVER copies truth)

```text
run_id · workflow_id/template_id · mode · objective · status · started_at · ended_at ·
budget{…}(declared, enforced in R4) · checkpoint_state(R5) · policy(ref) ·
task_ids[] · artifact_ids[] · receipt_ids[] · cost(rollup)
```

The Run holds **references + instance fields only**. It must never duplicate
task/artifact/receipt truth, or it becomes a second store.

### DAG executor — a NEW module, NOT inlined into the loop (F9)

`conductor-loop.ts` is explicitly **one action per step**, operator-advanced, and
stateless (156 lines). A graph walk + parallel scheduling does **not** compose by
adding `if (dagMode)` branches inside it — that is exactly the spaghetti to avoid.

Extract a dedicated **`src/main/conductor/dag-scheduler.ts`** with an explicit
scheduling model: given the Kernel task graph (`task_dependencies` `kind='blocks'`)
it returns the set of **schedulable** tasks (every upstream `complete` +
`verification_passed`). The loop stays the executor of *one* approved action; the
scheduler decides *which* actions are eligible (possibly several independent
branches). Each scheduled action still routes through the **same approval gate and
Kernel command boundary** — no second orchestrator, no background executor that
writes state outside Kernel commands.

A downstream task becomes claimable only when **every** upstream dependency is
`complete` with a `verification_passed` receipt; independent branches are eligible
concurrently but each executes through the existing gate.

> **Concurrency surface — decide at R3 promotion.** The scheduler returns the
> *eligible set*; how parallelism is realized — sequential loop steps over the
> eligible set vs an explicit batch step that dispatches independent branches —
> is an R3b implementation decision. The plan fixes the *module* (`dag-scheduler`)
> and the *invariant* (every action through the gate + Kernel boundary); the
> concrete scheduling model is recorded in the R3 goal result.

### Decomposition mandate + sub-milestones (F9/F10)

R3 bundles four hard things; build them as ordered sub-milestones with separate
smokes so the review surface stays bounded:
- **R3a** — Run-vs-Workflow decision memo + the Run/instance schema migration
  (references only; `run_id` backfill).
- **R3b** — `dag-scheduler.ts` + claim-gating on `verification_passed`
  (`smoke:dag`).
- **R3c** — Envoy consolidation + MCP Kernel reads (`smoke:authority`).

Before R3, also extract `run-budget.ts` (R4) and `checkpoint-controller.ts` (R5)
as their own modules rather than growing `conductor-loop.ts` in place.

### Authority consolidation (Kernel decides; Envoy mirrors)

Resolve Envoy (bridge / migrate / retire — §10.2): Envoy task ops must route
through Kernel task commands, or Envoy becomes a read-only mirror of Kernel task
state — there is exactly **one** task authority. MCP gains read-only Kernel
queries (the gap from `INCOMING_GOALS.md`).

> **MCP stays external-only (F25):** the new `kernel.canvas.snapshot` /
> `state_card` / `workflow.region` / `eval` reads are for **external agents**. The
> Conductor must keep using its native in-process `conductor-tools-readonly` —
> MCP must not become the Conductor's internal read path (v3 rule: MCP is an
> external adapter, not the internal fast path).

## Out of Scope

- No durability/recovery, runtime manager, or budget **enforcement** (R4 —
  budget fields are declared here, enforced there).
- No human checkpoint/deepen (R5), no templates (R6), no judgment (R7).
- No new harness; the DAG runs on mock (CI) and the real harness (proof).

## Acceptance Test

### Machine proof (mock harness, CI)

`bun run smoke:dag`: a `collect → {analyze} → synthesize` graph with one parallel
branch runs on mock workers; each downstream task starts only after its upstream
`verification_passed`; the independent branch runs concurrently; the Run
aggregates the task/artifact/receipt ids **without** duplicating them; artifacts
carry `run_id`.

### Authority proof

There is one task authority: assert Envoy reflects Kernel task state and does not
write competing task/receipt state; MCP exposes the new Kernel reads.

### Product proof (real)

A real multi-agent run executes the 3-node DAG end-to-end.

### Regression Guard

R0–R2 + v3 smokes pass; `smoke:dag` added; Run migration additive; the R1 single
atom still passes unchanged.

## Failure Signals

- The Run **copies** task/artifact/receipt truth (second store).
- A downstream task runs before its upstream is `complete`+verified.
- Envoy still acts as a parallel task/receipt authority.
- The DAG executor bypasses the approval gate or the Kernel command boundary.
- `Run` is named/shaped without resolving §10.1 against the vocab lock.

## Handoff Block

```text
Branch quantflow-v4. R3 = small DAG + one task authority.
RESOLVE FIRST: Run vs Workflow (§10.1) against the vocab lock; record the
decision in GLOSSARY + KERNEL_SCHEMA before coding. The Run AGGREGATES references
(task_ids/artifact_ids/receipt_ids) + instance fields only — it NEVER copies
task/artifact/receipt truth. Extend conductor-loop.ts into a DAG walk over
task_dependencies(kind='blocks'); a downstream task is claimable only when all
upstreams are complete + verification_passed; independent branches run in
parallel through the SAME approval gate + Kernel command boundary. Enforce
"Kernel decides; Envoy mirrors": route Envoy task ops through Kernel commands or
make Envoy a read-only mirror; add Kernel read tools to MCP. Budgets are DECLARED
on the Run here, ENFORCED in R4. Do not build durability/recovery/templates/
judgment. Run the full Regression Guard incl. smoke:dag.
```

---

# Goal R4 — Durable Pod Runtime

> Band C (control) · territory map §4 Band C, §5 (Runtime Manager record, policy
> envelope, budgets), §6 (hard problems), §7 (simulation harness), §8 rung 4,
> §10.4/§10.5. Depends on R3. **The heaviest rung — weeks, not days.**
>
> **Eve delta (see § Eve Integration) — this rung COLLAPSES for Eve workers.**
> Durability / sandbox / recovery / park-resume come from **Vercel Workflow**
> replay, not hand-built. The Runtime Manager shrinks to a thin control+mapping
> layer: persist `task↔sessionId`, drive Eve cancel/recover via its API, consume
> `session.*` events → Kernel worker status, restore the mapping on reload (the
> session itself survives on Vercel). The heavy durability engine below applies
> only to the **local lane**, which gets *light* durability (reload-survive +
> restart) — not the full park/resume machinery. Build heavy durability ONCE,
> and it's Eve's.

## Goal

Make a multi-worker run **survivable**: track many workers; timeout / cancel /
restart / mark-stale / recover a worker's task; survive an app reload; stay
bounded by budgets; be testable without real agents via a **simulation harness**
that fakes the full failure catalog; and make submit/verify/complete
**exactly-once** so retries and recovery can't double-write or double-complete.

## Why

In many-agent, long-running systems, **partial failure is the norm** — design
around retry/recovery/degradation, not the happy path (territory map §6). This is
the rung that turns "a graph runs once on a good day" into "a run survives the
night." Difficulty concentrates here.

## Direct Repo Scope

```text
src/kernel/migrations/00X-r4-runtime.sql   (additive: worker_instances status += stale|failed|assigned, auth_status, last_seen; Run budget fields; policy ref)
src/kernel/schema/types.ts + KERNEL_SCHEMA_V1.md
src/harness/runtime-manager/ (NEW)         (control plane over Goal 6A identity: track/timeout/cancel/restart/mark-stale/recover; status truth stays in Kernel)
src/harness/sim/ (NEW)                      (simulation harness: fakes the failure catalog; same WorkerHarness contract)
src/kernel/tasks/index.ts + commands        (attempt-keyed submit/verify/complete — enforce the R1 idempotency seam; stale-task recovery → open)
src/main/conductor/conductor-loop.ts        (DAG executor checks Run budgets / stop conditions; pauses on budget exhaustion)
quantflow-electron/src/main/canvas-persistence.ts + worker restore (reload survival: worker/task/run state restored from Kernel; persist/restore spawned tiles)
quantflow-electron/scripts/smoke-pod.* + package.json (smoke:pod)
# NOTE (F36): the attention-profile attribute is R6 scope (run templates), NOT R4 — moved out.
```

### Worker status reconciliation — extend the v3 enum deliberately (F7)

Shipped v3 `WorkerInstanceStatus` is `spawning | active | idle | stopped | error`.
The territory map's R4 list (`spawning | idle | assigned | working | blocked |
stale | stopped | failed` + `auth_status`) **collides** with it — `active` vs
`working` vs `assigned`, `error` vs `failed`. Before the migration, write a
**reconciliation map** in the goal result and `KERNEL_SCHEMA_V1.md`, e.g.:
`assigned` = worker has a non-null `assigned_task_id`; keep `active` for
"runtime up"; map `failed` as a terminal error distinct from transient `error`;
do **not** put task-like states (`working`/`blocked`) on the worker — those belong
to the **task**, not the worker. Extend the existing enum; do not fork a parallel
worker state machine.

### Worker Runtime Manager (control layer, NOT a truth store)

Tracks many workers and drives harness verbs (timeout / cancel / restart /
mark-stale / recover-task). **Worker status truth stays in the Kernel** (State
Cards / `worker_instances.status`); the manager reports and drives, it does not
own truth.

> **No shadow authority (F12):** the Runtime Manager is a pure control plane. It
> mutates state **only** through Kernel commands — `kernel.worker.status_update`
> for stale/cancel/restart and `kernel.task.*` (e.g. return a recovered task to
> `open`) — **never** direct SQL. R4 must name exactly which commands implement
> mark-stale and recover-task (add them to `kernel.worker.*` / `kernel.task.*` if
> missing) rather than letting the manager write rows itself.

### Budgets / stop conditions

`max_workers · max_wallclock · max_spend · max_tool_calls · max_retries ·
requires_checkpoint` declared on the Run (R3), checked by the executor.

### Simulation harness (machine proof of Band B/C)

Implements the same `WorkerHarness` contract and fakes the full catalog
(territory map §7): `worker succeeds · submits bad artifact · times out · is
rate-limited · returns a blocker · verifier rejects · human checkpoint waits ·
downstream receives a missing artifact · app reloads mid-run`.

> **One fake-harness lineage (F11):** the R4 `sim` harness **extends/wraps the R1
> `mock`** base (shared spawn/handle/draft plumbing) and adds the failure catalog
> — it is not a second, independently-drifting fake. If `mock` already covers the
> happy path, `sim` = `mock` + injectable failure modes. State this relationship
> in the R4 goal result.

### Idempotency / exactly-once + write-concurrency

Attempt-keyed `submit`/`verify`/`complete` (enforce the R1 seam) so retry/recovery
can't double-write artifacts or double-complete tasks. SQLite is single-writer —
add a write strategy so concurrent receipt writes from many workers don't
contend/corrupt (territory map §6 "storage write-concurrency").

### Policy: declare now, enforce minimally

Policy fields declared per run/worker; **minimal safety-critical enforcement only**
routes through the Kernel (`request → validate → execute → receipt`). Broad
capability enforcement stays on the deferred R0/distribution axis.

## Out of Scope

- No production/cloud durability — **driver seams only** (interface, no cloud
  code).
- No **broad** permission enforcement (R0/distribution axis).
- No human checkpoint UI/deepen loop (R5), no templates (R6), no judgment (R7).

## Acceptance Test

### Machine proof (simulation harness, CI)

`bun run smoke:pod`: multiple sim workers run a DAG; **reload mid-run → worker/
task/run state survives** (fixes the MCP-tiles-lost-on-reload finding); a worker
**timeout → marked stale → its task recovered to `open`**; **cancel** stops a
worker; **budget exceeded → run stops**; each failure-catalog case is handled
without corrupting state; a **retried submit/verify is exactly-once** (no double
artifact, no double `complete`); concurrent receipt writes from many workers do
not corrupt or deadlock.

### Product proof (real)

A real multi-worker run survives an app reload and a worker kill, and recovers.

### Regression Guard

R0–R3 + v3 smokes pass; `smoke:pod` added; migration additive; the R1 atom and
R3 DAG still pass.

## Failure Signals

- The Runtime Manager becomes a **truth store** (worker status not in Kernel).
- A reload loses worker/task/run state.
- A retry double-writes an artifact or double-completes a task.
- Budgets are declared but not enforced; a run blows its budget silently.
- Concurrent writes corrupt or deadlock the DB.
- `auth_status` or worker status is invented outside the Kernel.
- Cloud/production code is added instead of driver seams.

## Handoff Block

```text
Branch quantflow-v4. R4 = make a multi-worker run survivable. The heaviest rung —
design around partial failure, not the happy path.
Build: a Worker Runtime Manager (control layer — worker status truth STAYS in the
Kernel), a simulation harness implementing the SAME WorkerHarness contract that
fakes the full failure catalog, reload survival (restore worker/task/run from
Kernel), budget enforcement by the executor, and attempt-keyed exactly-once
submit/verify/complete (enforce the R1 idempotency seam). Add a SQLite
write-concurrency strategy. Migration is additive (worker status values,
auth_status, last_seen, Run budget fields). Policy is DECLARED with only minimal
safety-critical enforcement routed through the Kernel; broad enforcement stays
deferred. NO cloud code — driver seams only. NO checkpoint UI/templates/judgment.
Run the full Regression Guard incl. smoke:pod.
```

---

# Goal R5 — Human Checkpoint / Deepen Loop

> Band C (control) · territory map §2 (decision-authority rule), §4 Band C, §8
> rung 5. Depends on R4.
>
> **Eve delta (see § Eve Integration):** Eve's `input.requested` /
> `authorization.required` events **park** the session; the QF loop surfaces the
> candidate set and takes the **token-bound** selection (5D decision authority
> stays QuantFlow's), then resumes via `continuationToken`. Eve provides
> pause/resume; QuantFlow keeps the decision.

## Goal

Let a run **pause at a checkpoint, surface a candidate set to the human, take a
token-bound selection, and spawn deepening tasks** for the chosen candidate(s),
then resume. This operationalizes the decision-authority rule: the Kernel is
terminal on truth, the **human is terminal on decisions**.

## Why

A research-run OS that auto-decides is a liability — "a Night Shift run produces a
*briefing*, not a placed bet." R5 is the steering wheel: the run gathers
candidates, the human picks, and only then does the system deepen. It reuses the
proven Goal 5D approval-binding (token-bound, auditable in Kernel receipts).

## Direct Repo Scope

```text
src/kernel/runs/ (or workflows)            (checkpoint_state transitions: running → awaiting-selection → resumed)
src/kernel/migrations/00X-r5-checkpoint.sql (additive: run checkpoint_state if not already present)
artifact with kind = "candidate"           (the candidate set is a typed artifact; artifact.kind is free TEXT today — the kind ENUM/migration is R7, so no enum work here — F24)
src/main/conductor/conductor-loop.ts        (at a checkpoint: pause → surface candidate set → take token-bound selection → spawn deepening tasks → resume)
src/kernel/tasks/index.ts                   (deepening tasks created from the selected candidate, linked via task_dependencies)
quantflow-electron/scripts/smoke-checkpoint.* + package.json (smoke:checkpoint)
```

> **Three "pause" concepts — name the owner (F13):** `workflows.status` already
> has `paused`; the run gets `checkpoint_state` (`awaiting-selection`); the
> Conductor loop has its own `paused` phase. R5 must state explicitly which field
> owns checkpoint pausing (the run's `checkpoint_state`) vs a workflow-level pause
> vs a loop step pause, so the executor and UI don't special-case all three.
> Recommended: `checkpoint_state` is the run-instance pause; `workflows.status`
> stays the mission-level pause; the loop phase is transient per-step.

### Checkpoint mechanics (reuse the 5D approval binding)

- The run reaches a checkpoint phase and **pauses** (`awaiting-selection`).
- It surfaces a **candidate-set artifact** (`kind: 'candidate'`) — the options.
- The operator submits a **selection**, token-bound to the exact candidate set
  shown (same drift-proof property as `proposalToken` in `conductor-loop.ts`).
  The selection is recorded as a human decision (receipt).
- **Deepening tasks spawn only for the selected candidate(s)**; the run resumes.

## Out of Scope

- No run templates (R6); no Run Replay / decision-log-as-typed-artifact (R7 — R5
  records the selection, R7 formalizes the decision/outcome logs).
- No semantic verification (R7).
- No auto-selection of any kind.

## Acceptance Test

### Machine proof (sim harness, CI)

`bun run smoke:checkpoint`: a run reaches a checkpoint, pauses
(`awaiting-selection`), surfaces a candidate-set artifact, the operator submits a
**token-bound** selection, deepening task(s) spawn for the **selected** candidate
only, and the run resumes. The selection is recorded as a human-decision receipt.

### Decision-authority proof

The run does **not** auto-pick: with no selection submitted it stays paused
indefinitely; a stale/forged/drifted selection token is refused (reuse the 5D
stale-token behavior); no deepening task spawns without a valid selection.

### Product proof (real)

A real run pauses, the operator picks from the candidate set, and the deepening
tasks run.

### Regression Guard

R0–R4 + v3 smokes pass; `smoke:checkpoint` added; migration additive; the 5D loop
approval semantics are unchanged.

## Failure Signals

- The run **auto-decides** at a checkpoint (violates decision-authority).
- The selection is not token-bound (an operator can approve set A and have the
  run deepen drifted set B).
- Deepening tasks spawn without a human selection.
- The candidate set is stored as live mutable state instead of a `candidate`
  artifact.

## Handoff Block

```text
Branch quantflow-v4. R5 = human-in-the-loop steering. The run PAUSES at a
checkpoint, surfaces a candidate-set artifact (kind 'candidate'), takes a
TOKEN-BOUND human selection (reuse the Goal 5D proposalToken drift-proofing),
and spawns deepening tasks ONLY for the selected candidate, then resumes. The run
must NEVER auto-decide — no selection ⇒ stays paused; stale/forged token ⇒
refused. Record the selection as a human-decision receipt. Do not build
templates/replay/semantic-verify. Run the full Regression Guard incl.
smoke:checkpoint.
```

---

# Goal R6 — Run Templates (Scout / Research / Deep)

> Band B/C plan layer · territory map §4 Band C (Attention Profile), §8 rung 6.
> Depends on R5.

## Goal

Package the proven loop into **named run modes** — Scout / Research / Deep — as
saved, parameterized **Conductor plans** that assemble a DAG (R3) + roles +
budgets (R4) + stop conditions + artifact expectations + **per-phase attention
profiles** and execute the full collect → checkpoint (R5) → deepen loop. Invoking
a named mode runs the whole thing.

> **Bottom-half dock model (the operator's two-section legend).** A template is
> the dock's bottom half: a **saved layout** — `tiles[]` (each a `roleId` + canvas
> position) + `connections[]` + the workflow wiring (DAG/roles/budgets). Clicking
> it **restores the full canvas layout**, then arming/Commence spawns the wired
> pod. Templates **only reference roleIds already stocked in the top half (R8)** —
> they never define agents and carry no spawn logic. Stock the top, arm the
> bottom. (Today only the hardcoded `rl-training` template exists in
> `legend-dock.js`; R6 makes this data-driven and multi-template.)

## Why

This is where v4 becomes a product rather than a pile of mechanisms: the operator
picks "Scout this" or "Deep-research this" and a tuned run executes. The attention
profile is what keeps it sane — **parallelize low-attention phases, serialize
high-attention phases** (the human is the bottleneck, not agent count).

## Direct Repo Scope

```text
run templates as plan-layer config (NOT a Kernel primitive) — e.g. <QUANTFLOW_DIR>/run-templates/*.json, like roles/*.json
src/main/conductor/ (template runner)      (compile a template → DAG + phase metadata, then run it through the SAME dag-scheduler/executor — F14)
three templates: scout.json / research.json / deep.json (DAG depth, roles, budgets, stop conditions, artifact expectations, per-phase attention profile high|medium|low)
attention-profile enforcement              (serialize high-attention phases; allow parallelism only in low-attention phases)
quantflow-electron/scripts/smoke-run-template.* + package.json (smoke:run-template)
```

> **One executor, not three (F14):** by R6 there are three potential orchestration
> entry points (the Conductor loop, the template runner, the runtime manager). A
> template must **compile to a DAG + phase metadata** and execute through the
> **same `dag-scheduler`** (R3) + runtime manager (R4) + checkpoint controller
> (R5) — it must not re-implement gating/scheduling logic. The template runner is
> a *compiler/driver*, not a second orchestrator.

### Attention Profile (plan-layer attribute, NOT a primitive)

Each run phase declares a touch level: **high** (spec / clarification / final
decision), **medium** (plan review / candidate selection / verifier objections),
**low** (collection / analysis / report generation). The runner runs **one**
human-led high-attention lane plus one or more low-attention execution lanes with
artifact handoff — never several high-attention agents interrogating the operator
at once.

## Out of Scope

- No Night Shift unattended-reliability packaging or morning-briefing artifact
  (that composition is R7 + R4 recovery + R6 budgets).
- No Run Replay / semantic verify / lessons (R7).
- Templates must not become Kernel truth — they are plan-layer config.

## Acceptance Test

### Machine proof (sim harness, CI)

`bun run smoke:run-template`: invoking a named template (e.g. Scout) instantiates
a Run, executes its DAG on sim workers within its declared budget, hits its
checkpoint(s), and produces the expected artifacts. A **high-attention phase is
serialized** (not parallelized) while a **low-attention phase runs in parallel**,
per the template's attention profile.

### Product proof (real)

A real Scout (and one of Research/Deep) run executes end-to-end from a single
named invocation.

### Regression Guard

R0–R5 + v3 smokes pass; `smoke:run-template` added; templates are config only (no
schema/primitive added).

## Failure Signals

- A template becomes a Kernel primitive / truth store (it is plan-layer config).
- A run **duplicates** Run truth inside the template.
- The attention profile is ignored — a high-attention phase is parallelized and
  swarms the operator.
- A named run cannot execute the full collect → checkpoint → deepen loop.

## Handoff Block

```text
Branch quantflow-v4. R6 = Scout/Research/Deep as saved plan-layer Conductor plans
(config like roles/*.json, NOT a Kernel primitive). A template assembles a DAG
(R3) + roles + budgets (R4) + stop conditions + artifact expectations + a
per-phase attention profile, and a template runner drives the full
collect → checkpoint (R5) → deepen loop from one named invocation. Enforce the
attention profile: SERIALIZE high-attention phases, PARALLELIZE only
low-attention phases — never swarm the operator. Do not make templates Kernel
truth; do not build Night Shift packaging or Replay. Run the full Regression
Guard incl. smoke:run-template.
```

---

# Goal R7 — Judgment & Compounding

> Band D (judgment & compounding) · territory map §4 Band D, §5 (typed research
> artifacts + provenance), §8 rung 7, §9 (RL = schema prep only). Depends on R6.

## Goal

Make a completed run **trustworthy** and make the system **compound across runs**:
a readable **Run Replay**, **semantic verification** (did the evidence actually
support the claim) escalating from R1's structural check, **typed research
artifacts** with external provenance, **decision** and **outcome** logs, **lesson
cards** mirrored to the vault, and an **eval auto-trigger** so runs feed the
evaluation layer.

## Why

When 8 agents run for 4 hours you must be able to see, debug, and trust what
happened, and the system must get smarter each run. This is the other heavy rung —
trust and the learning loop. The day-one implication seeded back at R1 pays off
here: the **receipt chain** must be **timeline-reconstructable** (ordered by
`correlation_id`, linked, complete) for Replay to be cheap now — events are
ephemeral and not persisted (F1).

## Direct Repo Scope

```text
Run Replay (projection — renderer + conductor, derived; NOT truth) over the durable receipt chain + artifact rows + task timestamps (NOT events — see F1)
src/main/conductor/ (verifier role) + src/evals/  (semantic verification: escalate from structural; judged via the verifier role + evals)
src/kernel/migrations/00X-r7-typed-artifacts.sql  (additive: artifact kind enum += evidence|candidate|skeptic_note|thesis|decision_log|outcome|lesson; provenance fields source_refs|observed_at|source_kind|confidence|quote_or_snapshot_ref|sensitivity)
src/kernel/schema/types.ts + KERNEL_SCHEMA_V1.md
decision_log + outcome artifact kinds       (what the human chose and why; what actually happened after)
lesson card                                 ('lesson' artifact distilled from a run, mirrored to vault via the Goal 8 OKF exporters in src/vault)
eval auto-trigger                           (on task/run complete → produce an evaluation; fixes the 'evaluations had 0 rows' finding)
RL prep                                      (outcome/eval schema preparation ONLY — no training)
quantflow-electron/scripts/smoke-judgment.* + package.json (smoke:judgment)
```

### Authority guards (Band D)

- **Run Replay is RECEIPT-PRIMARY (F1/F8).** The `events` table is **not
  persisted** — `emitKernelEvent` is an in-memory `EventEmitter` + `webContents.send`
  only (this also matches `AUTHORITY_RULES.md`: "events are ephemeral coordination
  signals"). So Replay must reconstruct the timeline from **durable** Kernel
  evidence: the **receipt chain** (by `correlation_id`) + **artifact rows** + task
  **lifecycle timestamps**. Treat events as renderer-only forever. Do **not** bolt
  on a second timeline store by starting to write the `events` table — unless the
  goal explicitly decides to persist events at the transition seam, which is a
  larger change than R7 needs. Replay is a **projection, not truth** (like State
  Cards). The R1 receipt-chain obligation (F2) is what makes this cheap.
- **Semantic verification** escalates from structural (R1): it never mutates state
  outside the verification-receipt / eval path; high-risk proposals still go
  through human approval.
- **Keep `taskVerify` an orchestrator, not a god function (F15).** `tasks/index.ts`
  is already ~542 lines. Structural verification lives in `artifacts/verify.ts`
  (R1); semantic verification is its **own stage/module** invoked by the verify
  pipeline. `taskVerify` calls stages — it must not inline structural + semantic +
  eval logic in one function block.
- **Evals stay non-authoritative + fire-and-forget (F16).** The auto-trigger on
  task/run complete is **fire-and-forget**: it must not be read back into any
  `claim`/`verify`/`complete` decision path. Add an explicit regression assertion
  that task progression does not gate on eval presence or score (the Goal 9
  invariant holds).
- **RL is schema preparation only** until runs produce real traces — no training,
  no GRPO, no fine-tuning.
- Typed evidence artifacts **extend** the base Artifact record with the reserved
  provenance fields; the file/vault is storage, the artifact row is truth.

## Out of Scope

- No RL **training** / GRPO / fine-tuning — schema prep only.
- No cloud / Night-Shift production infra — driver seams only.
- No heavy context densification (instrumentation from R2 only).

## Acceptance Test

### Machine proof (sim harness, CI)

`bun run smoke:judgment`: a completed run produces a **deterministic Run Replay**
over its **receipt chain + artifact rows + task timestamps** (ordered by
`correlation_id`, linked, complete — not events), a `decision_log` artifact, an
`outcome` artifact, and a `lesson` artifact mirrored to the vault; a **semantic
verification** escalates from structural and is recorded as a verification/eval
receipt; an **evaluation is auto-produced** on run/task complete (rows present —
the missing trigger). Replay reconstructs the full timeline from Kernel evidence
alone.

### Product proof (real)

A real completed run has a readable replay, a decision log, and a traceable
outcome → lesson.

### Regression Guard

R0–R6 + v3 smokes pass; `smoke:judgment` added; migration additive; **evals remain
non-authoritative** (no runtime decision path reads them); the existing
`smoke:eval` and vault export still pass.

## Failure Signals

- Run Replay is treated as a source of truth instead of a projection.
- Semantic verification mutates state outside the verification-receipt/eval path.
- An eval becomes authoritative — a runtime path reads evals to decide task/
  workflow state.
- RL training is built instead of schema prep.
- A decision/outcome/lesson lives outside the Kernel artifact record + vault
  mirror.
- Events/receipts turn out **not** to be timeline-reconstructable (R1's day-one
  obligation was skipped).

## Handoff Block

```text
Branch quantflow-v4. R7 = trust + compounding. Build: a Run Replay PROJECTION over
the append-only events/receipts (derived, never truth — first verify they are
ordered/linked/complete); semantic verification that ESCALATES from R1's
structural check via the verifier role + evals (never mutates state outside the
verification-receipt/eval path; high-risk still needs human approval); typed
research artifacts (additive migration: kind enum + provenance fields
source_refs/observed_at/source_kind/confidence/quote_or_snapshot_ref/sensitivity);
decision_log + outcome + lesson artifact kinds (lesson mirrored to vault via the
Goal 8 OKF exporters); and an eval AUTO-TRIGGER on task/run complete. Evals stay
NON-AUTHORITATIVE. RL is SCHEMA PREP ONLY — no training. No cloud code. Run the
full Regression Guard incl. smoke:judgment.
```

---

# Goal R8 — One-Click Agent/Tool Onboarding (the legend bar)

> **Operator-added rung (beyond the territory-map spine)** — driven by the
> reliability + extensibility focus: "I want adding to the legend bar to be easy,
> anything at the click of a button." Band A/B (execution/flow) — an
> extensibility seam, not new runtime authority. Depends on **R0** (readiness
> badge); pairs with **R1** (a freshly-added agent can immediately run the atom).
> Independent of R3–R7, but added agents only become *pod-useful* after R3/R4.

## Goal

Make adding a new agent/tool to the **legend bar (QF Dock spawn rail)** a
**one-click UI action** — not a source edit + rebuild — and show a **live R0
readiness badge** on every entry, so composing "a couple research tiles + a couple
scripts" is a repeatable, reliable motion.

## Why

Today the spawn rail is a **hardcoded `LEGEND_RECIPES` array** in
`quantflow-electron/src/windows/shell/src/legend-dock.js` (7 recipes) plus a
hardcoded `ICONS` map — adding an agent/tool means editing source and rebuilding.
The role registry **already** supports custom roles via `roles/*.json`
(`role-service.ts` `listRoles()` merges them and attaches `commandAvailable`
diagnostics), but the dock doesn't read them and there's no UI to create them. The
operator's priority is reliable parallel orchestration with easy agent/tool
addition; R8 makes the addition trivial and binds it to **R0** so a not-ready
agent is visibly flagged before it's spawned into a pod.

## Direct Repo Scope

```text
quantflow-electron/src/windows/shell/src/legend-dock.js   (recipes become DATA-DRIVEN from the role registry + user-added entries; built-ins stay as seed)
quantflow-electron/src/windows/shell/src/legend-dock.test.ts (render-from-injected-registry; readiness-badge mapping)
quantflow-electron/src/windows/shell/src/add-agent-form.*  (NEW — the "+ Add" form: id/name/command/runtimeTarget/icon/color/startupPrompt/type)
quantflow-electron/src/main/role-service.ts               (add create/update/remove for custom roles — writes roles/*.json; listRoles already merges)
quantflow-electron/src/main/ipc-*.ts                       (read: list recipes incl. custom + readiness; write: create/update/remove a custom agent/tool)
quantflow-electron/src/windows/shell/src/legend-spawn.js   (custom recipe → roleId resolves through the SAME spawn path; no special-casing)
(integrates the R0 capability report → per-recipe ready/amber/red badge)
BUILD_PLAN_V4.md                                           (ledger update on approval — verifier only)
```

### Design coherence — the legend bar IS the product spine

The QF Dock already splits into **Spawn** (agent recipes) and **Templates**
(saved runs). Keep that split and treat it as the architecture made visible:
- **Top half = agents** → owned by **R8** (+ the role registry). Stocking the
  bar = making workers available.
- **Bottom half = templates** → owned by **R6** (Scout/Research/Deep = a DAG +
  roles + budgets + attention profile). Arming a template = wiring stocked agents
  into a run.

A workflow is composed by *stocking the top half, then arming the bottom half*.
R8 must not blur these — it adds **agents**, not templates.

### What "one-click add" means

- The dock renders recipes from a **registry list** (`listRoles()` + user-added),
  not the hardcoded array. Built-ins become seed data, not the source of truth.
- A **"+ Add"** affordance in the dock header opens a small form: `id`, `name`,
  `commandTemplate`, `runtimeTarget` (`herdr-wsl`/`windows-pty`), `icon` (pick
  from the existing `ICONS` set — no hand-SVG required), `color`, `startupPrompt`,
  `type`. Saving writes a role to the registry and refreshes the bar — **no
  rebuild**.
- Each recipe shows an **R0 readiness badge** (green/amber/red from
  present/authed/ready). A not-ready agent is **spawnable-but-flagged** (or gated
  — operator's choice), so you never silently drop a dead agent into a pod.
- A custom recipe spawns through the **same** role-spawn path
  (`legend-spawn.js` → `roleId` → `kernel.worker.spawn`) — identical to built-ins.

### Agent inventory model — CLI roles + Eve packages (the extensibility contract)

The top half is a **scrollable, data-driven inventory** of *every* agent/script.
Two recipe shapes feed the same row UI + the same R0 readiness badge:

- **CLI role** (Codex, Claude, shell, Python, Pi) — a thin `role.json`
  (`commandTemplate`, `runtimeTarget`), spawned via PTY/herdr. The shape that
  exists today.
- **Eve package** (e.g. `quantflow-eve`) — a **directory** (`agent/agent.ts`,
  instructions, channels) plus a **`manifest.json`** that supplies the dock-row
  metadata. Spawned via the **`eve-harness`** (event-stream translator), not a
  terminal command. This is what "use Eve to structure the bar" means: **one
  folder = one manifest = one dock entry = one harness target.**

This adds `eve-harness` as a `HarnessKind` (alongside `local-shell`/`herdr-shell`,
behind the same `WorkerHarness` contract) and `eve-local` / `eve-deployed` runtime
targets. `role ≠ harness ≠ model` still holds; the dock just renders all layers.

**`manifest.json` contract (the standard the dock consumes — config, not Kernel truth):**
```jsonc
{
  "id": "qf-research-eve",
  "name": "QF Research (Eve)",
  "roleId": "eve-researcher",
  "harnessKind": "eve-harness",
  "icon": "...", "color": "#...",
  "endpoint": "http://127.0.0.1:3000",   // eve-local now; deployed /eve/v1 base URL later (R4)
  "modelHint": "deepseek-v4-pro",         // a bare OpenCode Go model id
  "type": "agent"
}
```
"+ Add" writes either a `role.json` (CLI) **or** an Eve `manifest.json`; the dock
discovers, renders, and badges it — no rebuild. **One spawn path:** every row →
`legend-spawn` → `kernel.worker.spawn` (CLI) or `eve-harness` (Eve); no special
cases. Readiness is **derived** from the R0 probe per row (Eve row checks
`/eve/v1/info` + key; CLI row checks `role:<id>` present/authed).

> The proven `quantflow-eve` package (see `docs/v4/EVE_SETUP.md`) is the first
> real Eve recipe; sketching its `manifest.json` is the cheap pre-R8 step that
> doesn't touch Kernel or templates.

## Out of Scope

- No change to orchestration/DAG (R3) — R8 makes agents *available*; their pod
  behavior is R3/R4. (Newly-added agents are only *pod-useful* after R3/R4.)
- **No domain-specific connectors/data tools here** — those are the first *pack*
  (content) loaded *through* R8, scoped separately (see the domain-pack track).
- **MCP-tool onboarding** (registering a live-data MCP connector at the click of a
  button) is a sibling seam — note it as a follow-up; R8 covers spawn-rail
  agent/tool *recipes*, not MCP server authoring.
- No run-template authoring UI (templates are R6).
- No Kernel schema change — roles are a config **registry**, not run-state truth.

## Acceptance Test

### Machine proof (CI)

- `legend-dock` renders recipes from an **injected registry list** (not the
  hardcoded array); the 7 built-ins still render and spawn.
- Adding a recipe via the add path makes it appear without a rebuild; removing it
  removes it. Round-trips through `role-service` create/remove.
- The readiness badge maps `healthy|degraded|down → green|amber|red`
  deterministically from an injected R0 capability result.
- A custom recipe resolves to its `roleId` and spawns through the shared
  role-spawn path (asserted with a fake spawn) — no special path.

### Product proof (manual) — Mode 1 (terminal summon)

A new agent/tool appears in the bar with a readiness badge and **spawns a working
**Mode-1 terminal tile** — **no source edit, no rebuild**:
- A **CLI recipe** (e.g. a `python` "odds-scraper") → terminal tile.
- An **Eve recipe** → a **terminal tile running the `eve dev` TUI** in its package
  folder (NOT an idle headless tile). Eve summons exactly like Codex.
> The headless `eve-harness` path is **Mode 2** (Conductor automation) and is
> proven separately by R1 — it is **not** what a legend click does. See
> § "Operator spawn model — Mode 1 vs Mode 2".

### Regression Guard

Existing `legend-dock`/`legend-spawn` tests pass; the 7 built-in recipes render +
spawn unchanged; cumulative v3 base + R0…N stack green (Appendix A).

## Failure Signals

- Recipes stay hardcoded — the "add" button writes source or needs a rebuild.
- A custom agent spawns through a special path instead of the shared role-spawn.
- The readiness badge is cosmetic (not wired to real R0 capability status).
- Role/agent definitions become **Kernel run-state truth** instead of a config
  registry.
- A not-ready agent can be spawned into a pod with **no** readiness signal.

## Handoff Block

```text
Branch quantflow-v4. R8 = make the legend bar (QF Dock spawn rail) one-click
extensible. Today LEGEND_RECIPES in legend-dock.js is hardcoded; make it
DATA-DRIVEN from the role registry (role-service.ts listRoles() already merges
built-ins + roles/*.json with commandAvailable). Add a "+ Add" form that
create/update/removes a custom role (writes roles/*.json via IPC) and refreshes
the bar with NO rebuild. Show a per-recipe R0 readiness badge (green/amber/red
from present/authed/ready) so a not-ready agent is flagged before it's spawned.
Custom recipes spawn through the SAME legend-spawn → roleId → kernel.worker.spawn
path — no special-casing. Roles are CONFIG, not Kernel run-state. Do not touch the
DAG/orchestration (R3), domain connectors (separate pack), or run templates (R6).
Run the cumulative Regression Guard (incl. legend-dock/legend-spawn tests).
```

---

## Night Shift (composition target — not a separate rung)

Night Shift = Rungs 1–7 **plus** unattended reliability (R4 recovery + R6
budgets) **plus** a morning-briefing artifact, **on top of R0** as the operational
prerequisite (an overnight run needs reliably authed workers — F37). It is the
proof that the whole spine holds overnight: many real agents, recoverable,
budget-bounded, producing a briefing the human decides on — never an auto-placed
action. Compose it only after R7; do not build it as a parallel track.

---

# Goal R8.5 — Settings Agent Inventory + Eve-First Authoring

> **STATUS: DRAFT — awaiting operator authorization.** Not authorized work until the
> operator promotes it. Extensibility band (sibling of R8). Depends on **R8 ✅**.
> Canonical frame: `docs/v4/SPAWN_MODEL.md` (agent = model + tools + harness; front
> door = *author a tool set, then bind a key*). Intake: `docs/v4/INCOMING_GOALS.md`.

## Goal

Make **adding and customizing an agent feel like authoring an Eve agent** (a folder:
`instructions.md` + `tools/` + a bound model), not filling a metadata modal — and give
Settings a single place to **view/manage the whole agent roster**. Keep the R8 engine
(registry · readiness badge · shared Mode-1 spawn) intact; change only the **front
door** (authoring) and add the **inventory**.

## Why

R8 made every agent summonable from the legend, but two gaps remain:
1. **The "+ Add" → Eve form is broken** (verified during the R8 proof): it writes a
   role with `harnessKind: eve-harness` and **no `commandTemplate`/`cwd`**, so any Eve
   row created through it spawns a broken WSL/Ubuntu shell, not Eve. The front door
   actively lies to the operator.
2. **No agent inventory** — Settings only does Canvas Skill install; there is no place
   to view/add/edit/remove the `roles/*.json` roster the dock reads.

The operator rejected hand-typing metadata: "incorporate how you build Eve agents for
everything." So authoring = **scaffold a real Eve package + edit files**, and the dock
picks it up through the existing `roles/*.json` registry.

## Direct Repo Scope

```text
src/windows/shell/src/settings-*.{js,...}        Settings "Agents" pane (list/add/edit/remove)
src/windows/shell/src/add-agent-form.js          FIX: stop emitting harnessKind:eve-harness;
                                                  Eve option = scaffold path (folder picker + cwd),
                                                  modal demoted to CLI/one-shot fallback only
src/main/legend-recipes.ts                        reuse create/update/remove (already roles/*.json)
src/main/eve-scaffold.ts (NEW)                    scaffold an Eve package from the proven template
src/main/ipc-legend-recipes.ts                    add cwd to the create/update input; wire scaffold IPC
docs/v4/EVE_SETUP.md                              authoring quickstart (template, Node-24, no empty folders)
BUILD_PLAN_V4.md                                  ledger update on approval (verifier only)
```

## Spike first (decides the scaffold shape)

- **Eve: multiple agents per app vs one project per agent.** `quantflow-eve` is
  one-project-one-agent today. Confirm whether `npx eve init <name>` / a copied
  template per persona is the model (it is, per current evidence) before building the
  scaffolder.
- **Node ≥24 requirement** is real (proven this session): the scaffold/role must target
  a Node-24 runtime (Windows PowerShell has it; WSL needs the nvm launcher). Record the
  chosen default in the scaffolder.

## The authoring path (build → integrate)

1. **Settings "Agents" pane** reads `listLegendRecipesWithReadiness()` and renders the
   roster (name · runtime · readiness badge · model label). Add/edit/remove call the
   existing `legend:create/update/remove` IPC (extended with `cwd`).
2. **"Add Eve agent"** = `eve-scaffold`: scaffold a fresh Eve package from the proven
   template into an operator-chosen folder, then write a **`roles/*.json`** pointing at
   it (`commandTemplate: npm run dev` + `cwd` = that folder + `runtimeTarget` +
   `defaultShell`). It must emit a `roles/*.json` — **`eve-packages` discovery was
   removed in R8**; the registry is `roles/*.json` only.
3. **Fix the broken form:** the Eve path no longer writes `harnessKind: eve-harness`
   with no command; it produces a valid Mode-1 role (or routes to the scaffolder). The
   plain modal stays only for dumb CLI/one-shot scripts.
4. **Customize = edit files:** authoring depth is adding `tools/`, `skills/`, etc. to
   the Eve folder (with content — **never empty folders**, which break Eve discovery).

## Out of Scope

- No Kernel command, receipt, or schema change — roles stay config.
- No Conductor/DAG (R3), no Mode-2/`eve-harness` change, no durability (R4).
- No model routing in QuantFlow — the key lives in the agent folder's `.env.local`.
- No pre-created empty Eve capability folders (Eve discovery rejects them).
- No new registry path — one shape (`roles/*.json`).

## Acceptance Test

### Machine proof (CI-safe)
- Settings/registry round-trip: add → list → edit → remove a role through the IPC; the
  dock registry reflects each (unit-tested over a temp roles dir).
- `eve-scaffold` writes a **runnable** Eve package (boots `eve dev` with 0 discovery
  errors — no empty `.gitkeep` folders) **and** a valid `roles/*.json` with
  `commandTemplate`/`cwd`/`runtimeTarget`.
- The Add→Eve path **never** emits `harnessKind: eve-harness` and never a role missing
  `commandTemplate`/`cwd` (regression test for the R8-proof bug).

### Product proof (operator, manual)
- From Settings → "Add Eve agent", scaffold a new persona into a folder; it appears in
  the legend with a readiness badge; legend-click → **Mode-1 `eve dev` TUI tile**.
- Edit (rename/recolor) and remove from Settings both reflect in the dock.

### Regression Guard (cumulative — Appendix A)
- All R8 tests (`legend-dock` / `legend-spawn` / `legend-recipes`) + every prior smoke
  + `bun run build` + MCP stay green. No Kernel/schema change.

## Failure Signals
- Authoring writes a broken role (no `commandTemplate`/`cwd`, or `harnessKind:
  eve-harness`) — the exact bug R8.5 exists to kill.
- A scaffolded agent fails `eve dev` discovery (e.g. empty folders shipped).
- A second registry/discovery path reappears beside `roles/*.json`.
- Any Kernel/schema mutation, or model routing added to QuantFlow.

## Handoff Block

```text
Branch quantflow-v4. Read: AGENTS.md chain → docs/v4/SPAWN_MODEL.md → docs/v4/EVE_SETUP.md
→ BUILD_PLAN_V4 § Goal R8.5 → R8 ledger row.

R8.5 changes the AUTHORING front door + adds a Settings agent inventory. Keep the R8
engine (registry/badge/Mode-1 spawn). Front door = author a tool set + bind a key, via an
Eve-package scaffold that emits a roles/*.json (eve-packages discovery is GONE — roles/*.json
only). Fix add-agent-form.js so the Eve path never writes harnessKind:eve-harness/no-command.
Never pre-create empty Eve folders (discovery breaks). No Kernel/schema. Two proof tracks.
Commit locally; verifier checks + pushes. Do not self-approve.
```

---

# Appendix A — Cumulative Regression Guard (F26)

Each rung's regression guard is **cumulative**: a worker on rung N runs the
smokes for R0…N plus the v3 base. Run from `quantflow-electron/` unless noted.

**v3 base (every rung):**
```text
bun run smoke:kernel-task · smoke:state-card · smoke:conductor ·
smoke:conductor-actions · smoke:conductor-loop · smoke:worker-harness ·
smoke:harness-interface · smoke:workflow-region · smoke:vault-export · smoke:eval
bun test src/main/harness-ops.test.ts
bun test src/main/diagnostics/health-runner.test.ts
bun run build
(cd ../tools/quantflow-mcp && node --test)
```

**Added per rung (cumulative):**
| Rung | New smoke(s) to add to the stack |
| --- | --- |
| R0 | `smoke:capability-preflight` |
| R1 | `smoke:task-atom` |
| R2 | `smoke:context-flow` |
| R3 | `smoke:dag` + `smoke:authority` |
| R4 | `smoke:pod` |
| R5 | `smoke:checkpoint` |
| R6 | `smoke:run-template` |
| R7 | `smoke:judgment` |

A rung is not done until **its** stack (v3 base + R0…N) is green.

---

# Appendix B — Review dispositions (Cursor thermo-nuclear pass)

Findings verified against shipped code and folded into the goals above. Items
marked *resolve-at-rung* are captured in the relevant goal text and decided when
that rung is promoted (per the review's own guidance).

| ID | Disposition |
| --- | --- |
| F1/F8 | **Accepted.** Verified: `events` not persisted (`emitKernelEvent` in-memory). R7 Replay reworded **receipt-primary**; events stay renderer-only. |
| F2 | **Accepted.** R1 now carries an explicit receipt-chain self-sufficiency acceptance item (correlation_id intact, artifact_refs on submit/verify). |
| F3 | **Accepted.** R1 specifies **one canonical orchestration path** (send → poll collectReceipts → caller posts artifact.create → submit), shared mock+real. |
| F4 | **Accepted.** R1 harness boundary fixed: harness returns a `ReceiptDraft` + file path; the **caller** posts to Kernel. Mock never calls `kernel.*`. |
| F5 | **Accepted.** R1/R2 product proofs explicitly scoped to the Conductor/Kernel path; Envoy duality persists until R3. |
| F6 | **Accepted.** R3 gate-zero decision memo + heuristics (Workflow already has instance-ish fields). |
| F7 | **Accepted.** R4 worker-status reconciliation map (extend the v3 enum; no task-like states on workers). |
| F9/F10 | **Accepted.** R3 extracts `dag-scheduler.ts` (no inlining into the 156-line loop) + R3a/R3b/R3c sub-milestones. |
| F11 | **Accepted.** R4 `sim` extends the R1 `mock` base. |
| F12 | **Accepted.** R4 Runtime Manager mutates only via `kernel.worker.*`/`kernel.task.*` — no direct SQL. |
| F13 | **Accepted.** R5 names checkpoint-pause ownership vs workflow pause vs loop pause. |
| F14 | **Accepted.** R6 templates compile to DAG + phase metadata, run through the one executor. |
| F15 | **Accepted.** R7 keeps `taskVerify` an orchestrator; semantic verify is its own stage. |
| F16 | **Accepted.** R7 eval auto-trigger is fire-and-forget with a no-read-back regression assertion. |
| F17 | **Accepted.** R1 diagnosis softened — audit assign paths (taskClaim already binds via tileId). |
| F18/F19 | **Accepted.** R2 envelope is a pure projection (no conductor/renderer imports); assignment gate is an acknowledged R2 limitation closed by R3. |
| F20 | **Accepted.** Audit confirms no existing credential store; `getCredential()` is the single accessor. |
| F21 | **Accepted.** R0 uses `qf capability` / `smoke:capability-preflight` — not the existing `preflight` script. |
| F22 | **Accepted.** R0 product proof satisfied by any rail reaching ready; herdr fix optional. |
| F23 | **Accepted.** R1 real `send` is approval-gated/explicit; only mock assign stays low-risk/auto. |
| F24 | **Accepted.** R5 wording fixed — `artifact.kind` is free TEXT; the kind enum is R7. |
| F25 | **Accepted.** R3 MCP Kernel reads are external-only; Conductor keeps native tools. |
| F26 | **Accepted.** Appendix A cumulative regression stack added. |
| F27 | **Accepted.** `docs/v4/AGENTS.md` added; root `AGENTS.md` + `.cursor` rule updated to v4. |
| F28 | **Accepted.** Naming guard added — rung R0 ≠ "distribution axis" (§9). |
| F29 | **Accepted.** `src/harness/AGENTS.md` drift note corrected (5D defined the seam; `conductor-actions` does not yet call `send` — R1 wires it). |
| F30 | **Accepted.** R1 atom must not use the `legacy: true` bypass. |
| F31/F32 | **Accepted.** R1 decides `artifact_root` first; locks the `attemptId` field name/semantics. |
| F34 | **Accepted.** R0 probes map to spawn-rail roles + harness descriptors separately; no CLI-as-harness-kind. |
| F36 | **Accepted.** Attention-profile attribute moved from R4 to R6. |
| F37 | **Accepted.** Night Shift notes R0 as operational prerequisite. |
| F33 | **Noted.** Editor line-count metadata is cosmetic; ignored. |

---

*All eight rungs (R0–R7) are now scoped and patched against the thermo-nuclear
review. They are promoted and authorized one at a time per the Promotion
discipline above; future edits are expected as each rung meets reality.*
