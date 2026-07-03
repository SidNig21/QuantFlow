# P3 Report — Stage D: collapse duplicate truth (behind `QF_ONE_TRUTH=1`)

**Branch:** `quantflow-v5-fabled` · **Phase:** P3 (Fabled mission, THE CENTERPIECE) · **Status:** GATE GREEN (machine gate)

Chunks D0–D5 built by Composer sub-agents, verified and committed by the Lead. Everything reversible: the flag is read only as `=== "1"`, defaults OFF everywhere. **Founder-reserved and NOT done here: flipping the flag default-ON in the live app + the witnessed product proof.**

## Commits

| Commit | Chunk | What |
| --- | --- | --- |
| `8eb8f34` | D0 | Tile-extension schema — migration 008 (`tile_extensions` + `canvas_settings`), `kernel.tile_extension.set/get` + `kernel.canvas.settings.set/get`, `docs/v5/TILE_EXTENSION_SCHEMA.md` |
| `625aa96` | D1 | Boot from Kernel behind flag + always-on save-path parity dual-write (`kernel.tile.layout_sync` added: geometry+title only, no events) + `one-truth-boot` qa |
| `e7e8745` | D2 | JSON demoted: flag-ON save writes Kernel + `canvas-ephemeral.json` only (canvas-state.json untouched → safe downgrade); `canvas:export-state` on-demand full export + `one-truth-save` qa |
| `ecfce33` | D3 | `canvas-state.js` → documented read-through cache; durable-mutation gaps routed through Kernel commands; `canvas-cache-discipline` qa lint + allowlist |
| `c27a8b0` | D4 | Connections Kernel-canonical under flag (zero runtime.db connection writes); runtime.db demoted to derived mirror (AGENTS.md contract) + `connection-round-trip` qa |
| `2ee1bb1`* | D5 | Divergence test — Kernel == projection == export across 8 mutation batches; receipts corroborate, not authority; last two D3 gaps closed (spawn-time extension write, workspace-rename Kernel write) |

*D5 commit hash assigned at commit time (this report and D5 land together).

## Field disposition (D0, canonical reference: `docs/v5/TILE_EXTENSION_SCHEMA.md`)

Geometry/z/display_name stay on `tiles`. Canvas fields (type, file/folder/url/workspace paths, terminal/runtime targets, titles, route handle, herdr agent/workspace ids) → `tile_extensions` typed columns + `extra_json`. Viewport → `canvas_settings` singleton. Runtime-ephemeral (`ptySessionId`, `herdrPaneId`, `herdrTerminalId`) deliberately NOT Kernel truth — they live in `canvas-ephemeral.json` until Stage E.

## The four truth stores, after Stage D (flag ON)

| Store | Before | After |
| --- | --- | --- |
| `kernel.db` | partial truth | **sole canonical truth** (tiles+extensions+connections+viewport) |
| in-memory `canvas-state.js` | parallel truth | read-through cache, mutation discipline enforced by qa lint |
| `canvas-state.json` | boot authority | untouched stale snapshot (downgrade safety) + ephemeral side-file + on-demand export |
| `runtime.db` | connection dual-write | derived, non-authoritative runtime mirror (connections: zero writes under flag) |

## D4 runtime-state inventory (for Stage E / follow-ups)

- (K) duplicates Kernel: `connections-repo` (collapsed in D4), `tasks-repo`, `runs-repo`, `artifacts-repo` (→ Stage E / PF3 follow-ups).
- (R) legitimate runtime ephemera: `schemas-repo`, `status-repo`, `pty-sessions-repo`, `tiles-runtime-repo`, `tile-capabilities-repo` (stay, documented derived).
- (E) audit log: `events-repo` (stays).
- (V) `envoy-repo`: **retirement finding** — R3c-b already routes task mutations through the Kernel bridge; remaining work is (1) envoy mirror writes become post-Kernel projection, (2) `obsidian-envoy-mirror` reads Kernel queries, (3) drop envoy tables. Deliberately NOT done inside D4 (not small/safe); queued as a follow-up.

## D5 divergence proof

8 mutation batches through real command paths (spawn×3 with extensions, layout/z/rename, connections×2, label update, viewport, workspace-rename, tile delete w/ cascade, connection delete), each asserting Kernel reads == flag-ON `loadState` assembly == `exportState` output after documented normalization. Receipts corroborate: lifecycle events captured and count-asserted; assembly code paths receipt-free (import-graph proof); ignoring receipts cannot change any representation.

## Incident log (Lead verification)

- D3's builder corrupted `renderer-event-router.js` during a whole-file rewrite (doubled CRLF blank lines). Lead restored the file and re-applied the intended one-entry delta (`connection.updated` dispatch). All later chunks carry a file-write-hygiene instruction; no other file affected (blank-ratio audit).

## Exit gate (Lead-run, flag OFF default; flag ON only inside test envs)

```
PASS contract-nouns / unit-kernel / unit-kernel-full / unit-shell
PASS perf-baseline-present / taxonomy-sync / storm
PASS golden (x2) — flag-OFF receipts byte-identical
PASS one-truth-boot / one-truth-save / connection-round-trip
PASS canvas-cache-discipline / divergence
electron bun test 1060/0 · bun run build green
```

## Next

P4 — Stage E (one event path, PTY out of projection, storm stays 0) + Stage F (getCredential accessor, external-runtime fence + kill switch).
