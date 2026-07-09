# Dock Runtime Rework Spec

This is the working architecture spec for making the QuantFlow Dock launch real collaborative runtime actors. It deliberately ignores saved recipes until singular Dock actors work end to end.

## Goal

Make one Dock Card launch one real actor that QuantFlow can prove is alive, address through one RuntimeHandle, and project onto the canvas from Kernel truth.

The first product proof is not "a tile appears." The proof is:

1. Operator clicks a Dock Card.
2. Kernel records the actor launch intent.
3. Canvas projects a tile from Kernel truth.
4. Runtime launcher starts or attaches the backing runtime.
5. QuantFlow proves the actor meets its readiness bar.
6. RuntimeHandle can deliver the next instruction.
7. Receipts/events prove what happened.

## Current Decisions

### D1. Dock Cards launch actors before recipes

The rework focuses on singular Actor Cards first. Recipe Cards are deferred until the operator has real workflows worth saving.

### D2. Agent and Worker readiness differ

Agents require a proven send/reply round trip before QuantFlow counts them alive. Workers require a trustworthy process-ready milestone.

### D3. Agent classification follows talkability

An actor is an Agent when it exposes a talkable model-backed participant. Its launch command does not decide the classification.

### D4. Eve agents are server-backed agents

Eve agents should canonically launch with `npm run dev` and be addressed through a server delivery adapter. `npm run chat` can remain temporary bridge plumbing but should not be the product model.

### D5. Kernel is the trusted ledger, not the runner

The Kernel records what QuantFlow officially believes. Electron main performs messy outside-world actions such as starting processes, writing to terminals, calling servers, opening sockets, and probing readiness. External products report facts to the Kernel; they do not become the source of QuantFlow truth.

### D6. Integrations must fit a product bucket

Every product or system added to QuantFlow must enter as exactly one primary bucket before implementation:

- Actor: works on the canvas
- Tool: can be called by an actor
- Runtime: place where work runs
- Export / Archive: receives proven outputs

No integration enters as a vague "cool product." It must have a job and must not bypass Kernel truth.

### D7. One actor gets one primary runtime binding

QuantFlow can support multiple runtime kinds, but a single live actor should have one primary Runtime Binding. A binding may internally use a substrate plus control layer, such as Herdr managing WSL panes, but WSL, Herdr, AgentOS, PTY, and server adapters must not compete to own the same tile.

### D8. AgentOS is the preferred Agent runtime, not the whole product

For model-backed Agents, AgentOS is the preferred long-term runtime when the actor can run inside AgentOS cleanly. This does not make AgentOS the QuantFlow Kernel or the whole product. QuantFlow still owns product truth; AgentOS owns the isolated agent session internals.

### D9. Eve and Mastra are Agent Framework candidates

Eve and Mastra should be evaluated as ways to define useful agents and multi-agent behavior. They are not automatically runtimes and they do not own QuantFlow truth. When possible, a custom Eve or Mastra agent may be hosted inside AgentOS; if not, it can run behind its own adapter as long as it still satisfies the Agent readiness bar.

### D10. Mastra is parked for this rework

Mastra is intentionally out of scope for the Dock Runtime rework. The focused stack is QuantFlow + Eve + AgentOS + Rivet Actors.

### D11. Eve, AgentOS, and Rivet each own a different layer

The preferred stack is:

```text
QuantFlow = product, canvas, Kernel truth, receipts
Eve = custom agent authoring framework
AgentOS = talkable agent runtime/session VM
Rivet Actors = durable actor supervision/state/workflow infrastructure
```

They are complementary only if each stays in its layer.

### D12. Prove AgentOS before adapting Eve

The proof order is:

```text
1. Plain AgentOS proof
2. Eve-through-AgentOS proof
3. Dock Card through AgentOS proof
4. Rivet TileActor supervision later
```

This avoids collapsing AgentOS runtime problems, Eve packaging problems, and QuantFlow bridge problems into one undiagnosable failure.

## Plain Mental Model

```text
Dock = what the operator wants
Electron main = does the messy real-world action
Kernel = what QuantFlow officially believes
Canvas = what the operator sees
RuntimeHandle = how QuantFlow talks to the actor
Receipt = proof something happened
```

