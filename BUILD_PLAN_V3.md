# QuantFlow v3 Build Scope Plan

Branch: `quantflow-v3`
Base branch: `quantflow-v2`
Planning mode: Goal Sessions
Execution rule: one goal at a time; no parallel architecture tracks unless explicitly approved.

---

# v3 Goal Status

This section is the durable progress ledger for the v3 branch.

| Goal | Status | Worker | Verifier | Verified date | Notes |
| --- | --- | --- | --- | --- | --- |
| Goal 0 — Branch, v3 plan files, and DOX rails | Complete / approved | Claude | Codex | 2026-06-13 | Docs-only. Branch exists, v3 plan installed, DOX base contract incorporated, child `AGENTS.md` rails installed at durable boundaries, stale setup text removed. |
| Goal 1 — Kernel Constitution and Canonical Schema | Complete / approved | Claude | Codex | 2026-06-13 | Constitutional schema docs created, authority rules expanded, TypeScript row types declared, v3 baseline SQL parses in SQLite. No runtime wiring performed. |
| Goal 2 — Kernel Command Boundary and Canvas-as-Renderer Audit | Complete / approved | Claude | Codex | 2026-06-14 | Runtime command boundary wired for canvas actions. Manual spawn, move, resize, connect, and close now gate canonical commits through awaited Kernel commands; MCP connection path gates before shell mutation; build passes. |
| Goal 3 — Task State Machine v3: Submitted and Verifying Gates | Complete / approved | Claude | Codex | 2026-06-14 | Kernel-native task lifecycle now enforces submitted/verifying gates, verification receipts, self-verification guard, receipt-chain queries, MCP submit/verify/reject tools, and a scoped legacy bypass only from working/submitted/verifying; smoke, MCP tests, and build pass. |
| Goal 4 — State Cards and Flip Tile UI | Complete / approved | Claude | Codex | 2026-06-14 | Kernel-owned StateCards are maintained by an event watcher, seeded from tile creation, linked to tasks through default WorkerInstances, exposed through state_card list/get, and projected into the shell flip UI without replacing terminal state; state-card smoke, Goal 3 smoke, MCP tests, shell tests, and build pass. |
| Goal 5A — Conductor Read-Only MVP | Complete / approved | Claude | Codex | 2026-06-14 | Embedded Conductor reads Kernel-owned workflow/tile/task/StateCard/receipt context, projects a read-only Conductor panel, and posts only append-only planning receipts; workflow-scoped receipt isolation is covered by smoke tests. Manual app check confirmed `Ctrl+K` opens Conductor and the panel live-refreshes after tile spawn. Follow-up pushed through `0cae304` reserves `Ctrl+K` for the command palette and moves Find/file search to `Ctrl+F`. |
| Goal 6A — Worker Spawn Reconciliation and Minimal Harness Registry | Complete / approved | Claude | Codex | 2026-06-15 | Kernel now owns worker spawn/status identity through `worker_instances`, `kernel.worker.spawn/status_update/stop`, seeded local/herdr harness descriptors, runtime-id recording, State Card worker-status projection, and shell role spawn gating before PTY/herdr runtime start. Fix pass `dcc54dc` closes the worker.spawn rejection loophole; smoke, MCP tests, focused shell tests, and build pass. |

Completion rule:

```text
Worker submits goal result.
Verifier checks the result against this build plan's acceptance criteria.
Verifier updates this status ledger if the goal is approved.
Operator authorizes the next goal.
```

Workers do not approve their own goal completion.

---

# Agent Operating Rails / Supporting Tools

These tools are repo-ops aids only. They do not create a new v3 goal, do not block Goal 3, and must not become QuantFlow runtime dependencies.

- DOX is already installed as the `AGENTS.md` rule hierarchy. It is repo discipline for agent navigation, local instructions, and drift control. It is not product architecture and has no runtime package, service, or build step.
- Dosu is optional living repo knowledge for agent-facing docs, `AGENTS.md` freshness, and coding-agent MCP context. It may help keep documentation aligned with code changes, especially as multiple agents touch the repo. References: https://dosu.dev/for-agents, https://dosu.dev/blog/a-stale-agents-md-is-worse-than-no-agents-md, https://github.com/dosu-ai/dosu-cli
- Entire CLI is optional AI session tracing beside Git commits. It may help record how agent sessions produced code, but it is extra process tooling and should be skipped if it adds friction or noise. Reference: https://github.com/entireio/cli

Non-blocking setup notes:

```text
Dosu:
npx @dosu/cli setup
npx @dosu/cli setup --agent   # only if current CLI help documents/supports it

Entire:
entire enable
entire status
```

Authority limits:

```text
DOX, Dosu, and Entire do not own Kernel truth.
They do not replace BUILD_PLAN_V3.md, KERNEL_CONSTITUTION.md, AGENTS.md/DOX rails, Envoy, receipts, State Cards, or Obsidian.
They do not define app runtime behavior.
They must not be imported into the QuantFlow app or added as runtime dependencies.
If they conflict with this build plan or Kernel Constitution, this build plan and Kernel Constitution win.
```

---

# v3 North Star

QuantFlow v3 promotes the runtime Kernel into the sole source of truth, keeps the infinite canvas as the primary product surface, and introduces an embedded Conductor plus a worker harness abstraction.

The product should feel like:

> QuantFlow is where autonomous work becomes visible, coordinated, and provable.

The technical spine becomes:

```text
Canvas
= visual renderer of live work

Kernel
= source of truth

Conductor
= in-process planner

Harness Layer
= worker/runtime adapter boundary

Workers
= visible execution tiles

Receipts
= evidence

State Cards
= compressed current reality

Vault
= durable knowledge mirror
```

---

# v3 Core Correction

The main v3 correction is authority.

In v2, the canvas, Electron main, Envoy, MCP, herdr, and terminal workers all partially participate in state. That works, but it creates ambiguity.

In v3:

```text
Every state change writes to the Kernel first.
The canvas subscribes and renders.
The Conductor reads and mutates state through native Kernel tools.
Workers coordinate through tasks and receipts.
MCP remains an external adapter, not the internal control plane.
```

The canvas is a projector, never a database.

---

# v3 Non-Negotiables

## Keep

- Infinite canvas.

- Live terminal tiles.

- herdr-backed WSL panes.

- node-pty as display glass / Windows shell fallback.

- Envoy task bus and receipt chain.

- Obsidian mirror.

- Existing MCP tools as external agent interface.

