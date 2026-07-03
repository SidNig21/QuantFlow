import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createEveHarness } from '../../src/harness/eve/index';
import { setKernelDbForTesting } from '../../src/kernel/database';
import { compareGoldenReceipts } from './golden-task-atom';

const UNREACHABLE_EVE = 'http://127.0.0.1:1';

async function runOneTruthRoundTrip(): Promise<boolean> {
  try {
    const { runOneTruthBootCheck } = await import('./one-truth-boot');
    const { runOneTruthSaveCheck } = await import('./one-truth-save');
    const bootOk = await runOneTruthBootCheck();
    const saveOk = await runOneTruthSaveCheck();
    return bootOk && saveOk;
  } finally {
    setKernelDbForTesting(null);
  }
}

async function probeEveUnavailable(): Promise<{ ok: boolean; message: string }> {
  const harness = createEveHarness({
    baseUrl: UNREACHABLE_EVE,
    workspace: mkdtempSync(join(tmpdir(), 'qf-eve-kill-')),
    streamTimeoutMs: 500,
    fetch: async () => {
      throw new Error('ECONNREFUSED');
    },
  });

  const handle = await harness.spawn({ tileId: 'tile-kill', roleId: 'eve-kill' });
  try {
    await harness.send(handle, { text: 'probe', taskId: 'task-kill' });
    return { ok: false, message: 'send should have failed against unreachable Eve' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/ECONNREFUSED|Eve HTTP error|fetch failed|unavailable/i.test(msg)) {
      return { ok: false, message: `unexpected Eve error shape: ${msg}` };
    }
  }

  const state = await harness.readState(handle);
  if (state.status === 'complete') {
    return { ok: false, message: 'readState must not report complete when Eve is down' };
  }

  await harness.stop(handle);
  return { ok: true, message: 'Eve harness degraded gracefully' };
}

export async function runKillSwitchCheck(): Promise<boolean> {
  let ok = true;
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on('unhandledRejection', onRejection);

  const savedEveUrl = process.env.QF_EVE_BASE_URL;
  const savedAgentOsHost = process.env.QF_AGENTOS_HOST;
  const savedAgentOsPort = process.env.QF_AGENTOS_PORT;
  delete process.env.QF_EVE_BASE_URL;
  delete process.env.QF_AGENTOS_HOST;
  delete process.env.QF_AGENTOS_PORT;
  process.env.QF_EVE_BASE_URL = UNREACHABLE_EVE;

  try {
    const goldenOk = await compareGoldenReceipts();
    if (!goldenOk) {
      ok = false;
      console.error('kill-switch: golden task-atom receipts diverged with external runtimes down');
    }

    const roundTripOk = await runOneTruthRoundTrip();
    if (!roundTripOk) {
      ok = false;
      console.error('kill-switch: one-truth boot/save round-trip failed with Eve/AgentOS unreachable');
    }

    const eveProbe = await probeEveUnavailable();
    if (!eveProbe.ok) {
      ok = false;
      console.error(`kill-switch: ${eveProbe.message}`);
    }
  } finally {
    if (savedEveUrl === undefined) delete process.env.QF_EVE_BASE_URL;
    else process.env.QF_EVE_BASE_URL = savedEveUrl;
    if (savedAgentOsHost === undefined) delete process.env.QF_AGENTOS_HOST;
    else process.env.QF_AGENTOS_HOST = savedAgentOsHost;
    if (savedAgentOsPort === undefined) delete process.env.QF_AGENTOS_PORT;
    else process.env.QF_AGENTOS_PORT = savedAgentOsPort;
    process.off('unhandledRejection', onRejection);
  }

  if (rejections.length > 0) {
    ok = false;
    console.error(`kill-switch: ${rejections.length} unhandled rejection(s) during check`);
    for (const r of rejections) {
      console.error('  -', r instanceof Error ? r.message : String(r));
    }
  }

  return ok;
}
