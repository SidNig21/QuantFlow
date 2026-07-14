# P0 REPORT — 2026-07-02
Orchestrator/Verifier: Fable (Cursor) · Builders: Composer sub-agents · Branch: quantflow-v5-fabled
HEAD at start: d282c36 · HEAD at end: 9cc988d

## Summary
All Windows-red tests fixed honestly in six chunks; the Electron suite and the repo-root sweep are fully green.
The "suspicious two" were both REAL drift (stale README test; envoy mirror's better-sqlite3 dependency breaking bun's test path) — fixed with a test update and a minimal injectable seam.
Verifier should look first at P0.3 (the only chunk touching production code: the row-source seam in `obsidian-envoy-mirror.ts`).

## Chunks

### P0.1 — platform-correct path expectations (bucket: path-separator test bugs)
- STATUS: Implemented-verified (command below re-run by Fable)
- Commit: 72898ee — `qa(P0.1): platform-correct path expectations in context-service and files tests`
- Layer: QA
- Proof command: `cd quantflow-electron && bun test src/main/context-service.test.ts src/main/files.test.ts`
- Proof output (last lines):
  ```
   33 pass
   0 fail
   77 expect() calls
  Ran 33 tests across 2 files. [676.00ms]
  ```
- Files touched: `quantflow-electron/src/main/context-service.test.ts`, `quantflow-electron/src/main/files.test.ts`
- Deviations from spec: none. Expectations now built with `node:path` `join`/`resolve` (assertions not weakened); the `ls`-dependent atomicWriteFileSync check replaced with cross-platform `readdirSync` instead of a skip — it now runs everywhere.
- Findings: none.

### P0.2 — POSIX-only skip: tmux backend-default (bucket: POSIX-only)
- STATUS: Implemented-verified
- Commit: 5c09210 — `qa(P0.2): skip POSIX-only tmux backend-default test on native Windows`
- Layer: QA
- Proof command: `cd quantflow-electron && bun test src/main/tmux.test.ts`
- Proof output: `12 pass · 9 skip · 0 fail` (the skip is named with a reason comment: native Windows has no tmux binary; the tmux fall-through path is POSIX-only)
- Files touched: `quantflow-electron/src/main/tmux.test.ts`
- Deviations from spec: none. Truthful skip, test body unchanged.
- Findings: `tmux helpers > getTmuxConf` (listed in the NIGHT1 12) now passes when run from `quantflow-electron/` — its failure was cwd-dependent, handled in P0.5.

### P0.3 — the suspicious two: BOTH were real drift
- STATUS: Implemented-verified
- Commit: 8226d36 — `qa(P0.3): repair README identity drift + envoy mirror row-source seam for bun tests`
- Layer: QA + harness (one minimal production seam)
- Proof command: `cd quantflow-electron && bun test src/main/package-identity.test.ts src/main/obsidian-envoy-mirror.test.ts`
- Proof output: `6 pass · 0 fail`
- Files touched: `package-identity.test.ts`, `obsidian-envoy-mirror.ts`, `obsidian-envoy-mirror.test.ts`
- Investigation results (per mission §4 P0 "investigate before touching"):
  - **README identity**: TEST drift, not product drift. Commit `fdcf779` ("docs: README single hero screenshot") deliberately replaced `![QuantFlow](screenshot.png)` with `assets/readme/canvas-hero.png` and `` `~/.quantflow/` `` with `%USERPROFILE%\.quantflow\vault-config.json`; the test kept asserting the old strings. Test updated to assert the current deliberate identity; anti-Collaborator negative assertions preserved.
  - **Envoy mirror**: PRODUCTION-PATH drift. Commit `3d8b975` made the mirror call `listEnvoyTasks`/`listEnvoyReceipts` (runtime-state repo → `better-sqlite3`). Bun 1.3.12 on this host cannot load better-sqlite3, so `poll()` threw inside its catch-all and silently wrote nothing. The Electron/Node production path is unaffected. Fix: injectable `envoyRowSource` seam (default = real repo functions, reset in `_resetObsidianMirrorsForTesting`), mirroring the file's existing `setEnvoyCliRunnerForTesting` convention. Zero production behavior change.
