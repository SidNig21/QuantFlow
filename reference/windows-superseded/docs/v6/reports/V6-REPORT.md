# V6 Report — Full actors demo loop

**Branch:** `quantflow-v6-actors`  
**Gate:** `bun qa/run.ts actors-demo` — **GREEN** (twice consecutively)

## What changed

- End-to-end demo proof: spawn Hermes + Codex + Claude, manual codex→claude relay, Hermes orchestrator→codex delegation.
- Gate requires two consecutive green proof runs (`run-1`, `run-2`).

## V6 gate proof (pasted)

```
actors-demo: starting run-1
ACTORS-DEMO-PROOF: step=spawn-trio ok=true detail=tile-...,tile-...,tile-...
ACTORS-DEMO-PROOF: step=sync-graph ok=true detail=conn-demo-manual-1
ACTORS-DEMO-PROOF: step=cables ok=true detail=conn-demo-orch-1+conn-demo-manual-1
ACTORS-DEMO-PROOF: step=orchestrate ok=true detail=hermes→codex delegated
ACTORS-DEMO-PROOF: step=screenshot-V6-00-actors-demo-run1.png ok=true detail=564821 bytes
actors-demo: run-1 OK
actors-demo: starting run-2
ACTORS-DEMO-PROOF: step=screenshot-V6-00-actors-demo-run2.png ok=true detail=564387 bytes
actors-demo: run-2 OK
actors-demo: PASS (full stack green twice consecutively)
```

## Scripted evidence

- `docs/v6/reports/evidence/V6-00-actors-demo-run1.png`
- `docs/v6/reports/evidence/V6-00-actors-demo-run2.png`

## Regression (also green this session)

- `bun qa/run.ts agentos-terminal`
- `bun qa/run.ts legend-agentos`
- `bun qa/run.ts agentos-boot` (when run with regression stack)
