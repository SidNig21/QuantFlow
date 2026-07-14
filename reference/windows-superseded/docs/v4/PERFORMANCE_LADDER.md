# QuantFlow v4 — Performance Phase Build Plan (Make It Instant)

> **This is the authoritative scope plan for the v4 Performance phase (rungs PF0–PF7).**
> It is the promotion target: the operator promotes ONE rung at a time and explicitly
> authorizes it; workers never self-approve a rung. Full handoff blocks are written at
> promotion time (the rungs below are at *scope* altitude, like S2–S6 in the Surface ladder).
>
> **Source of truth for the findings:** [`PERF_STACK_AUDIT.md`](PERF_STACK_AUDIT.md)
> (same folder). This ladder turns that audit's Sections E–J into goal-session-sized rungs.
> Read the audit for evidence; read this file to decide what to build and in what order.

Branch target: continue `quantflow-v4`, or a new `quantflow-v4-perf`.
Base: `quantflow-v4`.

> **Name-collision warning:** `PF#` here = a **Performance rung** (a unit of work).
> The audit's **`P0`–`P3`** in its Section H are **priority bands**, not rungs. They are
> not the same numbering. When this file says "audit P0," it means a priority; when it
> says "PF0," it means the first rung.

---

## The frame

The audit's verdict in one line:

> **The Kernel design is sound — performance debt lives in the v2 collab shell, which
> still projects the whole canvas by re-querying full snapshots instead of trusting the
> event payload it already received.**

So this is **not** a rewrite and **not** micro-optimization. It is removing redundant
work from the hot path and making where-the-time-goes *visible*. The product principle
(audit §A) is the north star:

> QuantFlow should feel **instant even when work takes time** — the canvas updates on
> **phase transitions**, streams proof as layers progress, and makes the stack **visible
> per tile** (not just "Running…").

## The one non-negotiable order

**PF0 (instrument + baseline) goes first.** The audit is emphatic: do not approve any
optimization PR before there is a span timeline answering *"where did the time go?"* and
a captured baseline to beat. Every later rung's proof is a **measured delta against PF0's
`qa/perf-baseline.json`** — not a vibe. This is the project's anti-swamp rule applied to
performance: *attach to the measured atom; no full-size optimization before the atom is
measured.*

After PF0, the rungs are ordered by **ROI × safety**: PF1/PF2 are additive, high-return,
"safe now" wins; PF3/PF4 touch storage/authority and are phased and gated; PF5–PF7 round
it out, with PF7 being the product payoff.

---

## The rung spine (8 rungs)

| Rung | Name | Kills (audit bottleneck / §) | Weight | Risk |
| --- | --- | --- | --- | --- |
| **PF0** | Instrumentation + Baselines (the "measure first" keystone) | §E spans + §F benchmarks; bottleneck #11 (no span model) | keystone | low (additive) |
| **PF1** | Incremental Projection Router (kill snapshot polling) | **#1** broad `refreshWorkflowProjection` refetch | heavy | low (additive) |
| **PF2** | Stream / Canvas separation (PTY + status side-channel) | #8 Herdr-status leak; §C5 high-freq logs hit canvas | medium | low |
| **PF3** | Single Source of Truth (collapse 4 persistence layers) | **#2** quadruple persistence | heavy | **high (phased)** |
| **PF4** | Write Discipline (audit + receipt + verify) | #3 audit double-write; receipt storms; sync verify | medium | med (gated) |
| **PF5** | Fast Paths (batch IPC · parallel boot · MCP in-proc) | #6 multi-tile + startup waterfall; #7 MCP 3-hop | medium | low–med |
| **PF6** | Decompose the Monolith (no file >800 LOC on the hot path) | **#5** `renderer.js` god-file; complexity #1 | heavy | med (refactor) |
| **PF7** | Phase Model + Operator Run Timeline (the product payoff) | §G phase enum; §E operator output | medium | low |

**Keystone + parallel notes.** PF0 is the keystone — promote it alone, first. PF1 and PF6
are tightly coupled (PF1's event-kind router *is* the first module PF6 extracts from
`renderer.js`), so PF1 may carry the first slice of PF6. PF3 is the heaviest and riskiest
and depends on the PF0 baseline plus the tile-extension schema doc; do not start it until
PF0/PF1 have proven the projection path is clean.

---

## Parallel execution waves

