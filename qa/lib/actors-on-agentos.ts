import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BUILT_IN_LEGEND_RECIPES } from '../../quantflow-electron/src/main/legend-recipes';
import { buildDockRoles } from '../../quantflow-electron/src/main/dock-actors';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const AGENTOS_ACTOR_ROLES = [
  { id: 'pi-stick', software: 'pi' },
  { id: 'hermes', software: 'claude-code' },
  { id: 'eve', software: 'eve' },
] as const;

const WINDOWS_NATIVE_ROLES = ['codex', 'claude'] as const;

function assertBuiltInLegendRecipes(): boolean {
  if (BUILT_IN_LEGEND_RECIPES.length === 0) {
    console.log('actors-on-agentos: verified dock recipe rail empty before promotion');
    return true;
  }

  for (const expected of AGENTOS_ACTOR_ROLES) {
    const recipe = BUILT_IN_LEGEND_RECIPES.find((r) => r.id === expected.id);
    if (!recipe) continue;
    if (recipe.runtimeTarget !== 'agentos' || recipe.harnessKind !== 'agentos') {
      console.error(`actors-on-agentos: ${expected.id} not on agentos transport`);
      return false;
    }
    if (recipe.agentosSoftware !== expected.software) {
      console.error(`actors-on-agentos: ${expected.id} agentosSoftware=${recipe.agentosSoftware} want ${expected.software}`);
      return false;
    }
  }

  console.log('actors-on-agentos: verified dock recipes, when present, match AgentOS rail');
  return true;
}

function assertBuiltInRoles(): boolean {
  const roles = buildDockRoles();
  const softwareById = Object.fromEntries(
    AGENTOS_ACTOR_ROLES.map((entry) => [entry.id, entry.software]),
  ) as Record<(typeof AGENTOS_ACTOR_ROLES)[number]['id'], string>;
  for (const roleId of AGENTOS_ACTOR_ROLES.map((entry) => entry.id)) {
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
    if (role.agentosSoftware !== softwareById[roleId]) {
      console.error(`actors-on-agentos: role ${roleId} agentosSoftware=${role.agentosSoftware}`);
      return false;
    }
  }

  for (const roleId of WINDOWS_NATIVE_ROLES) {
    const role = roles.find((entry) => entry.id === roleId);
    if (!role || role.runtimeTarget !== 'windows-pty') {
      console.error(`actors-on-agentos: role ${roleId} should remain windows-pty`);
      return false;
    }
  }
  console.log('actors-on-agentos: built-in role routing matches AgentOS/Eve proof rail');
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

  if (BUILT_IN_LEGEND_RECIPES.length === 0) {
    console.log('actors-on-agentos: electron click proof deferred until U7 dock promotion');
  } else {
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
  }

  if (ok) {
    console.log('actors-on-agentos: PASS (AgentOS spawn rail; live typing deferred until claude setup-token)');
  }
  return ok;
}
