# v4 Rung Handoff — R3c-b — Envoy → Kernel Consolidation

**For:** Codex (verifier)  ·  **Branch:** `quantflow-v4`  ·  **Verifier:** Codex (machine proof only)
**Depends on:** R3a ✅ · R3b ✅ · R3c MCP reads ✅

## 0. Authoritative scope

Full goal shape = `BUILD_PLAN_V4.md` § "Goal R3" sub-milestone **R3c** (authority consolidation).
This handoff covers **R3c-b only** — wiring Envoy task ops through Kernel commands and adding
`smoke:authority`. MCP Kernel reads (R3c-a) were shipped separately.

**Product proof:** operator runbook → `docs/v4/handoffs/R3-product-proof-operator.md` (machine proof done; DAG witness is operator).

**Deferred (explicit):** R4 · full `envoy_tasks` table retirement.

## 1. Read before verifying (in order)

- `AGENTS.md` (root) → `docs/v4/AGENTS.md`
- `BUILD_PLAN_V4.md` § Goal R3 → Authority consolidation + Failure Signals
- `KERNEL_CONSTITUTION.md` + `docs/v3/AUTHORITY_RULES.md`
- Seam files listed in §2 below

## 2. What was built

**Pattern:** Kernel decides; Envoy mirrors (bridge). `task_id ≡ kernel.tasks.id`.

| File | Change |
| --- | --- |
| `quantflow-electron/src/main/envoy-kernel-bridge.ts` | **NEW** — `dispatchEnvoyKernel`, `syncMirrorFromKernel`, `refreshMirrorStatus`, `ensureKernelTile`, status mapping |
| `quantflow-electron/src/main/envoy-task-service.ts` | **REWRITE** — create/claim/progress/complete/block/fail route through Kernel commands; mirror sync after each mutation; `listTasks` refreshes mirror from Kernel |
| `quantflow-electron/src/main/runtime-state/envoy-repo.ts` | `patchEnvoyTaskClaim` for mirror-only claim metadata |
| `quantflow-electron/src/main/test-kernel-db.ts` | **NEW** — in-memory `bun:sqlite` Kernel DB for smokes/tests |
| `quantflow-electron/scripts/smoke-authority.ts` | **NEW** — R3c-b authority smoke |
| `quantflow-electron/package.json` | `"smoke:authority": "bun scripts/smoke-authority.ts"` |
| `src/kernel/database.ts` | `setKernelDbForTesting` + lazy `better-sqlite3` load (smokes avoid native bindings at import) |
| Tests/smokes | `envoy-task-service.test.ts`, `workflow-service.test.ts`, `envoy-task-smoke.ts` — Kernel assertions |

**Run Workflow path:** `createWorkflowTask` → `EnvoyTaskService.createTask` → `kernel.task.create` first → Envoy space post → mirror insert keyed by Kernel id.

**Legacy complete:** `qf_task_complete` / `EnvoyTaskService.completeTask` → `kernel.task.complete` with `legacy: true` (Hermes/MCP compat; auditable bypass).

**Not changed:** `qf_task_submit` / `qf_task_verify` (already Kernel). Full Envoy table retirement deferred.

## 3. Hard guardrails — do NOT (verifier scope check)

- No R4 files (migration 005, runtime-manager, smoke:pod, etc.)
- No second task authority — `envoy_tasks` must not mutate lifecycle without Kernel command first
- No `kernel.*` schema migration
- No push (local commit only)

## 4. Definition of done (acceptance)

### Machine proof

```bash
cd quantflow-electron
bun run smoke:authority    # NEW — one task authority + mirror refresh
bun run smoke:dag
bun run smoke:task-atom
bun test src/main/envoy-task-service.test.ts src/main/workflow-service.test.ts
bun run smoke:envoy-task
cd ../tools/quantflow-mcp && node --test
cd ../quantflow-electron && bun run build
```

**`smoke:authority` asserts:**

- Run Workflow create writes Kernel row before mirror (`task_id ≡ kernel id`, correlation match)
- Cable create → claim → complete mutates Kernel; mirror reflects Kernel
- Second claim rejected by Kernel gate
- Direct mirror-only status write cannot override Kernel on `listTasks` refresh
- No orphan envoy mirrors without Kernel rows

### Product proof (operator — deferred to dogfood)

Run Workflow Play → modal → Hermes spawn → task visible in Kernel via DevTools. See operator steps below.

### Regression guard

All commands in §4 must exit 0. R3a/R3b smokes unchanged.

## 5. Verification handoff — paste THIS back

### 5.1 Diff summary

```text
quantflow-electron/src/main/envoy-kernel-bridge.ts          NEW
quantflow-electron/src/main/test-kernel-db.ts               NEW
quantflow-electron/scripts/smoke-authority.ts               NEW
quantflow-electron/src/main/envoy-task-service.ts           REWRITE (Kernel-first)
quantflow-electron/src/main/runtime-state/envoy-repo.ts       patchEnvoyTaskClaim
quantflow-electron/package.json                             smoke:authority
quantflow-electron/bunfig.toml                              @qf-kernel/* alias
src/kernel/database.ts                                      setKernelDbForTesting + lazy better-sqlite3
quantflow-electron/src/main/envoy-task-service.test.ts      Kernel assertions
quantflow-electron/src/main/workflow-service.test.ts        Kernel assertions
quantflow-electron/scripts/envoy-task-smoke.ts              Kernel assertions
docs/v4/handoffs/R3c-envoy-consolidation.md                 THIS FILE
```

