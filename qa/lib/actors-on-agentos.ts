import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_LEGEND_RECIPES } from '../../quantflow-electron/src/main/legend-recipes';

const REPO_ROOT = join(import.meta.dir, '..', '..');

const ACTOR_RECIPES = [
  { id: 'codex', software: 'pi' },
  { id: 'hermes', software: 'pi' },
  { id: 'claude', software: 'claude-code' },
] as const;

function assertBuiltInLegendRecipes(): boolean {
  for (const expected of ACTOR_RECIPES) {
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
  console.log('actors-on-agentos: codex/hermes/claude legend recipes on agentos');
  return true;
}

function assertBuiltInRoles(): boolean {
  const source = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/main/role-service.ts'),
    'utf8',
  );
  for (const roleId of ['hermes', 'codex', 'claude-worker']) {
    const block = source.match(new RegExp(`id:\\s*"${roleId}"[\\s\\S]*?\\},`, 'm'));
    if (!block) {
      console.error(`actors-on-agentos: role ${roleId} not found`);
      return false;
    }
    if (!block[0].includes('runtimeTarget: "agentos"')) {
      console.error(`actors-on-agentos: role ${roleId} missing runtimeTarget agentos`);
      return false;
    }
    if (!block[0].includes('agentosSoftware:')) {
      console.error(`actors-on-agentos: role ${roleId} missing agentosSoftware`);
      return false;
    }
    if (!block[0].includes('legacyRuntimeTarget: "herdr-wsl"')) {
      console.error(`actors-on-agentos: role ${roleId} missing legacyRuntimeTarget herdr-wsl fallback`);
      return false;
    }
  }
  console.log('actors-on-agentos: built-in roles repointed with legacy fallback');
  return true;
}

function assertSpawnUsesAgentosPath(): boolean {
  const renderer = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/renderer.js'),
    'utf8',
  );
  if (!renderer.includes('spawnAgentOsTileAt')) {
    console.error('actors-on-agentos: renderer missing spawnAgentOsTileAt');
    return false;
  }
  console.log('actors-on-agentos: renderer uses agentos tile spawn');
  return true;
}

export async function runActorsOnAgentosCheck(): Promise<boolean> {
  let ok = true;
  if (!assertBuiltInLegendRecipes()) ok = false;
  if (!assertBuiltInRoles()) ok = false;
  if (!assertSpawnUsesAgentosPath()) ok = false;

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
    console.log('actors-on-agentos: PASS (sim; live model typing deferred until OPENCODE_API_KEY in WSL)');
  }
  return ok;
}
