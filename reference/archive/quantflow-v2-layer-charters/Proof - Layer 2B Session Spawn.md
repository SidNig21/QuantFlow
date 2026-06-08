# Proof - Layer 2B Session Spawn

Status: in progress. Code path and live herdr socket spawn smoke passed; manual clean-app Legend UI proof remains before 2B can be called complete.

Branch/base:
- Branch: `quantflow-v2`
- Base SHA at proof time: `ceb6fd1`
- Worktree: uncommitted 2B implementation changes present

Implemented proof surface:
- `src/main/herdr-socket-bridge.ts` provides typed newline-framed RPC beyond ping with timeout and error handling.
- `src/main/herdr-session-spawn.ts` creates deterministic Hermes herdr runtime identity.
- `src/main/ipc-herdr-spawn.ts` exposes main-process spawn through IPC.
- Renderer Legend/RPC Hermes spawn waits for herdr identity before creating the tile.
- Hermes herdr spawn runs the actual WSL command `hermes`; the old "Act as Hermes..." text is metadata, not typed terminal startup.
- The interim pane display fallback redraws only when pane output changes, avoiding visible constant polling.
- `herdr-bridge.ts` is not used by the new 2B spawn path and remains present.
- `herdrPaneId`, `herdrAgentName`, `herdrWorkspaceId`, and `herdrTerminalId` are carried through tile state and persistence.
- Installed herdr `0.5.5` does not expose `terminal attach`; display currently uses the documented interim `herdr pane read` refresh fallback.

Live socket smoke:

```bash
cd quantflow-electron
bun run smoke:herdr-spawn
```

Passed outside the sandbox because the default sandbox cannot see the WSL Unix socket:

```json
{
  "ok": true,
  "token": "qf_2b_smoke_1780711234195",
  "herdrAgentName": "qf.quantflow-v2-smoke.hermes.smoke-1780711234196",
  "herdrWorkspaceId": "w6538c248ffce810",
  "herdrPaneId": "w6538c248ffce810-2",
  "herdrTerminalId": "w6538c248ffce810-2",
  "terminalTarget": "herdr-wsl:w6538c248ffce810-2"
}
```

Focused verification:

```bash
cd quantflow-electron
bun test src/main/canvas-persistence.test.ts src/main/herdr-socket-bridge.test.ts src/main/herdr-session-spawn.test.ts src/main/ipc-herdr-spawn.test.ts src/main/pty-spawn-params.test.ts src/main/role-service.test.ts src/windows/shell/src/canvas-rpc.test.ts src/windows/shell/src/legend-spawn.test.ts src/windows/shell/src/role-herdr-spawn.test.ts src/windows/terminal-tile/src/session-start.test.ts
git diff --check
```

Result:
- `93 pass`
- `0 fail`
- `git diff --check` passed

Build:
- Not run. Current verification policy says not to run `bun run build` during routine slice work unless explicitly requested or a full artifact is required.

Remaining manual UI proof before completing 2B:

```bash
cd quantflow-electron
bun run dev
```

From a clean app launch:
1. Click Hermes in the Legend.
2. Confirm exactly one canvas tile appears.
3. Confirm the tile appears only after herdr identity is returned.
4. Capture `herdrPaneId`, `herdrAgentName`, `herdrWorkspaceId`, and `herdrTerminalId`.
5. Verify the herdr workspace/pane exists through socket or herdr list.
6. Confirm xterm displays the herdr pane output through the current documented `pane.read` fallback.

Post-UI persisted identity proof:

```bash
cd quantflow-electron
bun run proof:herdr-ui
```

This reads the dev `canvas-state.json`, finds persisted Hermes herdr tile candidates, validates required identity fields, skips stale candidates, and calls `pane.get` through the herdr socket for the first saved `herdrPaneId` that is still live.

Known risk:
- Interactive live attach remains constrained by installed herdr `0.5.5`; this branch records `terminalTarget` as the interim pane-display target `herdr-wsl:<pane_id>`, while storing `herdrTerminalId` separately until a real `herdr terminal attach` API exists.
