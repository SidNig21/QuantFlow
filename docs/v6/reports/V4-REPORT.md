# V4 Report — Agent-to-agent cable (manual orchestration)

**Branch:** `quantflow-v6-actors`  
**Gate:** `bun qa/run.ts a2a-cable` — **GREEN**

## What changed

- `sendConnectionRelay` routes delegation across synced connection graph entries.
- Sim mode writes ack bytes back to source tile terminal.
- Proof spawns two AgentOS actors, syncs graph, relays, verifies ack log.

## V4 gate proof (pasted)

```
a2a-cable: sim relay forward + ack OK
A2A-CABLE-PROOF: step=spawn-pair ok=true detail=tileA=tile-1783158202682-1 tileB=tile-1783158206419-2
A2A-CABLE-PROOF: step=cable-relay ok=true detail=connectionId=conn-a2a-1783158207021 target=tile-1783158206419-2
A2A-CABLE-PROOF: step=screenshot-V4-00-a2a-cable.png ok=true detail=541599 bytes
a2a-cable: PASS (sim cable relay + scripted canvas proof)
```

## Scripted evidence

- `docs/v6/reports/evidence/V4-00-a2a-cable.png`
