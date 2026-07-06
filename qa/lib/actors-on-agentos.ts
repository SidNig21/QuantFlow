import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BUILT_IN_LEGEND_RECIPES } from '../../quantflow-electron/src/main/legend-recipes';
import { buildDockRoles } from '../../quantflow-electron/src/main/dock-actors';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const AGENTOS_ACTOR_RECIPES = [
  { id: 'codex', software: 'codex' },
  { id: 'hermes', software: 'claude-code' },
  { id: 'claude', software: 'claude-code' },
] as const;

const EVE_ACTOR = { id: 'eve', runtimeTarget: 'windows-pty' } as const;

function assertBuiltInLegendRecipes(): boolean {
  for (const expected of AGENTOS_ACTOR_RECIPES) {
    const recipe = BUILT_IN_LEGEND_RECIPES.find((r) => r.id === expected.id);
    if (!recipe) {
      console.error(`actors-on-agentos: missing built-in recipe ${expected.id}`);
      return false;
    }
    if (recipe.runtimeTarget !== 'agentos' || recipe.harnessKind !== 'agentos') {
      console.error(`actors-on-agentos: ${expected.id} not on agentos transport`);
      return false;
    }
    if (recipe.agentosSoftware !== expected.software) {
      console.error(`actors-on-agentos: ${expected.id} agentosSoftware=${recipe.agentosSoftware} want ${expected.software}`);
      return false;
    }
  }

  const eve = BUILT_IN_LEGEND_RECIPES.find((r) => r.id === EVE_ACTOR.id);
  if (!eve || eve.runtimeTarget !== 'windows-pty') {
    console.error('actors-on-agentos: eve not on windows-pty transport');
    return false;
  }

  console.log('actors-on-agentos: codex/hermes/claude legend recipes on agentos');
  return true;
}

function assertBuiltInRoles(): boolean {
  const roles = buildDockRoles();
  const softwareById = {
    codex: 'codex',
    claude: 'claude-code',
    hermes: 'claude-code',
  } as const;
  for (const roleId of ['hermes', 'codex', 'claude'] as const) {
    const role = roles.find((entry) => entry.id === roleId);
    if (!role) {
      console.error(`actors-on-agentos: role ${roleId} not found in dock-actors`);
      return false;
    }
    if (role.runtimeTarget !== 'agentos') {
      console.error(`actors-on-agentos: role ${roleId} missing runtimeTarget agentos`);
      return false;
    }
    if (role.harnessKind !== 'agentos') {
      console.error(`actors-on-agentos: role ${roleId} missing harnessKind agentos`);
      return false;
    }
    if (role.legacyRuntimeTarget !== 'herdr-wsl') {
      console.error(`actors-on-agentos: role ${roleId} missing legacyRuntimeTarget herdr-wsl`);
      return false;
    }
    if (role.agentosSoftware !== softwareById[roleId]) {
      console.error(`actors-on-agentos: role ${roleId} agentosSoftware=${role.agentosSoftware}`);
      return false;
    }
  }
  console.log('actors-on-agentos: built-in roles on AgentOS rail');
  return true;
}

function assertSpawnUsesAgentOsPath(): boolean {
  const roleSpawn = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/role-tile-spawn.js'),
    'utf8',
  );
  if (!roleSpawn.includes('spawnAgentOsTileAt') || !roleSpawn.includes('agentosTerminalPrepare')) {
    console.error('actors-on-agentos: role spawn missing agentos path');
    return false;
  }
  console.log('actors-on-agentos: renderer uses agentos tile spawn for agentos roles');
  return true;
}

export async function runActorsOnAgentosCheck(): Promise<boolean> {
  let ok = true;
  if (!assertBuiltInLegendRecipes()) ok = false;
  if (!assertBuiltInRoles()) ok = false;
  if (!assertSpawnUsesAgentOsPath()) ok = false;

  const { runKillSwitchCheck } = await import('./kill-switch');
  if (!(await runKillSwitchCheck())) {
    console.error('actors-on-agentos: kill-switch not green');
    ok = false;
  } else {
    console.log('actors-on-agentos: kill-switch green');
  }

  const proof = Bun.spawnSync(['bun', 'run', 'proof:actors-on-agentos'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('actors-on-agentos: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('actors-on-agentos: PASS (AgentOS spawn rail; live typing deferred until claude setup-token)');
  }
  return ok;
}
