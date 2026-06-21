import { join, resolve } from 'node:path';
import { createMockHarness, type MockWorkerHarness, type MockHarnessOptions } from '../mock/index';
import type { PartialStateCard, ReceiptDraft, WorkerHandle, WorkerHarness, WorkerMessage } from '../types';

export const SIM_SCENARIOS = [
  'succeeds',
  'bad-artifact',
  'timeout',
  'rate-limited',
  'blocker',
  'verifier-rejects',
  'human-checkpoint',
  'downstream-missing-artifact',
  'reload-mid-run',
] as const;

export type SimScenario = (typeof SIM_SCENARIOS)[number];

export interface SimHarnessOptions extends MockHarnessOptions {
  defaultScenario?: SimScenario;
  scenarioByTaskId?: Record<string, SimScenario>;
  scenarioForMessage?(message: WorkerMessage, handle: WorkerHandle): SimScenario;
}

interface SimState {
  status: 'idle' | 'working' | 'done' | 'blocked' | 'stopped';
  blocker?: string | null;
  nextAction?: string | null;
  draft?: ReceiptDraft;
  collected: boolean;
}

export interface SimWorkerHarness extends WorkerHarness {
  readonly kind: 'mock';
  getRecordedSends: MockWorkerHarness['getRecordedSends'];
  scenarioForTask(taskId: string | null): SimScenario;
}

function scenarioFor(options: SimHarnessOptions, message: WorkerMessage, handle: WorkerHandle): SimScenario {
  const taskId = message.taskId ?? null;
  if (options.scenarioForMessage) return options.scenarioForMessage(message, handle);
  if (taskId && options.scenarioByTaskId?.[taskId]) return options.scenarioByTaskId[taskId]!;
  return options.defaultScenario ?? 'succeeds';
}

function missingArtifactDraft(message: WorkerMessage, handle: WorkerHandle, scenario: SimScenario): ReceiptDraft {
  const artifactRoot = resolve(message.artifactRoot ?? join(process.cwd(), 'artifacts'));
  const taskId = message.taskId ?? 'task';
  return {
    type: 'task_submitted',
    summary: `sim ${scenario} artifact for ${taskId}`,
    taskId,
    artifactFilePath: join(artifactRoot, `${taskId}-missing-artifact.txt`),
    artifactKind: 'file',
    mediaType: 'text/plain',
    metadata: { harnessKind: 'mock', simScenario: scenario, workerId: handle.workerId },
  };
}

export function createSimHarness(options: SimHarnessOptions = {}): SimWorkerHarness {
  const mock = createMockHarness(options);
  const states = new Map<string, SimState>();

  function stateFor(handle: WorkerHandle): SimState {
    let state = states.get(handle.workerId);
    if (!state) {
      state = { status: 'idle', collected: true };
      states.set(handle.workerId, state);
    }
    return state;
  }

  async function collectMockDraft(handle: WorkerHandle): Promise<ReceiptDraft | null> {
    const drafts = await mock.collectReceipts(handle);
    return drafts[0] ?? null;
  }

  return {
    kind: 'mock',

    async spawn(input) {
      const handle = await mock.spawn(input);
      states.set(handle.workerId, { status: 'idle', collected: true });
      return handle;
    },

    async send(handle, message) {
      const scenario = scenarioFor(options, message, handle);
      const state = stateFor(handle);
      state.status = 'working';
      state.blocker = null;
      state.nextAction = null;
      state.draft = undefined;
      state.collected = false;

      if (scenario === 'timeout') {
        return;
      }
      if (scenario === 'rate-limited') {
        state.status = 'blocked';
        state.blocker = 'rate limited';
        state.nextAction = 'retry after backoff';
        return;
      }
      if (scenario === 'blocker') {
        state.status = 'blocked';
        state.blocker = 'blocked by upstream condition';
        state.nextAction = 'resolve blocker';
        return;
      }
      if (scenario === 'human-checkpoint') {
        state.status = 'blocked';
        state.blocker = 'human checkpoint required';
        state.nextAction = 'wait for operator';
        return;
      }
      if (scenario === 'downstream-missing-artifact') {
        state.status = 'done';
        state.draft = missingArtifactDraft(message, handle, scenario);
        return;
      }

      await mock.send(handle, message);
      const draft = await collectMockDraft(handle);
      if (!draft) {
        state.status = 'done';
        return;
      }
      state.status = 'done';
      state.draft = {
        ...draft,
        contentHash: scenario === 'bad-artifact' ? 'sim-bad-sha256' : draft.contentHash,
        metadata: {
          ...(draft.metadata ?? {}),
          simScenario: scenario,
          ...(scenario === 'verifier-rejects' ? { expectedVerifierVerdict: 'fail' } : {}),
        },
      };
    },

    async readState(handle): Promise<PartialStateCard> {
      const state = stateFor(handle);
      return {
        status: state.status === 'stopped'
          ? 'stopped'
          : state.status === 'done'
            ? 'complete'
            : state.status === 'blocked'
              ? 'blocked'
              : 'active',
        blocker: state.blocker ?? null,
        nextAction: state.nextAction ?? null,
      };
    },

    async collectReceipts(handle) {
      const state = stateFor(handle);
      if (!state.draft || state.collected) return [];
      state.collected = true;
      return [state.draft];
    },

    async stop(handle) {
      await mock.stop(handle);
      stateFor(handle).status = 'stopped';
    },

    getRecordedSends() {
      return mock.getRecordedSends();
    },

    scenarioForTask(taskId) {
      return taskId && options.scenarioByTaskId?.[taskId]
        ? options.scenarioByTaskId[taskId]!
        : options.defaultScenario ?? 'succeeds';
    },
  };
}