## Canonical Actor Types

### Agent

A talkable model-backed actor. Examples:

- Codex
- Claude
- Hermes
- Eve agents such as Bovada Odds and Canvas Scout

Alive means QuantFlow has proven:

```text
launch or attach succeeded
delivery adapter exists
send probe succeeded
reply captured
receipt/event recorded
```

The Agent/Worker split is the first classification. Runtime selection comes after that. Do not classify an actor by whether it happens to launch through PTY, WSL, AgentOS, Eve server, or another substrate.

### Worker

An executable actor that runs scripts, reports, automations, servers, or long-lived process work without needing conversational reply. Examples:

- Shell
- Python script
- PufferLib training process
- scraper
- report generator
- Eve infrastructure process only when it is not itself the talkable actor

Alive means QuantFlow has proven:

```text
launch or attach succeeded
process-ready milestone observed
receipt/event recorded
```

## Runtime Doctrine

Runtime means "where the actor's work actually runs." Runtime does not mean "what the actor is" and does not mean "who owns truth."

The runtime question is always downstream from the actor question:

```text
What is this Dock Card?
  -> Agent or Worker?

What proof does it need before alive?
  -> Agent: send/reply
  -> Worker: process-ready

Which runtime can provide that proof cleanly?
  -> choose runtime binding
```

### Runtime Binding Shape

Every live actor gets one primary Runtime Binding:

```text
actorId
actorType: agent | worker
primaryRuntimeKind
executionSubstrate
controlLayer
displayRail
deliveryAdapter
readinessProbe
ephemeralIds
lastReadinessResult
```

This lets QuantFlow describe layered cases without pretending every layer is the owner.

Examples:

```text
Herdr-managed shell worker
  actorType: worker
  primaryRuntimeKind: herdr-wsl
  executionSubstrate: wsl
  controlLayer: herdr
  displayRail: xterm
  deliveryAdapter: herdr-pane
  readinessProbe: prompt/process-ready

Eve Bovada Odds
  actorType: agent
  primaryRuntimeKind: eve-server
  executionSubstrate: local node process
  controlLayer: electron-main launcher
  displayRail: logs/status tile
  deliveryAdapter: eve-server adapter
  readinessProbe: server health + send/reply

AgentOS Pi/Hermes candidate
  actorType: agent
  primaryRuntimeKind: agentos-vm
  executionSubstrate: agentOS virtual machine
  controlLayer: agentOS client/sidecar
  displayRail: terminal projection or session event view
  deliveryAdapter: agentOS session API
  readinessProbe: createSession + send/reply
```

### Runtime Kinds Under Evaluation

#### Windows PTY / Node PTY

The inherited Collaborator runtime model is terminal-first: a tile is backed by a persistent PTY session. This is a good fit for local CLIs and operator-visible terminals, but it is a weak abstraction for model-backed actors unless QuantFlow adds readiness probes, delivery adapters, and receipts on top.

#### WSL

WSL is an execution substrate, not a complete QuantFlow runtime by itself. It answers "where can Linux commands run?" It does not answer "how do we supervise a tile-bound actor?" or "how do we prove a model reply?"

#### Herdr

Herdr is a control layer over terminal/pane work, effectively a multiplexer/supervisor for WSL-style execution. It can be the primary runtime binding for shell-like workers when QuantFlow addresses the actor through Herdr pane ids. It should not own Kernel truth.

#### Eve Server

Eve agents are server-backed agents. Their canonical launch is `npm run dev`; QuantFlow should talk to the running Eve service through a delivery adapter. Terminal chat shims such as `npm run chat` are temporary bridge plumbing.

#### AgentOS

AgentOS is a serious candidate runtime for model-backed Agents. Its docs describe an isolated VM with virtual filesystem, process table, pipes, PTYs, permission policy, ACP sessions, transcript persistence, bindings, approvals, and session events. For QuantFlow, this means AgentOS can own the *inside of the agent runtime* while QuantFlow Kernel still owns product truth.

AgentOS should enter as:

