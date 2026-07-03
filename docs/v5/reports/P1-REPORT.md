# P1 Report — Stage B proof machinery (G-measure)

**Branch:** `quantflow-v5-fabled` · **Phase:** P1 (Fabled mission) · **Status:** GATE GREEN

Chunks B1–B5 built by Composer sub-agents, verified and committed by the Lead.

## Commits

| Commit | Chunk | What |
| --- | --- | --- |
| `bb85956` | B1 | `qa/run.ts` runner skeleton — named re-runnable checks (`contract-nouns`, `unit-kernel`, `unit-kernel-full`, `unit-shell`) |
| `26ccb92` | B2 | PF0 spans behind `QUANTFLOW_TRACE=1` — shared tracer `src/kernel/perf/trace.ts`, 7 anchor wrappers, `smoke:perf-trace` |
| `5d98b71` | B3 | `qa/perf-baseline.json` captured from real 5-trial runs + `perf-baseline` / `perf-baseline-present` checks |
| `6cebbe0` | B4 | Frozen event taxonomy (33 kinds) — `src/kernel/events/taxonomy.ts`, `docs/v4/EVENT_TAXONOMY.md`, `docs/v4/SPAN_SCHEMA.md`, `taxonomy-sync` check |
| `f8fe638` | B5 | Golden run — normalized task-atom receipt chain (`qa/golden/task-atom.receipts.golden.jsonl`, 8 receipts) + `golden` byte-diff check |
| `fb80f90` | fix | Envoy-listener flake fix (see Findings) |

## B2 — PF0 spans

- Tracer: `src/kernel/perf/trace.ts` (+ `perf/index.ts` barrel). Flag off = single env check, no fs, no span objects. JSONL at `{QF_PERF_DIR or ~/.quantflow/perf}/{date}.jsonl` + optional `latest-summary.md`. Ephemeral only — never a Kernel table.
- Anchors: `kernel.event.fanout`, `kernel.command`, `receipt.post`, `artifact.create` + `artifact.verify`, `ipc.invoke` (exported `wrapIpcInvokeHandler`, testable without Electron), `conductor.plan.started` + `conductor.context.query`, `harness.spawn.started` + PTY byte counters (aggregate — never a span per stdout line), `renderer.projection.refresh` (via flag-gated preload `recordPerfSpan` → `perf:recordSpan` IPC).
- Proof: `bun run smoke:perf-trace` — phase A (flag off) writes zero files, phase B receipts normalize identically to phase A and every anchor emits ≥1 span with `duration_ms`.
- Rework note: the builder initially committed an *invented* `qa/perf-baseline.json`; rejected, deleted, baseline deferred to B3 with real capture.

## B3 — measured baseline (this machine: i9-10900KF, bun 1.3.12, win32)

| Bench | Method (honest scope) | p50 | p95 |
| --- | --- | --- | --- |
| B1 | headless kernel+watcher bootstrap, fresh bun subprocess (excludes Electron window/renderer paint; `bun:sqlite` since better-sqlite3 can't load under Bun) | 95.3 ms | 118.0 ms |
| B3 | 10 sequential `kernel.tile.move` through real `dispatchKernelCommand`, in-memory DB | 0.83 ms | 1.27 ms |
| B4 | 100 receipts through real receipt command path; refetch counted per renderer trigger policy | 6.8 ms | 8.0 ms |

- **B4 snapshot-refetch count: 100/100/100/100/100** — the number PF1/P2 must drive to 0.
- Trigger policy extracted to `qa/lib/refetch-policy.ts` (verified against `renderer.js` ~3680–3699 by the Lead) so P2's storm check reuses the exact same counting.

## B4 — taxonomy freeze

33 event kinds frozen in `KERNEL_EVENT_KINDS`; `KernelEventPayload.kind` narrowed from `string` to the union. No typos surfaced, no dynamic-kind casts needed. `taxonomy-sync` asserts doc ↔ code ↔ call sites.

## B5 — golden run

8-receipt chain: `task_created → task_claimed → task_started → artifact_created → task_submitted → verification_started → verification_passed → task_completed`. Normalization: ids → first-seen placeholders, timestamps → chain-index offsets, temp paths → `<artifact-root>`, artifact sha256 → `<sha256>` (mock harness embeds a random worker UUID in the artifact body). Determinism double-capture: byte-identical; receipt order/content stable.

## Findings

1. **Envoy-listener flake (fixed, `fb80f90`).** `obsidian-envoy-mirror.test.ts` → `ensureEnvoyListener` spawned a real `envoy listen` child; its async stdout handlers hit `appendEvent` → better-sqlite3 (`ERR_DLOPEN_FAILED` under Bun) and restart backoff timers fired after the file finished, poisoning later files (~1 in 4 sweeps, "0 fail 1 error"). Fix: injectable listener factory seam (`setEnvoyListenerFactoryForTesting` + noop child) — same P0 seam pattern, no `mock.module`. Flake bar: 6/6 consecutive `unit-kernel-full` green.
2. **better-sqlite3 under Bun** remains the recurring Windows hazard (P0 finding confirmed twice more: B3 capture, flake root cause).

## Exit gate (Lead-run, this machine)

```
PASS contract-nouns / unit-kernel / unit-kernel-full / unit-shell
PASS perf-baseline-present / taxonomy-sync
PASS golden (x2 consecutive)
PASS smoke:perf-trace
```

Plus, at chunk time: full 17-smoke regression guard green, `bun run build` green, MCP `node --test` 24/24, electron `bun test` green.

## Next

P2 — Stage C seam extraction + PF1 router. Gate: golden identical + 0 refetch storm (baseline: 100).
