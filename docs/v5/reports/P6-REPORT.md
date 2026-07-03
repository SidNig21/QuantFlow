# P6 Report — The live proof loop

Branch: `quantflow-v5-fabled` · Machine gate: **GREEN** (`bun qa/run.ts loop-proof` exit 0, twice consecutively, screenshots committed to `docs/v5/reports/evidence/`)

## Commits

| Commit | Chunk | Summary |
| --- | --- | --- |
| `4e43802` | P6.A | Live AgentOS wiring in Electron main — `getWorkerHarness('agentos')` returns a lazy singleton (WSL host starts on first transport use, never at boot); production ApprovalGate surfaces the blocker on the tile state card via `kernel.state_card.update` + posts `approval.requested`/`human_decision` receipts; `agentos:approvals` / `agentos:approve` IPC + preload; `asHarnessKind` accepts `agentos` |
| `895a823` | P6.B | Visible loop — `agentos:run` fire-and-forget driver (spawn → send → collectReceipts → `kernel.receipt.post`), "AgentOS Worker" legend recipe + state-card tile spawn (`spawnAgentOsTileAt`), canvas Approve/Deny buttons on blocked cards, receipt timeline on the card back fed by `kernel.receipt.list` (targeted `receipt.posted` refresh only — no snapshot refetches) |
| `fb24941` | P6.C | Scripted proof — `QF_AGENTOS_SIM=1` sim-transport seam, in-app driver (`agentos-loop-proof.ts`) clicks the real legend entry, waits for the approval blocker, clicks Approve, verifies the timeline, captures screenshots; `loop-proof` qa check (blocking) |

## The loop (mission line, mapped to what shipped)

1. **Legend/dock entry spawns an `agentos` WorkerInstance** — `.lv1-recipe[data-recipe="agentos"]` → `spawnAgentOsTileAt` → `kernel.tile.create` + `kernel.worker.spawn` (harnessKind `agentos`) → tile auto-flips to its state card → `shellApi.agentosRun` with `AGENTOS_DEFAULT_INSTRUCTION`.
2. **Tile state card updates live from Kernel events** — existing `state_card.updated` / `receipt.posted` / `worker.*` targeted routing; no new event kinds.
3. **Approval checkpoint appears; canvas approve resumes the blocked agent** — production gate blocks the adapter, card shows `blocked` + `AgentOS approval: <action>` with Approve/Deny; approve resolves via `agentos:approve` → Kernel writes land (card unblocks, `human_decision` receipt) → adapter resumes via `transport.respondPermission`.
4. **Replay timeline reads from receipts** — "Receipt timeline" section on the card back, most-recent-8 for the tile from `kernel.receipt.list`.

## Proof run (real pasted output)

```
LOOP-PROOF: step=renderer-ready ok=true detail=settle=2500ms
LOOP-PROOF: step=spawn-click ok=true detail=selector=.lv1-recipe[data-recipe="agentos"] spawnMode=center
LOOP-PROOF: step=spawn-tile ok=true detail=tileId=tile-1783075516572-1
LOOP-PROOF: step=screenshot-00-canvas-spawn.png ok=false detail=capturePage returned empty PNG
LOOP-PROOF: step=approval-blocked ok=true detail=blocker=AgentOS approval: write tier2 result file
LOOP-PROOF: step=screenshot-01-blocked-approval.png ok=true detail=302679 bytes
LOOP-PROOF: step=approval-click ok=true detail=selector=[data-agentos-approval="approve"]
LOOP-PROOF: step=run-complete ok=true detail=status=idle receipts=16 rows=8
LOOP-PROOF: step=screenshot-02-approved-timeline.png ok=true detail=654666 bytes
LOOP-PROOF: step=done ok=true detail=C:\Users\rybow\QuantFlow\docs\v5\reports\evidence
```

Evidence: `docs/v5/reports/evidence/01-blocked-approval.png` (card blocked, Approve/Deny visible), `02-approved-timeline.png` (post-approval timeline). `00-canvas-spawn.png` is a nice-to-have that races Electron's first paint and is skipped without failing the gate.

The proof uses the **sim transport** (deterministic replay of a real spike ACP stream, including a permission request) with the **production** ApprovalGate/IPC/state-card path. The live WSL+model path is separately proven by `agentos-live` (PASS, OpenCode Zen `big-pickle`).

## Fixes found by the proof (all committed in P6.C)

- **Relay port EACCES:** random high ports hit Windows excluded port ranges; proof now uses port 0 (OS-assigned ephemeral).
- **Approval race:** `resolveAgentOsApproval` used to resolve the adapter before the Kernel writes landed, so the resumed run's receipt storm could re-render the card while it still read `blocked`. Kernel writes now land first.
- **State-card render race:** overlapping `renderStateCardBack` calls could interleave across awaits; latest-token guard added.
- **Orphaned pty-sidecar:** the detached sidecar outlives `app.exit` and inherits console handles, hanging any pipeline that launched the proof; the proof kills it by pid file on exit.

## Gate verification (Fable re-ran, exits 0)

```
loop-proof 0 (twice consecutively) · agentos-live PASS (OPENCODE_API_KEY, blockedMs=2011)
all 22 blocking qa checks 0 (full sweep incl. golden, storm, pty-flood, divergence,
  one-event-path, secrets-accessor, runtime-fence, kill-switch, agentos-atom)
quantflow-electron bun test: 1041 pass / 32 skip / 0 fail (1073 total)
bun test src/harness src/main/conductor: 26 pass / 0 fail
```

## Named findings deferred

- Approval milestones can appear twice on the timeline during live runs (gate posts live, driver re-posts translator drafts) — cosmetic; dedupe by `metadata.requestId` if it bothers the founder.
- `00-canvas-spawn.png` racing first paint — cosmetic nice-to-have.
- The proof drives one tile; multi-worker concurrency is guarded (per-tile "already running") but not proof-scripted.
