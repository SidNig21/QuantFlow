import {
  DEFAULT_AGENTOS_HEALTH_TIMEOUT_MS,
  resolveAgentOsHealthTimeoutMs,
} from '../../src/harness/agentos/host-lifecycle';
import {
  classifyAgentOsFailure,
  formatAgentOsUnavailable,
} from '../../src/harness/agentos/error-messages';
import { runKillSwitchCheck } from './kill-switch';

function assertDistinctErrors(): boolean {
  const cred = formatAgentOsUnavailable('No AgentOS credential in environment', {
    hasCredential: false,
  });
  const model = formatAgentOsUnavailable('prompt failed: CreditsError', { hasCredential: true });
  const hostDown = formatAgentOsUnavailable('agentos-host did not become healthy within 90000ms', {
    hasCredential: true,
  });

  const messages = [hostDown, cred, model];
  const unique = new Set(messages);
  if (unique.size !== 3) {
    console.error('agentos-boot: expected three distinct failure messages');
    for (const msg of messages) console.error(`  - ${msg}`);
    return false;
  }

  if (classifyAgentOsFailure('agentos-host did not become healthy') !== 'host') {
    console.error('agentos-boot: host failure misclassified');
    return false;
  }
  if (classifyAgentOsFailure('No AgentOS credential in environment') !== 'credential') {
    console.error('agentos-boot: credential failure misclassified');
    return false;
  }
  if (classifyAgentOsFailure('CreditsError') !== 'model') {
    console.error('agentos-boot: model failure misclassified');
    return false;
  }

  console.log('agentos-boot: three failure classes verified');
  console.log(`  host: ${hostDown}`);
  console.log(`  credential: ${cred}`);
  console.log(`  model: ${model}`);
  return true;
}

function assertColdWslBudget(): boolean {
  const timeout = resolveAgentOsHealthTimeoutMs();
  if (timeout < DEFAULT_AGENTOS_HEALTH_TIMEOUT_MS) {
    console.error(`agentos-boot: health timeout ${timeout}ms below cold-WSL budget ${DEFAULT_AGENTOS_HEALTH_TIMEOUT_MS}ms`);
    return false;
  }
  console.log(`agentos-boot: cold-WSL health budget=${timeout}ms (default ${DEFAULT_AGENTOS_HEALTH_TIMEOUT_MS}ms)`);
  return true;
}

async function assertPrewarmHook(): Promise<boolean> {
  const result = Bun.spawnSync(
    ['bun', 'test', 'quantflow-electron/src/main/agentos-prewarm.test.ts'],
    { cwd: import.meta.dir + '/../..', stdout: 'pipe', stderr: 'pipe' },
  );
  if (result.exitCode !== 0) {
    console.error('agentos-boot: pre-warm unit test failed');
    console.error(result.stdout.toString());
    console.error(result.stderr.toString());
    return false;
  }
  console.log('agentos-boot: pre-warm on by default; opt-out via QF_AGENTOS_PREWARM=0 (unit test PASS)');
  return true;
}

export async function runAgentOsBootCheck(): Promise<boolean> {
  let ok = true;

  if (!assertColdWslBudget()) ok = false;
  if (!assertDistinctErrors()) ok = false;
  if (!(await assertPrewarmHook())) ok = false;

  const killOk = await runKillSwitchCheck();
  if (!killOk) {
    console.error('agentos-boot: kill-switch regression failed');
    ok = false;
  } else {
    console.log('agentos-boot: kill-switch GREEN');
  }

  if (ok) {
    console.log('agentos-boot: PASS (sim machinery; live one-click deferred until OPENCODE_API_KEY in WSL)');
  }
  return ok;
}