The parallelization axis is **layer separation**: `renderer.js` is the contention magnet
(PF1, PF2, PF5-batch, PF6, PF7 all touch it), so anything sharing it must serialize — while
rungs in *different* layers (Kernel, Electron-main, SDK) run concurrently with near-zero
merge risk. For scheduling, **PF5 splits into three independent sub-parts**: **boot**
(`index.ts`), **MCP** (`quantflow-mcp` server / `json-rpc-server.ts`), and **batch**
(`kernel:command-batch`, which shares the Kernel command path).

| Wave | Runs in parallel | Why this grouping is safe |
| --- | --- | --- |
| **0** | **PF0** (solo) | Keystone. Wraps every layer's seam and its baseline gates all proofs — nothing runs beside it. |
| **1** | **PF1 → PF2** (renderer track) ∥ **PF4** (kernel track) ∥ **PF5-boot + PF5-MCP** (electron/SDK track) | Three disjoint layers, no shared files. PF0 freezes the event taxonomy, so the renderer↔kernel contract is stable while both move. PF1→PF2 are serial *within* the renderer track (same event/projection path). |
| **2** | **PF5-batch** (after PF4) · **PF3** (after PF1, focused) | Each shares files with a Wave-1 rung, so it sequences rather than parallelizes: PF5-batch touches `commands/index.ts` (= PF4); PF3 is the riskiest rung (storage) and waits until PF1 proves the projection path clean. |
| **3** | **PF6** (solo) | Rewrites `renderer.js` — must follow every renderer hot-path edit (PF1, PF2) so it reorganizes stable code instead of re-merging. The operator already called PF6 single. |
| **4** | **PF7** | Lands the phase projection on PF6's decomposed projection module and reads PF0 spans. |

**Critical path:** PF0 → PF1 → PF2 → PF6 → PF7 (~5 serial slots), with PF4, PF5 (all three
sub-parts), and PF3 absorbed into parallel capacity — down from 8 sequential rungs. Wave 1's
three tracks are the big compression if a second and third worker are available.

**Coordination guards for parallel waves:**

