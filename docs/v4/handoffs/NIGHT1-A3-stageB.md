# NIGHT 1 — A3 + Stage B (contract close + proof machinery)

> **Builder:** Codex · **Verifier:** Claude (morning) · **Decision authority:** founder
> **Branch:** `quantflow-v4` — commit locally per chunk, **do NOT push** (verifier pushes after audit)
> **Mission:** close G-contract (A3) and G-measure (B1–B5). After tonight, "verified"
> means a command anyone can re-run — this night builds that machinery.

---

## 0. Read order (before any edit — no exceptions)

1. `START_HERE.md` (the rules; §8 hard rules bind every chunk below)
2. `REBUILD_QUEUE.md` §1–2 (the promotion model; tonight = A3, B1, B2, B3, B4, B5)
3. `docs/v4/handoffs/A3-rename-codemod.md` (full A3 spec — already authored)
4. `docs/v4/PERFORMANCE_LADDER.md` § PF0 only (B2/B3 spec + its Handoff Block) + `docs/v4/PERF_STACK_AUDIT.md` §E (span shape/anchors) + §F (benchmarks)
5. `docs/v4/GLOSSARY.md` § RENAME MAP (A3 authority)
6. The `AGENTS.md` of any module you touch

Do **NOT** read R0–R8.5 bodies, S-rung bodies, or v2/v3 execution docs.

## 1. Night rules (stop conditions — these end the night, not your judgment)

