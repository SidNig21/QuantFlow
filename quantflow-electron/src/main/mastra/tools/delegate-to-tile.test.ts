import { describe, expect, test, beforeEach } from 'bun:test';
import {
  registerTileRelayBinding,
  syncConnectionGraph,
} from '../../tile-session-registry';
import { delegateToTileTool } from './delegate-to-tile';

describe('delegateToTileTool', () => {
  beforeEach(() => {
    delete process.env.QF_AGENTOS_SIM;
    syncConnectionGraph([]);
  });

  test('sim delegate returns ack reply over herdr binding', async () => {
    process.env.QF_AGENTOS_SIM = '1';
    const tileA = 'mastra-tile-a';
    const tileB = 'mastra-tile-b';
    const connectionId = 'conn-mastra-delegate';

    registerTileRelayBinding(tileA, {
      runtimeTarget: 'herdr-wsl',
      herdrPaneId: 'pane-mastra-a',
    });
    registerTileRelayBinding(tileB, {
      runtimeTarget: 'herdr-wsl',
      herdrPaneId: 'pane-mastra-b',
    });
    syncConnectionGraph([{ id: connectionId, tileAId: tileA, tileBId: tileB }]);

    const result = await delegateToTileTool.execute({
      fromTileId: tileA,
      toTileId: tileB,
      connectionId,
      message: 'summarize status',
    });

    expect(result.ok).toBe(true);
    expect(result.reply).toStartWith('ack:');
  });

  test('rejects missing connection before relay', async () => {
    const result = await delegateToTileTool.execute({
      fromTileId: 'tile-a',
      toTileId: 'tile-b',
      connectionId: 'missing-conn',
      message: 'hello',
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('connection not found');
  });

  test('relay rejects off-graph peer', async () => {
    process.env.QF_AGENTOS_SIM = '1';
    registerTileRelayBinding('tile-a', {
      runtimeTarget: 'windows-pty',
      ptySessionId: 'pty-a',
    });
    registerTileRelayBinding('tile-b', {
      runtimeTarget: 'windows-pty',
      ptySessionId: 'pty-b',
    });
    syncConnectionGraph([{ id: 'conn-1', tileAId: 'tile-a', tileBId: 'tile-b' }]);

    const result = await delegateToTileTool.execute({
      fromTileId: 'tile-a',
      toTileId: 'tile-z',
      connectionId: 'conn-1',
      message: 'nope',
    });

    expect(result.ok).toBe(false);
  });
});
