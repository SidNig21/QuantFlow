import { describe, expect, test, beforeEach } from 'bun:test';
import { sendTileDelegate } from './tile-relay-dispatcher';
import {
  getStringLog,
  registerTileRelayBinding,
  syncConnectionGraph,
} from './tile-session-registry';

describe('tile-relay-dispatcher', () => {
  beforeEach(() => {
    delete process.env.QF_AGENTOS_SIM;
    syncConnectionGraph([]);
  });

  test('herdr-wsl sim delegate records ack via relay log path', async () => {
    process.env.QF_AGENTOS_SIM = '1';
    const tileA = 'tile-relay-a';
    const tileB = 'tile-relay-b';
    const connectionId = 'conn-relay-herdr';

    registerTileRelayBinding(tileA, { runtimeTarget: 'herdr-wsl', herdrPaneId: 'pane-a' });
    registerTileRelayBinding(tileB, { runtimeTarget: 'herdr-wsl', herdrPaneId: 'pane-b' });
    syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

    const result = await sendTileDelegate({
      fromTileId: tileA,
      toTileId: tileB,
      cableId: connectionId,
      text: 'delegate this task',
    });

    expect(result.ok).toBe(true);
    expect(result.reply).toStartWith('ack:');
  });

  test('windows-pty sim delegate succeeds without pane id', async () => {
    process.env.QF_AGENTOS_SIM = '1';
    const tileA = 'tile-pty-a';
    const tileB = 'tile-pty-b';
    const connectionId = 'conn-relay-pty';

    registerTileRelayBinding(tileA, { runtimeTarget: 'windows-pty', ptySessionId: 'pty-a' });
    registerTileRelayBinding(tileB, { runtimeTarget: 'windows-pty', ptySessionId: 'pty-b' });
    syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

    const result = await sendTileDelegate({
      fromTileId: tileA,
      toTileId: tileB,
      cableId: connectionId,
      text: 'hello eve',
    });

    expect(result.ok).toBe(true);
    expect(result.reply).toStartWith('ack:');
  });

  test('rejects off-graph delegation', async () => {
    registerTileRelayBinding('tile-x', { runtimeTarget: 'herdr-wsl', herdrPaneId: 'pane-x' });
    registerTileRelayBinding('tile-y', { runtimeTarget: 'herdr-wsl', herdrPaneId: 'pane-y' });
    syncConnectionGraph([{ id: 'conn-1', tileAId: 'tile-x', tileBId: 'tile-y' }]);

    const result = await sendTileDelegate({
      fromTileId: 'tile-x',
      toTileId: 'tile-z',
      cableId: 'conn-1',
      text: 'nope',
    });

    expect(result.ok).toBe(false);
    expect(getStringLog('conn-1', 5)).toHaveLength(0);
  });

  test('windows-pty live path returns captured reply via injectable deps', async () => {
    const tileA = 'tile-live-a';
    const tileB = 'tile-live-b';
    const connectionId = 'conn-relay-live';

    registerTileRelayBinding(tileA, { runtimeTarget: 'windows-pty', ptySessionId: 'pty-live-a', roleId: 'claude' });
    registerTileRelayBinding(tileB, { runtimeTarget: 'windows-pty', ptySessionId: 'pty-live-b', roleId: 'claude' });
    syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

    const writes: string[] = [];
    let readyBeforeWrite = false;
    const result = await sendTileDelegate(
      {
        fromTileId: tileA,
        toTileId: tileB,
        cableId: connectionId,
        text: 'ping',
      },
      {
        ptyWrite: (_sessionId, text) => {
          writes.push(text);
        },
        awaitTileReady: async () => {
          readyBeforeWrite = true;
        },
        waitForReply: async () => ({ ok: true, reply: 'PONG' }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.reply).toBe('PONG');
    expect(readyBeforeWrite).toBe(true);
    expect(writes.some((line) => line.includes('[a2a tile-live-a→tile-live-b] ping'))).toBe(true);
  });

  test('windows-pty rejects server-classified targets', async () => {
    registerTileRelayBinding('tile-eve-a', { runtimeTarget: 'windows-pty', ptySessionId: 'pty-a', roleId: 'claude' });
    registerTileRelayBinding('tile-eve-b', { runtimeTarget: 'windows-pty', ptySessionId: 'pty-b', roleId: 'eve' });
    syncConnectionGraph([{ id: 'conn-eve', tileAId: 'tile-eve-a', tileBId: 'tile-eve-b' }]);

    const result = await sendTileDelegate({
      fromTileId: 'tile-eve-a',
      toTileId: 'tile-eve-b',
      cableId: 'conn-eve',
      text: 'hello eve',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('server tile');
  });
});
