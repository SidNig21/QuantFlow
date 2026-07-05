import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runHermesOrchestrator } from '../../quantflow-electron/src/main/agentos-orchestrator';
import { getStringLog, registerTileRelayBinding, syncConnectionGraph } from '../../quantflow-electron/src/main/tile-session-registry';

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
  if (!source.includes('sendTileDelegate')) {
    console.error('orchestrator: must delegate via tile relay dispatcher');
    return false;
  }
  if (source.includes('prepareAgentOsTerminalAttach')) {
    console.error('orchestrator: must not force AgentOS attach on herdr tiles');
    return false;
  }
  console.log('orchestrator: module wires tile relay delegation');
  return true;
}

async function assertSimOrchestratorRun(): Promise<boolean> {
  process.env.QF_AGENTOS_SIM = '1';

  const orchestratorTileId = 'tile-orch';
  const workerTileId = 'tile-worker';
  const connectionId = 'conn-orch-worker';

  registerTileRelayBinding(orchestratorTileId, {
    runtimeTarget: 'herdr-wsl',
    herdrPaneId: 'pane-orch',
  });
  registerTileRelayBinding(workerTileId, {
    runtimeTarget: 'herdr-wsl',
    herdrPaneId: 'pane-worker',
  });
  syncConnectionGraph([{
    id: connectionId,
    tileAId: orchestratorTileId,
    tileBId: workerTileId,
  }]);

  const result = await runHermesOrchestrator({
    orchestratorTileId,
    goal: 'Summarize the workspace in one line',
    workers: [{ tileId: workerTileId }],
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

  console.log('orchestrator: sim Hermes run delegated via herdr relay');
  return true;
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
