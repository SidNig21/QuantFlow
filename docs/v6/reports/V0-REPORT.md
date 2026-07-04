# V0 Report — Fix AgentOS boot bugs

**Branch:** `quantflow-v6-actors`  
**Gate:** `bun qa/run.ts agentos-boot` — **GREEN**  
**Live slice:** **Deferred-founder** (no `OPENCODE_API_KEY` in WSL for hands-on one-click)

## Chunks

| Commit | Layer | Objective |
|--------|-------|-----------|
| `0fb3ce3` | projection | V0.0 — sync agentos into main-process legend registry (fresh-checkout gap; not WSL fix) |
| `2a63ed0` | harness | V0.1 — pre-warm AgentOS WSL host on app boot |
| (this phase) | harness | V0.2 — cold-WSL health budget 90s |
| (this phase) | harness | V0.3 — three distinct failure messages |
| (this phase) | qa | V0.4 — `agentos-boot` gate |

## V0 gate proof (pasted)

```
agentos-boot: cold-WSL health budget=90000ms (default 90000ms)
agentos-boot: three failure classes verified
  host: AgentOS unavailable: WSL host didn't start (agentos-host did not become healthy within 90000ms). Check WSL is running and try again.
  credential: AgentOS unavailable: no API key set. Set OPENCODE_API_KEY in your WSL environment (or OPENROUTER_API_KEY / ANTHROPIC_API_KEY).
  model: AgentOS unavailable: model error — prompt failed: CreditsError
agentos-boot: pre-warm fires on invoke (unit test PASS)
one-truth-boot: both-paths-parity confirmed
one-truth-save: ephemeral cache + export + downgrade confirmed
agentos-boot: kill-switch GREEN
agentos-boot: PASS (sim machinery; live one-click deferred until OPENCODE_API_KEY in WSL)
```

## Regression stack (green)

- `bun qa/run.ts kill-switch`
- `bun qa/run.ts agentos-atom`
- `bun qa/run.ts loop-proof`
- `bun qa/run.ts perf-baseline-present`

## Deviations

None. Live founder click proof waits on WSL `OPENCODE_API_KEY` per mission policy.

## Notes

- V0.0 justification corrected: registry sync closes P6 main/renderer split for **fresh checkout**; founder's demo failure was WSL host + error copy (V0.1–V0.3).
- Terminal-as-star is **V1**, not V0.
