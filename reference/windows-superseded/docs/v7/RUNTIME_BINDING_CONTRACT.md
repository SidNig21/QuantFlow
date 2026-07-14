> This document is governed by the AgentOS Anchor Principle in
> `AGENTOS_RIVET_RUNTIME_FINDINGS.md`. If anything here conflicts with the Anchor Principle,
> the Anchor Principle wins.
> AgentOS is the primary execution layer; the AgentOS-backed RivetKit actor is one
> component; the actor key `[workspaceId, tileId]` is the durable door; the Kernel owns
> product truth. Do not implement past the package/import audit until that fact is documented.

# RuntimeHandle + Runtime Binding — Contract Sketch

**Status:** design sketch grounded in the AgentOS/Rivet docs (2026-07-09). Not a drop-in
implementation. The AgentOS lane is the reference adapter (it's the only one with proof);
the other three lanes implement the same shape once proven.

**Design rule from the crawl:** the durable identity is the **actor key** (`actorId`), and
`getOrCreate([actorId])` gives idempotent, single-owner addressing for free. RuntimeHandle
must key off `actorId` and never hold a raw session/PTY/socket object above itself.

---

## Runtime Binding (persisted record, one per tile-bound actor)

```ts
type RuntimeKind = "agentos" | "eve-server" | "herdr-wsl" | "windows-pty";

interface RuntimeBinding {
  actorId: string;              // ALSO the Rivet actor key: getOrCreate([actorId])
  actorType: "agent" | "worker";
  primaryRuntimeKind: RuntimeKind;

  // Optional execution/display split (Herdr on WSL, etc.)
  executionSubstrate?: string;  // e.g. "wsl"
  controlLayer?: string;        // e.g. "herdr"
  displayRail?: string;         // e.g. "terminal-xterm" | "terminal-projection"

  deliveryAdapterId: RuntimeKind;
  readinessProbe: "send-reply" | "process-ready" | "server-health";

  // Ephemeral — cache only, NOT the delivery handle:
  lastSessionId?: string;       // for transcript replay only (getSessionEvents)
  lastReadinessResult?: { ok: boolean; at: number; detail?: string };
}
```

Key point: `lastSessionId` is a **replay cache**, not an address. Delivery always goes
through `actorId`. (Sessions are ephemeral per the Workflows/Persistence docs.)

---

## RuntimeHandle — the single door

```ts
interface RuntimeHandle {
  // Bind: idempotent. Same actorId => same live actor. Wakes it if asleep.
  attach(actorId: string): Promise<void>;

  // Deliver intent, observe result. Returns when the reply milestone is seen.
  send(actorId: string, intent: SendIntent): Promise<SendResult>;

  // Live event stream (agent.reply, tool calls, process output) for Canvas/receipts.
  onEvent(actorId: string, cb: (e: RuntimeEvent) => void): Unsubscribe;

  // Readiness probe. Agent: send small instruction + capture reply.
  //                  Worker: observe process-ready / server-health.
  probeReadiness(actorId: string): Promise<ReadinessResult>;

  // Lifecycle truth for Kernel: booted / shutdown(reason).
  onLifecycle(actorId: string, cb: (e: LifecycleEvent) => void): Unsubscribe;

  // Context recovery without a live session (survives sleep).
  listSessions(actorId: string): Promise<PersistedSession[]>;
  replay(actorId: string, sessionId: string): Promise<RuntimeEvent[]>;
}
```

RuntimeHandle stays **dumb**: route to the adapter, return facts. No truth-deciding, no
opinionated retries. Kernel + receipts own truth.

---

## Delivery Adapter — implemented per runtime kind

```ts
interface DeliveryAdapter {
  kind: RuntimeKind;

  attach(actorId: string): Promise<void>;
  send(actorId: string, intent: SendIntent): Promise<SendResult>;
  subscribe(actorId: string, cb: (e: RuntimeEvent) => void): Unsubscribe;
  probeReadiness(actorId: string): Promise<ReadinessResult>;
  onLifecycle?(actorId: string, cb: (e: LifecycleEvent) => void): Unsubscribe;
  listSessions?(actorId: string): Promise<PersistedSession[]>;
  replay?(actorId: string, sessionId: string): Promise<RuntimeEvent[]>;
}
```

### AgentOS adapter (reference — maps 1:1 to verified primitives)

```ts
// attach:        client.vm.getOrCreate([actorId]).connect()  // idempotent + wakes VM
// send:          createSession(agentType, opts) -> sendPrompt(sessionId, text)
// subscribe:     conn.on("sessionEvent", cb)     // agent.reply lives here
// onLifecycle:   conn.on("vmBooted" | "vmShutdown", cb)  // reason: sleep|destroy|error
// listSessions:  vm.listPersistedSessions()      // works with NO running VM
// replay:        vm.getSessionEvents(sessionId)
// probeReadiness (agent): sendPrompt("ping") and await a reply event
```

### Eve-server adapter (P2, unproven)
`npm run dev` → talk to `/eve/v1/session` over HTTP/WS; readiness = server health +
send/reply. `npm run chat` is bridge plumbing only.

### Herdr/WSL adapter (existing, re-house behind door)
Address by Herdr pane id; delivery = pane send/read; readiness = prompt/process-ready.

### Windows PTY adapter (existing, re-house behind door)
Native TUI adapter for Codex/Claude; readiness = send/reply probe.

---

## Readiness contract (both actor types)

```ts
type ReadinessResult =
  | { ok: true;  kind: "send-reply";     replySeenAt: number }
  | { ok: true;  kind: "process-ready";  signal: string }
  | { ok: true;  kind: "server-health";  status: number }
  | { ok: false; reason: string };
```

Actor becomes "alive" in Kernel **only after** `ok: true`. This is the gate that stops a
tile from showing alive before the round trip is proven.

---

## Receipt ordering (preserve current invariant)

The proven ordering is `agent.reply` **before** `turn.complete`. In AgentOS terms,
`agent.reply` is a `sessionEvent` and its `seq` in `agent_os_session_events` orders it ahead
of the turn-complete milestone. RuntimeHandle should post receipts in `seq` order so the
Kernel accepts them in the same order it does today.
