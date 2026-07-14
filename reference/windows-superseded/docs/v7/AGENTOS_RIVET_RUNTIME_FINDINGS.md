# AgentOS Anchor Principle

> **BINDING — read before any v7 implementation. This governs everything below it.**

QuantFlow is the visual governed control plane; AgentOS is the execution partner; RivetKit Actors durable-ize AgentOS; ACP talks to AgentOS sessions; the Kernel records product truth.

## Binding Rule

AgentOS is QuantFlow's primary execution layer.
Nothing replaces AgentOS in the v7 actor path. Other systems may only work:
- inside AgentOS,
- alongside AgentOS,
- behind the RuntimeHandle,
- or as deferred future sidecars.

The Kernel remains the source of product truth. AgentOS/RivetKit owns runtime substrate truth only: process/session lifecycle, actor keying, sleep/wake, queues, AgentOS VM state, transcript persistence, and runtime-local data.
Canvas remains projection. Dock remains spawn surface.

## Package Precondition

This architecture requires the RivetKit-wrapped AgentOS actor package.
`@rivet-dev/agentos-core` alone does **not** satisfy the v7 durability requirement.
If `tools/agentos-host` imports `AgentOs` from `@rivet-dev/agentos-core` and creates the VM directly, that is a raw AgentOS VM bridge, not a durable actor-backed AgentOS runtime.
The v7 actor path must use the RivetKit AgentOS actor wrapper:

```ts
agentOs()
```

...or the current equivalent package/API for an AgentOS-backed RivetKit actor.

Durability is not a declared property. It must be provided by the package actually used.

## Correct Stack

```text
QF Dock
  → Kernel dock.spawn command
  → RuntimeHandle
  → AgentOS-backed RivetKit actor
       durability, keying, lifecycle, queues, workflows, sleep/wake
  → AgentOS VM
  → ACP session
  → terminal tile / xterm stream
  → Kernel milestone receipts
  → Canvas projection
```

The "AgentOS-backed RivetKit actor" is **one** runtime component, not two. Do not build a
separate "AgentOS Actor Runtime" plus "RivetKit wrapper" as distinct systems — `agentOs()`
*is* the RivetKit actor.

## Keying Rule

Each launched AgentOS-backed actor is addressed by a compound actor key:

```text
[workspaceId, tileId]
```

The actor key is the durable runtime door.
The Kernel stores the product meaning of the tile/session. The actor key stores how the
runtime is re-addressed.

## v7 First Proof

The first v7 proof is one AgentOS-backed actor launched from the Dock end-to-end.

```text
Dock recipe
→ Kernel dock.spawn
→ RuntimeHandle
→ getOrCreate([workspaceId, tileId])
→ AgentOS-backed RivetKit actor
→ AgentOS VM/session
→ ACP events
→ terminal tile
→ Kernel milestone receipts
→ stop/sleep/reopen proof
```

## Explicitly Deferred

Do not introduce these into the first v7 proof:
- Mastra
- Restate
- Omnigent
- Rivet Cloud
- generic ACP-only agents
- multi-agent orchestration
- A2A cables
- workflow runners
- cloud deployment
- widget builder behavior

Mastra, Restate, and Omnigent are **candidate future sidecars only**. Their AgentOS
integration is **unproven** and must not be assumed.

## Acceptance Gate

The v7 proof does not pass until:
1. the runtime path uses the AgentOS-backed RivetKit actor wrapper, not raw `agentos-core`;
2. one Dock recipe launches one actor;
3. the actor is keyed by `[workspaceId, tileId]`;
4. the terminal tile receives live output;
5. the Kernel records milestone receipts;
6. the actor can stop/sleep and be re-addressed by the same key;
7. no canvas state or runtime-local store becomes product truth.

## Instruction to Cursor/Claude

```text id="cursor-instruction"
Add the AgentOS Anchor Principle to the top of the relevant v7 findings/architecture doc before implementation.
Do not infer new layers.
Do not build a separate "AgentOS Actor Runtime" plus "RivetKit wrapper" as two systems. The AgentOS-backed RivetKit actor is one runtime component.
First task is the package/import audit:
- find every AgentOS import
- identify whether it uses @rivet-dev/agentos-core or the RivetKit agentOs() wrapper
- report whether the current branch satisfies the Anchor Principle
- do not implement further until that fact is documented
```