- Deviations from spec: none.
- Findings: the mirror's silent catch-all (`// Mirror is best-effort`) masked this drift for months — candidate for a Watchtower diagnostic later (logged, not actioned; structure-freeze).

### P0.4 — electron mock leak (4 "Unhandled error between tests")
- STATUS: Implemented-verified
- Commit: ab0a136 — `qa(P0.4): electron mock factories expose default export to stop cross-file mock leak`
- Layer: QA
- Proof command: `cd quantflow-electron && bun test src/main/integrations.test.ts src/main/credentials/credential-accessor.test.ts`
- Proof output: `15 pass · 0 fail`
- Files touched: `integrations.test.ts`, `updater/update-manager.test.ts`
- Root cause: bun's `mock.module("electron", ...)` leaks across test files in the same process; the mock factories lacked a `default` export while `credential-accessor.ts` uses `import electron from "electron"`. Four downstream test files (legend-recipes, credential-accessor, capability-probes, preflight) crashed at import. Fix: factories return `{ ...electronMock, default: electronMock }`.
- Findings: fixing this UNMASKED 16 tests that were previously crashing before they could run (suite went 995 → 1011 tests). All pass.

### P0.5 — cwd-dependent getTmuxConf test (repo-root sweep failure)
- STATUS: Implemented-verified
- Commit: 3c2b47f — `qa(P0.5): pin cwd to package root in getTmuxConf test for repo-root sweeps`
- Layer: QA
- Proof command: `bun test quantflow-electron/src/main/tmux.test.ts` from repo root AND from `quantflow-electron/`
- Proof output: `12 pass · 9 skip · 0 fail` in both directions
- Files touched: `quantflow-electron/src/main/tmux.test.ts`
- Root cause: `getTmuxConf()`'s dev fallback resolves `resources/tmux.conf` from `process.cwd()`; the file lives under `quantflow-electron/`, so the repo-root `bun test src` sweep failed. Test now pins cwd to the package root (try/finally restore).
- Deviations: none. No production change.

### P0.6 — cable-overlay deferred-timer leak (repo-root sweep flake)
- STATUS: Implemented-verified
- Commit: 9cc988d — `qa(P0.6): flush deferred popover timer in cable-overlay tests to stop cross-file leak`
- Layer: QA
- Proof command: `bun test src` from repo root
- Proof output: see exit gate below.
- Files touched: `quantflow-electron/src/windows/shell/src/cable-overlay.test.ts`
- Root cause: `cable-overlay.js` defers its popover dismiss listener via `setTimeout(0)`; under sweep load the timer fired after the file's DOM stub was replaced by a later file's bare stub → "document.addEventListener is not a function" → cascade ("Cannot call describe() after the test run has completed", 1 fail + 2 errors attributed to `canvas-rpc.test.ts`). Fix: `afterEach` flushes pending macrotasks while the file's own stub is live.
- Findings: this failure was ORDER/TIMING dependent — it did not reproduce in `quantflow-electron/`-scoped runs, only the 114-file repo-root sweep. This class of flake is exactly what the P1 qa runner's twice-consecutive policy exists to catch.

## Exit gate (per mission §4 P0) — GREEN
All re-run personally by Fable (never by the building sub-agent):

- `cd quantflow-electron && bun test` — run 1: `979 pass · 32 skip · 0 fail · Ran 1011 tests across 105 files` (exit 0)
- `cd quantflow-electron && bun test` — run 2 (consecutive): `979 pass · 32 skip · 0 fail` (exit 0)
- `bun test src` at repo root: `993 pass · 32 skip · 0 fail · Ran 1025 tests across 114 files` (exit 0)
- Diff audit: chunks P0.1/P0.2/P0.4/P0.5/P0.6 are test-only; P0.3 adds one injectable test seam with production default unchanged + the justified README-test drift repair. No production behavior change.

## Stopped early?
- No. No gate failed twice.

## For the verifier
- Re-run: the three exit-gate commands above; per-chunk proofs listed in each chunk.
- Diff hotspots: `obsidian-envoy-mirror.ts` (the only production file touched — verify the default row source is byte-equivalent behavior), `package-identity.test.ts` (confirm the README assertions match founder intent for the current README).
- Deferred findings: mirror's silent catch-all error swallowing (P0.3), unmasked-test count change 995→1011 (P0.4).
