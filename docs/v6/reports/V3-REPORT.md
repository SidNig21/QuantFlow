# V3 Report — Codex / Hermes / Claude on AgentOS

**Branch:** `quantflow-v6-actors`  
**Gate:** `bun qa/run.ts actors-on-agentos` — **GREEN**

## What changed

- Built-in legend recipes `codex`, `hermes`, `claude` default to `runtimeTarget: agentos` with matching `agentosSoftware`.
- Built-in roles repointed with `legacyRuntimeTarget: herdr-wsl` fallback.
- Kill switch remains green (one-truth + Eve/AgentOS degradation probes).

## V3 gate proof (pasted)

```
actors-on-agentos: codex/hermes/claude legend recipes on agentos
actors-on-agentos: built-in roles repointed with legacy fallback
actors-on-agentos: renderer uses agentos tile spawn
actors-on-agentos: kill-switch green
ACTORS-ON-AGENTOS-PROOF: step=spawn-codex ok=true detail=tileId=... runtime=pending-agentos
ACTORS-ON-AGENTOS-PROOF: step=spawn-hermes ok=true detail=tileId=... runtime=pending-agentos
ACTORS-ON-AGENTOS-PROOF: step=spawn-claude ok=true detail=tileId=... runtime=pending-agentos
ACTORS-ON-AGENTOS-PROOF: step=all-actors ok=true detail=recipes=codex,hermes,claude
ACTORS-ON-AGENTOS-PROOF: step=screenshot-V3-00-actors-on-agentos.png ok=true detail=541800 bytes
actors-on-agentos: PASS (sim; live model typing deferred until OPENCODE_API_KEY in WSL)
```

## Scripted evidence

- `docs/v6/reports/evidence/V3-00-actors-on-agentos.png`
