/**
 * V4 cable-drawn delegation — routes relay text across Kernel connections to AgentOS tiles.
 * S4: host-side agentos-cable toolkit is authoritative; Electron validates + logs + bridges.
 */
import { getAgentOsTileAttach, prepareAgentOsTerminalAttach, promptAgentOsTile, writeAgentOsTileTerminal } from './agentos-terminal-bridge';
import {
  appendRelayLog,
  getConnectionById,
  pushConnectionGraphToHost,
  registerHostTileSession,
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

async function syncHostRegistry(fromTileId: string, targetTileId: string, conn: {
  id: string;
  tileAId: string;
  tileBId: string;
}): Promise<void> {
  await prepareAgentOsTerminalAttach({ tileId: targetTileId });
  await pushConnectionGraphToHost([conn]);
  const fromAttach = getAgentOsTileAttach(fromTileId);
  const targetAttach = getAgentOsTileAttach(targetTileId);
  if (fromAttach?.sessionId) {
    await registerHostTileSession(fromTileId, fromAttach.sessionId);
  }
  if (targetAttach?.sessionId) {
    await registerHostTileSession(targetTileId, targetAttach.sessionId);
  }
}

async function postHostCableSend(
  input: ConnectionRelayInput,
): Promise<ConnectionRelayResult> {
  const base = await hostSidecarBaseUrl();
  const res = await fetch(`${base}/cable/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    message?: string;
    targetTileId?: string;
    reply?: string;
  };
  if (!res.ok || body.ok === false) {
    return { ok: false, message: body.message ?? `host cable send HTTP ${res.status}` };
  }
  return {
    ok: true,
    targetTileId: body.targetTileId,
    reply: body.reply,
  };
}

/** S5 — Hermes orchestrator seat invokes agentos-delegate via host toolkit path. */
export async function postHostDelegateSend(input: {
  fromTileId: string;
  connectionId: string;
  goal: string;
}): Promise<ConnectionRelayResult> {
  const base = await hostSidecarBaseUrl();
  const res = await fetch(`${base}/delegate/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    message?: string;
    targetTileId?: string;
    reply?: string;
  };
  if (!res.ok || body.ok === false) {
    return { ok: false, message: body.message ?? `host delegate send HTTP ${res.status}` };
  }
  return {
    ok: true,
    targetTileId: body.targetTileId,
    reply: body.reply,
  };
}

async function simFallbackRelay(
  input: ConnectionRelayInput,
  targetTileId: string,
): Promise<ConnectionRelayResult> {
  const delegated = `[a2a ${input.fromTileId}→${targetTileId}] ${input.text}`;
  try {
    await promptAgentOsTile(targetTileId, delegated);
  } catch {
    await prepareAgentOsTerminalAttach({ tileId: targetTileId });
    await promptAgentOsTile(targetTileId, delegated);
  }
  const reply = `ack: ${input.text.slice(0, 120)}`;
  try {
    await prepareAgentOsTerminalAttach({ tileId: input.fromTileId });
    await writeAgentOsTileTerminal(input.fromTileId, `\r\n[a2a ${targetTileId}→${input.fromTileId}] ${reply}\r\n`);
  } catch {
    // Relay log still records the round trip for proofs.
  }
  return { ok: true, targetTileId, reply };
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
    let relay: ConnectionRelayResult;
    if (process.env.QF_AGENTOS_SIM === '1') {
      relay = await simFallbackRelay({ connectionId, fromTileId, text }, targetTileId);
    } else {
      await syncHostRegistry(fromTileId, targetTileId, conn);
      relay = await postHostCableSend({ connectionId, fromTileId, text });
      if (!relay.ok) {
        return relay;
      }
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
