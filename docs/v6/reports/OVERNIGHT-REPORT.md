# Overnight Report — quantflow-v6-actors (V2→V6)

**Branch:** `quantflow-v6-actors`  
**WSL key:** `OPENCODE_API_KEY` appended to `~/.bashrc` (live proofs unblocked on next WSL login)

## Phase status

| Phase | Gate | Status |
|-------|------|--------|
| V0 | `bun qa/run.ts agentos-boot` | GREEN (prior session) |
| V1 | `bun qa/run.ts agentos-terminal` | GREEN (prior + regression tonight) |
| V2 | `bun qa/run.ts legend-agentos` | **GREEN** |
| V3 | `bun qa/run.ts actors-on-agentos` | **GREEN** |
| V4 | `bun qa/run.ts a2a-cable` | **GREEN** |
| V5 | `bun qa/run.ts orchestrator` | **GREEN** |
| V6 | `bun qa/run.ts actors-demo` | **PARTIAL** — one full demo green; 2× consecutive gate hung on 2nd Electron launch |

## Regression stack (tonight)

```
kill-switch          GREEN
agentos-boot         GREEN
agentos-terminal     GREEN
loop-proof           GREEN
agentos-atom         (run if needed: bun qa/run.ts agentos-atom)
```

## What landed

- **V2:** Legend `agentos` transport picker (+ software + instruction); dock refresh on recipe CRUD
- **V3:** Codex / Hermes / Claude default to AgentOS terminal actors; `legacyRuntimeTarget: herdr-wsl` kept
- **V4:** Cable A2A relay (`sendConnectionRelay`, `string:relay`, `relay.connectionSend`); sim ack + screenshots
- **V5:** `runHermesOrchestrator` over same relay channel
- **V6:** Demo proof script (spawn trio + cables + orchestrate); screenshot captured

## Evidence (sim)

| File | Phase |
|------|-------|
| `evidence/V2-00-legend-agentos.png` | V2 |
| `evidence/V3-00-actors-on-agentos.png` | V3 |
| `evidence/V4-00-a2a-cable.png` | V4 |
| `evidence/V5-00-orchestrator.png` | V5 |
| `evidence/V6-00-actors-demo-run1.png` | V6 |

## Founder re-verify commands

```bash
git checkout quantflow-v6-actors
bun qa/run.ts legend-agentos
bun qa/run.ts actors-on-agentos
bun qa/run.ts a2a-cable
bun qa/run.ts orchestrator
bun qa/run.ts actors-demo
bun qa/run.ts agentos-boot agentos-terminal agentos-atom loop-proof kill-switch
```

## Live proofs (batched — key now in WSL)

After opening a **new WSL shell** (or `source ~/.bashrc`):

1. Click **Codex / Hermes / Claude** — confirm AgentOS terminal (not card front)
2. Wire two actors with a cable; watch delegation in terminals
3. Optional: `bun qa/run.ts agentos-live` (non-blocking live slice)

## §0 vision check (plain language)

- **Terminal tiles:** YES — spawn path is terminal-first; proofs assert no auto-flip
- **Cables for A2A:** YES in sim — relay routes across Kernel connections to AgentOS sessions
- **Orchestrator:** YES minimally — Hermes delegates over the same relay; workers pre-spawned in proof (runtime recruit is thin)
- **State-card-first:** NOT introduced

## Tripwires

None fired. No Kernel schema/migration changes. No §6 founder decisions taken.

## Deferred / risks

1. **V6 double-run gate** — fix Electron cleanup between consecutive `proof:actors-demo` invocations
2. **Live model proofs** — scripted green without key; founder witnesses with WSL key
3. **V4/V5 founder feel** — sim screenshots captured; recommend 5-minute live canvas pass with two actors + one cable

## §6 (unchanged)

No merge, no herdr/Eve deletion, no `QF_ONE_TRUTH` flip, no paid models.
