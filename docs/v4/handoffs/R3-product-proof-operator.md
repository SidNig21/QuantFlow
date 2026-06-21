# R3 Product Proof — Operator Runbook

**Branch:** `quantflow-v4` · **Goal:** real multi-agent DAG on canvas (BUILD_PLAN_V4 § R3 Product proof)

Machine proof is **already green** (see §6). You run this doc to witness the product proof and approve R3 in the ledger.

## Graph (matches `smoke:dag`)

```text
collect ─┬─ analyze ──┐
         └─ extract ──┴─ synthesize
```

Four Kernel tasks, one parallel branch. Downstream claim requires upstream **`verification_passed`** (not legacy `qf_task_complete`).

## 0. Prerequisites (done for you)

| Item | Expected |
| --- | --- |
| Branch | `quantflow-v4` at `7fd2fba` or later |
| Vault config | `%USERPROFILE%\.quantflow\vault-config.json` → `QuantFlow Vault` |
| Skill file | `C:\Users\rybow\Obsidian\QuantFlow Vault\Projects\QuantFlow\QUANTFLOW_CANVAS_SKILL.md` exists |
| Machine proof | §6 stack exit 0 (2026-06-21) |

## 1. Start the app

```powershell
cd C:\Users\rybow\QuantFlow\quantflow-electron
bun run dev
```

Confirm vault in DevTools:

```javascript
await window.shellApi?.vaultGetPath?.()
// → C:\Users\rybow\Obsidian\QuantFlow Vault
```

## 2. Canvas setup — two real agents

1. **Legend dock** → spawn **Hermes** (orchestrator).
2. **Legend dock** → spawn **Codex** (worker).
3. Note each tile id: `quantflow_tile_list` via MCP, or from tile metadata in DevTools context.
4. Open **Conductor** panel (for Verify steps later).

## 3. Seed the DAG (DevTools Console)

Paste once. Uses workflow id `wf-r3-proof` and artifact root under the vault.

```javascript
(async () => {
  const k = window.kernelApi;
  const WF = "wf-r3-proof";
  const VAULT = "C:\\Users\\rybow\\Obsidian\\QuantFlow Vault";
  const ART = `${VAULT}\\Projects\\QuantFlow\\R3-proof-artifacts`;
  const cmd = (type, payload) => k.sendCommand(type, payload);

  await cmd("kernel.workflow.create", {
    id: WF,
    name: "R3 product proof",
    objective: "collect→{analyze,extract}→synthesize",
    status: "active",
    vaultPath: ART,
  });

  for (const [id, title] of [
    ["collect", "Collect sources"],
    ["analyze", "Analyze themes"],
    ["extract", "Extract facts"],
    ["synthesize", "Synthesize report"],
  ]) {
    await cmd("kernel.task.create", {
      id,
      workflowId: WF,
      correlationId: `corr_${id}`,
      title,
      objective: title,
    });
  }

  for (const [taskId, dep] of [
    ["analyze", "collect"],
    ["extract", "collect"],
    ["synthesize", "analyze"],
    ["synthesize", "extract"],
  ]) {
    await cmd("kernel.task.depend", { taskId, dependsOnTaskId: dep });
  }

  console.log("R3 DAG seeded:", WF, "artifact root:", ART);
  return WF;
})();
```

Create the artifact folder (PowerShell once):

```powershell
New-Item -ItemType Directory -Force -Path "C:\Users\rybow\Obsidian\QuantFlow Vault\Projects\QuantFlow\R3-proof-artifacts"
```

## 4. Atom helper (DevTools) — submit + verify after agent work

After an agent **claims** and writes a file, run this to finish the canonical atom (creates `verification_passed` so the DAG unlocks):

```javascript
async function r3FinishTask(taskId, relativePath = `${taskId}.md`) {
  const k = window.kernelApi;
  const WF = "wf-r3-proof";
  const ctx = await k.sendQuery("kernel.conductor.context", {});
  const task = ctx?.tasks?.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  const workerId = task.ownerWorkerId;
  if (!workerId) throw new Error("claim the task first (ownerWorkerId missing)");

  const art = await k.sendCommand("kernel.artifact.create", {
    workflowId: WF,
    taskId,
    workerId,
    uri: relativePath,
    kind: "file",
    summary: `R3 proof artifact for ${taskId}`,
  });
  if (!art?.ok) throw new Error(art?.error ?? "artifact.create failed");

  const sub = await k.sendCommand("kernel.task.submit", {
    taskId,
    artifactRefs: [art.id],
    summary: `${taskId} submitted`,
  });
  if (!sub?.ok) throw new Error(sub?.error ?? "submit failed");

  const ver = await k.sendCommand("kernel.task.verify", {
    taskId,
    verdict: "pass",
    operatorOverride: true,
    summary: `${taskId} verified (R3 proof)`,
  });
  if (!ver?.ok) throw new Error(ver?.error ?? "verify failed");

  const after = await k.sendQuery("kernel.task.get", { taskId });
  console.log(taskId, "→", after?.status);
  return after;
}
```