- Current phase-6 autonomous delegation proof.

- Operator workflow: goal sessions, one active goal at a time.


## Change

- Promote Kernel/runtime SQLite/Envoy state into sole truth owner.

- Add canonical State Cards.

- Add task verification states: `submitted` and `verifying`.

- Add explicit `worker_instances`, `harnesses`, `models`, and `permissions`.

- Add Conductor as native in-process planner.

- Add Harness Layer for Pi / Codex / Claude Code / shell / future workers.

- Make canvas mutations go through Kernel commands.


## Do Not Do Early

- Do not replace herdr.

- Do not migrate tiles to Cloudflare Containers.

- Do not rebuild everything around Durable Objects.

- Do not make MCP the internal fast path.

- Do not build RL training.

- Do not build a full dashboard product.

- Do not redesign away from the canvas.

- Do not add A2A or Agent Cards.

- Do not reintroduce custom string relay.

- Do not add Cloudflare remote tier before local authority is correct.


---

# Goal Session Rules

A v3 goal should be:

- Big enough to produce a meaningful product shift.

- Small enough to test and commit cleanly.

- Demoable on the canvas.

- Pass/fail checkable.

- Written before coding starts.

- Completed before moving to the next goal.

- Submitted by the worker and approved by the verifier before the next goal begins.


Each goal must have:

```text
Goal
Why
Repo scope
Out of scope
Tool / URL requirements
Acceptance test
Failure signals
Handoff block
```

---

# Goal 0 — Branch, Freeze v2 Truth, Create v3 Plan Files, Install DOX Rails

## Goal

Create `quantflow-v3` from `quantflow-v2`, establish v3 as an explicit authority-refactor branch, and install DOX-style `AGENTS.md` rails so every future coding agent reads the correct local rules before editing.

This goal does not change runtime behavior.

## Why

v3 should not drift from v2 accidentally. The repo needs a clean planning entry point so future agents do not execute old vault plans, archived layer docs, or mixed v2/v3 instructions.

DOX is included here because v3 will be worked on by multiple agents. The failure mode to prevent is agent drift:

```text
agent opens repo
reads stale v2 context
ignores v3 authority rules
touches the wrong layer
rebuilds existing systems under new names
breaks Kernel/canvas separation
```

The DOX rule is simple:

```text
Before editing, an agent must walk the applicable AGENTS.md chain.
After meaningful changes, the agent must update the affected AGENTS.md file if local rules changed.
```

## Direct Repo Scope

Create or update:

```text
BUILD_PLAN_V3.md
KERNEL_CONSTITUTION.md
V3_MIGRATION_NOTES.md
docs/v3/README.md
docs/v3/GLOSSARY.md
AGENTS.md
docs/v3/AGENTS.md
src/kernel/AGENTS.md
src/renderer/AGENTS.md
src/main/conductor/AGENTS.md
src/harness/AGENTS.md
tools/quantflow-mcp/AGENTS.md
src/vault/AGENTS.md
```

The v3 plan must explicitly say:

```text
quantflow-v2 remains the source of shipped behavior.
quantflow-v3 changes authority structure.
v3 does not delete the canvas/herdr terminal identity.
```

The root `AGENTS.md` must explicitly say:

```text
QuantFlow v3 is an authority refactor, not a rewrite.

Kernel owns truth.
Canvas renders truth.
Conductor plans.
Workers execute.
Receipts prove.
State Cards summarize.
Harnesses adapt runtimes.

BUILD_PLAN_V3.md is the current execution plan.
KERNEL_CONSTITUTION.md is the authority document.
Old v2 docs are reference only unless v3 explicitly points to them.
```

## DOX Setup Protocol

Use DOX as repo discipline, not as a runtime dependency.

Reference:

```text
https://github.com/agent0ai/dox
```

Setup steps:

```text
1. Open the DOX repo: https://github.com/agent0ai/dox
2. Copy the contents of its AGENTS.md into QuantFlow's root AGENTS.md as the base DOX operating rule.
3. Add QuantFlow-specific v3 authority rules at the top of root AGENTS.md.
4. Create child AGENTS.md files only at durable repo boundaries:
   - docs/v3/AGENTS.md
   - src/kernel/AGENTS.md
   - src/renderer/AGENTS.md
   - src/main/conductor/AGENTS.md
   - src/harness/AGENTS.md
   - tools/quantflow-mcp/AGENTS.md
   - src/vault/AGENTS.md
5. Instruct the coding agent:
   Initialize DOX tree for this project now.
6. Verify each child AGENTS.md says what that subtree owns, what it must not mutate, and which v3 docs must be read before work.
```

DOX has no package install step. It is an `AGENTS.md` documentation discipline: no dependency, no runtime, no service, no build step.

## Required Local AGENTS.md Rules

### Root `AGENTS.md`

Must contain:

```text
Read order:
1. AGENTS.md chain for the target files
2. BUILD_PLAN_V3.md
3. KERNEL_CONSTITUTION.md
4. current goal session
5. relevant repo files
6. old v2 docs only when v3 references them

Do not use old vault notes as marching orders.
Do not create new vocabulary when canonical v3 primitives already exist.
Do not bypass Kernel commands.
```

### `src/kernel/AGENTS.md`

Must contain:

```text
Kernel owns truth.
All state mutations go through Kernel commands.
Do not import renderer state.
Do not let workers self-complete tasks without verification.
Receipts are append-only.
Events are append-only.
State Cards are current summaries, not history.
```

### `src/renderer/AGENTS.md`

Must contain:

```text
Renderer is a projector.
Do not store canonical workflow/tile/task state here.
Renderer sends user intent to Kernel.
Renderer renders Kernel snapshots/events.
Do not create a second source of truth.
```

### `src/main/conductor/AGENTS.md`

Must contain:

```text
Conductor plans only.
Conductor may call native Kernel tools.
Conductor may not own truth.
Conductor may not bypass task verification.
Conductor may not execute shell commands directly unless routed through a worker/harness.
```

### `src/harness/AGENTS.md`

Must contain:

```text
role ≠ harness ≠ model.
Harness-specific assumptions must not leak into Kernel.
Each adapter must produce receipts/state-card updates through the same contract.
Do not make Pi, Codex, Claude Code, or Hermes profiles mandatory for the core architecture.
```

### `tools/quantflow-mcp/AGENTS.md`

Must contain:

