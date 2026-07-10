# Extensible Tooling Sketch — Deferred

This is not v7 implementation scope.
Do not implement this before:
1. the first AgentOS-backed Dock actor proof passes; and
2. at least two real adapters exist.

The capability schema and expanded layer taxonomy should be derived from real integrations,
not invented ahead of them.

> **Why deferred:** these are attractive abstractions that generalize from a sample size of
> zero adapters. Building them before a real second integration exists repeats the
> "generalize the door from one lane" mistake — here, from *no* lanes. Let the second real
> adapter reveal what the abstraction actually needs.

---

## Parked machinery (do NOT add to code yet)

Keep the following out of the codebase until the two preconditions above are met:
- `ToolCapability` union type
- `IntegrationCard` type
- the 10-slot layer registry
- plugin marketplace / generic adapter discovery

They are recorded here as *future shapes*, not specifications.

### Sketch: capability union (future shape only)

```ts
// FUTURE SHAPE — not v7. Derive the real set from actual adapters.
type ToolCapability =
  | "spawn_actor"
  | "run_terminal"
  | "run_workflow"
  | "schedule_task"
  | "call_tool"
  | "stream_events"
  | "store_artifact"
  | "evaluate_output"
  | "branch_context"
  | "inspect_runtime";
```

### Sketch: integration card (future shape only)

```ts
// FUTURE SHAPE — not v7. Note: the ownership fields below are asserted-as-literal in the
// original draft; a real schema should express these as checks, not frozen booleans.
type IntegrationCard = {
  id: string;
  name: string;
  layer:
    | "dock" | "kernel" | "runtime" | "agentos" | "protocol"
    | "tool" | "workflow" | "eval" | "canvas" | "artifact";
  capabilities: ToolCapability[];
  ownership: {
    ownsTruth: false;
    requiresKernelCommands: true;
    replacesAgentOS: false;
  };
  status: "core" | "adapter" | "sidecar" | "inspiration" | "deferred";
};
```

### Sketch: the 10-slot layer map (future shape only)

Start with **four load-bearing slots** in practice — Kernel (truth), RuntimeHandle
(execution lanes), Tool access (MCP/APIs), Canvas (projection) — and treat everything else
as deferred until a real tool forces a new slot. The full ten are recorded for reference:

1. Dock Surface — how users launch things
2. Kernel Truth — tiles, cables, receipts, approvals, artifacts, tasks
3. RuntimeHandle — normalized door into execution lanes
4. AgentOS-backed Actor — main live agent execution partner
5. Agent Session Protocol — ACP / session stream / events
6. Tool Access — MCP, APIs, browser, files, scrapers, data feeds
7. Workflow / Scheduler — durable steps, retries, timers, approvals
8. Evaluation / QA — scoring, verification, replay, regression tests
9. Canvas UX — visualization, branching, tiles, cable affordances
10. Artifact / Memory — reports, transcripts, logs, embeddings, Obsidian, SQLite

---

## Classification notes captured from prior discussion (reference, not commitments)

- **RivetKit Actors** — primitive: durable keyed actor runtime. Layer: AgentOS-backed actor
  substrate. Decision: use directly (this is core, already in v7).
- **ACP** — primitive: agent session communication/events. Layer: between RuntimeHandle and
  AgentOS session. Decision: protocol, not truth layer.
- **Restate** — primitive: durable workflow execution/retries/timers. Layer: future
  workflow/scheduler. Decision: candidate sidecar later; not the v7 actor path. Unproven.
- **Mastra** — primitive: agent/workflow framework, evals, tools, memory. Layer: future
  workflow/agent definition. Decision: candidate sidecar later. Integration unproven.
- **Manus Branch** — primitive: context/session branching. Layer: Kernel receipt lineage +
  canvas affordance. Decision: copy the concept natively ("Receipt Branch"); no dependency.
- **Vibecanvas** — primitive: agent-editable canvas/widgets. Layer: canvas inspiration only.
  Decision: do not drift toward a widget builder.

These are recorded reasoning, not adoption decisions. Re-run the Adoption Questions (in
`AGENTOS_RIVET_RUNTIME_FINDINGS.md`) against real code before treating any as committed.
