> This document is governed by the AgentOS Anchor Principle in
> `AGENTOS_RIVET_RUNTIME_FINDINGS.md`. If anything here conflicts with the Anchor Principle,
> the Anchor Principle wins.
>
> **Step 0 is mandatory:** audit every AgentOS import and verify whether the branch uses raw
> `@rivet-dev/agentos-core` or the RivetKit `agentOs()` wrapper. Do not implement past Step 0
> until the result is documented (record it under "Step 0 Import Audit Result" in the
> findings doc).

# P1d — Live-App Kernel Receipt Proof (Manual Checklist)

**Rule:** every item is **observed on your machine**, not assumed from the docs. Each has an
explicit *what you must see* (the receipt) and a pass/fail line. If you can't see it, it's
FAIL — "it compiled" and "a tile lit up" are not receipts.

**Purpose (from spec P1d):** run the real app path against a real tile/worker row, send a
prompt, and query Kernel receipts afterward — confirming `agent.reply` is recorded before
`turn.complete`, through the live app, not the harness.

**Environment note (carried from P0):** on Windows, `127.0.0.1:7430` may fail if localhost
mirroring doesn't expose the WSL listener. Host binds `0.0.0.0`; fall back to the WSL IP
(`wsl -e bash -lc "hostname -I | awk '{print $1}'"`). P0 used `http://172.22.214.38:7430`.

---

## Step 0 — Which AgentOS package is the host on? (do this before anything else)

This gates everything below. If the host is on the raw-VM package, "the session can't be
re-addressed" is *expected behavior*, not a bug — and P1e changes from "build session
persistence" to "switch packages."

- [ ] **0.1** Open `tools/agentos-host` and find how the VM is created.
- [ ] **0.2** Identify the import + entry point:
  - `AgentOs.create()` from `@rivet-dev/agentos-core` → **raw VM, NO persistence** → expect
    non-addressable sessions. Record as the likely root cause; P1e = migrate to `agentOS()`.
  - `agentOS()` from `@rivet-dev/agentos` → **actor-wrapped, persistence available** →
    re-addressability should work by key; if it doesn't, the bug is in *how* QF addresses it.

**Receipt:** paste the exact import line + factory call into the result block.
**PASS =** you can state definitively which package is in use.
**Do not proceed past a guess here.**

> If 0.2 shows `agentos-core`: stop, record the finding, and treat "move to `agentOS()`" as
> the P1e task. The rest of this checklist still runs, but re-addressability items (§4) are
> expected to FAIL until the package is switched.

---

## Step 1 — Real app path, real row (not the harness)

- [ ] **1.1** Launch QuantFlow the normal way (the actual Electron app, not a test script).
- [ ] **1.2** Cause a real tile/worker row to exist through the real UI/flow — the same row
      type a Dock Card would create. Record its `tileId` / `actorId` / worker row id.

**Receipt:** the real row's ids, and confirmation they came from the app path.
**PASS =** ids exist in the live app's Kernel/state, not fabricated by a harness.

---

## Step 2 — AgentOS session is created through the live app

- [ ] **2.1** The app (Electron main as client) starts/connects AgentOS and opens a session
      for that row.
- [ ] **2.2** Record the AgentOS `actor`/VM identity and the `sessionId`.

**Receipt:** live `sessionId` + the VM/actor id, tied to the row id from §1.
**PASS =** the session was opened by the app for the real row, matching P0/P1 id format
(e.g. `sessionId=…` as in P1a `a7e927f1-…`).

---

## Step 3 — Prompt sent, reply received, receipts in order

This is the core P1d assertion.

