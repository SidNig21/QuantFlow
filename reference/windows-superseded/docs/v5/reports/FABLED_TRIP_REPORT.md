# FABLED Trip Report — quantflow-v5-fabled

Mission: `docs/v5/FABLED_MISSION.md` · All seven phases **GREEN** · Written 2026-07-03.

Every gate below is a command that is green on this machine. Per-phase detail lives in `docs/v5/reports/P<N>-REPORT.md`.

## Per-phase status

| Phase | What shipped | Gate command(s) | Status | Commit(s) |
| --- | --- | --- | --- | --- |
| P0 | 12 Windows-red Electron tests fixed (path separators, POSIX skips, 2 real drift fixes) | `cd quantflow-electron; bun test` (×2 consecutive) | GREEN | `5bb67f5` |
| P1 | Stage B proof machinery — PF0 spans, `qa/perf-baseline.json`, frozen 33-kind event taxonomy, golden run | `bun qa/run.ts golden` (×2) · `taxonomy-sync` · `perf-baseline` · `cd quantflow-electron; bun run smoke:perf-trace` | GREEN | `78f7620` |
| P2 | Stage C — `renderer-event-router.js` + `projection.js` seams, PF1 incremental router | `bun qa/run.ts storm` (100 receipt.posted → **0** snapshot refetches) · `golden` | GREEN | `10c94bc` |
| P3 | Stage D — one-truth collapse behind `QF_ONE_TRUTH` (tile_extensions, Kernel boot, JSON demoted to export) | `bun qa/run.ts divergence` · `one-truth-boot` · `one-truth-save` · `golden` (flag OFF) | GREEN | `c476105` |
| P4 | Stage E+F — one event path, PTY fence (200ms cwd coalescing), `getCredential()` accessor, runtime fence, kill switch | `bun qa/run.ts one-event-path` · `pty-flood` · `secrets-accessor` · `runtime-fence` · `kill-switch` | GREEN | `070f9aa` `77bbb84` `2227de2` |
| P5 | AgentOS harness-of-record — adapter + translator + approval bridge; WSL host sidecar + HTTP/SSE transport; live model run | `bun qa/run.ts agentos-atom` (blocking) · `agentos-live` (non-blocking; **PASS** live on OpenCode Zen `big-pickle`) | GREEN + LIVE | `c02caf4` `8118a10` |
| P6 | The visible loop — legend spawn → live state card → canvas approval → receipt timeline; scripted proof + screenshots | `bun qa/run.ts loop-proof` (×2 consecutive) | GREEN | `4e43802` `895a823` `fb24941` |

Full sweep: all 22 blocking checks in `bun qa/run.ts --list` exit 0. Electron suite: 1041 pass / 32 skip / 0 fail on native Windows.

## Screenshots (committed evidence)

- `docs/v5/reports/evidence/01-blocked-approval.png` — AgentOS worker tile, state card `blocked`, blocker "AgentOS approval: write tier2 result file", Approve/Deny buttons.
- `docs/v5/reports/evidence/02-approved-timeline.png` — after canvas Approve: receipt timeline on the card back.

## DEFERRED TO FOUNDER (mission §6 — untouched, waiting on you)

1. **The D-flag decision (THE one):** `QF_ONE_TRUTH` stays default-OFF. Flipping it default-ON in the live app + the witnessed divergence product proof is constitutionally yours (`START_HERE.md` §7). Machine proof is done: `bun qa/run.ts divergence` green with the flag ON, golden preserved with it OFF, both boot paths proven.
2. **Eve retirement:** the Eve harness lane is fenced (P4) but not deleted; retirement is your call now that AgentOS is proven.
3. **Merging** `quantflow-v5-fabled` → `quantflow-v4`/`main`.
4. **Spend:** paid OpenCode Zen models are blocked by workspace balance (`CreditsError`); live runs use free `big-pickle`. Add credits or set `AGENTOS_MODEL` to change.
5. **Stage G/H** (bulk decomposition, token spine, QA closeout) — not started.
6. **The witnessed run** — the 10-minute script below.

## The 10-minute founder demo script

Prereqs: Windows, repo at `C:\Users\rybow\QuantFlow` on `quantflow-v5-fabled`, WSL up. For the live-model leg set `OPENCODE_API_KEY` in the environment.

1. **(1 min) The gates are real.** In PowerShell at the repo root: `bun qa/run.ts --list` then `bun qa/run.ts golden; bun qa/run.ts storm; bun qa/run.ts kill-switch` — three greens: replay identical, 100-receipt storm with 0 refetches, app healthy with Eve AND AgentOS unreachable.
2. **(2 min) The scripted loop, end to end.** `bun qa/run.ts loop-proof` — watch the LOOP-PROOF lines: spawn → blocked on approval → approve → timeline. Open the two PNGs it refreshes in `docs/v5/reports/evidence/`.
3. **(4 min) Drive it yourself.** `cd quantflow-electron; bun run dev`. On the canvas: click the **AgentOS Worker** entry in the legend dock (clock-face icon). A tile spawns already flipped to its state card. With `OPENCODE_API_KEY` set, the WSL sidecar boots and a real model (OpenCode Zen `big-pickle`) runs the default instruction; when it requests permission the card flips to **blocked** with Approve/Deny. Click **Approve** — the card unblocks, the receipt timeline fills in, `human_decision` lands in the chain.
4. **(2 min) The truth is in the Kernel.** Flip any tile: state card + receipt timeline are pure Kernel reads (`kernel.state_card.get`, `kernel.receipt.list`). Kill the WSL host mid-session if you like — errors read `agentos unavailable: …` and the app keeps running.
5. **(1 min) The decision.** `docs/v5/reports/P3-REPORT.md` — the one-truth flag is ready and reversible. Your call to flip it.

## Risks / honest notes

- OpenCode Zen credential: the workspace has no paid credits; the `opencode` AgentOS software cannot route Zen at pinned v0.2.x (Anthropic-hardcoded catalog), so live runs use `pi` + a custom `zen` provider (details: `tools/agentos-host/AGENTS.md`).
- AgentOS is pre-1.0; all its API shapes are pinned and fenced behind `AgentOsTransport`.
- Approval milestones can appear twice on the timeline in live runs (gate + translator both post) — cosmetic, noted in P6-REPORT.
- The scripted proof uses the sim transport for determinism; the live path is proven separately by `agentos-live` (PASS on this machine).
