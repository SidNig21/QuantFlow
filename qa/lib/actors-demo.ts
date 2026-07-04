import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

async function runDemoProofOnce(label: string, runTag: string): Promise<boolean> {
  console.log(`actors-demo: starting ${label}`);
  const proof = Bun.spawnSync(['bun', 'run', 'proof:actors-demo'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1', QF_ACTORS_DEMO_RUN: runTag },
  });
  if (proof.exitCode !== 0) {
    console.error(`actors-demo: ${label} failed (exit ${proof.exitCode})`);
    return false;
  }
  console.log(`actors-demo: ${label} OK`);
  return true;
}

export async function runActorsDemoCheck(): Promise<boolean> {
  const first = await runDemoProofOnce('run-1', '1');
  if (!first) return false;
  const second = await runDemoProofOnce('run-2', '2');
  if (!second) return false;
  console.log('actors-demo: PASS (full stack green twice consecutively)');
  return true;
}