- The **event taxonomy/kinds are frozen at PF0** — Wave-1 tracks treat them as a fixed
  contract (PF4 may reduce event *volume*, never rename/remove a kind PF1's router depends on).
- **One worker owns one track per wave** (one branch per track); rebase tracks onto PF0, not
  onto each other, until the wave converges.
- **PF5-batch and PF4 must not be in flight together** (shared `commands/index.ts`) — that is
  why batch is held to Wave 2.

---

## Constitutional guards (every rung)

1. **Measure before optimize.** No optimization rung lands without (a) a PF0 baseline for
   the path it touches, and (b) the rung's named target metric improving against it.
   This is the audit's *Approval bar* (§J), promoted to a guard.
2. **Kernel still owns truth (v4 One Rule, unchanged).** Performance changes are
   *projection*, *transport*, or *policy* — never a new truth store. Spans are **ephemeral
   JSONL**, not Kernel rows; the phase model (PF7) is a **projection** from Kernel joins,
   not a second state store; **no events table** (Replay stays receipt-primary, F1/F8).
3. **Additive & reversible; gate behavior changes behind a flag.** `QUANTFLOW_TRACE=1`
   (PF0), `QUANTFLOW_MCP_INPROC=1` (PF5), audit-sampling flag (PF4). Each change is tagged
   **safe projection tweak** vs **authority/storage migration** — the riskier the tag, the
   more it is phased and reversible.
4. **Two proof tracks** (same shape as the spine): a deterministic **machine benchmark**
   (the audit's `B#` IDs, CI-safe, no auth/cost) **+** an operator **product proof**
   ("the app feels instant" / "the timeline explains the wait").
5. **Respect the operator & the product.** Never trade away drag/resize feel, cable hit
   targets, or visible governance to win a microbenchmark. Visible trust (phase labels,
   run timeline) is a *deliverable*, not overhead to cut.

## Promotion discipline

```text
1. Operator promotes ONE PF-rung and explicitly authorizes it.
2. The full handoff block + acceptance test are written for that rung (not before).
3. Worker implements only that rung's scope; captures the rung's B# + product proof.
4. Verifier re-runs the benchmark vs qa/perf-baseline.json, audits the diff, updates the
   ledger, pushes.
5. Operator authorizes the next rung.
```

---

## Goal status ledger

| Rung | Status | Notes |
| --- | --- | --- |
| PF0 — Instrumentation + Baselines | **Scoped — ready to promote** | keystone; everything below proves against its baseline |
| PF1 — Incremental Projection Router | Scoped | the #1 hot-path fix; depends PF0 baseline |
| PF2 — Stream / Canvas separation | Scoped | depends PF0 (to prove no canvas churn under flood) |
| PF3 — Single Source of Truth | Scoped | **phased/high-risk**; depends PF0 + tile-extension schema doc |
| PF4 — Write Discipline | Scoped | gated; touches Kernel authority — policy only, no truth removed |
| PF5 — Fast Paths | Scoped | batch IPC ∥ parallel boot ∥ MCP in-proc |
| PF6 — Decompose the Monolith | Scoped | behavior-preserving; may carry PF1's extracted module |
| PF7 — Phase Model + Run Timeline | Scoped | the product payoff; depends PF0 spans (ideally after PF1) |

---

## PF0 — Instrumentation + Baselines  *(keystone)*

- **Kills:** the audit's biggest gap — *"where did the time go?"* is unanswerable today
  (bottleneck #11, §E, §H audit-P0). You cannot fix what you cannot see.
- **Goal:** a local span log + a captured baseline, with **zero behavior change**.
- **Builds (audit §E):**
  - A **local span log** gated by `QUANTFLOW_TRACE=1` (or `QF_PERF_TRACE=1`), written to
    `~/.quantflow/perf/{date}.jsonl` + an optional `latest-summary.md`. Span shape per
    §E (`run_id`, `layer`, `name`, `duration_ms`, `payload_size_bytes`, `status`, …).
  - **Wrappers only** at the 7 anchor points (§E): `events/index.ts emitKernelEvent`,
    `commands/index.ts dispatchKernelCommand`, `receipts/index.ts postReceipt` +
    artifact create/verify, `ipc.ts` timing proxy on `ipcMain.handle`,
    `conductor-loop.ts` step spans, `pty.ts` spawn + byte counters, and
    `renderer.js scheduleProjectionRefresh(reason)`. **Extend** existing
    `launch-traces.ts` / `herdr.bootstrap` / runtime `events-repo` — do not duplicate.
  - **Rule:** terminal lines are *stream data*, spans are *milestones* — do **not** span
    every stdout line.
  - **Capture the baseline** (audit §F) into `qa/perf-baseline.json` — p50/p95 over 5
    trials for B1–B10. At minimum land B1 (cold start), B4 (event storm: 100
    `receipt.posted` in 10s — count snapshot refetches), B3 (10-tile drag commit).
- **Machine proof:** with `QUANTFLOW_TRACE=1`, a smoke drives one task atom and asserts a
  span is emitted at each of the 7 anchors with non-null `duration_ms`; with the flag
  off, **zero** spans and an unchanged code path. `qa/perf-baseline.json` exists with
  B1/B3/B4 numbers.
- **Product proof:** the operator runs one real atom, opens `latest-summary.md`, and reads
  a longest-span line (e.g. "Longest span: harness.spawn — 812ms"). No DevTools, no SQLite.
- **Out of scope:** SaaS/distributed tracing (local JSONL first, §I); spanning stdout
  lines; any behavior change.
- **Depends on:** nothing. **This is the keystone — promote it first.**

### Acceptance Test — PF0

**Machine proof (CI-safe, deterministic):** a new `smoke:perf-trace` runs one task atom twice —

- **With `QUANTFLOW_TRACE=1`:** asserts exactly one span is captured at **each of the 7
  anchor points** (§E) with a non-null `duration_ms`, the correct `layer`, and the
  correlation/parent id where applicable; asserts the JSONL at `~/.quantflow/perf/{date}.jsonl`
  (honor a `QF_PERF_DIR` override for CI) is written and **every line parses** to the `Span`
  shape; asserts **no span is emitted per stdout line** (drive N terminal lines → span count
  unchanged).
- **With the flag unset:** asserts **zero** spans written and the atom's receipts/events are
  **byte-identical** to a no-trace golden (every wrapper is a pure no-op when off).
- Asserts `qa/perf-baseline.json` exists and carries **B1** (cold start), **B3** (10-tile drag
  commit), **B4** (event storm: 100 `receipt.posted` in 10s — **including the
  snapshot-refetch count** PF1 must later drive to 0), each as **p50/p95 over 5 trials**.

**Product proof (operator, capture evidence):** with `QUANTFLOW_TRACE=1`, run one real atom;
open `~/.quantflow/perf/latest-summary.md` and read a longest-span line (e.g. "Longest span:
harness.spawn — 812ms"). No DevTools, no SQLite.

### Regression Guard — PF0 (must stay green, unchanged)

PF0 wraps hot Kernel/IPC/PTY seams, so the **entire v4 smoke stack must stay green** *and*
behavior must be identical with the flag off:

```text
cd quantflow-electron
bun run smoke:kernel-task  smoke:state-card  smoke:conductor  smoke:conductor-actions
bun run smoke:conductor-loop  smoke:worker-harness  smoke:harness-interface
bun run smoke:workflow-region  smoke:eval  smoke:task-atom  smoke:dag  smoke:authority
bun run smoke:checkpoint  smoke:run-template  smoke:judgment  smoke:event-projection
bun run smoke:perf-trace            # new
bun run build
cd ../tools/quantflow-mcp && node --test   # 24/24
```

No schema migration. No new persisted store. Spans are **ephemeral JSONL** — never a Kernel
table (Replay stays receipt-primary, F1/F8).

### Failure Signals — PF0

- Any **behavior change** when `QUANTFLOW_TRACE` is unset (a wrapper that is not a no-op off).
- A **span per stdout/terminal line** (spans are milestones, not stream data).
- Spans written into **Kernel truth** / a new events-or-spans **table** (must be ephemeral
  JSONL — F1/F8).
- A **second tracer** built instead of extending `launch-traces.ts` / `herdr.bootstrap` /
  runtime `events-repo`.
- `qa/perf-baseline.json` missing B1/B3/B4, or numbers from fewer than 5 trials.
- Any regression in the v4 smoke stack, the MCP tests, or `bun run build`.

### Handoff Block — PF0 (Codex)

```text
Branch quantflow-v4 (or quantflow-v4-perf). Read: applicable AGENTS.md chain →
docs/v4/PERFORMANCE_LADDER.md § "Constitutional guards" + this PF0 rung ONLY +
PERF_STACK_AUDIT.md §E (span taxonomy/fields/anchors) + §F (benchmarks). Do NOT read the
R0–R8.5 or S-rung bodies.

PF0 is INSTRUMENTATION-ONLY — wrappers, no behavior change. Add a local span log gated by
QUANTFLOW_TRACE=1 → ~/.quantflow/perf/{date}.jsonl (+ optional latest-summary.md), Span shape
per §E. Wrap the 7 anchor points (emitKernelEvent, dispatchKernelCommand, postReceipt +
artifact create/verify, ipcMain.handle proxy, conductor-loop step, pty spawn + byte counters,
renderer scheduleProjectionRefresh). EXTEND launch-traces.ts / herdr.bootstrap / events-repo —
do not duplicate. Terminal lines are stream data, NOT spans — never span per stdout line.

Spans are EPHEMERAL JSONL — never a Kernel table (Replay stays receipt-primary, F1/F8). With
the flag OFF, every wrapper is a pure no-op (byte-identical receipts/events vs golden).

Capture the baseline into qa/perf-baseline.json: B1, B3, B4 (p50/p95 over 5 trials); B4 must
record the snapshot-refetch count (PF1 will drive it to 0).

Two proofs: machine smoke:perf-trace (span-at-each-anchor + flag-off no-op + baseline present)
+ operator latest-summary.md longest-span read. Run the full Regression Guard before
submitting. Commit locally; verifier (Claude) re-runs the stack + audits the diff, captures
the baseline, updates the ledger, pushes.
```

## PF1 — Incremental Projection Router  *(kill snapshot polling)*

- **Kills:** bottleneck **#1** — `refreshWorkflowProjection()` runs
  `kernel.workflow.region_list` + `kernel.canvas.snapshot` on ~15 event kinds with **no
  debounce** (`renderer.js` L1513–1529, L3671–3690). The dominant hot-path bug: the app
  re-queries the *whole* canvas on every little event.
- **Goal:** replace blanket snapshot refetch with **event-kind dispatch** — update only the
  surface that changed, from the payload already in hand.
- **Builds (audit judo #1, §H audit-P0, §J tasks 3–4):**
  - An **event-kind router** that maps each kernel event kind to a *targeted* surface
    refresh (region | tile | dock | checkpoint | cable), reusing the typed handlers S0
    already added — and **stops** calling the broad re-query for `receipt.posted`,
    `task.*`, `worker.*` where a targeted handler now covers it.
  - A **50ms debounce / coalesced rAF** on any remaining projection refresh so an event
    burst collapses to one redraw.
  - Keep the existing incremental cable SVG (it is already good — audit Appendix 1); the
    fix is *invocation frequency*, not the draw.
- **Machine proof:** **B4** — drive 100 `receipt.posted` in 10s and assert **0 full
  snapshot refetches** (vs the PF0 baseline count) and a measured projection-latency drop.
  Targeted-handler unit tests: a `receipt.posted` touches only the affected tile/dock.
- **Product proof:** during a receipt storm the canvas stays smooth; no UI stutter while
  workers/models are idle.
- **Out of scope:** new state library (Redux/Zustand), WebSockets for local events (§I);
  changing what each surface *renders* (that is the Surface ladder's job).
- **Depends on:** PF0 (the B4 baseline to beat). Naturally produces PF6's first extracted
  module (`renderer-event-router.js`).
- **Surface-ladder note:** this overlaps S0, which gave *some* targeted handlers but left
  the broad re-query in place. PF1 finishes that job. **Recommend landing PF1 before S2**
  (Live Run Projection adds projection surfaces — don't build them on snapshot polling).

## PF2 — Stream / Canvas separation  *(PTY + status side-channel)*

- **Kills:** bottleneck #8 + §C5 leak path — a Herdr status ping fires
  `kernel.worker.status_update` + `syncTileList()` + `herdrList()` + `updateCables()`
  (`renderer.js` L3585–3599); high-frequency terminal/log traffic shakes the whole canvas.
- **Goal:** enforce the rule **"high-frequency logs must not trigger high-frequency canvas
  state changes."** Terminal bytes live in the terminal webview; status pings do not
  redraw cables or re-list tiles.
- **Builds (audit judo #4, flow §5):**
  - Route `pty:data` to the terminal webview **only**; forbid stdout/status from triggering
    `updateCables`, `syncTileList`, or Kernel queries.
  - Decouple Herdr status from per-ping canvas work — coalesce status into the phase
    projection (PF7) rather than a full tile re-list per ping.
  - The Windows-PowerShell 16ms PTY batch already exists (§I) — **enforce the no-leak rule;
    do not re-implement the batch.**
- **Machine proof:** **B7** — `cat large.log` floods a terminal; assert **0** canvas state
  changes (no `updateCables` / `syncTileList` / Kernel query) attributable to stdout, and
  no main-process stall (bytes/sec vs main-CPU from PF0 byte counters).
- **Product proof:** a noisy terminal does not make tiles/cables jitter; the rest of the
  canvas stays responsive.
- **Out of scope:** re-tuning the existing 16ms batch (§I); changing terminal rendering.
- **Depends on:** PF0 (byte counters + the leak baseline).

## PF3 — Single Source of Truth  *(collapse the four persistence layers)*

- **Kills:** bottleneck **#2** — tile/session/connection truth lives in **four** places at
  once: in-memory `canvas-state.js`, JSON `canvas-state.json`, `kernel.db`, `runtime.db`.
  Every mutation pays a reconciliation tax and they can diverge.
- **Goal:** **one** canonical hydration source (the Kernel); demote the rest to
  cache/export.
- **Builds (audit judo #2, §H audit-P1, §J task 9):**
  - **Document the tile-extension schema first** (§J9) — the Kernel-side home for the
    canvas-only fields (position, transport type) that justify demoting the JSON. This
    unblocks the rung.
  - Boot from `kernel.canvas.snapshot` + a `tile_extensions` table; **demote
    `canvas-state.json`** to a cache/export artifact (not a source of truth).
  - **Stop the dual-write** of connections to `runtime.db`; make Kernel `connections`
    canonical (audit §C3 dual-write risk).
- **Machine proof:** hydration reads from Kernel only (assert no read of `canvas-state.json`
  on boot); a connection round-trips through Kernel without a `runtime.db` write;
  bytes-written/session drops vs the PF0 baseline; a divergence test (Kernel vs JSON) can no
  longer disagree because JSON is no longer authoritative.
- **Product proof:** reload survives from Kernel state alone; no "tiles came back wrong"
  after a crash; export still produces a valid `canvas-state.json` on demand.
- **Out of scope:** storing artifacts/logs in Kernel state (§I — artifacts stay by ref);
  changing the Kernel schema beyond the additive `tile_extensions` table.
- **Depends on:** PF0 (baseline), and the §J9 schema doc. **Highest-risk rung — phase it:**
  demote-read before stop-write; keep a reversible fallback until proven.

## PF4 — Write Discipline  *(audit + receipt + verify)*

- **Kills:** bottleneck #3 (every `dispatchKernelCommand` = INSERT **+** UPDATE on
  `commands` before the handler runs) + receipt storms + synchronous whole-file artifact
  verify (`artifacts/verify.ts`).
- **Goal:** stop writing to disk more than the truth requires — **without removing any
  truth** (this rung is *policy*, not authority change).
- **Builds (audit §C6/§D, §H audit-P1/P2):**
  - **Milestone receipts only:** Conductor micro-steps become *spans* (PF0), not receipts.
    Receipts stay for milestones (artifact/verification/decision). *Authority-sensitive —
    keep every receipt the One Rule requires; only demote non-milestone chatter.*
  - **Command-audit sampling/batch** for high-frequency ops (`tile.move`/`resize`), behind
    a flag (audit marks this "Needs flag").
  - **Async/worker artifact verify** for large files so verification stops blocking task
    completion (instrument size-vs-latency first via PF0).
- **Machine proof:** writes/command drops for `tile.move` under sampling; a receipt-storm
  benchmark shows fewer rows with **no** milestone receipt lost (authority-preserving
  assertion); verify latency for a large file no longer blocks the completion span.
- **Product proof:** a drag of many tiles no longer hitches on audit writes; a large
  artifact's run completes without a verify stall.
- **Out of scope:** SQLite pragma tuning (WAL+NORMAL already set, §I); removing any receipt
  the constitution requires; parallelizing the Conductor approval gate without operator
  authorization (§I).
- **Depends on:** PF0. **Gate every write-policy change behind a flag; tag as
  authority-adjacent.**

## PF5 — Fast Paths  *(batch IPC · parallel boot · MCP in-process)*

- **Kills:** bottleneck #6 (N sequential `kernel.tile.move` round-trips on multi-drag,
  `tile-manager.js` L201–211; startup waterfall in `index.ts`) and #7 (MCP local path is a
  3-hop stdio→TCP:9811→JSON-RPC relay).
- **Goal:** collapse avoidable round-trips on the three worst offenders.
- **Builds (audit judo #3 + secondary, §H audit-P0/P1, §J tasks 7 & 10):**
  - **`kernel:command-batch`** — one transaction + one event burst for multi-tile drag and
    MCP bulk ops (replaces N IPC round-trips).
  - **Parallel startup** — paint the window after IPC registration; bring up sidecar +
    Herdr in the background after first paint.
  - **MCP in-process fast path** for local Hermes (`QUANTFLOW_MCP_INPROC=1`) — bypass the
    TCP relay when same-machine.
- **Machine proof:** **B3** 10-tile drag commit **<200ms** (from N round-trips → 1);
  **B1** cold-start trace improves (first paint before sidecar/Herdr); **B6** local MCP
  `kernel.taskGet` p95 **<50ms** in-process.
- **Product proof:** dragging a group of tiles settles instantly; the window appears fast
  and fills in; MCP tool calls feel local.
- **Out of scope:** remote/WebSocket transport (only after the local path is clean, §I);
  optimizing Eve before the local/mock path is measured (§I).
- **Depends on:** PF0 (B1/B3/B6 baselines). The three sub-parts are independent and can
  land separately.

## PF6 — Decompose the Monolith  *(no file >800 LOC on the hot path)*

- **Kills:** bottleneck **#5** / complexity #1 — `renderer.js` (~3,497 LOC) does tiles,
  cables, watchtower, conductor, kernel events, and webviews, so render frequency is
  impossible to reason about and *fixes don't stick*.
- **Goal:** split the hot-path monolith into focused modules (<800 LOC each) **with no
  behavior change** — a refactor that makes the earlier rungs maintainable.
- **Builds (audit judo #5, §H audit-P0, §J task 8, monolith register):**
  - Extract `renderer-event-router.js` (this is PF1's deliverable), `projection.js`, and
    `watchtower-host.js` from `renderer.js` — each <800 LOC.
  - Put a **coalesced rAF queue** in the projection module (feeds PF1's debounce; addresses
    cable jank, B8).
  - Address the other >800 LOC hot-path files as they are touched (`tile-manager.js`,
    `canvas-rpc.js`, `pty.ts`) — `shell.css` is maintenance, not hot path (skip).
- **Machine proof:** no shell **hot-path** file >800 LOC; the full shell unit suite stays
  green (behavior-preserving); **B8** cable pan p95 **<16ms** with the rAF queue.
- **Product proof:** drag/resize/cable feel is unchanged; nothing regressed.
- **Out of scope:** rewriting `renderer.js` **behavior** or drag/resize feel / cable hit
  targets (§I — this is a *structural* split, not a behavior change); the thin
  `src/renderer/` TS track (leave the architecture split for a later call).
- **Depends on:** PF0 (green baseline to prove "no behavior change"). Tightly coupled to
  PF1 — can interleave.

## PF7 — Phase Model + Operator Run Timeline  *(the product payoff)*

- **Kills:** the *product* gap, not a CPU gap — today a tile says "Running…" with no idea
  *what it is waiting on* (§A, §E operator output, §G).
- **Goal:** make where-the-time-goes **visible to the operator** — the differentiator that
  turns this whole effort into trust.
- **Builds (audit §G + §E):**
  - **One projection enum** for State Cards, tile chrome, and spans (§G: `idle | starting |
    preflight | planning | … | harness_executing | streaming_output | structural_verifying
    | receipt_written | awaiting_approval | complete | failed | …`), **derived** from Kernel
    task/worker/receipt joins — *a projection, not a second truth store.*
  - A **run timeline** per tile/run (§E) — start as text/JSON (§J task 6: longest-span
    summary), then surface on the State Card back or a Watchtower tab.
  - The **tile phase label** (the headline product win): "Running — waiting on Hyperliquid
    SDK", not just "Running".
- **Machine proof:** the phase enum is computed purely from Kernel joins (deterministic
  unit test, no new store); a finished run renders a longest-span timeline from PF0 spans;
  asserts **no** new persisted store (no events table — F1/F8).
- **Product proof:** the operator watches a real run, sees the tile say *what* it is waiting
  on, and reads a per-run timeline that names the longest span — without opening logs,
  SQLite, DevTools, or terminals.
- **Out of scope:** the tile phase *chip* UI (`MODEL|SDK|PTY`) — the State Card phase string
  covers v1 (§I); Braintrust / external trace vendor (parked, Surface ladder).
- **Depends on:** PF0 (spans), ideally after PF1 (phase transitions ride the event router).

---

## Definition of Done (the audit's Approval bar, §J)

The ladder is complete when:

- [ ] *"Where does the time go?"* is answerable **per run** via the span timeline (PF0+PF7).
- [ ] Every bottleneck has a **named owning layer** (covered by the rung table above).
- [ ] Each change is **tagged**: safe projection tweak vs authority/storage migration.
- [ ] Slow paths are **classified**: architecture vs compute/network.
- [ ] **Baselines were captured before** every optimization PR (PF0 gates the rest).

## What NOT to optimize (audit §I — out of scope for this ladder)

Until the relevant PF0 baseline exists, do **not**:

- Tune SQLite pragmas (WAL + NORMAL already set) or re-do the 16ms PTY batch (already done).
- Add React memoization, a new state library (Redux/Zustand), or WebSockets for local events.
- Stand up SaaS distributed tracing before the local JSONL spans exist.
- Store artifacts/logs in Kernel state or State Cards.
- Parallelize the Conductor approval gate without operator authorization.
- Optimize Eve before the local/mock path is measured.

### Parked (real, but not in this ladder)

- **Per-tile webview pooling / lazy-mount** (audit risk table: webview-per-tile memory) —
  marked "No (product)": it changes product behavior (a tile may not be live until focused).
  Revisit as its own product decision after PF1–PF6 land, not as a silent perf tweak.

---

## Sequencing & relationship to the Surface ladder (open operator decision)

The Performance and Surface ladders **touch the same files** (`renderer.js`, the projection
path, the event subscriber). The audit's recommendation, promoted here:

> **Land PF0 + PF1 before Surface S2 (Live Run Projection).** S2 *adds* projection surfaces
> (run region, agent tiles, artifact dock); building them on today's snapshot-polling
> foundation bakes the #1 bottleneck into new code. Instrument and fix the projection path
> first, then project new surfaces onto the clean path.

**This is the one decision to confirm before promoting PF0:** interleave the two ladders
(PF0 → PF1 → resume S2…), or finish one ladder before the other. The recommended default is
**interleave** — PF0+PF1 first, then continue the Surface rungs on the cleaned path.
