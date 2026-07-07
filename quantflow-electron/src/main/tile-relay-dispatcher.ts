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
import { writeToSession, awaitTileReady } from './pty';
import {
  isNativeTuiAdapter,
  isServerClassifiedAdapter,
} from './agent-adapter';
import { getAgentAdapterForRole } from './dock-actors';
import {
  waitForHerdrPaneReply,
  waitForPtySessionReply,
  type HerdrReadFn,
  type PtyCaptureFn,
  type RelayReplyCaptureInput,
} from './relay-reply-capture';
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
  ptyCapture?: PtyCaptureFn;
  herdrRead?: HerdrReadFn;
  awaitTileReady?: (sessionId: string, roleId?: string) => Promise<void>;
  waitForReply?: (
    input: RelayReplyCaptureInput,
    ctx: { runtime: 'herdr-wsl' | 'windows-pty'; sessionId?: string; paneId?: string },
  ) => Promise<{ ok: boolean; reply?: string; message?: string }>;
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

function delegateMarker(input: TileDelegateInput): string {
  return `[a2a ${input.fromTileId}→${input.toTileId}] ${input.text}`;
}

async function captureRelayReply(
  afterMarker: string,
  deps: TileRelayDeps,
  ctx: { runtime: 'herdr-wsl' | 'windows-pty'; sessionId?: string; paneId?: string },
): Promise<TileDelegateResult> {
  const captureInput: RelayReplyCaptureInput = { afterMarker };

  if (deps.waitForReply) {
    const captured = await deps.waitForReply(captureInput, ctx);
    if (!captured.ok) {
      return { ok: false, message: captured.message };
    }
    return { ok: true, reply: captured.reply };
  }

  if (ctx.runtime === 'windows-pty' && ctx.sessionId) {
    const captured = await waitForPtySessionReply(
      ctx.sessionId,
      captureInput,
      deps.ptyCapture,
    );
    if (!captured.ok) {
      return { ok: false, message: captured.message };
    }
    return { ok: true, reply: captured.reply };
  }

  if (ctx.runtime === 'herdr-wsl' && ctx.paneId) {
    const captured = await waitForHerdrPaneReply(
      ctx.paneId,
      captureInput,
      deps.herdrRead,
    );
    if (!captured.ok) {
      return { ok: false, message: captured.message };
    }
    return { ok: true, reply: captured.reply };
  }

  return { ok: true };
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
  const marker = delegateMarker(input);
  if (isSimRelay()) {
    return { ok: true, reply: simAck(input.text) };
  }
  const send = deps.herdrSend ?? ((id, text) => sendHerdrPaneLine(callHerdrSocket, id, text));
  await send(paneId!, marker);
  return captureRelayReply(marker, deps, { runtime: 'herdr-wsl', paneId: paneId! });
}

async function delegateWindowsPty(
  input: TileDelegateInput,
  deps: TileRelayDeps,
): Promise<TileDelegateResult> {
  const binding = getTileRelayBinding(input.toTileId);
  const sessionId = binding?.ptySessionId?.trim();
  const roleId = binding?.roleId?.trim();
  const adapter = getAgentAdapterForRole(roleId);
  if (isServerClassifiedAdapter(adapter)) {
    return {
      ok: false,
      message: `pty relay: tile ${input.toTileId} is a server tile, not a chat agent target`,
    };
  }
  if (!sessionId && !isSimRelay()) {
    return { ok: false, message: `pty relay: missing session for tile ${input.toTileId}` };
  }
  const marker = delegateMarker(input);
  const delegated = `${marker}\r`;
  if (isSimRelay()) {
    return { ok: true, reply: simAck(input.text) };
  }
  const waitReady = deps.awaitTileReady ?? (async (sid, rid) => {
    const readyAdapter = getAgentAdapterForRole(rid);
    if (isNativeTuiAdapter(readyAdapter)) {
      await awaitTileReady(sid, readyAdapter);
    }
  });
  await waitReady(sessionId!, roleId);
  const write = deps.ptyWrite ?? writeToSession;
  write(sessionId!, delegated);
  return captureRelayReply(marker, deps, { runtime: 'windows-pty', sessionId: sessionId! });
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