---

# Extensible Tooling Principle (Post-v7)

QuantFlow must be able to leverage new tools quickly without turning the system into a pile of overlapping runtimes.
AgentOS remains the primary execution partner for live actor work. RivetKit Actors durable-ize that execution. ACP talks to AgentOS sessions. The Kernel owns product truth. The Dock owns launch. The Canvas owns projection.

The correct rule is not:
> Everything must be AgentOS.

The correct rule is:
> Everything must enter QuantFlow through the correct layer.

New tools may be incorporated only when they strengthen one layer without duplicating another.

A tool may work:
- inside AgentOS,
- alongside AgentOS,
- behind RuntimeHandle,
- through Tool/MCP/API access,
- as an evaluation or QA sidecar,
- as a data/artifact provider,
- as a Canvas interaction idea,
- or as inspiration only.

A tool may not:
- replace AgentOS in the v7 actor path,
- bypass Kernel commands,
- mutate Canvas state directly,
- create a second task/receipt truth,
- create a second Dock,
- create a hidden graph that disagrees with Kernel,
- add a tool-specific receipt ledger,
- duplicate an existing core responsibility,
- or force cloud/external infrastructure into the local-first proof.

## Sacred Cohesion Line

Tools can extend QuantFlow, but they cannot create a second QuantFlow inside QuantFlow.

## Adoption Questions

For every new tool, ask:
1. What primitive does it provide?
2. Which QuantFlow layer owns that primitive?
3. Does QuantFlow already own this responsibility?
4. Does AgentOS already cover this for live actor execution?
5. Does the tool belong inside AgentOS, beside AgentOS, above AgentOS, or below AgentOS?
6. Does this need to be a dependency, or is it just inspiration?
7. What proof would show it improves the system without creating duplicate truth?

## Actor Discipline

Actors are powerful, but actor is not the universal hammer.

Use AgentOS-backed RivetKit actors for:
- live agent sessions,
- stateful workers,
- terminal actors,
- browser workers,
- long-lived runtime identities,
- anything that needs sleep/wake/re-addressing.

Do not turn these into actors unless a real runtime need exists:
- static docs,
- one-off artifacts,
- simple report files,
- pure UI components,
- short calculations,
- read-only references,
- design inspiration.

Runtime substrate mechanics belong to actors. Product semantics belong to Kernel.

## v7 Boundary

This principle is post-v7 guidance. It must not change the first v7 proof.

The first v7 proof remains:

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

Do not implement an integration taxonomy, capability registry, plugin marketplace, or generic adapter framework before the first proof passes. The expanded machinery lives in `EXTENSIBLE_TOOLING_SKETCH.md` and stays deferred.

---

# Product Loop Principle / Whole-App Cohesion Challenge

> **RESERVED — not yet written.** This section is intentionally a placeholder so the doctrine
> ordering (Anchor → Extensible Tooling → Product Loop → Findings) is fixed in the doc.
> Product Loop answers *why the app exists* — the operator loop Dock/Canvas must prove — and
> will be filled in before it gates any implementation. Its absence does not block the v7
> first proof.

---

# AgentOS + Rivet Actors → QuantFlow Runtime Findings

**Purpose:** Map what the AgentOS and Rivet Actor docs actually say to the specific
QuantFlow Dock/runtime problems (P1d–P3, RuntimeHandle, cleanup, plug-and-play Dock).
Compiled from a crawl of the official docs on 2026-07-09.

**Sources crawled (primary):**
- Architecture overview — https://agentos-sdk.dev/docs/architecture
- Persistence & Sleep — https://agentos-sdk.dev/docs/persistence
- Bindings — https://agentos-sdk.dev/docs/bindings
- Workflows — https://agentos-sdk.dev/docs/workflows
- Actor Keys — https://rivet.dev/docs/actors/keys
- Rivet docs index (llms.txt/full + `.md` per page) — https://rivet.dev/docs/general/docs-for-llms

