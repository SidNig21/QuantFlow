import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _setLegendRegistryDirs,
  createLegendRecipe,
} from '../../quantflow-electron/src/main/legend-recipes';

const REPO_ROOT = join(import.meta.dir, '..', '..');

async function assertLegendRecipeCreateAgentos(): Promise<boolean> {
  const rolesDir = mkdtempSync(join(tmpdir(), 'qf-legend-agentos-'));
  _setLegendRegistryDirs({ rolesDir });
  try {
    const recipe = await createLegendRecipe({
      id: 'test-agentos-actor',
      name: 'Test AgentOS Actor',
      color: '#6366f1',
      icon: 'agentos',
      runtimeTarget: 'agentos',
      harnessKind: 'agentos',
      agentosSoftware: 'opencode',
      agentosInstruction: 'Say hello in one line.',
      type: 'agent',
    });
    if (recipe.runtimeTarget !== 'agentos' || recipe.harnessKind !== 'agentos') {
      console.error('legend-agentos: recipe missing agentos transport fields');
      return false;
    }
    if (recipe.agentosSoftware !== 'opencode') {
      console.error('legend-agentos: agentosSoftware not persisted');
      return false;
    }
    console.log('legend-agentos: createLegendRecipe agentos transport OK');
    return true;
  } finally {
    rmSync(rolesDir, { recursive: true, force: true });
  }
}

function assertAddAgentFormSource(): boolean {
  const source = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/add-agent-form.js'),
    'utf8',
  );
  if (!source.includes('value="agentos"')) {
    console.error('legend-agentos: add-agent-form missing agentos runtime option');
    return false;
  }
  if (!source.includes('agentosSoftware')) {
    console.error('legend-agentos: add-agent-form missing agentosSoftware field');
    return false;
  }
  console.log('legend-agentos: add-agent-form has agentos picker');
  return true;
}

function assertSpawnUsesRecipeFields(): boolean {
  const renderer = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/renderer.js'),
    'utf8',
  );
  if (!renderer.includes('recipe?.agentosSoftware')) {
    console.error('legend-agentos: renderer spawn missing agentosSoftware');
    return false;
  }
  if (!renderer.includes('recipe?.agentosInstruction')) {
    console.error('legend-agentos: renderer spawn missing agentosInstruction');
    return false;
  }
  console.log('legend-agentos: spawnLegendRecipeAt uses per-recipe agentos fields');
  return true;
}

function assertHerdrPathPreserved(): boolean {
  const renderer = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/renderer.js'),
    'utf8',
  );
  if (!renderer.includes('spawnRoleTileAt(role')) {
    console.error('legend-agentos: herdr/pty spawn path removed');
    return false;
  }
  console.log('legend-agentos: herdr/pty spawn path preserved');
  return true;
}

export async function runLegendAgentosCheck(): Promise<boolean> {
  let ok = true;
  if (!(await assertLegendRecipeCreateAgentos())) ok = false;
  if (!assertAddAgentFormSource()) ok = false;
  if (!assertSpawnUsesRecipeFields()) ok = false;
  if (!assertHerdrPathPreserved()) ok = false;

  const proof = Bun.spawnSync(['bun', 'run', 'proof:legend-agentos'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('legend-agentos: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('legend-agentos: PASS (sim; live dock spawn deferred until OPENCODE_API_KEY in WSL)');
  }
  return ok;
}