```text
primaryRuntimeKind: agentos-vm
deliveryAdapter: agentOS session API
readinessProbe: createSession + sendPrompt + reply/sessionEvent
truthOwner: QuantFlow Kernel
```

Important implications:

- AgentOS has its own internal kernel, but that is not the QuantFlow Kernel.
- AgentOS VM state and transcripts are runtime evidence, not canonical QuantFlow truth.
- AgentOS bindings could expose QuantFlow tools to the agent as VM commands, but each binding must still report back through QuantFlow receipts/events.
- AgentOS agent-to-agent communication through bindings is interesting, but QuantFlow cables should remain the product-level relationship until deliberately replaced.

Preferred use:

```text
Dock Agent Card
  -> QuantFlow Kernel records launch intent
  -> Electron main asks AgentOS to get/create VM and create session
  -> AgentOS sidecar/kernel owns VM isolation, adapter, session events, transcript
  -> RuntimeHandle sends prompts through AgentOS session API
  -> QuantFlow Kernel records alive/reply/receipt truth
```

AgentOS is especially attractive because its session docs describe long-lived conversations, persisted transcripts, session events, lazy resume, crash handling, and bounded restart. Its bindings docs also describe host JavaScript functions exposed as in-VM CLI tools, which could become a clean way to expose QuantFlow-approved tools to agents without giving agents raw host access.

#### Rivet Actors

Rivet Actors are a candidate supervision/stateful backend layer, not the same thing as AgentOS. Their docs describe durable actor state, ephemeral actor vars, SQLite, queues, workflows, realtime events, lifecycle hooks, and Cloudflare/server deployment. For QuantFlow, this maps more naturally to a future TileActor supervisor than to the first Dock launch runtime.

Rivet should enter, if at all, as:

```text
bucket: Runtime/Supervision Infrastructure
possible role: durable TileActor host
not role: immediate Kernel replacement
```

The AgentOS workflow docs show the intended partnership: a durable RivetKit workflow actor can drive a separate AgentOS VM actor through the actor client. Each workflow step is recorded, retried, and resumed independently, while the AgentOS session is created inside the step that needs it. This is the likely long-term shape for QuantFlow recipes and autonomous work, but not the first singular Dock Card proof.

#### Eve

Eve is an Agent Framework candidate for custom domain agents. The ideal path is to run Eve agents inside AgentOS if AgentOS can host the Eve runtime and expose a clean prompt/reply contract. If that is not practical immediately, Eve remains a server-backed Agent behind an Eve delivery adapter, with `npm run dev` as canonical launch and `npm run chat` only as bridge plumbing.

Eve's docs describe a filesystem-first framework for durable backend AI agents. Agents are defined from files under `agent/`, with instructions, an `agent.ts` model definition, tools under `agent/tools/`, durable sessions, streaming output, and Vercel-backed workflows/sandbox/gateway/observability. For QuantFlow, Eve should define custom agent behavior; it should not replace the QuantFlow Kernel or Dock.

Eve-to-AgentOS possibilities:

```text
Path A: Eve service adapter
  QuantFlow launches `npm run dev`
  Eve runs as its own server
  RuntimeHandle talks to `/eve/v1/session`
  Good near-term path

Path B: Eve as AgentOS custom software
  Eve agent is packaged behind an ACP adapter
  AgentOS createSession launches it as custom software
  RuntimeHandle talks through AgentOS sendPrompt/sessionEvent
  Preferred long-term if practical
```

#### Mastra

Mastra is parked for this rework.

Mastra fit:

```text
status: parked
reason: reduce stack surface until Eve + AgentOS + Rivet Actors are understood and proven
```

## Preferred Long-Term Stack Shape

```text
Dock Card
  -> QuantFlow Kernel records launch intent
  -> TileActor supervisor is created or resumed
  -> TileActor starts AgentOS VM/session for talkable Agents
  -> AgentOS hosts packaged agent software
  -> Eve package may provide custom agent behavior
  -> RuntimeHandle sends prompt through AgentOS
  -> AgentOS session events stream back
  -> Kernel records receipts, state, artifacts, and readiness truth
  -> Canvas projects Kernel truth
```