### 5.2 Command outputs (Cursor builder run — 2026-06-21, re-verified)

**smoke:authority** — OK — 0 failure(s) (17 checks PASS)

**smoke:dag** — OK — 0 failure(s)

**smoke:task-atom** — OK — 0 failure(s)

**bun test envoy-task-service + workflow-service** — 18 pass, 0 fail

**smoke:envoy-task** — `"ok": true`, `"final_status": "done"`, `"second_claim_rejected": true`

**node --test (quantflow-mcp)** — 24 pass, 0 fail

**bun run build** — ✓ built (main + preload + renderer)

### 5.3 Self-assessment

| Criterion | Met | Evidence |
| --- | --- | --- |
| Kernel decides on create | ✅ | `kernel.task.create` before mirror in `EnvoyTaskService.createTask` |
| task_id ≡ kernel.tasks.id | ✅ | `smoke:authority` PASS |
| Claim/complete via Kernel commands | ✅ | `dispatchEnvoyKernel` for claim/start/complete |
| Mirror reflects Kernel on read | ✅ | `refreshMirrorStatus` in `listTasks`; smoke mirror-override test |
| Run Workflow path wired | ✅ | `createWorkflowTask` smoke section green |
| smoke:authority wired | ✅ | `package.json` script |
| No second truth store for lifecycle | ✅ | No direct `claimEnvoyTask`/`insertEnvoyTask` as authority |
| Regression stack green | ✅ | §5.2 |
| R4 scope not touched | ✅ | No R4 files in diff |
| Full envoy_tasks retirement | ⏸ deferred | Mirror table retained by design |

### 5.4 Notes

- **Bug fixed during build:** mirror used `kernel.correlation_id` (undefined on `TaskSnapshot`); corrected to `kernel.correlationId`.
- **Test infra:** `setKernelDbForTesting` + `bun:sqlite` in-memory migrations (matches `smoke-dag` pattern); production `initKernelDb` lazy-loads `better-sqlite3` from `quantflow-electron/node_modules`.
- **Legacy complete:** intentional `legacy: true` on Envoy-complete path for Hermes/MCP until full submit/verify adoption.
- **Product proof:** operator runbook at `docs/v4/handoffs/R3-product-proof-operator.md`; machine stack re-green 2026-06-21.

---

## Operator — Run Workflow dogfood steps

1. **Branch & start app**
   ```bash
   git checkout quantflow-v4
   cd quantflow-electron
   bun run dev
   ```

2. **Open canvas** — ensure Hermes role tile exists (Legend dock → add Hermes if needed).

3. **Run Workflow** — click Play (Run Workflow). Enter a short prompt, e.g. `Dogfood R3c-b: list open Kernel tasks and claim this workflow task`.

4. **Confirm task creation**
   - DevTools → Console:
     ```javascript
     await window.kernelApi.sendQuery("kernel.conductor.context", {})
     ```
   - Expect a new task with `status: "open"`, title from your prompt, `correlationId` matching the workflow result.

5. **Confirm mirror (optional)**
   - Envoy inbox / task list in app should show the task with the **same task id** as Kernel.
   - `correlation_id` on mirror row must match Kernel `correlationId`.

6. **Hermes activation** — after spawn, Hermes pane should receive activation line containing `task_id=`, `correlation_id=`, and canvas skill path.

7. **Agent path (MCP)**
   - Hermes/Codex: `qf_task_list` → find task → `qf_task_claim` → work → `qf_task_complete` (legacy) or submit/verify path.
   - After complete: Kernel task `status: "complete"`; Envoy mirror `status: "done"`.

8. **Capture for verifier:** screenshot or paste Kernel task row + mirror row ids/status after claim and after complete.

---

## Codex verifier prompt (after implementation)

```text
You are the R3c-b VERIFIER on branch quantflow-v4. Do not build R4.

Read docs/v4/handoffs/R3c-envoy-consolidation.md (full handoff).

Scope check:
- Confirm diff is R3c-b only (Envoy→Kernel bridge, smoke:authority, tests). No R4 files.
- Confirm EnvoyTaskService routes create/claim/complete/block/fail through kernel.task.* commands.
- Confirm task_id ≡ kernel.tasks.id; envoy_tasks is mirror only.

Run the full §4 regression stack from quantflow-electron:
  bun run smoke:authority
  bun run smoke:dag
  bun run smoke:task-atom
  bun test src/main/envoy-task-service.test.ts src/main/workflow-service.test.ts
  bun run smoke:envoy-task
  cd ../tools/quantflow-mcp && node --test
  cd ../quantflow-electron && bun run build

Paste §5 bundle back: diff summary, FULL command outputs, self-assessment table, notes.
Flag any guardrail violation. Do not push. Do not update BUILD_PLAN ledger — operator approves after dogfood.
```
