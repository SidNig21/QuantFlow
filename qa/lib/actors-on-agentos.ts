import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BUILT_IN_LEGEND_RECIPES } from '../../quantflow-electron/src/main/legend-recipes';
import { buildDockRoles } from '../../quantflow-electron/src/main/dock-actors';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const HERDR_ACTOR_RECIPES = [
  { id: 'codex', software: 'codex', commandTemplate: 'codex' },
  { id: 'hermes', commandTemplate: 'hermes' },
  { id: 'claude', software: 'claude-code', commandTemplate: 'claude' },
] as const;

const EVE_ACTOR = { id: 'eve', runtimeTarget: 'windows-pty' } as const;

function assertBuiltInLegendRecipes(): boolean {
  for (const expected of HERDR_ACTOR_RECIPES) {
    const recipe = BUILT_IN_LEGEND_RECIPES.find((r) => r.id === expected.id);
    if (!recipe) {
      console.error(`actors-on-herdr: missing built-in recipe ${expected.id}`);
      return false;
    }
    if (recipe.runtimeTarget !== 'herdr-wsl' || recipe.harnessKind !== 'herdr-shell') {
      console.error(`actors-on-herdr: ${expected.id} not on herdr-wsl transport`);
      return false;
    }
    if ('software' in expected && expected.software) {
      if (recipe.agentosSoftware !== expected.software) {
        console.error(`actors-on-herdr: ${expected.id} agentosSoftware=${recipe.agentosSoftware} want ${expected.software}`);
        return false;
      }
    } else if (recipe.agentosSoftware) {
      console.error(`actors-on-herdr: ${expected.id} should not carry agentosSoftware`);
      return false;
    }
    if (expected.commandTemplate && recipe.commandTemplate !== expected.commandTemplate) {
      console.error(`actors-on-herdr: ${expected.id} commandTemplate=${recipe.commandTemplate} want ${expected.commandTemplate}`);
      return false;
    }
  }

  const eve = BUILT_IN_LEGEND_RECIPES.find((r) => r.id === EVE_ACTOR.id);
  if (!eve || eve.runtimeTarget !== 'windows-pty') {
    console.error('actors-on-herdr: eve not on windows-pty transport');
    return false;
  }

  console.log('actors-on-herdr: codex/hermes/claude legend recipes on herdr-wsl');
  return true;
}

function assertBuiltInRoles(): boolean {
  const roles = buildDockRoles();
  for (const roleId of ['hermes', 'codex', 'claude'] as const) {
    const role = roles.find((entry) => entry.id === roleId);
    if (!role) {
      console.error(`actors-on-herdr: role ${roleId} not found in dock-actors`);
      return false;
    }
    if (role.runtimeTarget !== 'herdr-wsl') {
      console.error(`actors-on-herdr: role ${roleId} missing runtimeTarget herdr-wsl`);
      return false;
    }
    if (role.harnessKind !== 'herdr-shell') {
      console.error(`actors-on-herdr: role ${roleId} missing harnessKind herdr-shell`);
      return false;
    }
    if (role.legacyRuntimeTarget !== 'agentos') {
      console.error(`actors-on-herdr: role ${roleId} missing legacyRuntimeTarget agentos opt-in`);
      return false;
    }
    if (roleId === 'hermes') {
      if (role.commandTemplate !== 'hermes' || role.agentosSoftware) {
        console.error('actors-on-herdr: hermes must use commandTemplate hermes with no agentosSoftware');
        return false;
      }
    }
  }
  console.log('actors-on-herdr: built-in roles on native herdr rail');
  return true;
}

function assertSpawnUsesHerdrPath(): boolean {
  const roleSpawn = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/role-tile-spawn.js'),
    'utf8',
  );
  if (!roleSpawn.includes('requiresHerdrSpawn') || !roleSpawn.includes('herdrSpawnRole')) {
    console.error('actors-on-herdr: role spawn missing herdr path');
    return false;
  }
  console.log('actors-on-herdr: renderer uses herdr tile spawn for herdr-wsl roles');
  return true;
}

export async function runActorsOnAgentosCheck(): Promise<boolean> {
  let ok = true;
  if (!assertBuiltInLegendRecipes()) ok = false;
  if (!assertBuiltInRoles()) ok = false;
  if (!assertSpawnUsesHerdrPath()) ok = false;

  const { runKillSwitchCheck } = await import('./kill-switch');
  if (!(await runKillSwitchCheck())) {
    console.error('actors-on-herdr: kill-switch not green');
    ok = false;
  } else {
    console.log('actors-on-herdr: kill-switch green');
  }

  const proof = Bun.spawnSync(['bun', 'run', 'proof:actors-on-agentos'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('actors-on-herdr: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('actors-on-herdr: PASS (native herdr spawn rail; AgentOS opt-in only)');
  }
  return ok;
}
