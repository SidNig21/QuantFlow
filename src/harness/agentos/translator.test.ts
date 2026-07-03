import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  countMilestoneReceiptsForEvents,
  createAcpTranslatorState,
  translateSessionUpdate,
  translateTurnComplete,
} from './translator';

const FIXTURE = join(import.meta.dir, 'fixtures', 'tier2-events-trimmed.jsonl');

function loadFixtureEvents(): unknown[] {
  return readFileSync(FIXTURE, 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}

describe('agentos translator', () => {
  test('maps tier2 fixture tool lifecycles to milestone receipts, not per chunk', () => {
    const events = loadFixtureEvents();
    const chunkEvents = events.filter((event) => {
      const update = (event as { params?: { update?: { sessionUpdate?: string } } }).params?.update;
      return update?.sessionUpdate === 'agent_message_chunk';
    });
    expect(chunkEvents.length).toBeGreaterThanOrEqual(2);

    const state = createAcpTranslatorState();
    const ctx = { taskId: 'task1', harnessKind: 'agentos' };
    const drafts = events.flatMap((event) => translateSessionUpdate(event, state, ctx));
    drafts.push(...translateTurnComplete(state, ctx));

    const milestones = drafts.map((d) => d.metadata?.['milestone']);
    expect(milestones).toContain('session.start');
    expect(milestones.filter((m) => m === 'tool.started')).toHaveLength(4);
    expect(milestones.filter((m) => m === 'tool.completed')).toHaveLength(4);
    expect(milestones).toContain('transcript.summary');
    expect(milestones).toContain('turn.complete');
    expect(milestones.filter((m) => m === 'agent_message_chunk')).toHaveLength(0);
  });

  test('coalesces many agent_message_chunk events into O(1) receipts', () => {
    const chunk = {
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'sim',
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'x' },
        },
      },
    };
    const events = Array.from({ length: 60 }, () => chunk);
    const count = countMilestoneReceiptsForEvents(events, { harnessKind: 'agentos' });
    expect(count).toBeLessThanOrEqual(3);
  });
});