> Confidence tags used below: **[verified]** = stated directly in a doc I read;
> **[inferred]** = my reasoning from verified facts; **[unverified]** = plausible but not
> confirmed, needs a check in Cursor.

---

## 0. The single most important finding (check this first in P1d)

**AgentOS ships as two different packages with different durability guarantees.** [verified]

| Package | Entry point | Durable? | Re-addressable? |
| --- | --- | --- | --- |
| `@rivet-dev/agentos-core` | `AgentOs.create()` | **No** — raw VM only | No |
| `@rivet-dev/agentos` | `agentOS()` (wraps VM in a Rivet Actor) | **Yes** — filesystem + sessions + events persist | Yes, by key |

The `agentOS()` actor wraps the raw VM in a Rivet Actor, which is what adds durable
state, cron, and workflows out of the box. The bare core package is a raw VM with no
persistence. [verified]

**Why this reframes P1d → P1e:** The handoff says P1e is needed "only if P1d shows the
same AgentOS session cannot be addressed again." But whether it *can* be re-addressed is
mostly a function of **which package `tools/agentos-host` initializes**, not a limitation
of AgentOS. [inferred]

**Action for P1d:** Before concluding "the session can't be re-addressed," confirm which
entry point the host uses. If it's `AgentOs.create()` (core), non-addressability is
*expected* and the fix is to move to `agentOS()` — not to invent a session-id persistence
layer. This may collapse the original P1e task entirely.

---

## Step 0 Import Audit Result

> **TO BE FILLED IN AT THE MACHINE — do not leave implied.** Run the greps below against the
> branch, read what `tools/agentos-host` actually imports, and record the verdict here before
> any v7 implementation.
>
> ```bash
> grep -R "agentos-core\|agent-os-core\|agentOs\|AgentOs" -n .
> grep -R "@rivet-dev/agentos" -n .
> grep -R "rivetkit/agent-os" -n .
> ```
>
> **Verdict (fill one):**
> - [x] **RAW BRIDGE** — imports `AgentOs` from `@rivet-dev/agentos-core` and creates the VM
>   directly → does **not** satisfy the Anchor Principle package precondition. Durability =
>   real migration work, not a config flip.
> - [ ] **DURABLE ACTOR** — uses `agentOs()` / the RivetKit AgentOS actor wrapper → satisfies
>   the precondition. Proceed to the v7 first proof.
>
> **Files/lines found:**
>
> ```text
> tools/agentos-host/host.js:8    import { AgentOs, toolKit, hostTool, nodeModulesMount } from "@rivet-dev/agentos-core";
> tools/agentos-host/host.js:237  vmInitPromise = AgentOs.create({   <- raw-VM factory, the exact RAW BRIDGE pattern
> tools/agentos-host/package.json "@rivet-dev/agentos-core": "0.2.4" (durable "@rivet-dev/agentos" NOT present)
> ```
>
> The SDK import surface is confined to `tools/agentos-host` — the Electron side
> (`src/harness/agentos/transport.ts`) deliberately depends on an interface only, so the
> migration blast radius is the host package alone. The durable wrapper package
> `@rivet-dev/agentos` is confirmed real on the npm registry at **v0.2.7** (core's latest is
> also 0.2.7; the host is on core 0.2.4).
>
> **Consequence:** P1e = migrate `tools/agentos-host` to `agentOS()` from `@rivet-dev/agentos`
> — NOT a session-id persistence layer. P1D checklist §4 (re-addressability) is expected to
> FAIL until the migration lands.
>
> **Date audited / by:** 2026-07-09 · Fable (Claude Code), greps + npm registry check run on
> the founder's machine at branch point `d637121`.

---

## 1. P1e — Runtime Binding persistence

**Original premise:** store the AgentOS *session id* on the tile/actor binding so future
messages hit the same live actor.

**What the docs say the durable handle actually is:** the **actor/VM key**, addressed via
`getOrCreate([key])` — not the session id. [verified]

- `getOrCreate([key])` is idempotent: the same key always resolves to the same actor.
  Keys are unique within an actor type. [verified]
