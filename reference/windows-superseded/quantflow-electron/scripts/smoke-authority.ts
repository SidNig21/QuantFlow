/**
 * smoke:authority (R3c-b) — Kernel is the sole task authority; Envoy mirrors.
 *
 * Asserts:
 *   - Run Workflow / Envoy create writes Kernel task first (task_id ≡ kernel id)
 *   - claim / complete mutate Kernel state; mirror reflects Kernel
 *   - direct mirror-only status writes cannot override Kernel truth on read
 *   - second claim rejected by Kernel gate
 */

import { EnvoyService, type EnvoyCliRunner } from "../src/main/envoy-service";
import { EnvoyTaskService, resetEnvoyTaskServiceForTesting } from "../src/main/envoy-task-service";
import { installTestRuntimeDb } from "../src/main/runtime-state/test-sqlite-adapter";
import { closeDb } from "../src/main/runtime-state/database";
import {
  _resetForTesting as resetEnvoy,
  getEnvoyTask,
  listEnvoyTasks,
  updateEnvoyTask,
} from "../src/main/runtime-state/envoy-repo";
import { _resetForTesting as resetEvents } from "../src/main/runtime-state/events-repo";
import { createConnection, _resetForTesting as resetConnections } from "../src/main/runtime-state/connections-repo";
import {
  createWorkflowTask,
  WORKFLOW_SOURCE_TILE_ID,
} from "../src/main/workflow-service";
import { installTestKernelDb, closeTestKernelDb } from "../src/main/test-kernel-db";
import { getKernelDb } from "../../src/kernel/database";
import { queryTaskGet } from "../../src/kernel/tasks/index";

let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
}

function makeRunner(): EnvoyCliRunner {
  let taskCounter = 0;
  return async (args) => {
    if (args.includes("spaces")) {
      return { stdout: JSON.stringify({ spaces: [] }), stderr: "", exitCode: 0 };
    }
    if (args.includes("space") && args.includes("create")) {
      return { stdout: JSON.stringify({ space_id: "space-auth" }), stderr: "", exitCode: 0 };
    }
    if (args.includes("task") && args.includes("create")) {
      taskCounter += 1;
      return {
        stdout: JSON.stringify({ message_id: `envoy-msg-${taskCounter}` }),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: JSON.stringify({ message_id: "status-msg" }), stderr: "", exitCode: 0 };
  };
}

function makeService(): EnvoyTaskService {
  return new EnvoyTaskService({
    envoy: new EnvoyService({ runner: makeRunner() }),
    startListener: false,
  });
}

installTestKernelDb();
installTestRuntimeDb();
resetEvents();
resetConnections();
resetEnvoy();
resetEnvoyTaskServiceForTesting();

const service = makeService();
const db = getKernelDb();

console.log("— Run Workflow path: Kernel task created before mirror —");
const wf = await createWorkflowTask(
  { canvasId: "main", prompt: "Authority smoke workflow task" },
  service,
);
check("workflow returns taskId", Boolean(wf.taskId));
const kernelWf = queryTaskGet(db, wf.taskId);
check("kernel row exists for workflow task", kernelWf != null);
check("task_id ≡ kernel id", wf.taskId === kernelWf?.id);
check("correlation ids match", wf.correlationId === kernelWf?.correlationId);
check("kernel status open after create", kernelWf?.status === "open");
const mirrorWf = getEnvoyTask(wf.taskId);
check("envoy mirror exists", mirrorWf != null);
check("mirror task_id matches kernel", mirrorWf?.task_id === wf.taskId);

console.log("\n— Cable task: create → claim → complete through Kernel —");
createConnection({ id: "conn-auth", tileAId: "hermes", tileBId: "codex" });
const created = await service.createTask({
  canvasId: "main",
  sourceTileId: "hermes",
  targetTileId: "codex",
  connectionId: "conn-auth",
  correlationId: "corr-auth",
  title: "Authority proof",
  instruction: "Prove one task authority",
}) as { task: { task_id: string } };
const taskId = created.task.task_id;
check("kernel task exists after envoy create", queryTaskGet(db, taskId)?.status === "open");

await service.claimTask({ taskId, claimingTileId: "codex", agentName: "Codex" });
check("kernel working after claim", queryTaskGet(db, taskId)?.status === "working");
check("mirror claimed_by set", getEnvoyTask(taskId)?.claimed_by === "Codex");

let secondClaimRejected = false;
try {
  await service.claimTask({ taskId, claimingTileId: "other", agentName: "Other" });
} catch {
  secondClaimRejected = true;
}
check("second claim rejected", secondClaimRejected);
check("kernel still working after rejected claim", queryTaskGet(db, taskId)?.status === "working");

await service.completeTask({
  taskId,
  resultSummary: "Done",
  artifactPaths: ["proof.md"],
  actorTileId: "codex",
});
check("kernel complete after envoy complete", queryTaskGet(db, taskId)?.status === "complete");
check("mirror done after kernel complete", getEnvoyTask(taskId)?.status === "done");

console.log("\n— Mirror cannot override Kernel truth on list refresh —");
updateEnvoyTask(taskId, { status: "inbox" });
const listed = service.listTasks({ correlationId: "corr-auth" }) as {
  tasks: Array<{ task_id: string; status: string }>;
};
check(
  "listTasks refreshes mirror from kernel (still done)",
  listed.tasks[0]?.status === "done",
);
check(
  "kernel still complete after mirror-only write",
  queryTaskGet(db, taskId)?.status === "complete",
);

console.log("\n— No orphan envoy tasks without kernel rows —");
const orphans = listEnvoyTasks({ canvasId: "main" }).filter(
  (row) => !queryTaskGet(db, row.task_id),
);
check("every envoy mirror has a kernel task", orphans.length === 0);

closeDb();
closeTestKernelDb();

console.log(`\n${failures === 0 ? "OK" : "FAILED"} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
