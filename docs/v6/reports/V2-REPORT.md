# V2 Report — Legend transport picker (agentos)

**Gate:** `bun qa/run.ts legend-agentos` — **GREEN**

## Proof (pasted)

```
legend-agentos: createLegendRecipe agentos transport OK
legend-agentos: add-agent-form has agentos picker
legend-agentos: spawnLegendRecipeAt uses per-recipe agentos fields
legend-agentos: herdr/pty spawn path preserved
LEGEND-AGENTOS-PROOF: step=legend-create ok=true detail=recipe=proof-agentos-actor
LEGEND-AGENTOS-PROOF: step=legend-registry ok=true detail=inDock=false inList=true
LEGEND-AGENTOS-PROOF: step=spawn-click ok=true detail=recipe=proof-agentos-actor
LEGEND-AGENTOS-PROOF: step=terminal-tile ok=true detail=tileId=tile-...
LEGEND-AGENTOS-PROOF: step=screenshot-V2-00-legend-agentos.png ok=true
legend-agentos: PASS (sim; live dock spawn deferred until OPENCODE_API_KEY in WSL)
```

## Landed

- `runtimeTarget: agentos` + `agentosSoftware` + `agentosInstruction` on legend recipes / roles
- Add-agent form: agentos transport + software picker + instruction field
- `spawnLegendRecipeAt` uses per-recipe agentos fields (not hardcoded `agentos` id only)
- Legend registry IPC broadcasts `legend:registry-changed` for dock refresh
- Gate + proof: `qa/lib/legend-agentos.ts`, `proof:legend-agentos`

## Live proof (deferred)

Founder dock spawn with real model — requires `OPENCODE_API_KEY` in WSL (`~/.bashrc` set this run).

## Verify

```bash
bun qa/run.ts legend-agentos
bun qa/run.ts agentos-terminal agentos-boot kill-switch
```
