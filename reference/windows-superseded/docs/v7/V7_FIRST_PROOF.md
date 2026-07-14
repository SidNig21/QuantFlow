# V7 First Proof

> Governed by the AgentOS Anchor Principle in `AGENTOS_RIVET_RUNTIME_FINDINGS.md`.
> If anything here conflicts with the Anchor Principle, the Anchor Principle wins.

## What the first proof is NOT

The first v7 proof is **not** Mastra, Restate, Omnigent, Rivet Cloud, generic ACP-only
agents, multi-agent orchestration, or A2A cables.

## What the first proof IS

```text
Dock
→ Kernel
→ RuntimeHandle
→ AgentOS-backed RivetKit actor
→ AgentOS VM
→ ACP session
→ terminal tile
→ Kernel receipts
→ stop/sleep/reopen proof
```

**Proof name:** `dock-actor-agentos-echo`

## Precondition (gates everything below)

The Step 0 import audit in `AGENTOS_RIVET_RUNTIME_FINDINGS.md` must be filled in first. If
the branch is on raw `@rivet-dev/agentos-core`, resolve that (migrate to the RivetKit
`agentOs()` wrapper) **before** attempting this proof — durability is a property of the
package actually used, not a declared one.

## Acceptance Gate

The proof does not pass until all of the following are observed on-machine (receipts, not
assumptions):

1. One Dock recipe launches one actor.
2. Actor is keyed by `[workspaceId, tileId]`.
3. Runtime path uses the AgentOS-backed RivetKit actor wrapper (not raw `agentos-core`).
4. Terminal tile receives live output.
5. Kernel records milestone receipts (`agent.reply` before `turn.complete`).
6. Stop/sleep/reopen proves durable re-addressing by the same key.
7. Canvas does not own truth.
8. Runtime-local store does not become product truth.

## Why the scope stays narrow

Once this single path is real, every future tool has a place to attach (see the Extensible
Tooling Principle). Without it, every new tool becomes another architecture debate. Do not
widen this proof to earn coverage — widen the system only after this passes.
