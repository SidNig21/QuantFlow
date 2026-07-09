# V7.0 Founder Decisions — structure-freeze + sequencing

> **Status:** PENDING founder sign-off. Blocks CARD V7.0.1 until recorded.
> **Audit context:** ce-doc-review (2026-07-07) + thermo-nuclear review (r2). Sequencing below is **locked intent**, not ignored.

---

## Sequencing (locked — do not reorder)

1. **Record this file** — freeze ruling + gate-zero definition (this doc).
2. **Finish v6 gate zero** on `quantflow-v6-actors` — see §Gate zero below.
3. **Commit v6 handoff fixes** isolated from watchtower/virtual-list drift.
4. **Cut** `quantflow-v7-actor-native` from the green v6 commit.
5. **Hand Codex CARD V7.0.1 only** (taxonomy append — no emitters yet).
6. **CARD V7.0.2** — receipt-backed `replay()` contract (see §Replay substrate).
7. **V7.1.1** — TileActor (real work begins).

---

## Decision 1 — Structure-freeze (§2.5.1)

**Question:** Is structure-freeze lifted for v7-min, or does V7.0 fold in Stage D (one-truth collapse)?

**Recommended ruling (Cursor + ce-doc-review):**

> **Narrow lift for v7-min only.** On branch `quantflow-v7-actor-native`, v7 may extend the frozen `KERNEL_EVENT_KINDS` taxonomy (3 kinds) and add receipt-backed read-side replay helpers. This is **not** a new authority layer — same writer (`emitKernelEvent`), same durable proof (`receipts`).
>
> **Stage D (retire `canvas-state.js`, one-truth collapse) is NOT folded into V7.0.** It stays in `REBUILD_QUEUE.md` as parallel debt. v7 must **not deepen** canvas-state / renderer god-file debt (§2.5 FINISH bucket).
>
> **Founder:** [ ] APPROVE narrow lift  [ ] REQUIRE Stage D in v7-min  [ ] OTHER: ___

---

## Decision 2 — Replay substrate (V7.0.2)

**Question:** Where does `replay()` get durable history?

**Recommended ruling:**

> **Receipt-primary (Option A).** `emitKernelEvent` stays ephemeral fan-out. Durable cable/actor history comes from `postReceipt` + existing `workflow-replay.ts` patterns. Extend `src/main/conductor/workflow-replay.ts` or extract shared receipt-primary helpers — **do not** add a parallel event journal without an explicit freeze lift.
>
> **Contract:** `tile.ready`, `message.sent`, `message.replied` each **dual-write**: `emitKernelEvent` (live UI) + `postReceipt` (durable replay). V7.2 gate asserts pairing survives main-process restart via receipts, not in-memory fan-out.
>
> **Founder:** [ ] APPROVE receipt-primary  [ ] REQUIRE persisted event store  [ ] OTHER: ___

---

## Decision 3 — Gate zero (v6 prerequisite)

**Question:** What must be green before cutting `quantflow-v7-actor-native`?

**Recommended ruling:**

> **v6 V4 cable proof** — `bun qa/run.ts a2a-cable` green **plus** founder-visible demo: two `claude` (or agentos) tiles, cable drawn, A messages B, reply on screen. This matches `docs/v6/ACTORS_MISSION.md` §V4.
>
> v6 V5 orchestrator (`bun qa/run.ts orchestrator`) is **not** a v7-min blocker — Omnigent (V7.7) reuses that path in Phase 2.
>
> **Founder:** [ ] APPROVE V4-only gate  [ ] ALSO require V5 orchestrator  [ ] OTHER: ___

---

## Decision 4 — v7-min product delivery vs engineering proof

**Question:** After witnessed V7.2, what does "done" mean for daily use?

**Recommended ruling:**

> v7-min completion = **engineering proof with `QF_RIVET=1` during founder demo**, not default-ON merge. Default-OFF flags stay until a separate founder flip decision (§10 item 5). §1 vision items map to phases — v7-min delivers **§1 items 1+3 only** (reload-survival + replayable cables under flags).
>
> **Founder:** [ ] APPROVE  [ ] Flip QF_RIVET default-ON after V7.2 witness  [ ] OTHER: ___

---

## Decision 5 — Rivet dependency (V7.1)

**Question:** Is rivet.gg SDK required for v7-min TileActor?

**Recommended ruling (ce-doc-review P0):**

> **v7-min path: TileActor in-process first** — wrap `pty.ts` + `tile-relay-dispatcher.ts` + worker rows **without** blocking on rivet.gg package selection. Rivet pattern/hibernation (V7.3+) is acceleration, not v7-min gate. Repo today has `@rivet-dev/agentos-core` in `tools/agentos-host` only — not a TileActor runtime.
>
> **Founder:** [ ] APPROVE in-process TileActor for v7-min  [ ] REQUIRE Rivet SDK before V7.1  [ ] OTHER: ___

---

## Audit carry-forward (not blocking doc review)

These surfaced in thermo + ce-doc-review; tracked for V7.0.2+ cards:

- `operational-event-log.js` kind set drifts from `KERNEL_EVENT_KINDS` — sync in V7.0.1
- `message.sent`/`message.replied` need `ReceiptType` extension — V7.0.2/V7.2
- Windows-PTY re-attach on reload may be relaunch-not-reattach — split V7.1 acceptance by backend
- L2 prose still says "event log" / id-ts — align with §3.1 receipt-primary language

---

## Sign-off

| Decision | Founder choice | Date |
|----------|----------------|------|
| 1 Structure-freeze | PENDING | |
| 2 Replay substrate | PENDING | |
| 3 Gate zero | PENDING | |
| 4 v7-min delivery | PENDING | |
| 5 Rivet dependency | PENDING | |

When all rows are filled, CARD V7.0.1 may start.
