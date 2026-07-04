/**
 * V4 cable-drawn delegation — routes relay text across Kernel connections to AgentOS tiles.
 */
import { prepareAgentOsTerminalAttach, promptAgentOsTile, writeAgentOsTileTerminal } from './agentos-terminal-bridge';
import {
  appendRelayLog,
  getConnectionById,
  removeConnectionFromGraph,
} from './tile-session-registry';

export interface ConnectionRelayInput {
  connectionId: string;
  fromTileId: string;
  text: string;
}

export interface ConnectionRelayResult {
  ok: boolean;
  message?: string;
  targetTileId?: string;
}

export async function sendConnectionRelay(
  input: ConnectionRelayInput,
): Promise<ConnectionRelayResult> {
  const connectionId = input.connectionId.trim();
  const fromTileId = input.fromTileId.trim();
  const text = input.text.trim();
  if (!connectionId) return { ok: false, message: 'connectionId required' };
  if (!fromTileId) return { ok: false, message: 'fromTileId required' };
  if (!text) return { ok: false, message: 'text required' };

  const conn = getConnectionById(connectionId);
  if (!conn) return { ok: false, message: `connection not found: ${connectionId}` };
  if (fromTileId !== conn.tileAId && fromTileId !== conn.tileBId) {
    return { ok: false, message: 'fromTileId is not on this connection' };
  }
  const targetTileId = fromTileId === conn.tileAId ? conn.tileBId : conn.tileAId;

  try {
    const delegated = `[a2a ${fromTileId}→${targetTileId}] ${text}`;
    try {
      await promptAgentOsTile(targetTileId, delegated);
    } catch {
      await prepareAgentOsTerminalAttach({ tileId: targetTileId });
      await promptAgentOsTile(targetTileId, delegated);
    }
    appendRelayLog({
      connectionId,
      fromTileId,
      toTileId: targetTileId,
      text,
    });

    if (process.env.QF_AGENTOS_SIM === '1') {
      const reply = `\r\n[a2a ${targetTileId}→${fromTileId}] ack: ${text.slice(0, 120)}\r\n`;
      try {
        await prepareAgentOsTerminalAttach({ tileId: fromTileId });
        await writeAgentOsTileTerminal(fromTileId, reply);
      } catch {
        // Ack is also recorded in relay log for scripted proofs.
      }
      appendRelayLog({
        connectionId,
        fromTileId: targetTileId,
        toTileId: fromTileId,
        text: `ack: ${text.slice(0, 120)}`,
      });
    }

    return { ok: true, targetTileId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}

export function closeConnectionRelayChannel(connectionId: string): void {
  removeConnectionFromGraph(connectionId.trim());
}