```text
MCP is the external adapter.
MCP is not the internal fast path.
Do not make Conductor depend on MCP for native QuantFlow control.
Keep MCP tools aligned with Kernel commands.
```

### `src/vault/AGENTS.md`

Must contain:

```text
Vault is a knowledge mirror, not live state.
Do not make Obsidian Markdown the source of operational truth.
Vault exports must preserve workflow/task/receipt IDs.
```

## Out of Scope

- No schema migration.

- No Conductor.

- No UI changes.

- No harness implementation.

- No Cloudflare.

- No RL.

- No new runtime dependency for DOX.

- No huge documentation tree beyond the listed AGENTS.md boundaries.


## Tool / URL Requirements

- Existing repo:

    - `CONCEPT.md`

    - `BUILD_PLAN_V2.md`

    - `ENVOY.md`

    - `TESTING.md`

- Planning sources:

    - [https://pi.dev/docs/latest](https://pi.dev/docs/latest)

    - [https://vercel.com/changelog/program-agent-harnesses-with-ai-sdk](https://vercel.com/changelog/program-agent-harnesses-with-ai-sdk)

    - [https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)

    - [https://developers.cloudflare.com/ai-gateway/](https://developers.cloudflare.com/ai-gateway/)

    - [https://github.com/agent0ai/dox](https://github.com/agent0ai/dox)


## Acceptance Test

- Branch exists: `quantflow-v3`.

- `BUILD_PLAN_V3.md` is the only execution plan for v3.

- `KERNEL_CONSTITUTION.md` defines authority rules.

- `V3_MIGRATION_NOTES.md` maps old v2 vocabulary to v3 vocabulary.

- Root `AGENTS.md` exists and includes the DOX operating rule plus QuantFlow v3 authority rules.

- Child `AGENTS.md` files exist at the listed durable repo boundaries.

- A fresh coding agent can open any target folder and answer:

    - What owns truth here?

    - What is this subtree allowed to mutate?

    - What docs must be read before editing?

    - What must not be rebuilt or bypassed?

- No runtime code changed.


## Failure Signals

- v3 plan duplicates v2 without clarifying authority changes.

- New plan creates a second architecture instead of migrating the existing one.

- Agent handoff still points to `BUILD_PLAN_V2.md` as execution source.

- DOX becomes a product feature instead of repo discipline.

- Agents create AGENTS.md files in every tiny folder instead of durable repo boundaries.

- Root `AGENTS.md` does not clearly say Kernel owns truth and canvas renders truth.


## Handoff Block

```text
Branch quantflow-v3.
Read the applicable AGENTS.md chain before editing.
Read CONCEPT.md and BUILD_PLAN_V2.md for existing truth, then BUILD_PLAN_V3.md and KERNEL_CONSTITUTION.md for v3 authority.
For v3 execution, BUILD_PLAN_V3.md is the only plan.
DOX setup: copy https://github.com/agent0ai/dox AGENTS.md into root AGENTS.md, add QuantFlow v3 authority rules, then initialize child AGENTS.md files only at durable repo boundaries.
This goal is docs-only. Do not change runtime code.
```

---

# Goal 1 — Kernel Constitution and Canonical Schema

## Goal

Define the canonical Kernel ontology and schema before further implementation.

This is the constitutional goal.

## Why

The v3 architecture depends on one rule:

```text
Kernel owns truth.
Canvas renders truth.
Conductor plans against truth.
Workers execute against truth.
Receipts prove truth changes.
```

If this is not locked early, the canvas and Electron main will continue to accumulate accidental authority.

## Direct Repo Scope

Create or update:

```text
KERNEL_CONSTITUTION.md
docs/v3/KERNEL_SCHEMA_V1.md
docs/v3/AUTHORITY_RULES.md
src/kernel/schema/
src/kernel/migrations/
```

Define canonical primitives:

```text
Workflow
Tile
WorkerInstance
Harness
Model
Task
TaskDependency
Receipt
StateCard
Artifact
Event
Connection
Permission
Command
```

Define canonical tables:

```text
workflows
tiles
worker_instances
roles
harnesses
models
tasks
task_dependencies
receipts
state_cards
artifacts
events
connections
permissions
commands
```

## Required Authority Rules

```text
Canvas cannot own truth.
Conductor cannot own truth.
Workers cannot own truth.
MCP cannot own truth.
Vault cannot own truth.
Kernel owns truth.

Receipts are append-only evidence.
State Cards are current summaries, not history.
Events are append-only state-transition history.
Tasks are state-machine objects, not chat messages.
Workers may submit completion.
The system verifies completion.
```

## Required Schema Concepts

### Workflow

A persistent mission context.

Fields:

```text
id
name
objective
status
created_at
updated_at
active_correlation_id
vault_path
metadata_json
```

### Tile

A visible canvas object.

Fields:

```text
id
workflow_id
display_name
tile_kind
x
y
width
height
z_index
status
created_at
updated_at
metadata_json
```

### WorkerInstance

A runtime participant connected to a tile.

Fields:

```text
id
tile_id
workflow_id
role_id
harness_id
model_id
status
permissions_json
envoy_space_id
herdr_pane_id
created_at
updated_at
metadata_json
```

### Harness

The adapter type.

Examples:

```text
local-shell
herdr-shell
pi
codex
claude-code
hermes-profile
future-ai-sdk-harness
```

### Model

The intelligence backend.

Examples:

```text
minimax
claude
gpt
local
openrouter
```

### Task

The coordination unit.

Fields:

```text
id
workflow_id
parent_task_id
correlation_id
title
objective
status
owner_worker_id
source_worker_id
target_worker_id
priority
approval_level
created_at
updated_at
submitted_at
verified_at
completed_at
metadata_json
```

### Receipt

The evidence unit.

Fields:

```text
id
workflow_id
task_id
worker_id
tile_id
type
summary
artifact_refs_json
parent_receipt_id
created_at
metadata_json
```

### StateCard

The compressed current reality.

Fields:

```text
id
tile_id
worker_id
workflow_id
current_task_id
status
blocker
last_meaningful_update
next_action
artifacts_json
caveman_summary
updated_at
metadata_json
```

## Out of Scope

- No UI.

- No Conductor.

- No harness implementation.

- No behavior migration yet.

- No schema perfection beyond canonical authority.


## Tool / URL Requirements

- Existing v2 references:

    - `BUILD_PLAN_V2.md`

    - `ENVOY.md`

    - existing runtime SQLite code

    - existing Envoy task bus code

    - existing MCP tool list

- Design references:

    - Vercel AI SDK HarnessAgent page for role/harness/model separation.

    - Pi docs for harness capability inventory.

    - OKF article for future vault export shape.


## Acceptance Test

- `KERNEL_CONSTITUTION.md` exists and is short enough to be read before every v3 coding session.

- `KERNEL_SCHEMA_V1.md` defines canonical tables and relationships.

- Every v3 primitive has one name and one owner.

- A future coding agent can answer:

    - Who owns truth?

    - What is a tile?

    - What is a worker?

    - What is a harness?

    - What is a receipt?

    - What is a state card?


## Failure Signals

- Schema is written as generic database design instead of QuantFlow authority design.

- `WorkerInstance`, `Harness`, and `Model` are collapsed into one concept.

- State Cards are treated as receipt history.

- Canvas state remains undefined.


---

# Goal 2 — Kernel Command Boundary and Canvas-as-Renderer Audit

## Goal

Audit and refactor the state boundary so canvas interactions flow through Kernel commands rather than direct renderer/local mutation.

## Why

The canvas must stay central visually, but it cannot be the source of truth.

This goal begins the actual v3 refactor.

## Direct Repo Scope

Create or update:

```text
src/kernel/commands/
src/kernel/queries/
src/kernel/events/
src/main/ipc/kernel-ipc.ts
src/renderer/state/
src/renderer/canvas/
```

Define command API:

```text
kernel.workflow.create
kernel.workflow.update
kernel.tile.spawn_requested
kernel.tile.created
kernel.tile.move
kernel.tile.resize
kernel.tile.status_update
kernel.connection.create
kernel.connection.delete
kernel.task.create
kernel.task.claim
kernel.task.block
kernel.task.submit
kernel.task.verify
kernel.task.complete
kernel.receipt.post
kernel.state_card.update
```

Define query API:

```text
kernel.workflow.snapshot
kernel.canvas.snapshot
kernel.tile.list
kernel.task.list
kernel.receipt.list
kernel.state_card.list
kernel.worker.list
```

Define renderer rule:

```text
Renderer sends intent.
Kernel validates and writes.
Renderer subscribes to state change.
Canvas re-renders from Kernel snapshot/event.
```

## Out of Scope

- Do not implement Conductor.

- Do not add AI.

- Do not add new worker harnesses.

- Do not redesign visual layout.

- Do not remove existing MCP path yet.


## Tool / URL Requirements

- Electron IPC docs if needed.

- Existing `events.subscribe` implementation.

- Existing canvas tile state/store code.

- Existing herdr spawn IPC files.

- Existing Envoy task bus code.


## Acceptance Test

Manual canvas actions still work:

```text
spawn tile
move tile
resize tile
connect tiles
close idle tile
```

But each action has:

```text
Kernel command
Kernel state write
Kernel event
Renderer update
```

## Failure Signals

- Renderer still mutates canonical tile state directly.

- Kernel command API becomes a loose wrapper around old renderer state.

- Canvas updates before Kernel accepts the mutation.

- Multiple state stores disagree about tile position/status.


---

# Goal 3 — Task State Machine v3: Submitted and Verifying Gates

## Goal

Upgrade the task lifecycle from worker-declared completion to system-verified completion.

## Why

For serious workflows, especially trading and RL validation, a worker saying “done” is not enough.

v3 task lifecycle:

```text
open
→ claimed
→ working
→ submitted
→ verifying
→ complete
```

Side paths:

```text
working → blocked
working/submitted/verifying → failed
blocked → working
claimed stale → open/ready
```

## Direct Repo Scope

Create or update:

```text
src/kernel/tasks/
src/kernel/tasks/state-machine.ts
src/kernel/tasks/validators.ts
src/kernel/receipts/
src/main/ipc/task-ipc.ts
tools/quantflow-mcp/
ENVOY.md
BUILD_PLAN_V3.md
```

Add commands:

```text
qf_task_submit
qf_task_verify
qf_task_reject
```

or equivalent Kernel-native commands with MCP adapter exposure.

Existing tools remain:

```text
qf_task_create
qf_task_claim
qf_task_update
qf_task_complete
qf_task_block
qf_task_fail
qf_receipt_list
qf_envoy_watch
```

But `complete` should eventually become either:

```text
submit + verify
```

or:

```text
complete only allowed after verification
```

## Required Receipt Types

```text
task_created
task_claimed
task_started
progress
artifact_created
task_blocked
task_submitted
verification_started
verification_passed
verification_failed
task_completed
task_failed
```

## Out of Scope

- No Conductor.

- No automatic verifier agent yet.

- No full Watchtower redesign.

- No RL scoring.

- No live trading integration.


## Tool / URL Requirements

- Existing `ENVOY.md`.

- Existing `bun run smoke:envoy-task`.

- Existing `bun run smoke:phase6`.

- Existing qf task MCP tools.


## Acceptance Test

A manual shell or Codex worker can:

```text
create task
claim task
mark working
submit result
post artifact receipt
verification begins
verification passes
task completes
receipt chain visible
```

The task cannot go straight from `working` to `complete` unless a compatibility flag allows legacy behavior.

## Failure Signals

- Worker can still self-complete without evidence.

- Verification receipts are optional or skipped.

- State transitions are not enforced centrally.

- Existing smoke tests break without a compatibility note.


---

# Goal 4 — State Cards and Flip Tile UI

## Goal

Add State Cards as a first-class Kernel primitive and expose them through the canvas by flipping a tile.

## Why

This is the key context-compression feature.

The user should not need to read 10,000 terminal lines to know what a tile is doing.

Front:

```text
live terminal
```

Back:

```text
state card
```

## Direct Repo Scope

Create or update:

```text
src/kernel/state-cards/
src/kernel/watchers/
src/renderer/components/Tile/
src/renderer/components/TileBack/
src/renderer/components/StateCardView/
src/renderer/shortcuts/
```

State Card fields:

```text
tile_id
worker_id
workflow_id
current_task_id
status
blocker
last_meaningful_update
next_action
artifacts
last_receipt_id
caveman_summary
updated_at
```

Flip interaction:

```text
keyboard: F
tile header button: flip icon
context menu: View State Card
```

State Card display sections:

```text
Current Task
Status
Blocker
Last Meaningful Update
Next Action
Artifacts
Last Receipt
Caveman Summary
```

## Watcher Behavior

A watcher maintains state cards by consuming:

```text
task events
receipt events
tile lifecycle events
terminal significance signals
worker status events
```

The watcher should not dump raw logs into the state card.

It should promote only meaningful status.

## Out of Scope

- No LLM summarizer required in first pass.

- No auto-caveman model call required in first pass.

- No full memory tile.

- No new dashboard.


## Tool / URL Requirements

- Current herdr `events.subscribe`.

- Existing renderer tile components.

- Existing Envoy receipts.

- CNVS/Maestri flip-tile reference as visual inspiration only.

- Claude Design for visual exploration only, not source of truth.


## Acceptance Test

User can:

```text
spawn 3 tiles
assign/claim tasks
flip each tile
see current task/status/blocker/next action
flip back to live terminal
```

Hermes/Conductor can query:

```text
state_card.list
state_card.get(tileId)
```

## Failure Signals

- State Card becomes a chat transcript.

- State Card requires reading the entire terminal log.

- Flip UI hides or degrades the terminal experience.

- State Card lives only in renderer state rather than Kernel state.


---

# Goal 5A - Conductor Read-Only MVP

## Goal

Add an embedded Conductor surface in Electron main that reads Kernel state and posts planning receipts.

Goal 5A is intentionally read-only except for `planning_receipt` writes. It proves the Conductor can understand the live Kernel world before it is allowed to mutate work.

## Why

MCP/PTY is too slow and indirect for the primary planner.

The planner should not control the canvas through a terminal.

Before the Conductor can safely spawn or assign workers, it must prove that it can read the same Kernel truth the canvas renders:

```text
getCanvasSnapshot
getWorkflowSnapshot
getStateCards
getTaskList
getReceiptChain
postPlanningReceipt
```

## Direct Repo Scope

Create or update:

```text
src/main/conductor/
src/main/conductor/conductor-reader.ts
src/main/conductor/conductor-tools-readonly.ts
src/main/conductor/prompts/
src/main/conductor/model-provider.ts
src/renderer/components/ConductorTile/
src/kernel/conductor/
```

Conductor tile shows:

```text
Current plan
State reads
Tool calls
Delegations
Receipts reviewed
Blockers
Next action
```

It is not a raw terminal.

## Native Tool Surface - Goal 5A

Minimum tools:

```text
get_canvas_snapshot
get_workflow_snapshot
get_state_cards
get_task_list
get_receipt_chain
post_receipt
focus_tile
request_human_approval
```

`post_receipt` is limited to Conductor planning receipts in Goal 5A.

## Conductor Rules

The Conductor may:

```text
read state
post planning receipts
ask human for approval
```

The Conductor may not:

```text
own truth
store private source-of-truth memory
create or assign tasks yet
spawn or activate workers yet
verify, reject, complete, or block tasks yet
complete tasks without verification evidence
execute shell commands directly unless through a worker
silently perform high-risk actions
```

## Model Provider

Initial target:

```text
MiniMax 3 or selected Nous/Hermes-compatible model provider
```

Provider must be behind an internal abstraction so it can later route through:

```text
Cloudflare AI Gateway
OpenRouter
local provider
direct API
```

## Out of Scope

- Do not remove Hermes terminal tile entirely yet.
- Do not delete MCP tools.
- Do not implement multiple harnesses here.
- Do not implement worker spawn or `spawn_role` here; Goal 6A owns that reconciliation.
- Do not implement autonomous loops here.
- Do not build RL scoring.
- Do not use Cloudflare AI Gateway yet unless trivial.

## Tool / URL Requirements

- Vercel AI SDK core docs.
- Vercel HarnessAgent changelog as conceptual reference.
- Existing QuantFlow MCP tools as native tool equivalents.
- Existing Envoy task bus as shipped-behavior reference only.
- MiniMax provider docs/API docs.
- Optional later: Cloudflare AI Gateway.

## Acceptance Test

On a canvas workflow:

```text
User starts Conductor.
Conductor reads state cards.
Conductor reads tasks and receipt chains.
Conductor tile shows current plan/read model/tool reads/blockers/next action.
Conductor posts a planning receipt through the Kernel.
The receipt appears in the task/workflow receipt chain.
```

No `terminal_write` handoff should be needed for the planner read path.

## Failure Signals

- Conductor becomes a second source of truth.
- Conductor requires MCP to call internal app functions.
- Conductor only chats but does not use native tools.
- Conductor tile becomes less informative than Hermes terminal.
- Conductor mutates tasks, workers, strings, or workflow state before Goal 6A and Goal 5C.

---

# Goal 6A - Worker Spawn Reconciliation and Minimal Harness Registry

## Goal

Make Kernel worker identity authoritative before the Conductor can spawn, assign, or manage workers.

The `worker_instances` row is the single identity tying a canvas tile, role, harness, model, PTY/herdr runtime, Envoy space, receipts, and State Card together.

Full spec: `docs/v3/WORKER_RECONCILIATION.md`.

## Why

Goals 2-4 made tiles, tasks, receipts, and State Cards Kernel-owned. Actual runtime spawn still runs through shell-side role spawn, PTY/herdr, and legacy Envoy paths.

The dual-authority gap is specific:

```text
PTY/herdr session + Envoy record do not yet have a Kernel-owned WorkerInstance identity.
```

Conductor actions cannot be reliable until worker spawn and status have one owner.

## Direct Repo Scope

Create or update:

```text
src/kernel/worker-instances/
src/kernel/commands/worker-commands.ts
src/harness/
src/harness/types.ts
src/harness/local-shell/
src/harness/herdr-shell/
src/harness/registry.ts
quantflow-electron/src/windows/shell/src/role-tile-spawn.js
quantflow-electron/src/main/
docs/v3/WORKER_RECONCILIATION.md
```

## Required Ownership Model

`kernel.worker.spawn` is the spawn authority:

```text
1. write worker_instances row with role_id/harness_id/model_id/status='spawning'
2. delegate to harness adapter to start existing runtime
3. record runtime ids back on the same worker_instances row
4. emit Kernel worker/tile/state_card events
```

`kernel.worker.status_update` owns status:

```text
worker_instances.status = spawning | active | idle | stopped | error
```

The shell's herdr status event path must update Kernel status, not only renderer badges.

Receipts flow through Kernel:

```text
harness collectReceipts -> kernel.receipt.post(worker_id, tile_id, task_id, ...)
```

Envoy is wrapped or explicitly bridged as a legacy transport detail. It is not a second task authority.

## Minimal Harness Scope

Implement only the contract needed to wrap current shipped runtimes:

```text
local-shell
herdr-shell
```

Pi remains a Goal 6 follow-up unless the programmatic contract is stable enough and explicitly approved.

## Out of Scope

- No Conductor autonomous loop.
- No Conductor task assignment/spawn tools until this passes.
- No full agent marketplace.
- No Claude Code or Codex adapter unless the local contract is already stable.
- No remote containers.
- Do not break existing phase-6 herdr/PTY behavior.

## Acceptance Test

From the live canvas path:

```text
spawn worker tile through Kernel worker spawn
worker_instances row has tile_id, role_id, harness_id, model_id if available
runtime ids are recorded: herdr_pane_id and/or envoy_space_id when present
herdr/PTY status updates worker_instances.status
State Card shows real worker status without reading terminal logs
task claimed by tile/worker maps to the same worker_instances row
worker close stops or detaches runtime and updates Kernel status
```

No manual pre-seeding of `worker_instances` is allowed in the proof.

## Failure Signals

- Shell calls `herdrSpawnRole` or PTY spawn directly without a Kernel worker identity.
- Worker status exists only as a renderer badge.
- Envoy task/receipt state competes with Kernel task/receipt state.
- `role_id`, `harness_id`, `model_id`, `herdr_pane_id`, or `envoy_space_id` stay permanently unpopulated when the data exists.
- Kernel mirrors legacy runtime state after the fact instead of authorizing spawn first.

---

# Goal 5C - Conductor Native Actions

## Goal

Allow the Conductor to mutate Kernel workflow state through native tools, after Goal 6A proves worker spawn/status ownership.

Goal 5C is a single-step, operator-triggered action surface. It is not the autonomous loop, and it is not the full WorkerHarness send/read/collectReceipts interface.

## Native Tool Surface - Goal 5C

Add mutation tools:

```text
create_task
assign_task
submit_task
verify_task
reject_task
block_task
spawn_role
connect_tiles
```

Each tool must be a thin native binding over existing Kernel authority:

```text
create_task / assign_task / submit_task / verify_task / reject_task / block_task
  -> Kernel task commands and receipt writes

spawn_role
  -> approved shell role-spawn path gated by kernel.worker.spawn

connect_tiles
  -> kernel.connection.create
```

The Conductor may choose the action and propose arguments, but the operator triggers one action at a time in Goal 5C.

## Rules

The Conductor may create and assign work, request verification, resolve blockers, and post receipts.

The Conductor still may not:

```text
execute shell commands directly
complete tasks without verification evidence
silently perform high-risk actions
run an autonomous loop
store private source-of-truth memory
implement generic harness send/read/collectReceipts
```

## Acceptance Test

Operator triggers one Conductor action at a time:

```text
Conductor reads Kernel state.
Conductor creates a task.
Conductor spawns or activates a worker through kernel.worker.spawn.
Worker claims task.
Worker submits result.
Verifier posts verification receipt.
Conductor marks the workflow step ready for next action.
```

No `terminal_write` handoff should be needed for the planner path.

This means the Conductor must not use terminal paste or MCP as an internal app-control path. Worker execution may still happen through the shipped terminal/agent runtime until Goal 6 hardens harness send/read/receipt collection.

## Failure Signals

- Conductor bypasses Kernel tools.
- Conductor writes through MCP instead of native app functions.
- Worker activation relies on manual paste.
- Conductor starts looping without operator authorization.
- Conductor implements an ad hoc harness protocol instead of waiting for Goal 6.

---

# Goal 5D - Conductor Loop

## Goal

Add an approval-gated Conductor loop after read-only planning, worker spawn reconciliation, native actions, and the full Goal 6 harness contract are proven.

Goal 5D should run after Goal 6 unless the operator explicitly approves a minimal pre-harness loop with reduced scope.

## Scope

The loop can:

```text
read current Kernel state
select the next low-risk tool call
ask for approval on high-risk actions
post planning/action receipts
pause on blockers or ambiguity
```

## Out of Scope

- No live trading actions.
- No cloud-required loop.
- No self-completion or self-verification.
- No hidden memory outside Kernel receipts/state.

## Acceptance Test

On a small workflow, the Conductor can perform multiple approved steps without terminal paste:

```text
plan -> create task -> assign/spawn -> wait for receipt -> request verification -> summarize next action
```

The operator can pause/stop the loop and inspect every decision through receipts and the Conductor tile.

## Failure Signals

- Loop acts faster than the UI/receipts can explain.
- Loop repeats failed actions without new evidence.
- Loop hides uncertainty instead of asking for approval.

---

# Goal 6 - Harness Interface and First Worker Adapters

## Goal

Expand the WorkerHarness interface after Goal 6A proves the minimal local/herdr registry.

Goal 6 should land before Goal 5D so the Conductor loop has a stable worker send/read/receipt contract instead of relying on terminal paste or role-specific hacks.

## Why

QuantFlow must not become locked to Pi, Claude Code, Codex, Hermes profiles, or any single model provider.

The distinction must be permanent:

```text
role != harness != model
```

## Direct Repo Scope

Create or update:

```text
src/harness/
src/harness/types.ts
src/harness/local-shell/
src/harness/herdr-shell/
src/harness/pi/
src/harness/registry.ts
src/kernel/worker-instances/
```

Interface shape:

```ts
interface WorkerHarness {
  kind: string;
  spawn(input: SpawnWorkerInput): Promise<WorkerHandle>;
  send(handle: WorkerHandle, message: WorkerMessage): Promise<void>;
  readState(handle: WorkerHandle): Promise<PartialStateCard>;
  collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]>;
  stop(handle: WorkerHandle): Promise<void>;
}
```

Worker config shape:

```text
role_id
harness_id
model_id
workflow_id
tile_id
permissions
skills
env
cwd
activation_prompt
```

## First Harnesses

### local-shell

Introduced in Goal 6A; harden for workflow use.

### herdr-shell

Introduced in Goal 6A; harden for workflow use.

### pi

Use Pi programmatic usage if stable enough; otherwise use RPC or JSON event stream mode.

## Out of Scope

- No Claude Code adapter unless local contract is stable.
- No Codex adapter unless existing Codex tile can be wrapped cleanly.
- No Vercel sandbox.
- No remote containers.
- No generic agent marketplace.

## Tool / URL Requirements

- Pi docs:
    - SDK
    - RPC mode
    - JSON event stream mode
    - providers
    - custom models
    - skills
    - extensions

- Vercel AI SDK HarnessAgent:
    - conceptual reference for swappable harnesses
    - do not hard-depend on experimental canary unless deliberately approved

- Existing herdr spawn code.
- Existing role spawn config.

## Acceptance Test

From the same workflow/task:

```text
spawn worker with harness=local-shell
spawn worker with harness=herdr-shell
spawn worker with harness=pi if approved/stable
```

Each worker gets:

```text
role
model
permissions
workflow context
activation prompt
```

Each worker can post or produce receipts through the same Kernel path. Envoy participation must be wrapped/bridged, not parallel authority.

## Failure Signals

- Harness and model are fused.
- Pi-specific assumptions leak into Kernel.
- Worker identity depends on display name.
- Harness implementation bypasses task/receipt system.
- The canvas cannot show harness/model/role separately.

---
# Goal 7 — Workflow Regions and Semantic Strings

## Optional Canvas Layout Discipline / Smart Grid

Parked Goal 7 enhancement/reference only. Do not implement before Goal 7, do not block Goal 3, and do not treat this as a new runtime authority.

Reference: https://github.com/alexmcdonnell-airtable/hyperagent-public-skills

The Muller-Brockmann grid-systems skill in that repo is inspiration only. The purpose is to keep QuantFlow workflow tiles organized on the infinite canvas without turning the app into a dashboard, rigid design tool, or mandatory layout system.

Possible scope:

```text
snap grid
grid overlay toggle
workflow layout templates
basic layout verification
no overlapping tiles
minimum readable terminal size
predictable placement zones for Conductor / workers / verifier / artifacts
```

Non-goals:

```text
do not implement this before Goal 7
do not block Goal 3
do not make layout mandatory
do not replace the infinite canvas
do not add a complex graph layout engine
do not make strings or grid layout into a new runtime authority
```

## Goal

Make workflows visible on the canvas without replacing the canvas with dashboards.

## Why

The user thinks in workflows.

Tiles are participants.

Workflow is the persistent mission.

## Direct Repo Scope

Create or update:

```text
src/kernel/workflows/
src/renderer/components/WorkflowRegion/
src/renderer/components/CanvasConnection/
src/renderer/components/StringOverlay/
src/renderer/canvas/overlays/
```

Workflow region shows:

```text
workflow name
objective
active tiles
task count
receipt count
blockers
status
```

Visual treatment:

```text
soft boundary
not a hard dashboard
not Kanban
not a modal-first system
```

Strings gain semantic type:

```text
delegation
context_flow
artifact_dependency
verification
blocker
receipt_handoff
manual_connection
```

## Out of Scope

- No full dashboard.

- No multi-workspace enterprise view.

- No 100-agent fleet view.

- No complex graph algorithm.

- No string relay revival.


## Tool / URL Requirements

- Existing canvas SVG/cable layer.

- Existing connection model.

- Claude Design for UI exploration:

    - flip tile

    - Conductor tile

    - workflow region

    - semantic strings


## Acceptance Test

User can run one workflow with 3–5 tiles.

The canvas visually shows:

```text
which tiles belong to workflow
which strings are delegations
which strings are verification/context/artifact relationships
which task is blocked
```

## Failure Signals

- Workflow region feels like a separate dashboard.

- Strings remain decorative only.

- Strings become PTY-to-PTY message transport again.

- Visual complexity increases without adding understanding.


---

# Goal 8 — Evidence and Vault: OKF-Style Knowledge Export

## Goal

Turn receipt chains and workflow outcomes into durable Obsidian knowledge documents.

## Why

SQLite/Kernel is live truth.

The vault is long-term knowledge.

Receipts are raw evidence.

OKF-style Markdown turns evidence into reusable context.

## Direct Repo Scope

Create or update:

```text
src/vault/
src/vault/exporters/
src/vault/okf/
src/vault/templates/
docs/v3/VAULT_OKF_SPEC.md
```

Export types:

```text
workflow_summary.md
task_summary.md
artifact_index.md
decision_log.md
receipt_chain.md
state_card_snapshot.md
```

Markdown frontmatter example:

```yaml
---
type: workflow_summary
workflow_id: wf_...
status: complete
receipt_count: 42
artifact_count: 7
created_at: ...
completed_at: ...
tags: [quantflow, workflow]
---
```

Body sections:

```text
Goal
What happened
Key decisions
Receipts
Artifacts
Blockers
Verification results
Lessons learned
Open follow-ups
```

## Out of Scope

- No live coordination through Markdown.

- No Obsidian as source of truth.

- No replacing SQLite with vault files.

- No automatic RL trajectory export yet.

- Do not revive or extend the legacy Envoy Obsidian mirror as a second exporter.


## Tool / URL Requirements

- Google Cloud OKF article/spec.

- Existing Obsidian mirror.

- Existing Envoy receipts.

- Existing Envoy mirror as shipped-behavior reference only; Goal 8 exports Kernel receipt chains.

- DuckDB/MotherDuck path later, not required here.


## Acceptance Test

Run one workflow.

On completion, QuantFlow creates:

```text
Obsidian workflow summary
task summaries
artifact index
receipt chain note
```

These documents are readable by humans and parseable by agents.

## Failure Signals

- Vault becomes live state.

- Exported notes are too verbose to be useful.

- Receipt evidence is lost during summarization.

- Notes cannot be traced back to workflow/task/receipt IDs.

- Kernel receipt export and legacy Envoy mirror both write competing workflow summaries.


---

# Goal 9 — Evaluation Layer: Workflow and Conductor Scoring


## Spec Gate Before Implementation

Goal 9 is blocked until `docs/v3/EVALS_SPEC.md` defines concrete rubrics, inputs, and scoring rules. Do not implement vague scores.

## Goal

Add lightweight evaluation after receipts and state cards exist.

## Why

Only after QuantFlow can coordinate work and prove outcomes should it score quality.

This is the bridge to future SkillOpt/RL.

## Direct Repo Scope

Create or update:

```text
src/evals/
src/evals/rubrics/
src/evals/workflow-score.ts
src/evals/conductor-score.ts
src/evals/receipt-quality.ts
docs/v3/EVALS_SPEC.md
```

`docs/v3/EVALS_SPEC.md` must be created and approved before runtime scoring code.

Score categories:

```text
task completion correctness
verification quality
receipt completeness
Conductor delegation quality
blocker handling
human intervention count
time to completion
artifact usefulness
```

Each score must name:

```text
receipt inputs
required evidence
rubric scale
failure conditions
whether a human/verifier judgment is required
```

## Out of Scope

- No RL.

- No GRPO.

- No training pipeline.

- No model fine-tuning.

- No full Braintrust integration unless explicitly approved.


## Tool / URL Requirements

- Braintrust docs later.

- Existing receipts.

- Existing OKF/vault exports.

- Existing workflow summary format.


## Acceptance Test

After a workflow completes, QuantFlow can generate:

```text
workflow score
Conductor decision score
receipt quality score
verification score
```

Scores attach to the workflow and optionally export to vault.

## Failure Signals

- Scoring requires manual reading of terminal logs.

- Scoring happens before verification exists.

- Scores are vague and not tied to receipts.

- Evals become a separate product before core coordination works.


---

# Goal 10 — Cloud and Remote Tier, Parked Until Local v3 Is Solid

## Goal

Add remote/cloud infrastructure only after the local Kernel/Conductor/Harness architecture is proven.

## Why

Cloudflare is strategically useful, but if added too early it becomes a re-platforming distraction.

## Direct Repo Scope

Only planning until explicitly approved:

```text
docs/v3/CLOUDFLARE_ROADMAP.md
src/cloud/
```

Priority order:

```text
1. Cloudflare AI Gateway for model logging/caching/rate limits/fallback.
2. R2 for archived receipts/artifacts.
3. Tunnel/Access for secure remote monitoring.
4. Durable Objects only if cross-machine shared world state is needed.
5. Containers only if remote tile execution is needed.
6. Workflows only for durable critical lifecycles such as trading.
```

## Out of Scope

- No DO tile controller in early v3.

- No Container tile body in early v3.

- No replacing local PTYs.

- No cloud-first rewrite.


## Tool / URL Requirements

- [https://developers.cloudflare.com/ai-gateway/](https://developers.cloudflare.com/ai-gateway/)

- [https://developers.cloudflare.com/r2/](https://developers.cloudflare.com/r2/)

- Later:

    - Cloudflare Durable Objects docs

    - Cloudflare Containers docs

    - Cloudflare Workflows docs

    - Cloudflare Tunnel/Access docs


## Acceptance Test

Planning-only until Goal 9 passes.

First allowed implementation is AI Gateway wrapper around model calls, with correlation IDs attached.

## Failure Signals

- Cloud tier changes local tile behavior.

- Cloud tier becomes required for core app.

- Cloud tier replaces herdr before local architecture is solid.

- Cloud migration starts before Conductor and Harness Layer are proven.


---

# Suggested v3 Goal Order

```text
Goal 0 - Branch, v3 plan files, and DOX rails
Goal 1 - Kernel Constitution and Canonical Schema
Goal 2 - Kernel Command Boundary and Canvas-as-Renderer Audit
Goal 3 - Task State Machine v3
Goal 4 - State Cards and Flip Tile UI
Goal 5A - Conductor Read-Only MVP
Goal 6A - Worker Spawn Reconciliation and Minimal Harness Registry
Goal 5C - Conductor Native Actions
Goal 6 - Harness Interface and First Worker Adapters
Goal 5D - Conductor Loop
Goal 7 - Workflow Regions and Semantic Strings
Goal 8 - Evidence and Vault OKF Export
Goal 9 - Evaluation Layer (blocked until EVALS_SPEC rubrics exist)
Goal 10 - Cloud and Remote Tier
```

---

# Immediate v3 First Milestone

The first milestone should not be Conductor.

The first milestone should be:

```text
Kernel owns truth.
Canvas renders truth.
Task state machine has verification.
State Cards exist.
```

Only then does Conductor become powerful.

The first meaningful v3 demo should be:

```text
User spawns a workflow with 3 tiles.
Canvas renders all tile/workflow state from Kernel.
A task moves open → claimed → working → submitted → verifying → complete.
Each step posts receipts.
Each tile flips to show its State Card.
No raw terminal reading is required to understand the workflow.
```

That foundation is now in place through Goal 6A. The next product proof is Conductor native actions, then a stable harness contract, then the approval-gated loop.

---

# v3 Product Demo Target

The first real v3 product demo should look like:

```text
1. User creates workflow: “Build Replay Loader”
2. QuantFlow opens a workflow region on the canvas.
3. User spawns Hermes/Conductor, Pi Coder, Shell Verifier.
4. Conductor creates a task.
5. Pi Coder claims and works.
6. Pi Coder submits result.
7. Shell Verifier verifies result.
8. Task completes only after verification.
9. Receipts appear.
10. Tile flip shows current state cards.
11. Vault export creates workflow summary.
```

That demo proves the product identity:

```text
visible
coordinated
provable
```

---

# The v3 Handoff Block for Coding Agents

```text
Branch quantflow-v3.

Read:
1. applicable AGENTS.md chain
2. CONCEPT.md
3. BUILD_PLAN_V2.md
4. BUILD_PLAN_V3.md
5. KERNEL_CONSTITUTION.md

v3 is an authority refactor, not a product rewrite.

DOX rails:
- Root AGENTS.md and child AGENTS.md files are mandatory in v3.
- Follow https://github.com/agent0ai/dox setup.
- Before editing, read the AGENTS.md chain for the target files.
- After meaningful changes, update affected AGENTS.md files only if local rules changed.

Optional repo-ops tools: Dosu may maintain agent-facing docs/freshness; Entire may record AI coding sessions; neither is required for app runtime.

Keep:
- infinite canvas
- live terminal tiles
- herdr-backed WSL panes
- Envoy task bus as shipped behavior / wrapped legacy transport
- Obsidian mirror
- existing MCP tools as external adapter

Change:
- Kernel owns truth
- canvas renders Kernel state
- tasks require submitted/verifying gates
- State Cards are first-class
- Goal 5A Conductor is read-only except planning receipts
- Goal 6A makes Kernel worker spawn/status authoritative before Conductor actions
- worker role/harness/model are separate

Do not:
- replace herdr
- move tiles to Cloudflare
- build RL
- build A2A
- redesign away from the canvas
- bypass Kernel commands
- let workers self-complete without verification receipts
- let Conductor spawn/assign workers before Goal 6A passes
- let Envoy compete with Kernel task/receipt authority

Work only on the current v3 goal.
Commit locally before handoff. Do not push worker goal commits; the verifier reviews the local commit/diff, updates the ledger if approved, and pushes the approved branch state.
```
