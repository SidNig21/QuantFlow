import { describe, expect, test } from 'bun:test';
import {
  waitForHerdrPaneReply,
  waitForPtySessionReply,
} from './relay-reply-capture';

describe('relay-reply-capture', () => {
  test('pty capture returns reply after output stabilizes', async () => {
    let reads = 0;
    const capture = async () => {
      reads += 1;
      if (reads === 1) {
        return '[a2a tile-a→tile-b] ping\npartial';
      }
      return '[a2a tile-a→tile-b] ping\nPONG from eve';
    };

    const result = await waitForPtySessionReply(
      'pty-test',
      {
        afterMarker: '[a2a tile-a→tile-b] ping',
        timeoutMs: 2_000,
        intervalMs: 50,
      },
      capture,
    );

    expect(result.ok).toBe(true);
    expect(result.reply).toBe('PONG from eve');
  });

  test('herdr capture returns last seen reply when output never stabilizes', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return `[a2a a→b] ask\nline ${reads}`;
    };

    const result = await waitForHerdrPaneReply(
      'pane-test',
      {
        afterMarker: '[a2a a→b] ask',
        timeoutMs: 300,
        intervalMs: 80,
      },
      read,
    );

    expect(result.ok).toBe(true);
    expect(result.reply).toMatch(/^line \d+$/);
  });

  test('returns partial reply at timeout when some text was captured', async () => {
    const capture = async () => '[a2a x→y] go\nstill typing';

    const result = await waitForPtySessionReply(
      'pty-partial',
      {
        afterMarker: '[a2a x→y] go',
        timeoutMs: 120,
        intervalMs: 40,
      },
      capture,
    );

    expect(result.ok).toBe(true);
    expect(result.reply).toBe('still typing');
  });
});