- Sessions are **ephemeral**: the Workflows doc states sessions would not survive a replay
  and recommends creating/closing a session within the step that uses it. [verified]
- Across sleep/wake, what persists is: the `/home/agentos` filesystem, **session records**
  (`agent_os_sessions`), **session event history** (`agent_os_session_events`), preview
  tokens, and cron definitions. What does **not** persist: running processes, active
  shells, in-memory mounts, VM kernel state. [verified]
- `listPersistedSessions()` works **without a running VM**; `getSessionEvents(sessionId)`
  replays a transcript from durable storage. [verified]

**Corrected P1e design:**
1. Persist on the Runtime Binding: `actorKey` (= your `actorId`, used as the Rivet key).
   Optionally cache the last `sessionId` **only** for transcript replay, not for delivery.
2. To re-address an actor later: `client.vm.getOrCreate([actorId])` — this wakes the VM if
   asleep. [inferred from verified addressing + wake-on-connect]
3. To recover prior context: `listPersistedSessions()` → `getSessionEvents()` to replay,
   then open a **fresh** session for new work. [verified mechanism]

**Net:** the persistent binding is one line of addressing, not a session-id registry. This
is exactly the "one delivery door, route pinned" property, provided natively.

---

## 2. P1f — Electron main lifecycle (lazy, non-blocking start)

**Roles (Architecture doc):** client (your app) → server (runs the sidecar, owns kernels)
→ VM (guest). Electron main is the **client**. [verified]

**Lazy start pattern (directly supported):**
- Don't connect at QuantFlow boot. Call `getOrCreate([actorId]).connect()` on the **first
  Dock Card interaction**; the VM boots on demand. [inferred from wake-on-connect]
- The VM sleeps automatically after a 15-minute idle grace period and wakes when a client
  connects or a cron job fires. [verified]
- Subscribe to `vmBooted` to flip readiness truth; subscribe to `vmShutdown` (reason:
  `"sleep" | "destroy" | "error"`) to update Kernel state. [verified]

**Watch-outs for P1f:** [verified facts, QF impact inferred]
- Action timeout = 15 min and sleep grace = 15 min are **set internally by the `agentOS()`
  factory and cannot be overridden per-call.** Any synchronous QF call expecting a >15 min
  agent action will hit the action timeout.
- "Prevents sleep" = active sessions, running processes, active shells, pending hooks. A
  long-running worker keeps the actor awake while its process runs — good for training
  jobs, but confirm the *action* wrapping it doesn't exceed 15 min.
- The sidecar is a real process. For a local Electron app you must run the server/sidecar
  locally (in-process or as a child). Starting it lazily on first use is the non-blocking
  path. [unverified — confirm sidecar startup cost and whether it blocks]

---

## 3. RuntimeHandle rebuild — the AgentOS lane's primitives

RuntimeHandle is the single send/reply door. For the **AgentOS lane**, the door wraps four
native primitives: [verified primitives, mapping inferred]

| RuntimeHandle concern | AgentOS primitive |
| --- | --- |
| Address the actor (bind) | `getOrCreate([actorId])` — idempotent, unique key |
| Deliver intent | `createSession(agentType, opts)` + `sendPrompt(sessionId, text)` |
| Observe result | `sessionEvent` stream (this is where `agent.reply` lives) |
| Lifecycle truth | `vmBooted` / `vmShutdown` events |
| Recover context | `listPersistedSessions()` / `getSessionEvents()` |

