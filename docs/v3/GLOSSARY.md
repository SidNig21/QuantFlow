# QuantFlow v3 Glossary

Canonical term definitions for v3. Use these terms in code, docs, and agent prompts.

Do not create alternate terms for concepts already defined here. If a term is missing, add it here rather than coining a local alias elsewhere.

---

## Core Primitives

### Workflow

A persistent mission context. Wraps a goal, its participating tiles, tasks, receipts, and state cards. The top-level coordination unit. All tiles in a workflow share a `workflow_id`.

### Tile

A visible canvas object. Can host a WorkerInstance, display a terminal, show a Conductor view, or represent any canvas participant. All tile state is Kernel-owned. The canvas renders tiles from Kernel snapshots.

### WorkerInstance

A runtime participant connected to a tile. Has exactly one Role, one Harness, and one Model. Not the same as a Role (type) or a Harness (adapter). A WorkerInstance is the running entity; its Role describes what function it performs.

### Role

The function a WorkerInstance plays in a workflow. Examples: `planner`, `coder`, `verifier`, `shell`. The Role is not the Harness and not the Model.

### Harness

The runtime adapter that bridges a WorkerInstance to its execution environment. Examples: `local-shell`, `herdr-shell`, `pi`, `codex`, `claude-code`. The Harness is not the Role and not the Model.

### Model

The intelligence backend behind a WorkerInstance. Examples: `minimax`, `claude`, `gpt`, `local`, `openrouter`. The Model is not the Harness.

```text
role ≠ harness ≠ model
```

### Task

The coordination unit. A state-machine object owned by the Kernel. Moves through:

```text
open → claimed → working → submitted → verifying → complete
```

Tasks are not chat messages. Workers may not self-complete without verification evidence.

### TaskDependency

A declared prerequisite between tasks. Blocks a task from becoming claimable until its dependencies are met.

### Receipt

The evidence unit. Append-only proof of what a worker did, submitted, or completed. Canonical types:

```text
task_created, task_claimed, task_started, progress, artifact_created,
task_blocked, task_submitted, verification_started, verification_passed,
verification_failed, task_completed, task_failed,
planning   (Conductor planning evidence — Goal 5A; not a task transition)
```

Receipts are never deleted or modified.

### StateCard

The compressed current reality of a tile/worker. Fields: `current_task_id`, `status`, `blocker`, `last_meaningful_update`, `next_action`, `artifacts`, `caveman_summary`. Updated by watchers from task events, receipts, and terminal signals.

A StateCard is **not** a chat log. It is **not** a receipt chain. It answers: *what is this tile doing right now?*

### Artifact

A durable output produced during a task. Referenced in receipts. Examples: file path, code snippet, analysis result, test output.

### Event

An append-only state-transition record. Used by watchers to maintain StateCards and by the renderer to re-render the canvas. Never deleted.

### Connection

A visual link between tiles on the canvas. In v3 Goal 7, gains a semantic type:

```text
delegation, context_flow, artifact_dependency, verification,
blocker, receipt_handoff, manual_connection
```

### Permission

An access rule scoped to a WorkerInstance. Defines what the worker may read, write, or execute.

### Command

A Kernel operation request. The canonical entry point for any state mutation. All components (renderer, Conductor, MCP adapter) write state through Kernel commands.

---

## Subsystem Terms

### Kernel

The sole source of truth. Hosts the SQLite state store, command handlers, query handlers, and event bus. All state mutations go through the Kernel. No other component may own canonical state.

### Canvas

The infinite canvas renderer (Electron renderer process). A visual projector of Kernel state. Not a database. User intent → Kernel command; Kernel event → canvas re-render. The canvas is never ahead of the Kernel.

### Conductor

The native in-process planner running in Electron main. Reads Kernel state through queries. Creates and manages tasks using native Kernel tools. Never owns truth. Never executes shell commands directly.

### Harness Layer

The collection of `WorkerHarness` adapter implementations. Each adapter wraps a different runtime environment. All produce receipts and StateCard updates through the same Kernel contract.

### MCP

The external adapter layer. Exposes Kernel commands and queries to external agents (Hermes, Claude Code, Codex, etc.) via the MCP server. Not the internal control plane. Not required for Conductor.

### Vault

The Obsidian knowledge mirror. Receives OKF-style exports of completed workflows, task summaries, and receipt chains. Not live state. Not a source of operational truth.

### Envoy

The task coordination bus. Routes task events between the Kernel and workers. Hosts the receipt chain. Backed by the Kernel's canonical task/receipt tables.

### herdr

The WSL session manager. Owns panes, Unix socket API, and agent state. Wrapped by the `herdr-shell` Harness adapter. Not replaced in v3.

---

## Anti-Patterns (Terms That Must Not Drive Design)

| Anti-pattern | Why |
| --- | --- |
| **canvas-as-database** | The canvas is a projector. |
| **worker self-completion** | Workers submit; the Kernel verifies. |
| **MCP as internal fast path** | MCP is an external adapter. |
| **vault as live state** | Vault is a durable knowledge mirror. |
| **string relay** | Retired. Do not revive. |
| **profile (fusing role+harness+model)** | `role ≠ harness ≠ model`; keep them separate. |
| **second source of truth** | Every component derives state from the Kernel. |