1. **One chunk = one commit**, message format: `<layer>(<chunk>): <objective>` (e.g. `authority(A3): one-word-per-concept rename codemod`).
2. **Execute chunks strictly in order.** A chunk's exit gate must pass before the next chunk starts.
3. **A gate that fails twice = STOP.** Record the failure in the report (§9), leave the working tree clean (commit what passed, stash/revert what didn't), end the night. Do not improvise past a red gate.
4. **No new truth stores. No schema migrations. No Kernel signature changes** (contract is frozen per A2). Nothing tonight needs any of these — needing one means the chunk is off the rails.
5. **Do not touch:** Stage D files (`quantflow-electron/src/main/runtime-state/**`, `orchestration-service.ts`, `ipc-orchestration.ts`), any GLOSSARY KEEP row, `tile-interactions.js` geometry, `canvas-state.js` semantics.
6. **Never self-mark `Implemented-verified`.** Tonight's ceiling is `Implemented-unverified`; the verifier and founder upgrade it.
7. Untracked `Rebuild Prompt.md` at repo root is the operator's file — do not commit or delete it. Shell files may show phantom `M` with empty diffs (CRLF artifact) — ignore them; do not commit line-ending-only changes.

---

## 2. Chunk A3 — one-word-per-concept rename codemod

Full spec: **`docs/v4/handoffs/A3-rename-codemod.md`** — execute it as written.
Summary: apply exactly the A3 rows of the GLOSSARY RENAME MAP (RUN / HARNESS / PAUSE),
skip every Stage D and KEEP row. A2 signature rows are already landed (verified 2026-07-02).

- **Layer:** authority + projection
- **Proof:** `bun test src` green + `cd quantflow-electron && bun test` green + the three zero-hit greps in the spec
- **Exit gate:** both suites green, greps zero-hit, one commit. Closes **G-contract**.

## 3. Chunk B1 — `qa/` runner skeleton

- **Layer:** QA
- **Objective:** a repo-root `qa/` harness where every gate is a named, re-runnable command. Today `qa/` holds screenshots/review docs — keep them (move to `qa/evidence/` if in the way).
- **Build:** `qa/run.ts` (bun): registry of named checks; `bun qa/run.ts --list` prints them; `bun qa/run.ts <name>` runs one and exits 0/1. Checks may shell out to existing smokes in `quantflow-electron/scripts/`. Seed with: `contract-nouns` (the A3 greps), `unit-kernel` (`bun test src`), `unit-shell` (`bun test` in quantflow-electron).
- **Must NOT:** touch app code. Pure additive tooling.
- **Proof command:** `bun qa/run.ts --list && bun qa/run.ts contract-nouns`
- **Exit gate:** list shows ≥3 checks; each seeded check runs green.
- **Rollback:** delete `qa/run.ts` (additive only).

## 4. Chunk B2 — PF0 spans behind `QUANTFLOW_TRACE=1`

Execute the **Handoff Block — PF0 (Codex)** in `docs/v4/PERFORMANCE_LADDER.md` verbatim.
Non-negotiables restated: wrappers only at the 7 anchor points; extend `launch-traces.ts` /
`herdr.bootstrap` / `events-repo`, never a second tracer; spans = ephemeral JSONL
(`~/.quantflow/perf/{date}.jsonl`, honor `QF_PERF_DIR` override), **never** a Kernel table;
no span per stdout line; flag off = pure no-op.

- **Layer:** authority (instrumentation-only; zero behavior change)
- **Flag-off proof (self-contained):** inside `smoke:perf-trace`, run the task atom with the flag **off** and capture normalized receipts, then run with the flag **on** — assert receipts identical and a span present at each of the 7 anchors. (Do not depend on B5's golden; B5 lands later tonight.)
- **Proof command:** `cd quantflow-electron && bun run smoke:perf-trace`, then the full PF0 Regression Guard block (all smokes + `bun run build` + MCP `node --test`)
- **Exit gate:** `smoke:perf-trace` green; flag-off no-op proven; full guard green.
- **Rollback:** delete the flag + wrappers (additive).

## 5. Chunk B3 — `qa/perf-baseline.json`

- **Layer:** QA
- **Objective:** the captured baseline every later rung must beat. **B1** cold start, **B3** 10-tile drag commit, **B4** event storm (100 `receipt.posted` in 10s — **must record the snapshot-refetch count**; PF1 later drives it to 0). Each p50/p95 over **5 trials** (per PERF_STACK_AUDIT §F).
- **Build:** capture script registered in the qa runner (`bun qa/run.ts perf-baseline` re-captures; `perf-baseline-present` asserts the file exists and is well-formed). Commit the captured `qa/perf-baseline.json`.
- **Proof command:** `bun qa/run.ts perf-baseline-present`
- **Exit gate:** file committed with B1/B3/B4 p50+p95 from 5 trials; refetch count present in B4.
- **Rollback:** delete file + check (additive).

## 6. Chunk B4 — freeze event taxonomy + span schema

- **Layer:** contract
- **Objective:** the frozen contracts PF1 and replay bind to, **referenced by code, not prose**.
- **Build:**
  1. `src/kernel/events/taxonomy.ts` — enumerate every `kind` string actually passed to `emitKernelEvent` across the codebase (grep all call sites) as a `const` array + `KernelEventKind` type; narrow `KernelEventPayload.kind` (src/kernel/events/index.ts:5) from `string` to it. Fix any call-site typos this surfaces (report them — do not silently rename kinds).
  2. `docs/v4/EVENT_TAXONOMY.md` — one row per kind: emitter site, meaning, projection consumer.
  3. `docs/v4/SPAN_SCHEMA.md` — the PF0 `Span` shape (§E fields) + the 7 anchor names, citing the actual type from B2's code.
  4. qa check `taxonomy-sync`: asserts the doc's kind list == the code's const array (parse the doc table or export a generator).
- **Must NOT:** rename existing event kinds (that's a contract change — freeze what exists).
- **Proof command:** `bun qa/run.ts taxonomy-sync && bun test src`
- **Exit gate:** typecheck/tests green (payload narrowed), doc == code, check green.
- **Rollback:** revert commit (type-narrowing only).

## 7. Chunk B5 — the golden run

- **Layer:** QA
- **Objective:** the regression anchor — receipts for one real run, captured as-is, committed. This freezes **today's working behavior**, not aspirational behavior.
- **Build:** `qa/golden/` with:
  1. `capture` (qa runner check `golden-capture`): drive the scripted **task atom** path against an injected fresh DB (`setKernelDbForTesting` exists for smokes) — worker spawn → task claimed → work → receipts → verification → complete. Collect the full receipt chain; **normalize volatile fields** (ids → stable placeholders, timestamps → `<T+ms>` offsets, absolute paths → repo-relative); write `qa/golden/task-atom.receipts.golden.jsonl`.
  2. `check` (qa runner check `golden`): re-run the same scripted atom, normalize identically, byte-diff against the committed golden. Green = identical.
- **Determinism note:** if two consecutive `golden-capture` runs differ, that nondeterminism is a *finding* — record exactly which fields flapped in the report; normalize them only if they are genuinely volatile metadata (time/id), STOP per §1.3 if receipt *order or content* flaps.
- **Proof command:** `bun qa/run.ts golden` (twice in a row, both green)
- **Exit gate:** golden committed; check green twice consecutively. Closes **G-measure** with B2/B3.
- **Rollback:** delete `qa/golden/` (additive).

---

## 8. End-of-night regression sweep (after the last chunk that lands)

```text
bun test src
cd quantflow-electron && bun test && bun run build
bun run smoke:task-atom && bun run smoke:checkpoint && bun run smoke:event-projection && bun run smoke:perf-trace
cd ../tools/quantflow-mcp && node --test
bun qa/run.ts --list   # every check listed, every seeded check green
```

All green → night complete. Anything red → fix only if it's your regression; otherwise STOP and report.

---

## 9. RETURN REPORT — fill this in as `docs/v4/handoffs/NIGHT1-REPORT.md`

```markdown
# NIGHT 1 REPORT — <date>
Builder: Codex · Branch: quantflow-v4 · HEAD at start: <sha> · HEAD at end: <sha>

## Summary
<3 lines max: what landed, what didn't, the one thing the verifier must look at first>

## Chunks
### <ID> — <objective>
- STATUS: Implemented-unverified | Blocked | Not-reached
- Commit: <sha> — <message>
- Layer: <authority | projection | visual | harness | QA | contract>
- Proof command: <exact command>
- Proof output (last ~10 lines):
  ```
  <paste>
  ```
- Files touched: <paths>
- Deviations from spec: none | <what + why — a deviation without a why is a defect>
- Findings: <typos surfaced by B4, nondeterminism found by B5, anything unexpected>
(repeat per chunk, in execution order)

## Stopped early?
- Chunk + gate that failed twice: <or "no">
- Failure output: <paste>
- Working-tree state left: <clean at commit <sha>>

## For the verifier (Claude)
- Re-run: <the exact commands that prove each chunk>
- Diff hotspots: <files where a mistake would be subtle>
- Ledger updates needed: REBUILD_QUEUE.md chunk STATUS rows <list>
```

**Rules for the report:** paste real output, never summaries of output; every STATUS
claim must name its command; findings are as valuable as code — write them down.

---

## 10. Morning protocol (for the record)

Verifier (Claude) independently re-runs every proof + audits diffs chunk-by-chunk +
drives the live app (operator smoke: spawn tile, drag, receipts) → verdict: merge/push,
fix-list, or rescope. Founder reads one verdict message. REBUILD_QUEUE STATUS rows are
updated by the verifier in the push commit, per chunk, per proof.
