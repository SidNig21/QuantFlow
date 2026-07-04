import { ipcMain } from 'electron';
import { registerMethod } from './json-rpc-server';
import { closeConnectionRelayChannel, sendConnectionRelay } from './agentos-a2a-relay';

export function registerA2aRelayHandlers(): void {
  ipcMain.handle(
    'string:relay',
    async (_event, payload: {
      connectionId?: string;
      fromTileId?: string;
      text?: string;
      targetTileId?: string;
      targetSessionId?: string | null;
    } = {}) => {
      const connectionId = typeof payload.connectionId === 'string' ? payload.connectionId : '';
      const fromTileId = typeof payload.fromTileId === 'string' ? payload.fromTileId : '';
      const text = typeof payload.text === 'string' ? payload.text : '';
      if (!connectionId || !fromTileId || !text.trim()) {
        return { ok: false, message: 'connectionId, fromTileId, and text required' };
      }
      return sendConnectionRelay({ connectionId, fromTileId, text });
    },
  );

  registerMethod(
    'relay.connectionSend',
    async (params) => {
      const p = params as Record<string, unknown>;
      const connectionId = typeof p.connectionId === 'string' ? p.connectionId : '';
      const fromTileId = typeof p.fromTileId === 'string' ? p.fromTileId : '';
      const text = typeof p.text === 'string' ? p.text : '';
      return sendConnectionRelay({ connectionId, fromTileId, text });
    },
    {
      description: 'Send a one-shot delegation message across a cable connection (V4 A2A)',
      params: {
        connectionId: 'Kernel connection id',
        fromTileId: 'Source tile on the connection',
        text: 'Delegation message text',
      },
    },
  );

  registerMethod(
    'relay.connectionClose',
    (params) => {
      const p = params as Record<string, unknown>;
      const connectionId = typeof p.connectionId === 'string' ? p.connectionId : '';
      if (!connectionId) return { ok: false, message: 'connectionId required' };
      closeConnectionRelayChannel(connectionId);
      return { ok: true };
    },
    {
      description: 'Close the in-memory relay channel for a deleted cable',
      params: { connectionId: 'Connection id' },
    },
  );
}
