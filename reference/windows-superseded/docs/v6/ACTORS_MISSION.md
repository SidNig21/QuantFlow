# QUANTFLOW v6 "ACTORS" — MISSION ORDER

> **Branch:** `quantflow-v6-actors` (off `quantflow-v5-fabled`)
> **Authorized:** founder directive 2026-07-04. This mission corrects a scope miss in v5:
> v5 built the AgentOS *pipe* and dressed it in state-card / approval UI the founder did
> not want. v6 delivers the founder's actual vision.
> **Orchestrator/Verifier:** Fable (Cursor) · **Builders:** Composer sub-agents

---

## 0. THE VISION (read this first, in the founder's words)

**The legend bar is the universal spawn bar for every actor and every script.**
Just like a legend entry can join **herdr** today, an entry can join **AgentOS**.
An AgentOS actor is a **real agent living in the VM, shown as a TERMINAL TILE** you
watch and talk to — **not a state card.** Actors **talk to each other** (agent-to-agent);
you wire that by **drawing a cable** between two tiles on the canvas. AgentOS is the
**fabric** everything runs on.

**Founder's exact words to hold onto:** *"I don't care about conductor and state cards and
all this bullshit. I want agent-to-agent communication and orchestration, easily achievable
through the legend bar. The legend bar is the spawn bar for all actors and other scripts."*

## 1. What the founder will SEE when this is done

1. Click **any** legend entry set to the `agentos` transport → a **terminal tile** opens,
   running a real agent inside the AgentOS VM (you can read its output and type to it).
2. **Codex, Claude Code, and Hermes** spawn as AgentOS terminal actors — same fabric,
   one runtime. (New actors and old, all on AgentOS.)
3. **Draw a cable** from Actor A's tile to Actor B's tile → A can now hand work to B.
   You watch the delegation happen across the cable.
4. Later: a **Hermes orchestrator** actor that spawns and delegates to other actors on its
   own, using the same agent-to-agent wiring you first drew by hand.

That is the product. Everything below serves exactly that picture.

## 2. What we KEEP from v5 (the pipe is good; the dress-up is gone)

- **KEEP:** `src/harness/agentos/` adapter, `tools/agentos-host` WSL sidecar, the HTTP/SSE
  transport, credential order (OpenCode Zen → OpenRouter → Anthropic), the kill switch,
  the P0–P4 foundation fixes (Windows tests, PF1 router, one-truth flag, fences).
- **DROP from the experience:** state-card-first rendering for AgentOS actors, and the
  mandatory approval-gate ceremony. The **terminal is the primary surface.**
- **DEMOTE, don't delete:** receipts still get written silently (they power replay and are
  cheap) but they are **not the UI** and never block the actor. Approval becomes **optional** —
  it surfaces only if an actor explicitly requests permission, as a small inline prompt in
  the terminal tile, not a whole card the founder must service.

## 3. Non-negotiables (invariants — violating any ends the session)

1. **The terminal tile is the star.** An AgentOS actor renders as an interactive terminal
   (via AgentOS `connectTerminal`/`openShell`), like the herdr/pty tiles do. No state card
   as the default face.
2. **One actor = one AgentOS session.** No shared-session cross-talk except through the
   explicit agent-to-agent cable.
