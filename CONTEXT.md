# QuantFlow Runtime Context

QuantFlow is a canvas runtime for visible, coordinated, and provable agent work. This glossary defines the runtime language used when discussing how the Dock launches real work.

## Language

**Dock Card**:
A selectable Dock entry that starts either one actor or one saved recipe. It captures operator intent but does not itself own runtime truth.
_Avoid_: Button, menu item

**Actor Card**:
A Dock Card that starts one real participant on the canvas. Agent cards and worker cards are both actor cards, but they have different readiness bars.
_Avoid_: Agent button, tile button

**Recipe Card**:
A Dock Card that starts a saved multi-tile mission. A recipe declares actors, cables, tasks, and initial intent before the runtime turns them into a run.
_Avoid_: Template button, macro

**Agent**:
An actor backed by a talkable model or chat loop that can receive an instruction and produce a meaningful reply through a RuntimeHandle. An agent is classified by talkability, not by whether its launch command looks like a server, terminal, or script.
_Avoid_: Any terminal process, worker, model alone

**Worker**:
An actor that runs scripts, reports, servers, automations, or long-running process work without needing a conversational reply loop. A worker is alive after a trustworthy process-ready milestone.
_Avoid_: Dumb agent

**Server-Backed Agent**:
An agent whose launch command starts a service, such as an Eve dev server, while QuantFlow talks to it through a delivery adapter instead of typing into the process terminal.
_Avoid_: Worker, dev server only

**RuntimeHandle**:
The single delivery door used to send messages to a live tile-bound actor, regardless of whether the backing runtime is AgentOS, Windows PTY, or Herdr WSL.
_Avoid_: Direct PTY write, adapter object

**Runtime**:
The place or substrate where an actor actually runs, such as Windows PTY, WSL, Herdr-managed WSL, AgentOS, a sandbox, or an Eve server process. A runtime provides execution; it does not own QuantFlow truth.
_Avoid_: Kernel, product integration, truth owner

**Agent Runtime**:
A runtime that can host a long-lived talkable agent session with prompts, replies, events, isolation, and resumable state. AgentOS is the preferred candidate for this role when an actor can run inside it cleanly.
_Avoid_: Terminal only, process runner

**Agent Framework**:
A toolkit for defining an agent's behavior, tools, model choices, memory, or coordination pattern. Eve and Mastra can create useful agents, but they are not automatically the QuantFlow runtime or truth owner.
_Avoid_: Runtime, Kernel

**Agent Package**:
A packaged definition of an agent that can be launched by an Agent Runtime. For AgentOS this means software that speaks ACP directly or through an ACP adapter; for Eve this means the filesystem-first `agent/` project that defines instructions, tools, runtime config, and sessions.
_Avoid_: Dock Card, runtime, product

**TileActor**:
The durable supervisor for one QuantFlow tile-bound actor. A TileActor may eventually be implemented with Rivet Actors, while the talkable agent session inside it may run through AgentOS.
_Avoid_: Canvas tile, AgentOS session, Kernel

**Runtime Binding**:
The recorded relationship between one live tile-bound actor and its primary runtime, delivery adapter, readiness probe, and ephemeral ids such as PTY session id, Herdr pane id, AgentOS session id, or server URL.
_Avoid_: Stacked runtimes, hidden session state

**Readiness Bar**:
The proof required before QuantFlow treats an actor as alive. Agents require a send/reply round trip; workers require a process-ready milestone.
_Avoid_: Spawned, open

**Runtime Truth**:
The authoritative state committed by the Kernel. The Dock and Canvas project this truth but do not create their own competing truth.
_Avoid_: UI state, local state

**Kernel**:
The internal authority that records what QuantFlow believes is true: actors, tiles, tasks, connections, status, receipts, and artifacts. It is not the Dock, not the Canvas, and not the thing that runs processes; it is the rulebook and ledger that decides what the app can trust.
_Avoid_: UI, backend product, process runner
