import { createSimTransport } from '../../src/harness/agentos/sim-transport';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');

async function assertSimTerminalBytes(): Promise<boolean> {
  const transport = createSimTransport();
  const { sessionId } = await transport.createSession('pi');
  const shellId = `sim-shell-${sessionId}`;
  const chunks: string[] = [];
  transport.onTerminalData(shellId, (bytes) => {
    chunks.push(Buffer.from(bytes).toString('utf8'));
  });
  const opened = await transport.openTerminal(sessionId, 80, 24);
  if (opened.shellId !== shellId) {
    console.error(`agentos-terminal: unexpected shellId ${opened.shellId}`);
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (!chunks.some((c) => c.includes('AgentOS actor ready'))) {
    console.error('agentos-terminal: welcome bytes missing from sim terminal');
    return false;
  }
  await transport.writeTerminal(shellId, 'hello\r');
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (!chunks.some((c) => c.includes('[sim] received: hello'))) {
    console.error('agentos-terminal: echo bytes missing after write');
    return false;
  }
  await transport.resizeTerminal(shellId, 100, 40);
  console.log('agentos-terminal: sim bytes both ways + resize OK');
  return true;
}

function assertTerminalFirstSpawnSource(): boolean {
  const source = readFileSync(
    join(REPO_ROOT, 'quantflow-electron/src/windows/shell/src/role-tile-spawn.js'),
    'utf8',
  );
  if (source.includes('flipTile(tile.id)')) {
    console.error('agentos-terminal: spawn still auto-flips to state card');
    return false;
  }
  if (!source.includes('spawnTerminalWebview')) {
    console.error('agentos-terminal: spawn missing terminal webview');
    return false;
  }
  if (!source.includes('agentosTerminalPrepare')) {
    console.error('agentos-terminal: spawn missing agentosTerminalPrepare');
    return false;
  }
  console.log('agentos-terminal: spawn path is terminal-first (no auto-flip)');
  return true;
}

export async function runAgentOsTerminalCheck(): Promise<boolean> {
  let ok = true;
  if (!(await assertSimTerminalBytes())) ok = false;
  if (!assertTerminalFirstSpawnSource()) ok = false;

  const proof = Bun.spawnSync(['bun', 'run', 'proof:agentos-terminal'], {
    cwd: join(REPO_ROOT, 'quantflow-electron'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, QF_AGENTOS_SIM: '1' },
  });
  if (proof.exitCode !== 0) {
    console.error('agentos-terminal: electron proof failed');
    ok = false;
  }

  if (ok) {
    console.log('agentos-terminal: PASS (sim machinery; live typing deferred until OPENCODE_API_KEY in WSL)');
  }
  return ok;
}
