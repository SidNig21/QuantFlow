import { join } from 'node:path';
import { sendConnectionRelay } from '../../quantflow-electron/src/main/agentos-a2a-relay';
import {
  disposeAgentOsTerminalBridge,
  prepareAgentOsTerminalAttach,
} from '../../quantflow-electron/src/main/agentos-terminal-bridge';
import { disposeAgentOsService } from '../../quantflow-electron/src/main/agentos-service';
import {
  getStringLog,
  syncConnectionGraph,
} from '../../quantflow-electron/src/main/tile-session-registry';

const REPO_ROOT = join(import.meta.dir, '..', '..');

async function assertSimRelayRoundTrip(): Promise<boolean> {
  process.env.QF_AGENTOS_SIM = '1';
  await disposeAgentOsService();
  await disposeAgentOsTerminalBridge();

  const tileA = 'tile-a2a-a';
  const tileB = 'tile-a2a-b';
  const connectionId = 'conn-a2a-proof';

  try {
    await prepareAgentOsTerminalAttach({ tileId: tileA, software: 'pi' });
    await prepareAgentOsTerminalAttach({ tileId: tileB, software: 'pi' });
    syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

    const sent = await sendConnectionRelay({
      connectionId,
      fromTileId: tileA,
      text: 'delegate this task',
    });
    if (!sent.ok || sent.targetTileId !== tileB) {
      console.error('a2a-cable: relay send failed', sent);
      return false;
    }

    const logs = getStringLog(connectionId, 10);
    const hasForward = logs.some((e) => e.fromTileId === tileA && e.toTileId === tileB);
    const hasAck = logs.some((e) => e.fromTileId === tileB && e.text.startsWith('ack:'));
    if (!hasForward || !hasAck) {
      console.error('a2a-cable: relay log missing forward or sim ack', logs);
      return false;
    }

    console.log('a2a-cable: sim relay forward + ack OK');
    return true;
  } finally {
    await disposeAgentOsTerminalBridge();
    await disposeAgentOsService();
  }
}

export async function runA2aCableCheck(): Promise<boolean> {
  let ok = true;
  if (!(await assertSimRelayRoundTrip())) ok = false;

  const proof = Bun.spawnSync(['bun', 'run', 'proof:a2a-cable'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('a2a-cable: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('a2a-cable: PASS (sim cable relay + scripted canvas proof)');
  }
  return ok;
}
