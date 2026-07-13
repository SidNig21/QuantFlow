# HANDOFF — T-UX remainder: Eve native TUI first, then cable-collab close-out

> **STATUS: CLOSED (2026-07-13).** §4 (U1 native TUI, both forks) was superseded and completed differently by `HANDOFF-EVE-SESSION-TILE.md` (Eve session tiles — see its STATUS block for all receipts). §5 native-collab is GREEN (async two-turn contract, `a7041f9`). U8 landed in `tools/agentos-host/AGENTS.md`; **U7 done 2026-07-13** (`eve` promoted to `DOCK_SPAWN_ACTOR_IDS`, assertions flipped, founder-authorized). §§6/9 commit rules and gotchas remain live reference. Next phase: `docs/v7/PREMIER_PHASE_PLAN.md` (PARKED until founder go).

**Date:** 2026-07-12 · **Branch:** `quantflow-v7-agentos-anchor` @ `c586e28` (pushed) · **Repos:** `QuantFlow` + `quantflow-eve`
**Driver:** founder, in the Codex app. This document is the single authority for the remaining work.

> **SEQUENCING OVERRIDE:** this doc **overrides plan 002** (`docs/plans/2026-07-12-002-feat-t-ux-eve-native-collab-plan.md`) wherever they disagree. Specifically: plan 002's U1 ("presentation spike, build last, keep the ACP editor") is **stale — do not build it**. U1 here = surface Eve's REAL native TUI, and it goes **FIRST** (founder priority 2026-07-12). Everything else in plan 002 (U2–U6 specs, KTDs, verification contract) remains valid reference.

---

## 0. Paste-to-Codex kickoff

```
Repo: C:\Users\rybow\QuantFlow (branch quantflow-v7-agentos-anchor) + C:\Users\rybow\quantflow-eve
Read docs/v7/HANDOFF-T-UX-REMAINDER.md fully — it is the authority and overrides plan 002 on sequencing.

Task order:
1. §4 U1 spike: answer fork (a) vs (b) for Eve's native TUI, then implement the winner
   (stop and report first if the answer is (b) — it pairs with T-PERF).
2. §5: get the agentos-eve-native-collab gate GREEN live (code is built; two prior fails
   were environment: stale eve build, then a transient model fetch).
3. Commits per §6 rules ONLY. Never touch DOCK_SPAWN_ACTOR_IDS (U7 is founder-only).
Run the §7 regression stack after each landing. Respect every §9 gotcha.
```

---

## 1. The two-rail model (the mental model everything below uses)

Founder's layering, authoritative: **(Model, Harness, Framework = Eve — her TUI lives HERE) → (Actor: Rivet `getOrCreate([workspaceId, tileId])`) → (AgentOS: hosts the actor, owns shell/terminal channel + ACP sessions) → (Dock Catalog: QuantFlow lists, does not run).**

Two rails ride that stack, and the current bug is that they're wrongly merged for Eve:

| Rail | What it carries | State |
|------|-----------------|-------|
| **Display rail** | What the operator sees/types in the tile — PTY bytes, TUI paint | ❌ Eve's tile shows a synthetic `"Eve ready — type a message" >` prompt shell, NOT Eve's real TUI |
| **Coordination rail** | ACP prompts, cable delivery, `cable_list`/`cable_send`, host `/cable/send` | ✅ Built, framed cleanly, committed (`c586e28`) |

U1 fixes the display rail. The coordination rail must stay intact while it happens.

## 2. Honest ledger (git-verified — do not trust any doc claiming more)

| Work | State | Receipt |
|------|-------|---------|
| U5 multispawn / U6 A2A transport / `/cable` / bite 1 (clean framing + inline reply + `/cable/peers` + tripwire) | ✅ committed + pushed, gates green | `d69ec3a`, `bf4f131`, `f37b9ab`, `c586e28` |
| **U4** Eve `cable_list`/`cable_send` tools | 🟡 on disk **untracked** in `quantflow-eve/agent/tools/`, reviewed, contract-correct; loaded into Eve's bundle only after the 2026-07-12 `eve build` | not committed |
| **U6** native-collab proof + wiring | 🟡 on disk uncommitted in QuantFlow (proof + launcher + qa lib + package.json/qa/run.ts/index.ts wiring), reviewed | **never passed live** — see §5 |
| **U1** native TUI | 🔴 not started — FIRST | — |
| U8 DOX / U7 promotion | 🔴 queued | — |

## 3. Regression stack (run after every landing; one at a time; never while editing the tree)

