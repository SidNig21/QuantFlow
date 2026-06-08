# QuantFlow — what it is

QuantFlow is **Collaborator’s canvas** with **herdr** running the WSL work underneath.

You see tiles and strings on a map. Each WSL tile is a **real terminal** backed by a **herdr pane**. Windows-only shells use node-pty without herdr.

That’s the product. Everything else is later plumbing.

## The one flow that must work

```
Legend click → herdr creates/owns pane → PTY shows that pane in xterm → you type and see live output
```

If a tile does not accept keyboard input like a normal terminal, **it is broken** — not “interim,” not “good enough for smoke tests.”

## Who owns what

| Piece | Job |
|-------|-----|
| Canvas (Collaborator fork) | Draw tiles, strings, pan/zoom. No process logic. |
| herdr | WSL sessions: panes, agents, state, Unix socket API. |
| node-pty | **Display glass** for WSL (herdr attach in PTY). **Windows shell fallback** only. |
| MCP :9811 | Tools for agents. Already exists. |
| Envoy | **Later.** Canvas-scoped proof bus; watchers post receipts. |
| Obsidian vault | Durable operator memory; context pins and handoff with Envoy evidence. |
| A2A | **Rejected** for local v2. Not building Agent Cards or HTTP agent delegation. |

## Hard rejects (agents: do not “helpfully” add these)

- `herdr pane read` polling as tile display (screenshot loop ≠ terminal)
- Direct `herdr-client.sock` → xterm (failed in slice 0a)
- Custom string relay (retired)
- A2A / Agent Cards
- Dumb tiles calling Envoy directly
- New architecture docs, layer charters, or GoalBuddy templates unless the operator asks

## Collaborator + herdr = hand in hand

These two tools are meant to fit together. QuantFlow is not inventing a new terminal stack — it is **wiring canvas spawn to herdr sessions** and **PTY attach for display**. When that feels hard, the bug is almost always in the wiring, not in the vision.
