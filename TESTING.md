# QuantFlow Agent QA Guide

How any agent (Cursor, Claude Code, Codex, etc.) drives and tests QuantFlow like an operator.

Two surfaces, used together:

| Surface | Tool | Use for |
| --- | --- | --- |
| UI (clicks, modals, visual) | `agent-browser` via CDP | Driving the canvas like a human: Run Workflow, legend spawn, cables, screenshots |
| State (truth, assertions) | QuantFlow MCP / relay `127.0.0.1:9811` | Verifying results: Envoy tasks, receipts, tile list, terminal contents |

Never treat terminal echo or a screenshot alone as proof of task success — verify through Envoy (`qf_task_list`, `qf_receipt_list`) or the vault mirror `Projects/QuantFlow/Envoy/`.

## Setup (operator, once per session)

Start QuantFlow with the CDP debug port enabled:

```powershell
cd C:\Users\rybow\QuantFlow\quantflow-electron
$env:QUANTFLOW_DEBUG_PORT="9222"; bun run dev
```

The port is **off by default** and binds to `127.0.0.1` only. Without `QUANTFLOW_DEBUG_PORT`, nothing is exposed.

`agent-browser` is installed globally (`npm install -g agent-browser`). Verify: `agent-browser --version`.

## Agent UI workflow

```powershell
agent-browser connect 9222          # attach to the running app
agent-browser tab                   # list targets — t1 is the shell window (canvas);
                                    # each terminal tile is its own target
agent-browser tab t1                # select the canvas
agent-browser snapshot -i -c        # interactive elements with @eN refs
agent-browser click @e62            # interact by ref (re-snapshot after changes —
                                    # refs are per-snapshot, numbers vary by session)
agent-browser fill @e7 "some text"
agent-browser press Enter
agent-browser wait --text "Envoy task created"
agent-browser screenshot --annotate proof.png   # numbered labels match refs
agent-browser console               # renderer console errors
agent-browser close                 # detach when done (app keeps running)
```

Key facts learned from live runs:

- The shell window is the target titled `QuantFlow` (`/shell/index.html`).
- The **Run Workflow** button is in the QF DOCK (bottom left of the legend rail).
- Terminal tiles render xterm inside iframes — read terminal *content* via the relay
  (`canvas.terminalRead` / `quantflow_tile_read`), not the DOM.
- Unlabeled `graphics-symbol` refs are canvas icons; use `screenshot --annotate` to map them visually.
- Tiles may be panned off-viewport; snapshot still lists them.

## State verification

- MCP server (Windows): `node C:\Users\rybow\QuantFlow\tools\quantflow-mcp\server.js`
  (already configured in repo `.mcp.json` as `quantflow`).
- Relay token: `%USERPROFILE%\.quantflow\relay-token` (TCP clients pass it as `params.token`).
- Quick health: `npm run smoke:relay` in `tools/quantflow-mcp` (add `-- --workflow` for a tile/cable smoke).
- Envoy bus regression: `bun run smoke:envoy-task` in `quantflow-electron`.
- Unit tests: `bun test` in `quantflow-electron`.
- Operator mirror: vault `Projects/QuantFlow/Envoy/` (`task-board.md`, `history.md`).

## Standard QA prompt

Paste this to any agent:

```text
QA-test QuantFlow (branch quantflow-v4, active goal: see the promoted rung in docs/v4/).

App is running with CDP on 9222. Read TESTING.md first.

UI: agent-browser (connect 9222 → tab t1 → snapshot -i → click/fill by ref →
re-snapshot after changes). Screenshot --annotate for evidence.
State: QuantFlow MCP / relay 9811 (qf_task_list, qf_receipt_list, tile list,
terminal read). Terminal content via relay, never via DOM.

Scenario: <describe — e.g. "Run Workflow with prompt X; verify Hermes spawns,
claims the Envoy task, and the receipt chain appears in Envoy/Obsidian mirror">

Report: STATUS (PASS/PARTIAL/FAIL), steps taken, evidence (screenshots,
task/correlation ids, receipts), console errors, blockers.
Do not commit or push. Do not kill WSL or delete ~/.quantflow data.
```

## Known landmines

- WSL-hosted MCP → Windows relay: intermittent `ECONNREFUSED` / UNC cwd issues — prefer Windows-side MCP for testing.
- Codex TUI composer: text written via `terminal_write` may sit unsent; verify with a terminal read, then send Enter (`\r`).
- Worker tiles spawned via `role_spawn` get no workflow context (the delegation-phase-6 gap) — only Run Workflow wires Hermes activation.
- Canvas pacing is slow by design: Codex tiles can take 1–2+ minutes to boot. Wait before declaring failure.
