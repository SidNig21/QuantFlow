# V4 Report — Cable-drawn A2A delegation

**Gate:** `bun qa/run.ts a2a-cable` — **GREEN**

## Proof (pasted)

```
a2a-cable: sim relay forward + ack OK
A2A-CABLE-PROOF: step=spawn-pair ok=true detail=tileA=... tileB=...
A2A-CABLE-PROOF: step=cable-relay ok=true detail=connectionId=conn-a2a-...
A2A-CABLE-PROOF: step=screenshot-V4-00-a2a-cable.png ok=true
a2a-cable: PASS (sim cable relay + scripted canvas proof)
```

## Landed

- `agentos-a2a-relay.ts` — `sendConnectionRelay` validates Kernel connection graph, prompts target AgentOS tile
- Sim mode: auto-ack + relay log entry; prepares attach if missing
- `ipc-a2a-relay.ts` — `string:relay` IPC + `relay.connectionSend` JSON-RPC
- Connection delete closes relay channel via `closeConnectionRelayChannel`
- Evidence: `docs/v6/reports/evidence/V4-00-a2a-cable.png`

## Founder eyes (morning)

V4 **feels aligned with §0**: cable establishes a delegation channel; message routes to the target terminal actor. Sim proofs are green; **live two-actor delegation** needs WSL key + founder canvas session.

## Verify

```bash
bun qa/run.ts a2a-cable
bun qa/run.ts actors-on-agentos kill-switch
```
