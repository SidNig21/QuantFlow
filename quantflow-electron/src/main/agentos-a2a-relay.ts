/**
 * V4 cable-drawn delegation — ACL in Kernel graph; transport via tile-relay-dispatcher.
 */
import {
  appendRelayLog,
  getConnectionById,
  removeConnectionFromGraph,
} from './tile-session-registry';
import { sendTileDelegate } from './tile-relay-dispatcher';

export interface ConnectionRelayInput {
  connectionId: string;
  fromTileId: string;
  text: string;
}

export interface ConnectionRelayResult {
  ok: boolean;
  message?: string;
  targetTileId?: string;
  reply?: string;
}

async function hostSidecarBaseUrl(): Promise<string> {
  const { resolveAgentOsHostAddress } = await import('@qf-harness/agentos/host-lifecycle');
  const port = Number.parseInt(
    process.env.AGENTOS_HOST_PORT ?? process.env.QF_AGENTOS_PORT ?? '7430',
    10,
  );
  const host = await resolveAgentOsHostAddress({ port });
  return `http://${host}:${port}`;
}

/** S5 — Hermes orchestrator seat invokes agentos-delegate via host toolkit path. */
export async function postHostDelegateSend(input: {
  fromTileId: string;
  connectionId: string;
  goal: string;
}): Promise<ConnectionRelayResult> {
  const conn = getConnectionById(input.connectionId.trim());
  if (!conn) {
    return { ok: false, message: `connection not found: ${input.connectionId}` };
  }
  const fromTileId = input.fromTileId.trim();
  const targetTileId = fromTileId === conn.tileAId ? conn.tileBId : conn.tileAId;
  const delegated = await sendTileDelegate({
    fromTileId,
    toTileId: targetTileId,
    cableId: input.connectionId.trim(),
    text: input.goal.trim(),
  });
  if (!delegated.ok) {
    return { ok: false, message: delegated.message };
  }
  return {
    ok: true,
    targetTileId,
    reply: delegated.reply,
  };
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
    const relay = await sendTileDelegate({
      fromTileId,
      toTileId: targetTileId,
      cableId: connectionId,
      text,
    });
    if (!relay.ok) {
      return { ok: false, message: relay.message };
    }

    appendRelayLog({
      connectionId,
      fromTileId,
      toTileId: targetTileId,
      text,
    });

    if (relay.reply) {
      appendRelayLog({
        connectionId,
        fromTileId: targetTileId,
        toTileId: fromTileId,
        text: relay.reply,
      });
    }

    return { ok: true, targetTileId, reply: relay.reply };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}

export function closeConnectionRelayChannel(connectionId: string): void {
  removeConnectionFromGraph(connectionId);
}

/** Exported for orchestrator live path that still hits host /delegate/send directly. */
export { hostSidecarBaseUrl };
