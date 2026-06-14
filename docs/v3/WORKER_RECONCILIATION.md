# Worker Reconciliation Spec

> **Status: implemented in Goal 6A.** `kernel.worker.spawn` /
> `kernel.worker.status_update` / `kernel.worker.stop` make `worker_instances`
> the authoritative identity; the shell role-spawn + herdr status paths route
> through them; the minimal harness registry (`local-shell`, `herdr-shell`) +
> a default model are seeded; the State Card reflects Kernel worker status.
> Proof: `bun run smoke:worker-harness`. Conductor actions (5C) remain gated.

This spec binds the back half of v3 before Conductor actions begin.

Goal 6A owns the reconciliation. Goal 5A may read worker state, but Goal 5C/5D may not spawn, assign, or manage workers until this spec is implemented and verified.

## Current Gap

Goals 2-4 made these Kernel-owned:

- tiles
- tasks
- receipts
- State Cards

The live app still starts actual runtimes through shell-side role spawn, PTY/herdr, and legacy Envoy paths.

The specific dual-authority gap is:

```text
PTY/herdr session + Envoy record do not yet have a Kernel-owned WorkerInstance identity.
```

The `worker_instances` row must become the single identity that ties together:

- canvas tile
- role
- harness
- model
- PTY/herdr runtime id
- Envoy space id when present
- task ownership
- receipts
- State Card status

## Decision

Kernel spawn is authoritative.

Existing herdr, PTY, and Envoy behavior must be wrapped or bridged underneath Kernel worker commands. The Kernel must not merely mirror worker runtime state after the fact.

## Four Questions

### 1. Who Spawned This Worker?

`kernel.worker.spawn` is the spawn authority.

Required order:

```text
1. Write or reserve worker_instances row.
2. Set role_id, harness_id, model_id when known.
3. Set status='spawning'.
4. Delegate to the harness adapter.
5. Record runtime ids on the same row.
6. Emit Kernel events for worker/tile/state_card reconciliation.
```

The shell role-spawn path must call `kernel.worker.spawn` instead of calling `herdrSpawnRole` or PTY spawn directly.

### 2. Who Owns Its Status?

`worker_instances.status` is canonical.

Allowed statuses:

```text
spawning
active
idle
stopped
error
```

`kernel.worker.status_update` owns status changes.

Herdr/PTY status events must call the Kernel status command. Renderer badges and State Cards project from Kernel state.

### 3. How Does It Report Receipts?

Receipts flow through the Kernel receipt chain.

Harness adapters may collect draft receipts, but final writes are:

```text
kernel.receipt.post(worker_id, tile_id, task_id, ...)
```

Envoy can remain as a transport or legacy bridge only if its output is tied back to the Kernel worker/task/receipt identity.

### 4. How Does The Canvas Know?

The canvas already knows through the Goal 2/4 path:

```text
Kernel event -> renderer reconcile -> state_card.get
```

No new canvas authority should be introduced for worker status. Once spawn and status are Kernel-owned, State Cards should show live worker state without reading terminal logs.

## Minimal Harness Boundary

Goal 6A implements only the minimum registry needed to wrap shipped runtime paths:

- `local-shell`
- `herdr-shell`

Pi, Claude Code, Codex, remote containers, and richer adapter behavior remain later Goal 6 work unless explicitly approved.

## Acceptance

The proof must use the live-ish spawn path. It must not pre-seed worker rows.

Acceptance checks:

- A worker tile is spawned through `kernel.worker.spawn`.
- A `worker_instances` row exists with `tile_id`.
- `role_id`, `harness_id`, and `model_id` are populated when the source data exists.
- `herdr_pane_id` and/or `envoy_space_id` are recorded when present.
- Herdr/PTY status updates call `kernel.worker.status_update`.
- State Card reflects worker status from Kernel state.
- Task claim by tile/worker maps to the same `worker_instances` row.
- Closing/stopping a worker updates Kernel status and does not leave orphaned worker identity.

## Failure Signals

- Shell spawns workers directly and asks Kernel to mirror afterward.
- Worker status exists only in a renderer badge.
- Envoy task/receipt state competes with Kernel task/receipt state.
- Worker identity depends on display name.
- Harness, role, and model collapse into one field.
- The Conductor can spawn or assign workers before this spec is implemented.
