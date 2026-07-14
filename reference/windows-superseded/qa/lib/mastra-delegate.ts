import { join } from 'node:path';
import { delegateToTileTool } from '../../quantflow-electron/src/main/mastra/tools/delegate-to-tile';
import {
  registerTileRelayBinding,
  syncConnectionGraph,
} from '../../quantflow-electron/src/main/tile-session-registry';

const REPO_ROOT = join(import.meta.dir, '..', '..');

async function assertSimDelegateTool(): Promise<boolean> {
  process.env.QF_AGENTOS_SIM = '1';

  const tileA = 'qa-mastra-a';
  const tileB = 'qa-mastra-b';
  const connectionId = 'conn-qa-mastra';

  registerTileRelayBinding(tileA, {
    runtimeTarget: 'windows-pty',
    ptySessionId: 'pty-qa-a',
  });
  registerTileRelayBinding(tileB, {
    runtimeTarget: 'windows-pty',
    ptySessionId: 'pty-qa-b',
  });
  syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

  const result = await delegateToTileTool.execute({
    fromTileId: tileA,
    toTileId: tileB,
    connectionId,
    message: 'status check',
  });

  if (!result.ok || !result.reply?.startsWith('ack:')) {
    console.error('mastra-delegate: sim tool execute failed', result);
    return false;
  }

  console.log('mastra-delegate: sim delegateToTile OK');
  return true;
}

export async function runMastraDelegateCheck(): Promise<boolean> {
  let ok = true;
  if (!(await assertSimDelegateTool())) ok = false;

  const unit = Bun.spawnSync(
    ['bun', 'test', 'quantflow-electron/src/main/mastra/tools/delegate-to-tile.test.ts'],
    { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
  );
  if (unit.exitCode !== 0) {
    console.error('mastra-delegate: unit tests failed');
    ok = false;
  }

  if (ok) {
    console.log('mastra-delegate: PASS (sim delegate tool + unit tests)');
  }
  return ok;
}