**Design implication:** the idempotent key *is* the D7 guarantee ("one primary binding, no
competing owners") enforced at the infrastructure layer — two callers using the same key
reach the same actor by construction. RuntimeHandle's AgentOS adapter should therefore key
off `actorId` and never hold a raw session object above itself. [inferred]

**Adapter shape to generalize** (so Eve/Herdr/PTY implement the same contract): see
`RUNTIME_BINDING_CONTRACT.md`.

---

## 4. Plug-and-play Dock — Bindings are the tool mechanism

**Bindings** expose host JavaScript functions (with Zod input schemas) to the agent as
auto-generated CLI commands at `/usr/local/bin/agentos-{name}` inside the VM, injected into
the agent's system prompt. [verified]

- The `execute()` handler runs **on the host** with full host access; the agent never sees
  credentials — it only sees the input/output contract. [verified]
- Bindings vs MCP: bindings = direct host JS, no auth needed, code-mode built in (agents
  call them inside scripts for up to ~80% token reduction), near-zero latency. MCP =
  third-party servers, extra network hop, per-server auth. [verified]
- Security caveat: bindings run on the host with full access, so don't expose anything that
  could compromise the host without safeguards. [verified]

**QuantFlow mapping:** [inferred]
- A Dock Card's "approved tools" = a `toolKit` of bindings. This is the clean way to give
  agents QuantFlow capabilities **without raw host access** — exactly the concern in the
  spec.
- The Registry (Pi stable; ClaudeCode/Codex **Beta**; OpenCode) + Custom Software is the
  "card catalog" of pluggable agent software.
- A Dock Card ≈ { actor key + agent software package + toolKit of bindings }.

---

## 5. Proof-gated cleanup — why the fallback becomes structurally impossible

Once a Runtime Binding is keyed by `actorId` and delivery goes through `getOrCreate`
addressing: [inferred from verified idempotent-key semantics]
- `legacyRuntimeTarget` / silent fallback for the AgentOS lane is structurally impossible —
  a key resolves to exactly one actor; there is no ambiguous second owner to fall back to.
- `runtime-state/` demotes cleanly to derived cache: the durable truth already lives in
  AgentOS SQLite (`agent_os_sessions` / `agent_os_session_events`) plus the QuantFlow
  Kernel. `runtime-state/` should project from those, not own them.
- `tile-session-registry` stays as a projection of `listPersistedSessions()`, not an
  authority.

**Gate:** do this only after the keyed binding + readiness probe are proven for the
AgentOS lane (P1d/P1e), per the existing ladder.

---

## 6. Eve / Hermes as AgentOS software (P2 and beyond)

- The path is **Custom Software: Definition** (https://agentos-sdk.dev/docs/custom-software/definition)
  + **Custom Agents** (https://agentos-sdk.dev/docs/agents/custom). This is the spec's
    "Path B: Eve as AgentOS custom software." [verified path exists]
- Expose QuantFlow tools to the packaged agent via **bindings**, keeping credentials on the
  host. [inferred]
- **Still unproven for your case.** Claude/Codex first-party agents are Beta; a packaged
  Eve or Hermes agent is a further step. Prove it with the same cheap send/reply probe you
  used for Pi before stacking it live (D12 discipline). [unverified]
- Hermes overlap note: Hermes brings its own persistence/scheduling/subagents, which
  overlaps AgentOS's **actor** layer (cron, queues, workflows, sleep/wake), not just the
  VM. Decide who owns delivery (RuntimeHandle vs Hermes gateway) and memory (Kernel vs
  Hermes SQLite) before packaging. [inferred]

---

## 7. Rivet Workflows — the parked future (recipes/autonomous loops)

- A workflow is an actor's `run` handler wrapped in `workflow()`; each `ctx.step()` is
  recorded, retried, and resumed independently, surviving restarts. Create the AgentOS
  session inside the step that needs it (sessions are ephemeral). [verified]
- This is the long-term shape for QuantFlow recipes/autonomous work — **explicitly out of
  scope** for the current ladder, but the interfaces you build now should not preclude it.
  A future Rivet "TileActor" workflow slots in without changing Dock/Kernel/Canvas/
  RuntimeHandle semantics. [verified scope note in spec + inferred]

---

## 8. Open questions to resolve in Cursor (with real files in hand)

1. Which package does `tools/agentos-host` use — `agentos-core` or `agentos`? (Finding #0.)
2. Does any long-running QF worker action exceed the fixed 15-min action timeout?
3. Sidecar startup cost on the target machine — does lazy start actually keep QF boot
   non-blocking? (P1f.)
4. Can a packaged Eve/Hermes agent clear the same send/reply readiness probe as Pi? (P2.)
5. For workers needing raw network/filesystem, does AgentOS deny-by-default fight the job,
   or do host-dir mounts + egress allowlist cover it? (Runtime-kind selection.)
