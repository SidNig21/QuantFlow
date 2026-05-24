## QuantFlow Project Memory

QuantFlow is the active project in this repo. Treat `C:\Users\rybow\QuantFlow`
as the repo root and `quantflow-electron/` as the Electron app. The old
Collaborator codebase is the canvas platform lineage, but current naming,
paths, commits, and docs should say QuantFlow.

Current shipped state:
- Branch `QuantFlow` was verified for this cleanup at `c15d968`:
  `feat(goal-5.5a): smart string registry, adapters, and pipeline`.
- Unification phases 0-7 are done: QuantFlow identity, SQLite `runtime.db`,
  herdr bridge, MCP verification, cable UX, and the PTY decision.
- Phase 7.5, redesign, Goals 1-5, Goal 8, and Goal 5.5a are done.
- Next implementation target is the herdr/Envoy architecture refresh (vault
  Build Plan slices 0a→4): herdr attach spike, legend/templates, event-ping
  strings, canvas-scoped Envoy space, real Envoy bridge (Goal 5.5b).

Canonical planning docs live in the Obsidian vault:
- Start: `C:\Users\rybow\Obsidian\Cursor Collab\Projects\QuantFlow\Start Here.md`
- Execute: `C:\Users\rybow\Obsidian\Cursor Collab\Projects\QuantFlow\Build Plan.md`
- Architecture: `C:\Users\rybow\Obsidian\Cursor Collab\Projects\QuantFlow\How the pieces fit.md`
- Opus specs (when Build Plan requires): `Projects\QuantFlow\specs\opus\`
- Do not implement from `Projects\QuantFlow\reference\`

Architecture facts that must not drift (refresh 2026-05-24 — see vault Build Plan):
- herdr is WSL session authority: spawn, attach (`herdr-client.sock`),
  lifecycle/output subscriptions. Spike attach (slice 0a) before spawn rewire.
- node-pty sidecar is fallback for native Windows shell only — not the
  long-term backend for WSL agent/dumb worker tiles.
- herdr lifecycle: bootstrap on need; never teardown on QuantFlow quit.
- herdr has no MCP server. Use herdr socket/CLI or QuantFlow MCP tools.
- QuantFlow MCP is configured by `.mcp.json` and talks to the app relay on
  port `9811`. The app must be running for live tile tools.
- Canonical cable persistence uses `connections[]`, never top-level `cables[]`.
- Strings are visual topology plus event-driven pings (pattern/exit triggers),
  not stdout firehose. Manual cable popover chat is deprecated for orchestration.
- Envoy: one canvas-scoped space; shared memory, tasks, evidence, receipts.
- Dumb processes never call Envoy; QuantFlow registers proxies and watchers
  post on their behalf. Watchtower/Envoy proof must share `connection_id` and
  `correlation_id`.
- Legend/templates build canvas layout natively; Hermes orchestrates run after
  Commence — not boilerplate tile assembly via MCP.
- Template Commence is manual (locked): spawn layout → inspect → Commence →
  workers start and strings arm.

Recent MCP/runtime surfaces:
- `quantflow_route_task`
- `quantflow_tile_read`
- `quantflow_pty_write`
- `quantflow_pty_expect`
- Goal 5.5a smart string registry/adapters/pipeline.

Before substantial work:
1. Read this file, then read `Projects/QuantFlow/Build Plan.md` in the vault.
2. Check `git status --short --branch` in `C:\Users\rybow\QuantFlow`.
3. Keep Hermes-specific memory separate from Claude Code project memory.
4. Do not touch `Agents/Hermes/hermes-home` unless the user explicitly asks.

## Hydra Orchestration Toolkit

Hydra is a Lead-driven orchestration toolkit. You (the Lead) make strategic
decisions at decision points; Hydra handles operational management.
`result.json` is the only completion evidence.

Why this design (vs. other coding-agent products):
- **SWF decider pattern, specialized for LLM deciders.** Hydra is the AWS SWF / Cadence / Temporal decider pattern. `hydra watch` is `PollForDecisionTask`; the Lead is the decider; `lead_terminal_id` enforces single-decider semantics.
- **Parallel-first, not bolted on.** `dispatch` + worktree + `merge` are first-class. Lead sequences nodes manually and passes context explicitly via `--context-ref`. Other products treat parallelism as open research; Hydra makes it the default.
- **Typed result contract.** Workers publish a schema-validated `result.json` (`outcome: completed | stuck | error`, optional `stuck_reason: needs_clarification | needs_credentials | needs_context | blocked_technical`). Other products return free-text final messages and require downstream parsing.
- **Lead intervention points.** `hydra reset --feedback` lets the Lead actually intervene at decision points instead of being block-and-join. A stale or wrong run is one `reset` away.

Core rules:
- Root cause first. Fix the implementation problem before changing tests.
- Do not hack tests, fixtures, or mocks to force a green result.
- Do not add silent fallbacks or swallowed errors.
- An assignment run is only complete when `result.json` exists and passes schema validation.

Workflow patterns:
1. Do the task directly when it is simple, local, or clearly faster without workflow overhead.
2. Use Hydra for ambiguous, risky, parallel, or multi-step work:
   ```
   hydra init --intent "<task>" --repo .
   hydra dispatch --workbench W --dispatch <id> --role <role> --intent "<desc>" --repo .
   hydra watch --workbench W --repo .
   # → DecisionPoint returned, decide next step
   hydra complete --workbench W --repo .
   ```
3. Use a direct isolated worker when only a separate worker is needed:
   `hydra spawn --task "<specific task>" --repo . [--worktree .]`

Agent launch rule:
- When dispatching Claude/Codex through TermCanvas CLI, start a fresh agent terminal with `termcanvas terminal create --prompt "..."`
- Do not use `termcanvas terminal input` for task dispatch; it is not a supported automation path

TermCanvas Computer Use:
- TermCanvas may dynamically inject a Computer Use MCP server into Claude/Codex terminals; it does not have to appear in static MCP settings files.
- For local macOS desktop apps or system UI, check for TermCanvas Computer Use before assuming only shell, browser, or Playwright tools are available.
- If available, call `status` first, then `setup` if permissions or helper health are missing, then `get_instructions` for the current operating protocol.
- Do not manually start `computer-use-helper`, write its state file, launch the MCP server, or hand-write JSON-RPC unless explicitly debugging Computer Use itself.

Workflow control:
- After dispatching, always call `hydra watch`. It returns at decision points.
1. Watch until decision point: `hydra watch --workbench <workbenchId> --repo .`
2. Inspect structured state: `hydra status --workbench <workbenchId> --repo .`
3. Reset a dispatch for rework: `hydra reset --workbench W --dispatch N --feedback "..." --repo .`
4. Approve a dispatch's output: `hydra approve --workbench W --dispatch N --repo .`
5. Merge parallel branches: `hydra merge --workbench W --dispatches A,B --repo .`
6. View event log: `hydra ledger --workbench <workbenchId> --repo .`
7. Clean up: `hydra cleanup --workbench <workbenchId> --repo .`

Telemetry polling:
1. Treat `hydra watch` as the main polling loop; do not infer progress from terminal prose alone.
2. Before deciding wait / retry / takeover, query:
   - `termcanvas telemetry get --workbench <workbenchId> --repo .`
   - `termcanvas telemetry get --terminal <terminalId>`
   - `termcanvas telemetry events --terminal <terminalId> --limit 20`
3. Trust `derived_status` and `task_status` as the primary decision signals.

`result.json` must contain (slim, schema_version `hydra/result/v0.1`):
- `schema_version`, `workbench_id`, `assignment_id`, `run_id` (passthrough IDs)
- `outcome` (completed/stuck/error — Hydra routes on this)
- `report_file` (path to a `report.md` written alongside `result.json`)

All human-readable content (summary, outputs, evidence, reflection) lives in
`report.md`. Hydra rejects any extra fields in `result.json`. Write `report.md`
first, then publish `result.json` atomically as the final artifact of the run.

When NOT to use: simple fixes, high-certainty tasks, or work that is faster to do directly in the current agent.

## TermCanvas Pin System

TermCanvas has a first-class pin store. Pins are persistent records of work
the user wants done — captured when the user expresses intent, not when the
work happens. Use the `termcanvas pin` CLI to read and write them. Any agent
terminal can record, read, and update pins.

When to record a pin:
- User says "记一下", "回头处理", "帮我留意", "later", "todo this", or any phrasing that defers the work.
- User describes a problem or idea but isn't asking you to fix it right now.
- User pastes a GitHub issue URL and asks you to track it (record the URL via `--link`).

Do NOT silently nod — capture the pin with `termcanvas pin add` so it survives the session.

When existing pin content is pasted or dropped into the conversation:
- Treat it as context from an existing TermCanvas pin, not as a request to create another pin.
- Use the user's surrounding instruction to decide whether to execute, investigate, or discuss it.
- If the intent is unclear, ask what to do next instead of assuming the pin should be solved immediately.

Recording a pin:
```
termcanvas pin add --title "<short imperative>" --body "<detail>" [--link <url>]
```
- `--title`: short, scannable. Rephrase the user's words into imperative mood. Use the same language the user used (e.g. Chinese input → Chinese title, English input → English title).
- `--body`: preserve enough context for a future agent or the user to resume without re-asking basic questions. Use the same language the user used.
- Keep the body neutral and task-centered. Do not write "the user said/用户说..." as the main framing; describe the request, symptom, evidence, and next step directly. Quote the user's exact words only under Evidence / References when the wording itself matters.
- For bugs, feature requests, research threads, design feedback, or follow-up engineering work, use a compact template. Include only sections that have real content; do not fill sections with guesses:
  `Background`: what prompted this and where it came from.
  `Observed / Request`: the concrete symptom, ask, or idea.
  `Expected / Goal`: what should be true when this is handled.
  `Evidence / References`: user quote, screenshot, link, file path, command output, or code location if available.
  `Next action`: the first useful concrete step when someone picks it up.
  `Unknowns`: missing decisions or facts that still need confirmation.
- If the information is thin, choose deliberately:
  If local context can answer it cheaply, inspect the relevant code, state, logs, or files before recording and include what you found.
  If the missing information changes scope, product behavior, security, or architecture, ask the user one concise question before recording.
  If the user is clearly deferring and cannot answer now, record the pin anyway but mark assumptions and unknowns explicitly.
- If it is only a personal memo or reminder, a short body is acceptable, but still include why it matters or when to revisit it if that is known.
- For multi-line bodies, pass real newlines. In shell commands, use ANSI-C quoting such as
  `--body $'line 1\nline 2'`; do not put literal `\n` sequences inside ordinary quotes.
- `--link <url>`: attach an external reference (GitHub issue, doc, etc.). Use `--link-type github_issue` for issue URLs.
- Repo defaults to cwd. Pass `--repo <path>` only if you need a different one.

Reading and updating pins:
- `termcanvas pin list` — list pins for the current repo (filter `--status done` etc.)
- `termcanvas pin show <id>` — read a single pin before acting on it
- `termcanvas pin update <id> --status done` — mark complete after finishing the work
- `termcanvas pin update <id> --body "..."` — refine the description as you learn more

Rules:
- Pins belong to the user. Don't invent pins the user didn't ask for.
- One pin per intent. Three deferred items = three `pin add` calls.
- After completing work that originated from a pin, call `pin update <id> --status done`.
- The pin store is local to TermCanvas. It does NOT auto-sync to GitHub. If the user wants something on GitHub, they will say so explicitly.
- Status values: `open` (default), `done`, `dropped`. Pick `dropped` (not delete) when a pin is abandoned, so the history is preserved.
