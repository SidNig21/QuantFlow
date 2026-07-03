# P4 Report — Stage E + F: one event path + fences

Branch: `quantflow-v5-fabled` · Phase gate: **GREEN** (storm 0-refetch + runtime-fence + kill-switch)

## Commits

| Commit | Chunk | Summary |
| --- | --- | --- |
| `070f9aa` | E1 | One event path — `docs/v5/EVENT_BUS_MAP.md` bus inventory, `one-event-path` qa + allowlist, non-canonical header contracts on parallel buses (events-repo, operational-event-log, herdr-status-service, ipc-runtime-state), herdr dock refresh folded into `kernel:event` (`worker.status_updated`), redundant `syncTileList()` removed |
| `77bbb84` | E2+E3 | PTY-canvas fence — `pty-canvas-fence.js` milestone handlers, cwd (OSC 7) writes coalesced 200ms, `pty:exit` tile close verified on `kernel.tile.remove` path, watchtower status edge-trigger extracted; `pty-flood` qa (B7): 5000 chunks → 0 syncTileList / 0 updateCables / 1 saveCanvas / 1 titleUpdate |
| `2227de2` | F1+F2 | Single `getCredential()` accessor (`src/vault/credentials.ts` + CJS core), all host-side secret reads routed (electron credential-accessor with safeStorage-then-env fallback, MCP relay token, release script), `docs/v5/SECRETS_BOUNDARY.md`; `secrets-accessor` + `runtime-fence` + `kill-switch` qa; Eve seam errors wrapped as `eve-harness unavailable` (graceful degradation, boot never blocked) |

## Stage E — one event path + PTY fence

- **Bus map** (`docs/v5/EVENT_BUS_MAP.md`): kernel fan-out (`emitKernelEvent` → `kernel:event` → `routeKernelEvent`) is the only CANONICAL projection path. runtime.db events-repo, status-repo, EnvoyListener packets, watchtower relay-log, renderer ring buffers are telemetry/audit — headers now say so; `one-event-path` qa enforces: no renderer projection reads from deprecated buses (allowlisted exceptions), `emitKernelEvent` sole fan-out of taxonomy kinds, runtime kinds disjoint from the 33 frozen taxonomy kinds.
- **PTY fence (PF2 rule)**: `pty:data` routes to the terminal surface only — audit found no per-chunk canvas leak in the shell renderer; the one real per-event leak (`pty-cwd-changed` applied per OSC 7 report) is now coalesced at 200ms. `pty:exit` is a legitimate milestone and closes tiles via `closeCanvasTile` → `kernel.tile.remove` (same Kernel path as user close). The Windows 16ms PTY batch was left untouched per spec.
- **Storm proofs**: receipt storm (100 `receipt.posted` → 0 full refetches) still green; new `pty-flood` (B7): 5000 mixed chunks incl. OSC-bearing → 0 projection churn, O(1) milestones, PF0 byte counters grew with 0 extra spans.

## Stage F — secrets + external-runtime fence

- **F1**: one typed accessor `getCredential(name)`; renderer reads no secrets (verified — preload reads flags only). Inventory + host-vs-VM rule in `docs/v5/SECRETS_BOUNDARY.md`. `secrets-accessor` qa: static scan bans direct secret env reads outside the accessor and secret-pattern literals in tracked source. F3 (SDK adapter contract) stays deferred per REBUILD_QUEUE.
- **F2**: `runtime-fence` qa — canonical mutators only fire inside `src/kernel/**`; harness/Eve/electron-main reach truth via dispatched kernel commands only (no violations found; allowlist covers qa fixtures/smoke scripts). `kill-switch` qa — golden atom + one-truth boot/save round-trip with `QF_EVE_BASE_URL=http://127.0.0.1:1` and no AgentOS host: no crash, no unhandled rejection, receipts identical. Fix required: Eve `postJson`/stream previously threw raw fetch errors; now wrapped as explicit `eve-harness unavailable: …` (boot was never blocked — harness is lazy).

## Gate verification (Fable re-ran, exits 0)

```
one-event-path 0 · pty-flood 0 (B7: chunks=5000 syncTileList=0 updateCables=0 saveCanvas=1 titleUpdates=1)
storm 0 · golden 0 · divergence 0 · secrets-accessor 0 · runtime-fence 0 · kill-switch 0
unit-kernel 0 · unit-shell 0 · smoke:perf-trace 0
quantflow-electron bun test: 1066 pass / 32 skip / 0 fail · bun run build: green
tools/quantflow-mcp node --test: 24 pass / 0 fail
```

## Named findings deferred

- E1-F: orchestration-service legacy runtime mirror writes (Stage D follow-up); dead `watchtowerRuntimeEvents` preload stub (G5 IPC cleanup); herdr badge-only direct path remains (allowlisted, non-projection).
- F: none — no fence violations required deferral.

## Risks

- Cwd/title updates now lag up to ~200ms after an OSC 7 report (accepted PF2 trade).
- Electron `getCredential` now falls back to env when safeStorage is missing/empty — intended unification, but a behavior addition to the preflight path (covered by updated unit tests).
