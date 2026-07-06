import { join } from 'node:path';
import { sendConnectionRelay } from '../../quantflow-electron/src/main/agentos-a2a-relay';
import {
  getStringLog,
  registerTileRelayBinding,
  syncConnectionGraph,
} from '../../quantflow-electron/src/main/tile-session-registry';

const REPO_ROOT = join(import.meta.dir, '..', '..');

async function assertSimPiStickRelay(): Promise<boolean> {
  process.env.QF_AGENTOS_SIM = '1';

  const tileA = 'tile-pi-a2a-a';
  const tileB = 'tile-pi-a2a-b';
  const connectionId = 'conn-pi-a2a-proof';

  registerTileRelayBinding(tileA, { runtimeTarget: 'agentos' });
  registerTileRelayBinding(tileB, { runtimeTarget: 'agentos' });
  syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

  const sent = await sendConnectionRelay({
    connectionId,
    fromTileId: tileA,
    text: 'Reply with exactly PONG',
  });
  if (!sent.ok || sent.targetTileId !== tileB) {
    console.error('agentos-a2a: relay send failed', sent);
    return false;
  }

  const logs = getStringLog(connectionId, 10);
  const hasForward = logs.some((e) => e.fromTileId === tileA && e.toTileId === tileB);
  const hasAck = logs.some((e) => e.fromTileId === tileB && e.text.startsWith('ack:'));
  if (!hasForward || !hasAck) {
    console.error('agentos-a2a: relay log missing forward or sim ack', logs);
    return false;
  }

  console.log('agentos-a2a: sim relay forward + ack OK');
  return true;
}

export async function runAgentOsA2aCheck(): Promise<boolean> {
  let ok = true;
  if (!(await assertSimPiStickRelay())) ok = false;

  const proof = Bun.spawnSync(['bun', 'run', 'proof:agentos-a2a'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('agentos-a2a: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('agentos-a2a: PASS (two pi-stick sessions + sim cable relay)');
  }
  return ok;
}
