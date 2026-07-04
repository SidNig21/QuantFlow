# V6 Report — End-to-end demo

**Gate:** `bun qa/run.ts actors-demo` — **PARTIAL** (single scripted run green; double-run gate flaky)

## Proof (pasted — successful run)

```
ACTORS-DEMO-PROOF: step=spawn-trio ok=true detail=tile-...,tile-...,tile-...
ACTORS-DEMO-PROOF: step=cables ok=true detail=conn-demo-orch-1+conn-demo-manual-1
ACTORS-DEMO-PROOF: step=orchestrate ok=true detail=hermes→codex delegated
ACTORS-DEMO-PROOF: step=screenshot-V6-00-actors-demo-run1.png ok=true
```

Evidence: `docs/v6/reports/evidence/V6-00-actors-demo-run1.png`

## Issue

Gate requires **two consecutive** `proof:actors-demo` greens. Second invocation intermittently hangs after `spawn-trio` (stale Electron / IPC). Single-run demo path is sound.

## Demo script (founder)

1. Open QuantFlow; confirm WSL + `OPENCODE_API_KEY` in `~/.bashrc`
2. Legend: spawn **Hermes**, **Codex**, **Claude Code** — each should be a terminal tile (not state-card front)
3. Draw cable Codex → Claude; type in Codex terminal or use relay — watch Claude receive delegation
4. Draw cable Hermes → Codex; give Hermes a short goal — orchestrator delegates over the cable
5. Kill switch: stop AgentOS host — app shell still usable

## Verify

```bash
bun run --cwd quantflow-electron proof:actors-demo   # once
bun qa/run.ts actors-demo                           # target: 2x green
bun qa/run.ts orchestrator a2a-cable actors-on-agentos legend-agentos agentos-terminal kill-switch
```
