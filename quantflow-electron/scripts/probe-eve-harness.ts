/**
 * Localizes WHERE the eve-harness blocks in the spawn -> send -> readState ->
 * collectReceipts sequence. Each call is timeout-wrapped so nothing hangs.
 * Run: QF_EVE_WORKSPACE=... QF_EVE_BASE_URL=http://127.0.0.1:2000 bun scripts/probe-eve-harness.ts
 */
import { createEveHarness } from '../../src/harness/eve/index';

const baseUrl = process.env.QF_EVE_BASE_URL ?? 'http://127.0.0.1:2000';
const workspace = process.env.QF_EVE_WORKSPACE!;
const eve = createEveHarness({ baseUrl, workspace });

const t0 = Date.now();
const log = (m: string) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT in ${label} after ${ms}ms`)), ms)),
  ]);
}

try {
  log('spawn (POST /session, TASK as the single first message)…');
  const h = await withTimeout(eve.spawn({ tileId: 't', workflowId: 'wf', activationPrompt: 'QuantFlow task: write a one-sentence markdown note confirming the proof, then save it as the deliverable.' }), 20000, 'spawn');
  log(`  spawn OK  sessionId=${h.eveSessionId}`);
  log('  (single-turn variant: skipping send)');

  log('readState (GET /stream)…');
  const st = await withTimeout(eve.readState(h), 45000, 'readState');
  log(`  readState OK -> ${JSON.stringify(st)}`);

  log('collectReceipts…');
  const d = await withTimeout(eve.collectReceipts(h), 45000, 'collectReceipts');
  log(`  collectReceipts OK -> ${JSON.stringify(d)}`);
  log('ALL STAGES PASSED');
} catch (err) {
  log(`BLOCKED/ERROR -> ${(err as Error).message}`);
  process.exit(1);
}
