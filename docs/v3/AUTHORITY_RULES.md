# Authority Rules

These rules govern every v3 implementation decision. They are binding. No component, goal, or optimization may override them.

Read this alongside `KERNEL_CONSTITUTION.md` before every v3 coding session.

---

## Who Owns Truth

```text
Kernel owns truth.

Canvas cannot own truth.
Conductor cannot own truth.
Workers cannot own truth.
MCP cannot own truth.
Vault cannot own truth.
```

Every component derives state from the Kernel. There is no secondary source of truth.

### Why This Matters

In v2, the canvas, Electron main, Envoy, MCP, herdr, and terminal workers all partially held state. This worked but created ambiguity: which value was correct when they diverged?

v3 eliminates the ambiguity. One component writes; all others read from that write.

---

## Mutation Rules

All state mutations must follow this path:

```text
caller → Kernel command → Kernel validates → Kernel writes SQLite
→ Kernel emits event → subscribers receive event → components re-render or update
```

No shortcut is permitted:

| Shortcut | Why Forbidden |
| --- | --- |
| Canvas writes tile position locally and syncs later | Canvas is a projector; it must not lead the Kernel |
| Renderer updates UI before Kernel accepts command | Optimistic updates without Kernel confirmation create divergence |
| Worker marks task complete by updating its own state | Workers submit; the system verifies |
| MCP tool writes directly to SQLite | MCP tools must call Kernel commands, not bypass them |
| Conductor maintains a private copy of Kernel state | Conductor reads the Kernel; it does not shadow it |
| Vault Markdown drives task/tile/workflow state | Vault is an export target, not a state source |

---

## Read Rules

Components read Kernel state through queries, not through direct SQLite access:

```text
component → Kernel query → Kernel reads SQLite → returns snapshot
```

The renderer subscribes to Kernel events to stay current between explicit queries.

---

## Receipt Rules

Receipts are the evidence layer. They are governed by strict invariants:

1. **Receipts are append-only.** No receipt may be deleted or modified after creation.
2. **Receipts are indexed by correlation ID.** The full chain for any task or workflow is always reconstructable.
3. **Receipts do not replace State Cards.** A State Card summarizes current reality; a receipt proves what happened.
4. **Every meaningful state transition produces a receipt.** Silent state changes are not permitted.

Canonical receipt types:

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
planning
```

The `planning` receipt (Goal 5A) is the read-only Conductor's evidence of a plan
(reads/blockers/next action). It is append-only like all receipts and never
advances a task — it is not a task transition.

---

## Event Rules

Events are the state-change notification layer:

1. **Events are append-only.** No event may be deleted or modified after creation.
2. **Events drive the renderer.** The canvas re-renders from Kernel events, not from polling.
3. **Events drive State Card watchers.** Watchers consume events to maintain current summaries.
4. **Events are not receipts.** Events are ephemeral coordination signals; receipts are durable evidence.

---

## Task Rules

Tasks are state-machine objects. They are not chat messages, instructions, or strings.

### Canonical State Machine

```text
open → claimed → working → submitted → verifying → complete

working → blocked → working
working / submitted / verifying → failed
```

### Enforcement

- The Kernel enforces all transitions. No caller may bypass the state machine.
- No component may advance a task to `complete` without the `submitted → verifying` gate.
- The `verifying` state requires a verification receipt before `complete` is permitted.
- Stale `claimed` tasks (owner unreachable) may be returned to `open` by the Kernel only.

### Why the Submitted/Verifying Gate

Workers are trusted participants, not authorities. For serious workflows — trading, RL validation, critical operations — a worker saying "done" is not sufficient.

```text
Workers may submit completion.
The system verifies completion.
```

This applies to all task types in v3. Compatibility flags that allow legacy self-completion must be explicitly gated and eventually retired.

---

## State Card Rules

State Cards are the context-compression layer:

1. **State Cards are current summaries, not history.** A State Card answers: *what is this tile doing right now?*
2. **State Cards are Kernel-owned.** They live in the Kernel's `state_cards` table, not in renderer state.
3. **State Cards are maintained by watchers.** Watchers consume task events and receipts; they do not duplicate receipt chains.
4. **State Cards must not grow into chat logs.** If a State Card requires reading terminal output to understand it, it is broken.

---

## Harness Rules

```text
role ≠ harness ≠ model
```

- **Role**: the function a WorkerInstance plays (`planner`, `coder`, `verifier`, `shell`).
- **Harness**: the runtime adapter (`local-shell`, `herdr-shell`, `pi`, `codex`, `claude-code`).
- **Model**: the intelligence backend (`minimax`, `claude`, `gpt`, `local`).

A change to any one of these must not require changes to the others. The Kernel stores them as separate foreign keys on `worker_instances`.

---

## MCP Rules

MCP is an external adapter:

1. MCP tools expose Kernel commands and queries to external agents.
2. MCP tools must not implement business logic that belongs in the Kernel.
3. The Conductor must not depend on MCP for native QuantFlow coordination.
4. MCP is not the internal fast path. As the Kernel command boundary is hardened (Goal 2), MCP tools must route through Kernel commands.

---

## Vault Rules

1. The vault is a knowledge mirror, not live state.
2. Vault exports must include `workflow_id`, `task_id`, and `receipt_id` on every document so they remain traceable.
3. No agent may read vault Markdown as the source of task or workflow state.
4. Vault exports are produced after the fact, not consumed as input.

---

## Violation Signals

If any of the following are true, an authority rule has been violated:

- Canvas updates before the Kernel accepts the mutation.
- Two components disagree about the status of a task or tile.
- A task reaches `complete` without a `verification_passed` receipt.
- A State Card is a copy of the terminal log.
- A receipt is missing for a meaningful state transition.
- An MCP tool writes to SQLite directly.
- The Conductor stores its own canonical task list.
- A vault file is being used to drive workflow execution.
- A harness implementation leaks its type into the Kernel schema.
