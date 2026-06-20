import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  HarnessDescriptor,
  PartialStateCard,
  ReceiptDraft,
  SpawnWorkerInput,
  WorkerHandle,
  WorkerHarness,
  WorkerMessage,
} from '../types';

export const mockHarness: HarnessDescriptor = {
  kind: 'mock',
  description: 'Deterministic CI-safe worker harness that writes one proof artifact',
  configSchema: {},
};

interface MockState {
  handle: WorkerHandle;
  sent: WorkerMessage[];
  status: 'idle' | 'working' | 'done' | 'stopped';
  draft?: ReceiptDraft;
  collected: boolean;
}

export interface MockWorkerHarness extends WorkerHarness {
  getRecordedSends(): Array<{ workerId: string; text: string; taskId: string | null }>;
}

export interface MockHarnessOptions {
  artifactRoot?: string;
}

export function createMockHarness(options: MockHarnessOptions = {}): MockWorkerHarness {
  const states = new Map<string, MockState>();
  const sent: Array<{ workerId: string; text: string; taskId: string | null }> = [];

  function getState(handle: WorkerHandle): MockState {
    let state = states.get(handle.workerId);
    if (!state) {
      state = { handle, sent: [], status: 'idle', collected: false };
      states.set(handle.workerId, state);
    }
    return state;
  }

  return {
    kind: 'mock',

    async spawn(input: SpawnWorkerInput): Promise<WorkerHandle> {
      const tileId = input.tileId ?? 'mock-tile';
      const handle: WorkerHandle = {
        workerId: `mock-worker-${tileId}`,
        tileId,
        kind: 'mock',
      };
      states.set(handle.workerId, { handle, sent: [], status: 'idle', collected: false });
      return handle;
    },

    async send(handle: WorkerHandle, message: WorkerMessage): Promise<void> {
      const state = getState(handle);
      state.status = 'working';
      state.sent.push(message);
      sent.push({ workerId: handle.workerId, text: message.text, taskId: message.taskId ?? null });

      const artifactRoot = resolve(message.artifactRoot ?? options.artifactRoot ?? join(process.cwd(), 'artifacts'));
      mkdirSync(artifactRoot, { recursive: true });
      const taskId = message.taskId ?? 'task';
      const artifactFileName = message.artifactFileName ?? `${taskId}-mock-artifact.txt`;
      const artifactFilePath = resolve(artifactRoot, artifactFileName);
      const body = [
        'QuantFlow mock harness artifact',
        `taskId=${taskId}`,
        `workerId=${handle.workerId}`,
        `instruction=${message.text}`,
      ].join('\n');
      writeFileSync(artifactFilePath, body, 'utf-8');
      const contentHash = createHash('sha256').update(body).digest('hex');
      state.draft = {
        type: 'task_submitted',
        summary: `mock artifact for ${taskId}`,
        taskId,
        artifactFilePath,
        artifactKind: 'file',
        contentHash,
        mediaType: 'text/plain',
        sizeBytes: Buffer.byteLength(body),
        metadata: { harnessKind: 'mock' },
      };
      state.status = 'done';
    },

    async readState(handle: WorkerHandle): Promise<PartialStateCard> {
      const state = getState(handle);
      return {
        status: state.status === 'stopped' ? 'stopped' : state.status === 'done' ? 'complete' : 'active',
      };
    },

    async collectReceipts(handle: WorkerHandle): Promise<ReceiptDraft[]> {
      const state = getState(handle);
      if (!state.draft || state.collected) return [];
      state.collected = true;
      return [state.draft];
    },

    async stop(handle: WorkerHandle): Promise<void> {
      getState(handle).status = 'stopped';
    },

    getRecordedSends() {
      return [...sent];
    },
  };
}
