import { join } from 'node:path';

import {
  DOCK_SPAWN_ACTOR_IDS,
  getDockActor,
} from '../../quantflow-electron/src/main/dock-actors';

const REPO_ROOT = join(import.meta.dir, '..', '..');

function assertEveStillUnpromoted(): boolean {
  if (!getDockActor('eve')) {
    console.error('agentos-eve-multispawn: eve actor missing from dock registry');
    return false;
  }
  if ([...DOCK_SPAWN_ACTOR_IDS].includes('eve')) {
    console.error('agentos-eve-multispawn: eve promoted before U7 sign-off');
    return false;
  }
  console.log('agentos-eve-multispawn: eve remains staged but unpromoted');
  return true;
}

export async function runAgentOsEveMultispawnCheck(): Promise<boolean> {
  let ok = true;
  if (!assertEveStillUnpromoted()) ok = false;

  const proof = Bun.spawnSync(['bun', 'run', 'proof:agentos-eve-multispawn'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env },
  });
  if (proof.exitCode !== 0) {
    console.error('agentos-eve-multispawn: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('agentos-eve-multispawn: PASS (two live Eve AgentOS tiles, distinct actor keys)');
  }
  return ok;
}
