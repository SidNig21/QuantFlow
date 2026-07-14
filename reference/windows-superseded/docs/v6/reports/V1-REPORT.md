# V1 Report — AgentOS actor as TERMINAL TILE

**Branch:** `quantflow-v6-actors`  
**Gate:** `bun qa/run.ts agentos-terminal` — **GREEN**  
**Form-factor checkpoint:** **STOP for founder** (scripted evidence below)  
**Live slice:** **Deferred-founder** (interactive typing to a live model waits on WSL `OPENCODE_API_KEY`)

## What changed

- Extended `AgentOsTransport` with terminal attach/read/write/resize (`openTerminal`, `writeTerminal`, `onTerminalData`, …).
- WSL host + sim transport implement the wire protocol.
- `agentos-terminal-bridge.ts` + `pty.ts` route `agentos:<tileId>` targets through the PTY seam (xterm webview).
- `spawnAgentOsTileAt` opens **terminal front** (no auto-flip); `agentosRun` still drives harness receipts/approval on the optional card back.
- `loop-proof` updated: completion checks kernel receipts, not DOM receipt rows (terminal-first).

## V1 gate proof (pasted)

```
agentos-terminal: sim bytes both ways + resize OK
agentos-terminal: spawn path is terminal-first (no auto-flip)
TERMINAL-PROOF: step=renderer-ready ok=true detail=settle=3000ms
TERMINAL-PROOF: step=spawn-click ok=true detail=recipe=agentos
TERMINAL-PROOF: step=terminal-tile ok=true detail=tileId=tile-1783154759263-1 front=terminal
TERMINAL-PROOF: step=screenshot-V1-00-terminal-spawn.png ok=true detail=545727 bytes
TERMINAL-PROOF: step=done ok=true detail=C:\Users\rybow\QuantFlow\docs\v6\reports\evidence
agentos-terminal: PASS (sim machinery; live typing deferred until OPENCODE_API_KEY in WSL)
```

## Scripted evidence (screenshots)

- `docs/v6/reports/evidence/V1-00-terminal-spawn.png` — AgentOS Worker tile with **terminal webview front** (not flipped to state card).

## Regression (green)

```
LOOP-PROOF: step=run-complete ok=true detail=status=idle receipts=16 rows=0
LOOP-PROOF: step=done ok=true
```

(`rows=0` expected — receipt timeline is on optional card back, not the terminal face.)

## Founder checkpoint

V1 form-factor gate is green in sim/scripted mode. **Waiting for founder go** before V2.

Live proof when key is set: click AgentOS Worker → terminal front → type to agent → see model response in xterm.
