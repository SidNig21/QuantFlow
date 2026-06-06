# QuantFlow v2 — active scope

**Branch:** `quantflow-v2`  
**Read first:** `CONCEPT.md`  
**Execute:** `BUILD_PLAN_V2.md` only

## Active (spine only)

Prove **Collaborator canvas + herdr** works like one product. Nothing below Layers 3–7 in `Build Docs/` until spine is done.

| # | Gate | Pass when |
|---|------|-----------|
| 1 | Socket | Main → herdr ping → pong (**DONE** `f72c0b4`) |
| 2 | Spawn + display | Legend Hermes → herdr pane → **interactive** xterm (type, see live output) |
| 3 | Live state | Tile badge from `events.subscribe`, not 5s polling |

## Frozen until gate 2 passes

A2A, Envoy bridge, full legend palette, Watchtower evolution, Factory Droid, tennis vision, RL infra, custom tile forms.

## Gate 2 acceptance (operator, non-negotiable)

1. Click Hermes in Legend → one tile appears with `herdrPaneId` persisted.
2. xterm behaves like Generic CLI: **keyboard works**, prompt responds.
3. herdr pane exists (socket `pane.get` or list matches tile).
4. **Fail** if display is pane.read refresh, non-interactive mirror, or hidden node-pty WSL session ownership.

## Out of scope for agents right now

- Reading or extending `Build Docs/QuantFlow v2 1/` layer charters (reference only; operator may delete later)
- Vault `Projects/QuantFlow/Build Plan.md` (v1 branch)
- `reference/archive/`

## Handoff block (paste to any agent)

```
Branch quantflow-v2. Read CONCEPT.md + SCOPE.md + BUILD_PLAN_V2.md.
QuantFlow = Collaborator canvas + herdr WSL sessions + PTY display.
Active: gate 2 only. Interactive terminal required. pane.read display = reject.
Commit before handoff. One executor at a time.
```
