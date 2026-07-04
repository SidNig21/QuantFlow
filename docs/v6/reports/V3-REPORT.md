# V3 Report — Codex + Claude + Hermes on AgentOS

**Gate:** `bun qa/run.ts actors-on-agentos` — **GREEN**

## Proof (pasted)

```
actors-on-agentos: codex/hermes/claude legend recipes on agentos
actors-on-agentos: built-in roles repointed with legacy fallback
actors-on-agentos: renderer uses agentos tile spawn
actors-on-agentos: kill-switch green
ACTORS-ON-AGENTOS-PROOF: step=spawn-codex ok=true detail=tileId=... runtime=pending-agentos
ACTORS-ON-AGENTOS-PROOF: step=spawn-hermes ok=true detail=tileId=... runtime=pending-agentos
ACTORS-ON-AGENTOS-PROOF: step=spawn-claude ok=true detail=tileId=... runtime=pending-agentos
ACTORS-ON-AGENTOS-PROOF: step=all-actors ok=true detail=recipes=codex,hermes,claude
ACTORS-ON-AGENTOS-PROOF: step=screenshot-V3-00-actors-on-agentos.png ok=true
actors-on-agentos: PASS (sim; live model typing deferred until OPENCODE_API_KEY in WSL)
```

## Landed

- Built-in legend + role entries: `runtimeTarget: agentos` with `pi` / `claude-code`
- `legacyRuntimeTarget: herdr-wsl` preserved as fallback metadata (not deleted)
- Terminal-first spawn path unchanged

## Verify

```bash
bun qa/run.ts actors-on-agentos
bun qa/run.ts legend-agentos agentos-terminal kill-switch
```
