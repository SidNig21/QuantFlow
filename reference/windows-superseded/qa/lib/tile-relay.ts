import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sendConnectionRelay } from '../../quantflow-electron/src/main/agentos-a2a-relay';
import {
  getStringLog,
  registerTileRelayBinding,
  syncConnectionGraph,
} from '../../quantflow-electron/src/main/tile-session-registry';

const REPO_ROOT = join(import.meta.dir, '..', '..');

function assertDispatcherModule(): boolean {
  const source = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/main/tile-relay-dispatcher.ts'),
    'utf8',
  );
  if (!source.includes('sendTileDelegate')) {
    console.error('tile-relay: missing sendTileDelegate');
    return false;
  }
  if (!source.includes('herdr-wsl') || !source.includes('windows-pty')) {
    console.error('tile-relay: missing runtime backends');
    return false;
  }
  console.log('tile-relay: dispatcher module present');
  return true;
}

async function assertSimHerdrRelayRoundTrip(): Promise<boolean> {
  process.env.QF_AGENTOS_SIM = '1';

  const tileA = 'tile-a2a-a';
  const tileB = 'tile-a2a-b';
  const connectionId = 'conn-a2a-proof';

  registerTileRelayBinding(tileA, {
    runtimeTarget: 'herdr-wsl',
    herdrPaneId: 'pane-a2a-a',
  });
  registerTileRelayBinding(tileB, {
    runtimeTarget: 'herdr-wsl',
    herdrPaneId: 'pane-a2a-b',
  });
  syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

  const sent = await sendConnectionRelay({
    connectionId,
    fromTileId: tileA,
    text: 'delegate this task',
  });
  if (!sent.ok || sent.targetTileId !== tileB) {
    console.error('tile-relay: relay send failed', sent);
    return false;
  }

  const logs = getStringLog(connectionId, 10);
  const hasForward = logs.some((e) => e.fromTileId === tileA && e.toTileId === tileB);
  const hasAck = logs.some((e) => e.fromTileId === tileB && e.text.startsWith('ack:'));
  if (!hasForward || !hasAck) {
    console.error('tile-relay: relay log missing forward or sim ack', logs);
    return false;
  }

  console.log('tile-relay: sim herdr relay forward + ack OK');
  return true;
}

export async function runTileRelayCheck(): Promise<boolean> {
  let ok = true;
  if (!assertDispatcherModule()) ok = false;
  if (!(await assertSimHerdrRelayRoundTrip())) ok = false;

  const unit = Bun.spawnSync(
    ['bun', 'test', 'quantflow-electron/src/main/tile-relay-dispatcher.test.ts'],
    { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
  );
  if (unit.exitCode !== 0) {
    console.error('tile-relay: unit tests failed');
    ok = false;
  }

  if (ok) {
    console.log('tile-relay: PASS (herdr dispatcher + sim round-trip)');
  }
  return ok;
}
