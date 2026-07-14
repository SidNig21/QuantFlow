import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildDockRoles, getDockActor } from '../../quantflow-electron/src/main/dock-actors';

const REPO_ROOT = join(import.meta.dir, '..', '..');

function assertPiStickDockActor(): boolean {
  const actor = getDockActor('pi-stick');
  if (!actor) {
    console.error('agentos-stick: pi-stick actor missing from dock-actors');
    return false;
  }
  const role = buildDockRoles().find((entry) => entry.id === 'pi-stick');
  if (!role || role.runtimeTarget !== 'agentos' || role.harnessKind !== 'agentos') {
    console.error('agentos-stick: pi-stick not on agentos rail');
    return false;
  }
  if (role.agentosSoftware !== 'pi') {
    console.error(`agentos-stick: pi-stick agentosSoftware=${role.agentosSoftware}`);
    return false;
  }
  console.log('agentos-stick: pi-stick dock actor on agentos rail');
  return true;
}

function assertSpawnUsesAgentOsPath(): boolean {
  const roleSpawn = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/role-tile-spawn.js'),
    'utf8',
  );
  if (!roleSpawn.includes('spawnAgentOsTileAt') || !roleSpawn.includes('agentosTerminalPrepare')) {
    console.error('agentos-stick: role spawn missing agentos path');
    return false;
  }
  console.log('agentos-stick: renderer uses agentos tile spawn');
  return true;
}

export async function runAgentOsStickCheck(): Promise<boolean> {
  let ok = true;
  if (!assertPiStickDockActor()) ok = false;
  if (!assertSpawnUsesAgentOsPath()) ok = false;

  const unit = Bun.spawnSync(['bun', 'test', 'quantflow-electron/src/main/dock-actors.test.ts'], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (unit.exitCode !== 0) {
    console.error('agentos-stick: dock-actors unit tests failed');
    ok = false;
  }

  const proof = Bun.spawnSync(['bun', 'run', 'proof:agentos-stick'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('agentos-stick: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('agentos-stick: PASS (pi-stick spawn + session attach + sim prompt)');
  }
  return ok;
}
