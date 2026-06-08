# QuantFlow v2 — active scope

**Branch:** `quantflow-v2`  
**Read first:** `CONCEPT.md`  
**Execute:** `BUILD_PLAN_V2.md` only

## Spine status

| # | Gate / slice | Status |
|---|----------------|--------|
| 1 | Socket ping → pong | **DONE** `f72c0b4` |
| 2 | Spawn + interactive PTY | **DONE** `035f4f5` + `15b7852` |
| — | retirement-v1-relay | **DONE** `6961506` |
| — | unify-spawn-pipeline | **DONE** `de9c497` |
| 3 | `events.subscribe` tile state | **ACTIVE** |
| — | retirement-herdr-cli | Next after Gate 3 |
| — | envoy-obsidian | After herdr-cli retirement |

## Comms decision (settled)

- **A2A:** rejected for local QuantFlow. Do not implement Agent Cards or A2A task delegation.
- **Envoy:** proof and coordination bus — one canvas-scoped space, watchers post, main owns credentials.
- **Obsidian vault:** durable memory and operator context; integrate with Envoy evidence and existing vault-relative context pins.
- **MCP :9811:** keep as agent ↔ canvas tools (already works).

## Frozen until Gate 3 passes

Full legend palette cleanup, RL template restructure, Watchtower evolution, Factory Droid, tennis vision, RL infra.

## Out of scope for agents

- `Build Docs/QuantFlow v2 1/` layer charters (reference only; may delete)
- Vault `Projects/QuantFlow/Build Plan.md` (v1)
- A2A protocol, string relay cluster, `reference/archive/`

## Handoff block

```
Branch quantflow-v2. Read CONCEPT.md + SCOPE.md + BUILD_PLAN_V2.md + RETIREMENT.md.
Spine done through unify-spawn (de9c497). Active: Gate 3 only.
No A2A. Next comms slice: envoy-obsidian after retirement-herdr-cli.
pane.read display = reject. Commit before handoff. One executor at a time.
```