3. **Don't create a second source of truth.** Session/actor state that must persist goes
   through a Kernel command (this is the one v-series rule we never drop — it's why the app
   doesn't rot). But this is a *backbone*, not a UI: the founder never has to look at it.
4. **The app must survive AgentOS being down.** Kill switch stays green — legend still opens,
   pty/herdr tiles still work, only agentos tiles show a clear "AgentOS unavailable" line.
5. **No self-approval:** the Composer that builds a chunk never verifies it. Fable re-runs the
   proof and audits the diff before committing.
6. **Never push `quantflow-v4`, `quantflow-v5-fabled`, or `main`. Never force-push.**
7. A gate that fails twice → stop the phase, write the report, don't improvise past red.

## 4. PHASE LADDER (each phase = a visible step toward §1)

### V0 — Fix the two v5 boot bugs (so the founder's FIRST click works)
The demo failed on the founder's machine for two avoidable reasons; fix before anything else.
- **Cold-WSL timeout:** first AgentOS click waits 30s for the WSL host and gives up if WSL is
  cold. Fix: pre-warm the host on app start (fire-and-forget health poll) AND raise/adaptively
  extend the first-boot budget. Kill switch must stay green.
- **Uninformative error:** "agentos unavailable: host health check failed" hides *which* leg
  failed. Split the messages: "WSL host didn't start" vs "no API key set (set OPENCODE_API_KEY)"
  vs "model error". Surface the key-missing case as an actionable hint.
**Gate:** `bun qa/run.ts agentos-boot` — sim proves pre-warm fires on start, kill switch green,
and the three failure classes produce three distinct messages. Founder proof: one click reaches
a running actor on a warm machine with a key set.

### V1 — AgentOS actor as a TERMINAL TILE (the keystone)
Render an `agentos` actor as an interactive terminal tile (xterm), backed by AgentOS
`connectTerminal`/`openShell` streamed over the existing transport (extend the wire protocol
with terminal attach/read/write/resize). Founder reads output and types into the running agent.
State card becomes an optional *back* of the tile, not the front.
**Gate:** `bun qa/run.ts agentos-terminal` — sim/scripted: spawn agentos actor → terminal tile
renders → bytes flow both ways → resize works. Founder proof: click AgentOS Worker, see a live
terminal, type to the agent, get a response.

### V2 — Legend transport picker: any entry can join AgentOS
Generalize the legend recipe so an entry declares `transport: agentos` the same way it declares
`herdr-wsl`/`windows-pty` today. The "+ Add" / edit flow lets an entry pick AgentOS + a software
(`pi`/`opencode`/`claude-code`) + optional instruction. This is the "join AgentOS like you join
herdr" step.
**Gate:** `bun qa/run.ts legend-agentos` — a recipe with `transport: agentos` spawns a terminal
actor; an unchanged herdr/pty recipe still spawns as before. Founder proof: add a new AgentOS
actor from the dock, it spawns as a terminal.

### V3 — Move Codex + Claude Code + Hermes onto AgentOS
Re-point the existing legend entries to the `agentos` transport with the matching built-in
software (Claude Code → `claude-code`, Codex → the closest AgentOS agent or `pi`, Hermes → `pi`
as an interactive agent for now; Hermes-as-orchestrator is V5). Terminal view preserved. Old
transports stay available as a fallback recipe field but are no longer the default for these three.
**Gate:** `bun qa/run.ts actors-on-agentos` — each of the three spawns as an AgentOS terminal
actor and completes a trivial instruction. Kill switch still green. Founder proof: click Claude
Code / Codex / Hermes → each is an AgentOS terminal actor.

### V4 — Agent-to-agent by drawing a cable (manual orchestration — the payoff)
A cable drawn from Actor A's tile to Actor B's tile establishes a delegation channel: A can send
a message/task to B and receive B's result. Back it with AgentOS `listSessions` + a host binding
that routes a message from session A to session B (agent-to-agent). The cable is the visible,
operator-drawn wire; deletion removes the channel.
**Gate:** `bun qa/run.ts a2a-cable` — scripted: spawn two actors, draw a cable, A sends to B, B's
reply comes back over the channel; delete cable → channel closes. Founder proof: wire two real
actors, watch one delegate to the other on the canvas.

### V5 — Orchestrator actor (autonomous delegation, built on V4)
A Hermes orchestrator actor that, at runtime, spawns other actors and delegates to them using the
**same** agent-to-agent channel V4 proved — but decided by the orchestrator, not drawn by hand.
Cables render automatically as it wires up its workers.
**Gate:** `bun qa/run.ts orchestrator` — scripted: spawn Hermes-orchestrator with a goal → it
spawns ≥1 worker actor, delegates, collects a result; the delegation renders as a cable. Founder
proof: give Hermes a task, watch it recruit and drive a worker actor on its own.

### V6 — Proof loop + demo
End-to-end scripted proof + screenshots to `docs/v6/reports/evidence/`, and a founder demo script.
**Gate:** `bun qa/run.ts actors-demo` green twice consecutively.

## 5. Gate policy (from the v5 lessons — do not relearn)
- Every blocking gate is a command green **on this machine**. A host-baseline failure is fixed by
  a named repair chunk (like V0), never by silently narrowing scope or a permanently-red check.
- WSL is the required lane for the AgentOS sidecar; native Windows runs the Electron app + suite.
- Phantom `M` on shell files with empty diffs = CRLF artifact; ignore. `Rebuild Prompt.md`, `logs/`
  are operator files — never commit or delete.

## 6. DEFERRED TO FOUNDER (do not do; list in the report)
1. Merging `quantflow-v6-actors` anywhere.
2. Deleting the herdr/Eve lanes entirely (V3 keeps them as fallback; full retirement is a founder call).
3. The v5 `QF_ONE_TRUTH` default-ON flip (still the founder's witnessed proof).
4. Any spend beyond existing API keys; paid AgentOS models (free `big-pickle` is the default).

## 7. Reporting
Per phase: `docs/v6/reports/V<N>-REPORT.md` — real pasted proof output, deviations *with reasons*,
findings, verifier commands. Commit reports with the phase. Push `quantflow-v6-actors` per phase.

## 8. Session end
End (with report) when a gate fails twice after an honest repair, a non-negotiable would have to
bend, or a §6 founder decision is required. Otherwise keep going. Mission done when V6's gate is
green and the demo script is written.
