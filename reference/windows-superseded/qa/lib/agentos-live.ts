import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSimApprovalGate } from '../../src/harness/agentos/approval-gate';
import { resolveAgentOsCredential } from '../../src/harness/agentos/credential-order';
import { createAgentOsHarness } from '../../src/harness/agentos/index';
import { createHttpAgentOsTransport } from '../../src/harness/agentos/http-transport';
import {
  startAgentOsHost,
  stopAgentOsHost,
} from '../../src/harness/agentos/host-lifecycle';

const LIVE_TIMEOUT_MS = 5 * 60 * 1000;
const SPIKE_PROMPT = [
  'You have a CLI tool `agentos-quantflow` available. Do exactly this, in order:',
  '1. Run: agentos-quantflow receipt-emit --kind spike.start --detail begin',
  "2. Run: agentos-quantflow approval-request --action 'write tier2 result file'",
  '3. ONLY if step 2 returned approved:true, write /workspace/tier2-result.txt containing exactly: bindings-approved-hello',
  '4. Run: agentos-quantflow receipt-emit --kind spike.done --detail wrote-file',
].join('\n');

function milestoneLabel(draft: { type: string; metadata?: Record<string, unknown> }): string {
  const milestone = draft.metadata?.['milestone'];
  if (typeof milestone === 'string') return milestone;
  return draft.type;
}

export async function runAgentOsLiveCheck(): Promise<boolean> {
  const credential = resolveAgentOsCredential();
  if (!credential) {
    console.log('SKIP agentos-live: no credential (Deferred-founder)');
    return true;
  }

  const deadline = Date.now() + LIVE_TIMEOUT_MS;
  const guardTimeout = (): boolean => {
    if (Date.now() > deadline) {
      console.error('agentos-live: timed out after 5 minutes');
      return false;
    }
    return true;
  };

  let hostHandle: Awaited<ReturnType<typeof startAgentOsHost>> | null = null;
  const workspace = mkdtempSync(join(tmpdir(), 'qf-agentos-live-'));

  try {
    if (!guardTimeout()) return false;
    hostHandle = await startAgentOsHost();

    const transport = createHttpAgentOsTransport({
      host: hostHandle.host,
      port: hostHandle.port,
    });
    const gate = createSimApprovalGate(2_000);
    const harness = createAgentOsHarness({
      transport,
      workspace,
      software: credential.software,
      approvalGate: gate,
    });

    const handle = await harness.spawn({
      tileId: 'tile_agentos_live',
      roleId: 'worker_agentos_live',
      workflowId: 'wf-agentos-live',
      cwd: workspace,
    });

    if (!guardTimeout()) return false;
    await harness.send(handle, {
      text: SPIKE_PROMPT,
      taskId: 'task_agentos_live',
      workflowId: 'wf-agentos-live',
      artifactRoot: workspace,
    });

    const drafts = await harness.collectReceipts(handle);
    const labels = drafts.map((d) => milestoneLabel(d));

    const startIdx = labels.indexOf('session.start');
    const firstToolIdx = labels.findIndex((l) => l === 'tool.started');
    const approvalReqIdx = labels.indexOf('approval.requested');
    const approvalGrantIdx = labels.indexOf('approval.granted');
    const artifactIdx = labels.findIndex((l) => l === 'artifact.created' || l === 'task_submitted');
    const completeIdx = labels.indexOf('turn.complete');

    if (startIdx < 0 || firstToolIdx < 0 || approvalReqIdx < 0 || approvalGrantIdx < 0 || completeIdx < 0) {
      console.error('agentos-live: missing expected milestones:', labels.join(' → '));
      return false;
    }
    if (!(startIdx < firstToolIdx && firstToolIdx < approvalReqIdx && approvalReqIdx < approvalGrantIdx)) {
      console.error('agentos-live: tool/approval order wrong:', labels.join(' → '));
      return false;
    }
    if (artifactIdx >= 0 && !(approvalGrantIdx < artifactIdx && artifactIdx < completeIdx)) {
      console.error('agentos-live: artifact/complete order wrong:', labels.join(' → '));
      return false;
    }
    if (gate.records.length !== 1 || (gate.records[0]?.blockedMs ?? 0) <= 0) {
      console.error(`agentos-live: approval gate did not block (records=${gate.records.length})`);
      return false;
    }

    await harness.stop(handle);
    if (!guardTimeout()) return false;

    try {
      await harness.send(handle, { text: 'probe after stop', taskId: 'task_agentos_live_probe' });
      console.error('agentos-live: send should fail after host stop');
      return false;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!/unavailable|ECONNREFUSED|health check failed/i.test(msg)) {
        console.error(`agentos-live: unexpected post-stop error: ${msg}`);
        return false;
      }
    }

    console.log(`agentos-live: PASS (${credential.credentialName}, blockedMs=${gate.records[0]?.blockedMs})`);
    return true;
  } catch (error) {
    console.error('agentos-live: failed:', error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    if (hostHandle) {
      await stopAgentOsHost(hostHandle);
    }
  }
}