```sh
bun qa/run.ts agentos-toolkit-envelope     # seconds, no Electron
bun qa/run.ts agentos-eve-multispawn       # ~3-5 min each below (real app + Eve pool)
bun qa/run.ts agentos-eve-a2a
bun qa/run.ts agentos-eve-cable-chat
bun qa/run.ts agentos-eve-native-collab
```

## 4. U1 — Surface Eve's native TUI on the AgentOS tile (FIRST)

**Eve HAS a native TUI.** It is her Harness layer: `quantflow-eve/node_modules/eve/dist/src/cli/dev/tui/` (`terminal-renderer.js`, `setup-panel.js`) — what `eve dev` paints. The goal: that TUI, live in the Eve dock tile.

**Verified current state (code-read 2026-07-12):**
- `handle.openShell({ cols, rows })` (host.js ~1200) opens a **bare guest-VM shell** — no command, nothing feeding it.
- Eve runs on the WSL host (Path A). The guest runs only `quantflow-eve/agentos/eve-acp/index.js` — thin ACP↔HTTP adapter, `STREAM_MODE="final"`, returns final text. Eve's TUI runs **nowhere** on this rail.
- The tile display channel is **already wired**: `transport.onTerminalData(attach.shellId, …)` at `agentos-terminal-bridge.ts:232` streams shell bytes to the tile. The pipe exists; it's fed by an empty shell.
- `isAcpPromptSoftware("eve")` (`agentos-terminal-bridge.ts:248`, `acp-prompt-line-editor.ts:51`) forces the synthetic prompt shell — that fake chrome IS the garbled tile.

**The spike's ONE decision (guest-runtime feasibility, NOT a TUI question — Eve's full runtime cannot run in the guest; that wall forced Path A):**
- **(a) Thin TUI client in the guest shell.** IF `terminal-renderer.js`/`setup-panel.js` can run as a lightweight client — consuming Eve's HTTP/ACP event stream from `EVE_BASE_URL` and painting ANSI — run it in the actor's shell via `openShell({ command, args })`. Bytes flow through the already-wired `onTerminalData` → tile. **Spike step 1: grep those files' imports for full-framework/runtime deps vs pure event-in→ANSI-out.** Lighter; keeps everything inside the actor.
- **(b) Host-side PTY display rail.** Run `eve dev` (TUI mode) in a PTY on the WSL host; bridge PTY bytes to the tile as a display rail parallel to the AgentOS coordination actor (DOCK_RUNTIME_REWORK_SPEC: display rail ≠ execution rail). Sidesteps the guest wall; heavier; **pairs with T-PERF** (warm pool). Caution: `eve dev` historically holds a single-instance dev lock — multi-tile needs per-instance isolation (the reason the supervisor uses `eve start`). **If the spike lands on (b): STOP and report the design before building** — founder decides whether it waits for T-PERF pairing.

**Implementation (after the fork is answered, expected (a)):**
- Stop forcing the prompt shell for Eve: replace `isAcpPromptSoftware("eve") === true` routing with a native-terminal branch (e.g. `usesNativeTerminal("eve")`) in `agentos-terminal-bridge.ts` — raw `onTerminalData` bytes render; tile input routes via `writeTerminal(shellId, data)` into the TUI's stdin. The ACP prompt editor remains the fallback for software without a TUI.
- **Coordination rail untouched:** ACP `promptSession` (cable delivery to B, proofs) and all `/cable/*` endpoints stay exactly as committed.
- **Known dependent:** the `agentos-eve-cable-chat` gate drives the ACP line editor (`/cable` typed path). If Eve leaves prompt-mode, give that gate a valid input path (either `/cable` parsing on the native input stream, or route the gate's keystrokes through the coordination rail) — do not delete the gate.

**Exit:** manual — dock Eve tile shows Eve's real TUI (no `"Eve ready"` banner, no fake `> `), typing lands in Eve's own interface; plus §3 stack green.

## 5. U6 close-out — get `agentos-eve-native-collab` green (after U1, or parallel if careful)

**What it proves (the product sentence):** plain-chat instruction to Eve A → she *chooses* `cable_list` → `cable_send` → host bridges to Eve B with clean `Message from cabled agent @…` framing → B's reply returns inline → A reports it. Asserts: A's text contains `collab-ok`; B's persisted session events (`GET /session/:id/runtime`) contain no `"[a2a "`; screenshot `V7-04`.

**The code is done and reviewed.** Two live attempts failed on ENVIRONMENT, not logic:
1. Eve lacked the tools → root cause: `eve start` serves the prebuilt `.output` bundle; tools didn't exist until `eve build` ran (see §9.1). FIXED — bundle now contains them (verified: 11 refs in `eve.mjs`).
2. `AgentOS unavailable: model error — fetch failed` → Eve's LLM call to opencode.ai failed mid-proof; opencode was reachable (200) right after. Transient, or runtime-node/undici mismatch in the rebuilt bundle — if it repeats, check which node the supervisor's `npm run start` resolves in WSL and test `node .output/server/index.mjs` under node 22 vs 24.

**Action:** re-run `bun qa/run.ts agentos-eve-native-collab` on a healthy runtime until green (or fix the runtime-node issue if the model-fetch failure repeats). Do not weaken the assertions to pass.

## 6. Commit rules (founder-locked)

- **U6 files: commit ONLY after the gate passes live.** Never commit claiming green without a green run.
- **U4 (`quantflow-eve` tools): may commit independently** — they're reviewed and proven to load post-build (Eve listed them in attempt 1's error path... she named her toolset; and the bundle grep confirms inclusion). Commit `quantflow-eve` FIRST, then QuantFlow, whenever the tool contract changes.
- **U1: commit per-slice on green regression**, quantflow-eve first if Eve-side files change.
- **Never touch `DOCK_SPAWN_ACTOR_IDS`** — U7 promotion is the founder's hands only. Three gates assert eve is unpromoted; they get flipped in the founder's U7 change, not before.

