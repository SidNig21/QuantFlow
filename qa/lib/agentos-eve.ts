import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildDockRoles,
  DOCK_SPAWN_ACTOR_IDS,
  getDockActor,
} from '../../quantflow-electron/src/main/dock-actors';

const REPO_ROOT = join(import.meta.dir, '..', '..');

function assertEveDockActor(): boolean {
  const actor = getDockActor('eve');
  if (!actor) {
    console.error('agentos-eve: eve actor missing from dock-actors');
    return false;
  }
  const role = buildDockRoles().find((entry) => entry.id === 'eve');
  if (!role || role.runtimeTarget !== 'agentos' || role.harnessKind !== 'agentos') {
    console.error('agentos-eve: eve not on agentos rail');
    return false;
  }
  if (role.agentosSoftware !== 'eve') {
    console.error(`agentos-eve: eve agentosSoftware=${role.agentosSoftware}`);
    return false;
  }
  if ([...DOCK_SPAWN_ACTOR_IDS].includes('eve')) {
    console.error('agentos-eve: eve promoted to DOCK_SPAWN_ACTOR_IDS before U7');
    return false;
  }
  console.log('agentos-eve: eve dock actor is staged on agentos rail and hidden from spawn list');
  return true;
}

function assertLegendProofRecipeCanSelectEve(): boolean {
  const source = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/main/ipc-legend-recipes.ts'),
    'utf8',
  );
  if (!source.includes('input.agentosSoftware === "eve"')) {
    console.error('agentos-eve: legend.create parser does not accept agentosSoftware=eve');
    return false;
  }
  console.log('agentos-eve: proof legend recipe can select eve software');
  return true;
}

function assertSpawnUsesAgentOsPath(): boolean {
  const roleSpawn = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/role-tile-spawn.js'),
    'utf8',
  );
  if (!roleSpawn.includes('spawnAgentOsTileAt') || !roleSpawn.includes('agentosTerminalPrepare')) {
    console.error('agentos-eve: role spawn missing agentos path');
    return false;
  }
  console.log('agentos-eve: renderer uses agentos tile spawn');
  return true;
}

export async function runAgentOsEveCheck(): Promise<boolean> {
  let ok = true;
  if (!assertEveDockActor()) ok = false;
  if (!assertLegendProofRecipeCanSelectEve()) ok = false;
  if (!assertSpawnUsesAgentOsPath()) ok = false;

  const unit = Bun.spawnSync(['bun', 'test', 'quantflow-electron/src/main/dock-actors.test.ts'], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (unit.exitCode !== 0) {
    console.error('agentos-eve: dock-actors unit tests failed');
    ok = false;
  }

  const proof = Bun.spawnSync(['bun', 'run', 'proof:agentos-eve'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env },
  });
  if (proof.exitCode !== 0) {
    console.error('agentos-eve: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('agentos-eve: PASS (proof recipe spawn + Eve AgentOS attach + live prompt)');
  }
  return ok;
}
