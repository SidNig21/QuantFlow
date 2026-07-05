import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runHermesOrchestrator } from '../../quantflow-electron/src/main/agentos-orchestrator';
import {
  disposeAgentOsTerminalBridge,
  prepareAgentOsTerminalAttach,
} from '../../quantflow-electron/src/main/agentos-terminal-bridge';
import { disposeAgentOsService } from '../../quantflow-electron/src/main/agentos-service';
import { getStringLog, syncConnectionGraph } from '../../quantflow-electron/src/main/tile-session-registry';

const REPO_ROOT = join(import.meta.dir, '..', '..');

function assertOrchestratorModule(): boolean {
  const source = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/main/agentos-orchestrator.ts'),
    'utf8',
  );
  if (!source.includes('runHermesOrchestrator')) {
    console.error('orchestrator: missing runHermesOrchestrator');
    return false;
  }
  if (!source.includes('postHostDelegateSend') && !source.includes('sendConnectionRelay')) {
    console.error('orchestrator: must delegate via agentos-delegate toolkit bridge');
    return false;
  }
  if (!source.includes('prepareAgentOsTerminalAttach')) {
    console.error('orchestrator: must spawn workers via legend terminal attach');
    return false;
  }
  console.log('orchestrator: module wires spawn + relay');
  return true;
}

async function assertSimOrchestratorRun(): Promise<boolean> {
  process.env.QF_AGENTOS_SIM = '1';
  await disposeAgentOsService();
  await disposeAgentOsTerminalBridge();

  const orchestratorTileId = 'tile-orch';
  const workerTileId = 'tile-worker';
  const connectionId = 'conn-orch-worker';

  try {
    syncConnectionGraph([{
      id: connectionId,
      tileAId: orchestratorTileId,
      tileBId: workerTileId,
    }]);

    const result = await runHermesOrchestrator({
      orchestratorTileId,
      goal: 'Summarize the workspace in one line',
      workers: [{ tileId: workerTileId, software: 'pi' }],
      connectionIds: [connectionId],
    });

    if (!result.ok) {
      console.error('orchestrator: sim run failed', result);
      return false;
    }

    const logs = getStringLog(connectionId, 10);
    if (!logs.some((e) => e.fromTileId === orchestratorTileId && e.toTileId === workerTileId)) {
      console.error('orchestrator: delegation log missing', logs);
      return false;
    }

    console.log('orchestrator: sim Hermes run spawned worker + delegated');
    return true;
  } finally {
    await disposeAgentOsTerminalBridge();
    await disposeAgentOsService();
  }
}

export async function runOrchestratorCheck(): Promise<boolean> {
  let ok = true;
  if (!assertOrchestratorModule()) ok = false;
  if (!(await assertSimOrchestratorRun())) ok = false;

  const proof = Bun.spawnSync(['bun', 'run', 'proof:orchestrator'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('orchestrator: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('orchestrator: PASS (sim delegation + scripted canvas proof)');
  }
  return ok;
}
