# P2 Report — Stage C thin seam extraction + PF1 router

**Branch:** `quantflow-v5-fabled` · **Phase:** P2 (Fabled mission) · **Status:** GATE GREEN

Chunks C1–C3 built by Composer sub-agents, verified and committed by the Lead.

## Commits

| Commit | Chunk | What |
| --- | --- | --- |
| `d0f9d02` | C1 | Carve `renderer-event-router.js` out of `renderer.js` — behavior-preserving, data-driven dispatch |
| `3a1cc6c` | C2 | PF1 incremental projection router — targeted refresh + 50ms debounce + `storm` qa check |
| `15517dc` | C3 | Carve `projection.js` — single Kernel read path with injected transport |

## C1 — event router seam

Kernel event handling moved to `renderer-event-router.js` (120 LOC at carve time): `KIND_DISPATCH` table (7 explicit kinds), refetch policy as data (mirrors `qa/lib/refetch-policy.ts`), watchtower gate. `renderer.js` injects DOM handlers; its subscription is one `routeKernelEvent` call. 21 router unit tests. Behavior-identical (verified: same trigger policy against renderer source, golden green).

## C2 — PF1 (the headline number)

**Receipt storm: 100 blanket snapshot refetches → 0.**

- Targeted, no snapshot/region_list query: `receipt.posted` (flipped state-card refresh only), `task.*` (state card), `worker.*` (state card + `syncTileList` dock refresh).
- Remaining full-refresh kinds (`tile.*`, `connection.*`, `workflow.*`, artifact/checkpoint/decision/eval/plan kinds) coalesce through a ~50ms trailing-edge debounce — 10 `tile.moved` in a burst → 1 refresh.
- Policy history preserved: `qa/lib/refetch-policy.ts` now carries the frozen baseline policy (`shouldTriggerSnapshotRefetchBaseline`, still used by the B4 baseline capture) alongside the PF1 policy.
- New `storm` qa check drives 100 synthetic `receipt.posted` through the real router: asserts 0 full refetches, 100 targeted handler calls, and the debounce coalesce.

## C3 — projection.js single read path

- `createProjectionReader({ sendQuery })`: `readRegionList`, `readCanvasSnapshot`, `readStateCard`, `readConductorContext`, `refreshWorkflowProjectionCache` (parallel read, failed read leaves last frame), cached regions/snapshot/semantic-type getters. Zero mutation calls (grep-proven).
- `renderer.js` now has **0 direct `sendQuery` call sites** — only the injected transport closure. The old `workflowRegions` and `connectionSemanticTypes` locals collapsed into the reader's cache. B2 perf span kept around the refresh orchestration.
- Deferred (documented, out of thin-carve scope): `tile-state-card.js` and `conductor-panel.js` own their reads inside other modules; wrappers exist in projection.js for when Stage G decomposition reaches them.

## Exit gate (Lead-run)

```
PASS contract-nouns / unit-kernel / unit-kernel-full / unit-shell
PASS perf-baseline-present / taxonomy-sync
PASS storm   (baseline 100 → PF1 0 full refetches; burst 10 → 1 debounced)
PASS golden (x2 consecutive — receipts byte-identical)
```

Plus per chunk: electron `bun test` green (1051 tests / 107 files by C3), `bun run build` green.

## Notes

- `renderer.js` LOC 3506 → 3512 net (thin carve extracts decision logic, not bulk — Stage G owns the <800 LOC goal). New modules: router 370 LOC (after PF1), projection 96 LOC.
- No canvas-state.js / tile-interactions.js / Stage D file touched.

## Next

P3 — Stage D truth collapse (D0–D5) behind `QF_ONE_TRUTH` flag. THE CENTERPIECE; phased demote-read before stop-write. Founder-reserved: flag default-ON.