Near-term proof can skip Rivet Actors and use Electron main as the supervisor, but the interfaces should be shaped so a future Rivet TileActor can replace that supervision layer without changing Dock, Kernel, Canvas, or RuntimeHandle semantics.

## Backend Shape

The Dock is an intent selector, not a process spawner.

The Kernel is the authority and ledger. It records what QuantFlow believes is true, but it does not personally run Codex, Claude, Eve, WSL, PTYs, scripts, or servers. Electron main performs those side effects, then reports milestones back for the Kernel to accept or reject.

```text
Dock Card
  -> Actor Registry
  -> Kernel launch command
  -> Runtime Launcher
  -> Tile + Worker/Actor binding
  -> Readiness Probe
  -> RuntimeHandle binding
  -> Receipt/Event chain
  -> Canvas projection
```

## Required Backend Contracts

### Actor Registry

The Actor Registry defines what each Dock Card means:

- actor id
- display name
- actor type: agent or worker
- launch profile
- runtime target
- delivery adapter
- readiness bar
- default cwd policy
- optional model/provider hint

The registry must not contain live functions that cross renderer IPC.

### Launch Profile

The Launch Profile defines how the backing process or service starts:

- command
- args or command template
- cwd
- environment
- runtime target
- attach target when reconnecting

Launch Profile answers: "How do I start or attach the thing?"

### Delivery Adapter

The Delivery Adapter defines how QuantFlow talks to the actor after it is alive:

- native TUI adapter for Codex and Claude
- AgentOS adapter for AgentOS actors
- server adapter for Eve agents
- PTY/Herdr adapter for plain terminal workers

Delivery Adapter answers: "How do I send intent and observe result?"

### Readiness Probe

The Readiness Probe proves an actor is usable:

- agent probe: send a small instruction and capture a reply
- worker probe: observe process-ready signal, server health, prompt, port, or declared milestone

Readiness Probe answers: "Can QuantFlow rely on this actor right now?"

### RuntimeHandle

RuntimeHandle is the single delivery door for live tile-bound actors. All collaborative send/reply paths must go through it instead of leaking direct PTY writes, server calls, or adapter objects upward.

### Runtime Binding

Runtime Binding records the concrete runtime path for one tile-bound actor:

- actor id
- actor type
- primary runtime kind
- display rail, when different from execution
- delivery adapter
- readiness probe
- ephemeral ids
- last readiness result

Examples:

```text
Codex
  primary runtime: windows-pty
  display rail: terminal xterm
  delivery adapter: native TUI
  readiness: send/reply probe

Bovada Odds
  primary runtime: eve-server
  display rail: terminal logs or service status
  delivery adapter: Eve server HTTP/WebSocket adapter
  readiness: server health + send/reply probe

Herdr shell worker
  primary runtime: herdr-wsl
  substrate: WSL
  control layer: Herdr
  display rail: terminal xterm
  delivery adapter: pane send/read
  readiness: prompt or process-ready milestone

AgentOS actor
  primary runtime: agentos
  display rail: terminal projection
  delivery adapter: AgentOS prompt/session API
  readiness: session health + send/reply probe
```

## Cleanup & Deletion Targets

Folded in from the retired `docs/v6/STACK_REDUCTION_LADDER.md` (2026-07-09). These are the "re-wall the existing code" obligations that ride alongside the runtime proofs. Each is **proof-gated**: do not delete a path until a pinned Runtime Binding makes it unreachable (routing discipline from `docs/plans/2026-07-07-001-architecture-layer-routing-plan.md`).