**Alternative:** Conductor panel → **Submit** then **Verify** (pass) after the agent claim, if artifacts are already linked.

## 5. Execution order (multi-agent)

| Step | Who | Action |
| --- | --- | --- |
| 1 | Hermes | `qf_task_list` → only **collect** is claimable. `qf_task_claim` collect. Write `collect.md` under artifact root. |
| 1b | You | `await r3FinishTask("collect")` |
| 2a | Hermes | Claim **analyze** (now eligible). Short analysis → `analyze.md`. |
| 2b | Codex | Claim **extract** in parallel (also eligible). Short extract → `extract.md`. |
| 2c | You | `await r3FinishTask("analyze")` and `await r3FinishTask("extract")` |
| 3 | Hermes | Claim **synthesize** (only after both branches verified). Write `synthesize.md`. |
| 3b | You | `await r3FinishTask("synthesize")` |

### Agent prompts (paste into each tile)

**Hermes (after seed):**

```text
R3 product proof. Workflow wf-r3-proof. Read repo handoff:
/mnt/c/Users/rybow/QuantFlow/docs/v4/handoffs/R3-product-proof-operator.md

You own collect, analyze, and synthesize. Codex owns extract.
Use qf_task_list; claim only tasks that are open and not blocked.
After each claim, write a one-paragraph result to the artifact folder shown in your task.
Do NOT qf_task_complete — stop after writing the file; operator will submit/verify.
Start with collect only.
```

**Codex (after collect is verified):**

```text
R3 product proof. Workflow wf-r3-proof. Claim task "extract" when eligible (after collect verified).
Write extract.md in the artifact folder. Do not qf_task_complete — operator verifies.
```

### Negative check (optional but strong)

Before step 1b, in Hermes try claiming **analyze** — Kernel must reject (`unverified upstream dependencies: collect`).

## 6. Witness queries (capture for ledger)

```javascript
const WF = "wf-r3-proof";
const run = await window.kernelApi.sendQuery("kernel.run", { workflowId: WF });
console.log("Run projection:", run);
// Expect: 4 task ids, artifact ids, receipt ids; runId === workflowId === WF

const ctx = await window.kernelApi.sendQuery("kernel.conductor.context", {});
console.log("Tasks:", ctx.tasks.map(t => ({ id: t.id, status: t.status })));
// All four → complete
```

**Capture:** screenshot of canvas (Hermes + Codex tiles), DevTools `Run projection` JSON, final task statuses.

## 7. Authority smoke (optional second proof)

Run Workflow once (Play button) with prompt:

```text
R3 authority smoke: qf_task_list → claim this task → qf_task_update progress → qf_task_complete one sentence.
```

Confirm same `task_id` in Kernel and Envoy mirror (`kernel.task.get` + inbox).

## 8. Close R3 in ledger (you approve)

Edit `BUILD_PLAN_V4.md` R3 row:

- R3a ✅ R3b ✅ R3c-a ✅ R3c-b ✅
- Machine proof: §6 below, date witnessed
- Product proof: operator-witnessed DAG run (paste session date + tile ids)
- Then promote R4 when ready

---

## §6 Machine proof log (2026-06-21)

Run from `quantflow-electron`:

| Command | Result |
| --- | --- |
| `bun run smoke:authority` | OK — 0 failure(s) (17 checks) |
| `bun run smoke:dag` | OK — 0 failure(s) |
| `bun run smoke:task-atom` | OK — 0 failure(s) |
| `bun test src/main/envoy-task-service.test.ts src/main/workflow-service.test.ts src/main/vault-paths.test.ts` | 21 pass |
| `bun run smoke:envoy-task` | ok, final_status done |
| `cd ../tools/quantflow-mcp && node --test` | 24 pass |
| `bun run build` | ✓ built |

Commits: `1881d0c` (R3c-b), `7fd2fba` (sqlite bundle fix), `2c97dd3` (vault path + runbook).
