/**
 * Pattern B — route cable delegation by tile runtime, not AgentOS session id alone.
 */
import { callHerdrSocket } from './herdr-socket-bridge';
import { sendHerdrPaneLine } from './herdr-session-spawn';
import {
  getAgentOsTileAttach,
  prepareAgentOsTerminalAttach,
  promptAgentOsTile,
  writeAgentOsTileTerminal,
} from './agentos-terminal-bridge';
import {
  getConnectionById,
  getTileRelayBinding,
  pushConnectionGraphToHost,
  registerHostTileSession,
  type ConnectionGraphEntry,
} from './tile-session-registry';
import { writeToSession } from './pty';
import type { RoleRuntimeTarget } from './role-service';

export interface TileDelegateInput {
  fromTileId: string;
  toTileId: string;
  cableId: string;
  text: string;
  correlationId?: string;
}

export interface TileDelegateResult {
  ok: boolean;
  message?: string;
  reply?: string;
}

export interface TileRelayDeps {
  herdrSend?: (paneId: string, text: string) => Promise<void>;
  ptyWrite?: (sessionId: string, text: string) => void;
}

function isSimRelay(): boolean {
  return process.env.QF_AGENTOS_SIM === '1';
}

function simAck(text: string): string {
  return `ack: ${text.slice(0, 120)}`;
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

async function syncAgentOsHostRegistry(
  fromTileId: string,
  targetTileId: string,
  conn: ConnectionGraphEntry,
): Promise<void> {
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

async function postHostCableSend(input: {
  connectionId: string;
  fromTileId: string;
  text: string;
}): Promise<TileDelegateResult> {
  const base = await hostSidecarBaseUrl();
  const res = await fetch(`${base}/cable/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    message?: string;
    reply?: string;
  };
  if (!res.ok || body.ok === false) {
    return { ok: false, message: body.message ?? `host cable send HTTP ${res.status}` };
  }
  return { ok: true, reply: body.reply };
}

function resolveRuntime(tileId: string): RoleRuntimeTarget | null {
  return getTileRelayBinding(tileId)?.runtimeTarget ?? null;
}

async function delegateHerdr(
  input: TileDelegateInput,
  deps: TileRelayDeps,
): Promise<TileDelegateResult> {
  const binding = getTileRelayBinding(input.toTileId);
  const paneId = binding?.herdrPaneId?.trim();
  if (!paneId && !isSimRelay()) {
    return { ok: false, message: `herdr relay: missing pane for tile ${input.toTileId}` };
  }
  const delegated = `[a2a ${input.fromTileId}→${input.toTileId}] ${input.text}`;
  if (isSimRelay()) {
    return { ok: true, reply: simAck(input.text) };
  }
  const send = deps.herdrSend ?? ((id, text) => sendHerdrPaneLine(callHerdrSocket, id, text));
  await send(paneId!, delegated);
  return { ok: true };
}

async function delegateWindowsPty(
  input: TileDelegateInput,
  deps: TileRelayDeps,
): Promise<TileDelegateResult> {
  const binding = getTileRelayBinding(input.toTileId);
  const sessionId = binding?.ptySessionId?.trim();
  if (!sessionId && !isSimRelay()) {
    return { ok: false, message: `pty relay: missing session for tile ${input.toTileId}` };
  }
  const delegated = `[a2a ${input.fromTileId}→${input.toTileId}] ${input.text}\r`;
  if (isSimRelay()) {
    return { ok: true, reply: simAck(input.text) };
  }
  const write = deps.ptyWrite ?? writeToSession;
  write(sessionId!, delegated);
  return { ok: true };
}

async function delegateAgentOs(
  input: TileDelegateInput,
  conn: ConnectionGraphEntry,
): Promise<TileDelegateResult> {
  if (isSimRelay()) {
    const delegated = `[a2a ${input.fromTileId}→${input.toTileId}] ${input.text}`;
    try {
      await promptAgentOsTile(input.toTileId, delegated);
    } catch {
      await prepareAgentOsTerminalAttach({ tileId: input.toTileId });
      await promptAgentOsTile(input.toTileId, delegated);
    }
    const reply = simAck(input.text);
    try {
      await prepareAgentOsTerminalAttach({ tileId: input.fromTileId });
      await writeAgentOsTileTerminal(
        input.fromTileId,
        `\r\n[a2a ${input.toTileId}→${input.fromTileId}] ${reply}\r\n`,
      );
    } catch {
      // Relay log still records the round trip for proofs.
    }
    return { ok: true, reply };
  }
  await syncAgentOsHostRegistry(input.fromTileId, input.toTileId, conn);
  return postHostCableSend({
    connectionId: input.cableId,
    fromTileId: input.fromTileId,
    text: input.text,
  });
}

async function notifySender(
  input: TileDelegateInput,
  reply: string | undefined,
  runtime: RoleRuntimeTarget | null,
  deps: TileRelayDeps,
): Promise<void> {
  if (!reply) return;
  const line = `\r\n[a2a ${input.toTileId}→${input.fromTileId}] ${reply}\r\n`;
  if (runtime === 'herdr-wsl') {
    const paneId = getTileRelayBinding(input.fromTileId)?.herdrPaneId?.trim();
    if (paneId && !isSimRelay()) {
      const send = deps.herdrSend ?? ((id, text) => sendHerdrPaneLine(callHerdrSocket, id, text));
      await send(paneId, line.trim());
    }
    return;
  }
  if (runtime === 'windows-pty') {
    const sessionId = getTileRelayBinding(input.fromTileId)?.ptySessionId?.trim();
    if (sessionId && !isSimRelay()) {
      const write = deps.ptyWrite ?? writeToSession;
      write(sessionId, line);
    }
    return;
  }
  if (runtime === 'agentos') {
    try {
      await prepareAgentOsTerminalAttach({ tileId: input.fromTileId });
      await writeAgentOsTileTerminal(input.fromTileId, line);
    } catch {
      // Best-effort echo for orchestrator proofs.
    }
  }
}

/** Route a cable delegation to the target tile's native runtime backend. */
export async function sendTileDelegate(
  input: TileDelegateInput,
  deps: TileRelayDeps = {},
): Promise<TileDelegateResult> {
  const cableId = input.cableId.trim();
  const fromTileId = input.fromTileId.trim();
  const toTileId = input.toTileId.trim();
  const text = input.text.trim();
  if (!cableId) return { ok: false, message: 'cableId required' };
  if (!fromTileId) return { ok: false, message: 'fromTileId required' };
  if (!toTileId) return { ok: false, message: 'toTileId required' };
  if (!text) return { ok: false, message: 'text required' };

  const conn = getConnectionById(cableId);
  if (!conn) return { ok: false, message: `connection not found: ${cableId}` };
  if (fromTileId !== conn.tileAId && fromTileId !== conn.tileBId) {
    return { ok: false, message: 'fromTileId is not on this connection' };
  }
  const expectedTarget = fromTileId === conn.tileAId ? conn.tileBId : conn.tileAId;
  if (toTileId !== expectedTarget) {
    return { ok: false, message: 'toTileId is not the peer on this connection' };
  }

  const runtime = resolveRuntime(toTileId) ?? 'agentos';
  let result: TileDelegateResult;
  switch (runtime) {
    case 'herdr-wsl':
      result = await delegateHerdr(input, deps);
      break;
    case 'windows-pty':
      result = await delegateWindowsPty(input, deps);
      break;
    case 'agentos':
      result = await delegateAgentOs(input, conn);
      break;
    default:
      result = { ok: false, message: `unsupported relay runtime: ${runtime}` };
  }

  if (result.ok && result.reply) {
    const senderRuntime = resolveRuntime(fromTileId);
    await notifySender(input, result.reply, senderRuntime, deps);
  }
  return result;
}