- **Rebuild RuntimeHandle as the single delivery door.** It does not currently exist in code — the cable dispatcher (`tile-relay-dispatcher.ts`) still uses inline per-lane logic (`delegateHerdr`/`delegateWindowsPty`/`delegateAgentOs`). Rebuild it fresh against this spec so it also fronts the AgentOS session API and the Eve server adapter, not just the three legacy lanes. (An earlier draft `runtime-handle.ts` was dropped at `c85394f`; do not resurrect it — the spec's contract is richer.)
- **Remove `legacyRuntimeTarget` fields and silent spawn fallbacks** once a runtime is pinned by proof. A chat Agent tile must never quietly fall back to AgentOS via a fallback field (routing plan KD5). One actor, one primary binding (D7).
- **Demote `runtime-state/` to derived-only.** No feature may read it as the first source for canonical tiles/tasks/connections/artifacts/events. Keep `pty-sessions-repo` and diagnostics as operational stores only. Kernel + receipts own truth (D5).
- **`tile-session-registry` is a projection cache of Kernel truth**, never a second authoritative graph.
- **Legibility sweep:** archive stale docs per `DOC_AUTHORITY_MAP.md`, quarantine dead files to `reference/`, keep `REPO_MAP.md` current — the non-developer founder must be able to navigate the tree from the map alone.

## Non-Goals For This Phase

- Saved recipes
- Temporal-style scheduler
- complex task graph compiler
- autonomous multi-step loops
- recipe versioning
- generalized workflow marketplace

These are parked until singular Actor Cards work collaboratively.

## First Proof Target

The first proof target is not a Dock Card yet. It is a plain AgentOS runtime proof:

```text
Start AgentOS host/registry
  -> create/get VM actor
  -> create session with built-in software
  -> subscribe to session events
  -> send prompt
  -> capture reply
  -> close or persist session intentionally
  -> record exact runtime ids and result
```

After that, the first Dock proof target should be one singular Agent Card:

```text
Click Bovada Odds
  -> tile appears from Kernel truth
  -> AgentOS creates session for Eve-backed custom agent if adaptation is ready
  -> otherwise `npm run dev` starts the Eve service as an interim adapter
  -> readiness is observed
  -> RuntimeHandle sends a probe
  -> model-backed reply returns
  -> RuntimeHandle can send the next operator message
  -> receipt/event proves the round trip
```

This proof is better than starting with recipes because it validates the hardest runtime contract directly.

## Proof Ladder

### P0. AgentOS Standalone

Purpose: prove AgentOS works on this machine without QuantFlow complexity.

Status: passed manually on 2026-07-09.

Credential route:

```text
preferred credential: OPENCODE_GO_API_KEY or OPENCODE_API_KEY
preferred software: pi
provider route: OpenCode Go through Pi custom provider config
model: AGENTOS_MODEL=glm-5.1 when matching the operator's Eve/OpenCode Go setup
fallback credentials: OPENROUTER_API_KEY, then ANTHROPIC_API_KEY
```

The official AgentOS docs show Pi examples with `ANTHROPIC_API_KEY` passed into `createSession`. QuantFlow's local `tools/agentos-host` already extends this by writing Pi provider config for OpenCode Go/Zen when an OpenCode key is present.

Acceptance:

- AgentOS registry starts.
- A VM actor is created or found.
- A built-in agent session starts.
- `sendPrompt` returns meaningful text.
- `sessionEvent` stream shows activity.
- Session close/persist behavior is understood.
- Failure output distinguishes host startup, missing credential, and model/provider error.

Operator note:

- On Windows, `127.0.0.1:7430` may fail if localhost mirroring does not expose the WSL listener. The host binds `0.0.0.0`; use the WSL IP from `wsl -e bash -lc "hostname -I | awk '{print $1}'"` as the manual fallback.

Manual result:

```text
PowerShell base URL: http://172.22.214.38:7430
/health -> {"ok":true,"hasCredential":true}
POST /session {"software":"pi"} -> sessionId=a88cbfea-6d55-458f-9698-b3ea4aea7d8e, software=pi
POST /session/:id/prompt "Reply with exactly: agentos-p0-ok" -> ok=true, text=agentos-p0-ok
```

### P1. AgentOS Runtime Adapter

Purpose: prove QuantFlow can call AgentOS through one adapter.

Status: partially passed manually on 2026-07-09.

Acceptance:

- Electron main can start or connect to AgentOS.
- Runtime Binding records AgentOS actor/session ids.
- RuntimeHandle can send one prompt through AgentOS.
- Reply is captured.
- Kernel records readiness and receipt truth.

Passed so far:

- P1a transport prompt reply: QuantFlow's HTTP transport created an AgentOS `pi` session and returned the model reply text from `/session/:id/prompt`.
- P1b harness receipt drafts: QuantFlow's AgentOS harness sent a prompt, captured the returned reply text, and surfaced it as `metadata.milestone = agent.reply` before `turn.complete`.
- P1c Kernel receipt posting, unit proof: Electron main's AgentOS run driver posts the `agent.reply` harness draft through `kernel.receipt.post` in order before `turn.complete`.

Manual result:

```text
transport session: a7e927f1-5822-496a-b646-6e41d0e76c87
transport prompt: "Reply with exactly: agentos-p1-adapter-ok"
transport reply: {"text":"agentos-p1-adapter-ok","response":{"id":3,"jsonrpc":"2.0","result":{"stopReason":"end_turn"}}}

harness live session: c2b5c88e-232a-4f91-ae4a-bac0ddf87503
harness prompt: "Reply with exactly: agentos-p1-receipt-ok"
harness state: {"status":"active","lastMeaningfulUpdate":"c2b5c88e-232a-4f91-ae4a-bac0ddf87503","blocker":null}
harness drafts: task_started:session.start | progress:agent.reply:agentos-p1-receipt-ok | progress:transcript.summary | task_completed:turn.complete
```

Remaining:

- P1d Kernel receipt posting, live app proof: run the real app path against a real tile/worker row and query Kernel receipts afterward.
- P1e Runtime Binding: store the AgentOS session id on the tile/actor binding so future sends address the same session through one RuntimeHandle door.
- P1f Electron main lifecycle: prove app startup can connect/start AgentOS without blocking boot.

### P2. Eve Through AgentOS

Purpose: prove an Eve-defined agent can run as or behind AgentOS custom software.

Acceptance:

- Eve agent package or ACP adapter is registered as AgentOS software.
- AgentOS `createSession` can launch it.
- RuntimeHandle sends a prompt through AgentOS.
- Eve-backed reply returns.
- Failure mode clearly distinguishes Eve package, AgentOS runtime, and QuantFlow adapter errors.

### P3. Dock Agent Card

Purpose: prove operator-visible QuantFlow value.

Acceptance:

- Click one Agent Card.
- Tile appears from Kernel truth.
- Actor becomes alive only after send/reply proof.
- Canvas shows status from Kernel projection.
- Receipt proves the round trip.

## Open Grills

### G1. Who owns launch orchestration?

Candidates:

- Kernel command handler owns the whole launch.
- Electron main runtime launcher owns launch after Kernel records intent.
- A TileActor owns launch after Kernel creates a tile.

### G2. What is the minimum Kernel state for a launched actor?

Candidates:

- tile only
- tile plus worker row
- tile plus actor instance plus runtime binding

### G3. Should readiness be a Kernel status or a runtime mirror?

Candidates:

- Kernel stores readiness as actor truth.
- Runtime mirror stores readiness, Kernel stores only receipts.
- Kernel stores coarse lifecycle, runtime mirror stores ephemeral details.

### G4. What should fail when readiness fails?

Candidates:

- tile remains with error state
- tile auto-removes
- tile remains as stopped actor with restart action

### G5. What is the exact RuntimeHandle shape for server-backed Eve?

Candidates:

- HTTP request/response
- WebSocket/SSE session
- MCP/tool adapter
- terminal shim only as temporary fallback

### G6. Should AgentOS eventually host most talkable model-backed agents?

Candidates:

- Yes, AgentOS becomes the preferred Agent runtime when it can prove Codex/Claude/Eve/Mastra-class agents reliably.
- No, AgentOS remains optional for specific Agent types while PTY/Eve server stay first-class.
- Hybrid: AgentOS is preferred for isolated/capability-controlled agents, while local native CLIs and Eve server keep their natural runtimes.

### G7. Should Rivet Actors become the TileActor implementation?

Candidates:

- Yes, one Rivet actor per QuantFlow tile-bound actor.
- No, keep TileActor local in Electron main for now.
- Later, after Dock launch and RuntimeHandle are stable.
