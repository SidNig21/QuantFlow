# V2 Report — Legend transport picker (AgentOS)

**Branch:** `quantflow-v6-actors`  
**Gate:** `bun qa/run.ts legend-agentos` — **GREEN**

## What changed

- `createLegendRecipe` accepts `runtimeTarget: agentos`, `agentosSoftware`, `agentosInstruction`.
- Add-agent form exposes AgentOS transport + software picker.
- `spawnLegendRecipeAt` routes agentos recipes through `spawnAgentOsTileAt` with per-recipe fields.
- herdr/pty spawn path preserved for non-agentos recipes.

## V2 gate proof (pasted)

```
legend-agentos: createLegendRecipe agentos transport OK
legend-agentos: add-agent-form has agentos picker
legend-agentos: spawnLegendRecipeAt uses per-recipe agentos fields
legend-agentos: herdr/pty spawn path preserved
LEGEND-AGENTOS-PROOF: step=legend-create ok=true detail=recipe=proof-agentos-actor
LEGEND-AGENTOS-PROOF: step=legend-registry ok=true detail=inDock=false inList=true
LEGEND-AGENTOS-PROOF: step=spawn-click ok=true detail=recipe=proof-agentos-actor
LEGEND-AGENTOS-PROOF: step=terminal-tile ok=true detail=tileId=tile-1783157055670-1
LEGEND-AGENTOS-PROOF: step=screenshot-V2-00-legend-agentos.png ok=true detail=557190 bytes
legend-agentos: PASS (sim; live dock spawn deferred until OPENCODE_API_KEY in WSL)
```

## Scripted evidence

- `docs/v6/reports/evidence/V2-00-legend-agentos.png`

## Fix applied during proof hardening

- Removed invalid `options.instruction` reference in `spawnLegendRecipeAt` (ReferenceError blocked all agentos spawns).