- [ ] **3.1** Send a deterministic probe through the live app path (e.g. *"Reply with
      exactly: agentos-p1d-live-ok"*).
- [ ] **3.2** Capture the reply text.
- [ ] **3.3** Query Kernel receipts for this row **after** the round trip.
- [ ] **3.4** Confirm ordering: `agent.reply` receipt is recorded **before**
      `turn.complete`. (Same invariant proven in P1b/P1c, now via the live app.)

**Receipt:** the reply text + the ordered receipt list, e.g.
`session.start → agent.reply:agentos-p1d-live-ok → transcript.summary → turn.complete`.
**PASS =** reply matches the probe exactly AND `agent.reply` precedes `turn.complete` in
Kernel truth.

---

## Step 4 — Can the SAME actor be addressed again? (the P1e decision)

This is what P1d exists to answer. Do **not** open a new tile — reach the *same* actor.

- [ ] **4.1** Using the durable handle (the actor **key** = `actorId`, per the findings —
      not a stashed session object), send a **second** prompt to the same actor.
- [ ] **4.2** Confirm one live actor answered both sends (not two actors, not a new VM each
      time). Check via Kernel receipts + AgentOS `listPersistedSessions()` for that key.

**Receipt:** two receipts for the same `actorId`, and evidence a single actor/VM served
both (same VM id, or session records enumerated under one key).
**PASS =** second send reaches the same actor by key.
**FAIL =** a new actor/VM was spawned, OR delivery only worked via a re-stashed live session
object → this is the signal that P1e work (or the package switch from §0) is needed.

---

## Step 5 — No silent fallback (negative test — easy to skip, don't)

The whole rework exists to kill quiet fallbacks. Prove one fails **loudly**.

- [ ] **5.1** Point the row's runtime target at a deliberately broken/wrong target.
- [ ] **5.2** Send a prompt.

**Receipt:** an explicit, surfaced error tied to the row.
**PASS =** it fails visibly (error state + receipt).
**FAIL =** it silently succeeds anyway → a hidden fallback to AgentOS is live (the
`legacyRuntimeTarget` / KD5 hazard). Record exactly where the fallback fired.

---

## Step 6 — Record the runtime ids and result (spec's First Proof Target closeout)

- [ ] **6.1** Fill the result block below with exact ids (mirrors the P0/P1 manual-result
      blocks so this slots into the spec).

```text
package in use:        <@rivet-dev/agentos | @rivet-dev/agentos-core>   (from Step 0)
app path:              <real Electron app | FAIL>
live row:              tileId=<…> actorId=<…> workerRow=<…>
live session:          sessionId=<…> vm/actor=<…>
probe #1:              "Reply with exactly: agentos-p1d-live-ok" -> text=<…>
kernel receipts:       session.start | agent.reply:<…> | transcript.summary | turn.complete
ordering check:        agent.reply BEFORE turn.complete = <PASS | FAIL>
re-address (same key): probe #2 -> served by <same vm=<…> | NEW vm = FAIL>
silent-fallback test:  broken target -> <loud error PASS | silent success FAIL>
```

---

## Decision gate — what P1d tells you to do next

- **Step 0 = `agentos-core`** → P1e is *migrate to `agentOS()`*, not build session storage.
  Re-run §4 after switching.
- **Step 0 = `agentOS()` AND §4 PASS** → re-addressability already works; **P1e may be
  done**. Persist the actor key on the Runtime Binding and move to P1f.
- **§4 FAIL despite `agentOS()`** → the bug is in *how QF addresses* the actor (wrong/unstable
  key, or holding a session object instead of the key). Fix the addressing; that's the real
  P1e.
- **§5 FAIL** → a silent fallback exists; that path must be found and removed before any
  cleanup step, per D7/KD5.

**Guiding line:** this checklist should make your proofs *faster*, never replace them. A
receipt on your hardware is the only thing that turns "the docs say so" into "the Dock
works."

---

## Eve Path A U4 — single proof tile

This is the first Eve-on-AgentOS dock proof after the Path A pivot. It must not promote
Eve into the real spawn rail yet.

- [ ] **U4.1** Create the isolated proof-only recipe `proof-eve-agentos` with
      `runtimeTarget="agentos"` and `agentosSoftware="eve"`.
- [ ] **U4.2** Spawn one tile from that recipe and confirm the tile attached to an
      AgentOS session with `software="eve"`.
- [ ] **U4.3** Prompt the tile with `Reply with exactly: eve-proof-ok`.
- [ ] **U4.4** Capture the reply text and screenshot evidence.
- [ ] **U4.5** Confirm `DOCK_SPAWN_ACTOR_IDS` is still empty; U7 promotion is still
      operator-owned.

**Receipt:** `bun qa/run.ts agentos-eve` logs `AGENTOS-EVE-PROOF` steps, reply text
containing `eve-proof-ok`, and `V7-00-agentos-eve-live.png`.
**PASS =** proof recipe spawn, Eve session attach, and live prompt round-trip all pass.