## 7. Founder manual exit (after U1 + U6 green — your eyes, ~10 min)

1. Spawn Eve A + B from the dock rail; cable A↔B. Tiles show Eve's **real TUI** (U1).
2. In A: `Ask your cabled peer what 2 + 2 is and tell me their answer.`
3. Pass: A uses her cable tool, B shows a clean `Message from cabled agent @eve-…` inbound, A reports "my peer says 4" — one coherent conversation, no `[a2a`, no `command not found`, no phantom turns.
4. Delete the cable, repeat → A reports no peers (no hallucinated send).

## 8. U8 / U7 tail

- **U8 DOX:** `tools/agentos-host/AGENTS.md` wire-protocol table lags reality — add `GET /cable/peers`, `fromPort` on `/cable/send`, framed delivery format, `additionalInstructions` at session create, tripwire meaning, and the §9.1 Eve build requirement. Cross-link this handoff + plan 002 from `docs/v7/` context.
- **U7 (founder only):** add `eve` to `DOCK_SPAWN_ACTOR_IDS` (`quantflow-electron/src/main/dock-actors.ts`) + flip the three unpromoted-assertions in the same change. After manual exit + perf feels right.

## 9. Gotchas that already cost cycles (read before dispatching anything)

1. **New Eve code doesn't exist until `eve build`.** `eve start` serves `.output`. After ANY `quantflow-eve/agent/**` change: `wsl -e bash -lc "source ~/.nvm/nvm.sh && nvm use 24 && cd /mnt/c/Users/rybow/quantflow-eve && npm run build"`. Eve needs Node ≥24; WSL default is v22; nvm has 24.17.0. Symptom of forgetting: Eve says she doesn't have the tool.
2. **Codex CLI (if shelling out; app may differ):** pin `-m gpt-5.5` AND `-c model_reasoning_effort="high"` — defaults are broken on the installed CLI.
3. **One Electron gate at a time, never while the tree is being edited** — a mid-edit host.js produced a false a2a failure on 2026-07-12.
4. **Toolkit tripwire:** `agentos-toolkit-envelope` is GREEN while AgentOS's native actor rejects `toolKits` (verified: 0.2.7, 0.2.8-rc.1, main — Rivet's own example crashes on all; founder has contacted the team). The day it FAILS: mount `buildCableKit`/`buildDelegateKit` (host.js ~732, already written), port Eve callers to the in-VM `agentos-cable` CLI, retire `agent/tools/cable_*.ts`. Semantics identical by design.
5. **QF_EVE_WORKSPACE path bug (open):** Windows absolute paths aren't absolute on WSL — Eve's `write_task_artifact` once wrote a literal `./C:/...` tree (cleaned 2026-07-12; files preserved in `qf-artifacts/out/`). Fix seam: translate in `eve-supervisor.js` spawn env or set a Linux-native path; add a non-absolute guard in `artifactRoot()`.
6. **Relay-log trap:** Eve's tool path (HTTP → host) bypasses Electron's `appendRelayLog` — never assert `getStringLog` for agent-initiated sends; assert B's persisted session events via `GET /session/:id/runtime` (the native-collab proof shows the pattern).

## 10. Parked queue (do not start)

T-PERF (warm relay-actor pool — Rivet keying trap: actor keys permanent at `getOrCreate`; pool must pre-reserve tile ids or boot optimistically on the real key) — pairs with U1 fork (b) if chosen. Omnigent stays parked as possible L6 supervision only.
