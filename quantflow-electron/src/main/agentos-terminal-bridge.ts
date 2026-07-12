/**
 * AgentOS terminal PTY bridge — maps canvas PTY sessions to transport shells (V1).
 */
import { randomBytes } from 'node:crypto';
import type { AgentOsTransport } from '@qf-harness/agentos/transport';
import {
  hasAgentOsCredential,
  recordHostCredentialReport,
  requiresClaudeCredential,
  resolveAgentOsCredential,
} from '@qf-harness/agentos/credential-order';
import { formatAgentOsUnavailable } from '@qf-harness/agentos/error-messages';
import { getAgentOsTransport } from './agentos-service';
import { resolveTileChatRoute } from './tile-chat-route';
import {
  buildAgentOsDisplayTarget,
  parseAgentOsAttachTarget,
} from './pty-spawn-params';
import { getConnectionsForTile, registerHostTileSession } from './tile-session-registry';
import {
  bootstrapAcpTerminalText,
  createAcpPromptLineEditor,
  isAcpPromptSoftware,
  type AcpPromptLineEditor,
} from './acp-prompt-line-editor';

export { buildAgentOsDisplayTarget, parseAgentOsAttachTarget };

interface TileAttach {
  workspaceId?: string;
  tileId: string;
  sessionId: string;
  shellId: string;
  software: string;
  /** Operator-facing label (Hermes, Codex, Claude Code) — never the host software id. */
  actorName: string;
  terminalUnsub: (() => void) | null;
  sessionEventUnsub: (() => void) | null;
}

interface PtyBridge {
  shellId: string;
  tileId: string;
  unsub: () => void;
  echo: (text: string) => void;
  acpEditor?: AcpPromptLineEditor;
}

const tileAttaches = new Map<string, TileAttach>();
const ptyBridges = new Map<string, PtyBridge>();

function releaseTileAttach(tileId: string): void {
  const attach = tileAttaches.get(tileId);
  if (!attach) return;
  attach.terminalUnsub?.();
  attach.sessionEventUnsub?.();
  tileAttaches.delete(tileId);
}

function resolveSoftware(input?: string): string {
  const trimmed = input?.trim();
  if (
    trimmed === 'pi'
    || trimmed === 'opencode'
    || trimmed === 'claude-code'
    || trimmed === 'claude'
    || trimmed === 'codex'
    || trimmed === 'eve'
  ) {
    return trimmed === 'claude' ? 'claude-code' : trimmed;
  }
  return resolveAgentOsCredential()?.software ?? 'pi';
}

async function assertClaudeCredentialReady(
  transport: AgentOsTransport,
  software: string,
): Promise<void> {
  if (!requiresClaudeCredential(software)) return;
  try {
    const health = await transport.health();
    if (typeof health?.hasCredential === 'boolean') {
      recordHostCredentialReport(health.hasCredential);
    }
  } catch {
    // Host unreachable — createSession will surface host failure.
  }
  if (!hasAgentOsCredential()) {
    throw new Error(formatAgentOsUnavailable('no Claude credential'));
  }
}

function encodePtyData(text: string): Buffer {
  return Buffer.from(text, 'utf8');
}

function acpEventToTerminalText(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const envelope = event as { params?: { update?: Record<string, unknown> } };
  const update = envelope.params?.update;
  if (!update) return null;
  const kind = update.sessionUpdate;
  if (kind === 'agent_message_chunk') {
    const content = update.content as { text?: unknown } | undefined;
    return typeof content?.text === 'string' ? content.text : null;
  }
  if (kind === 'tool_call') {
    const title = update.title;
    return typeof title === 'string' ? `\r\n[tool] ${title}\r\n` : '\r\n[tool call]\r\n';
  }
  if (kind === 'turn_complete') {
    return '\r\n> ';
  }
  return null;
}

async function transportOrThrow(): Promise<AgentOsTransport> {
  return getAgentOsTransport();
}

async function submitTileChatLine(
  tileId: string,
  sessionId: string,
  line: string,
  echo: (text: string) => void,
): Promise<void> {
  const route = resolveTileChatRoute(tileId, line, getConnectionsForTile(tileId));
  if (route.kind === 'local') {
    const transport = await transportOrThrow();
    await transport.prompt(sessionId, route.text);
    return;
  }

  if (route.kind === 'cable-error') {
    echo(`\r\n[a2a error] ${route.notice ?? 'relay failed'}\r\n> `);
    return;
  }

  if (route.notice) echo(`\r\n[a2a] ${route.notice}\r\n`);
  echo(`\r\n[a2a ${tileId}→${route.toTileId}] ${route.text}\r\n`);
  const { sendConnectionRelay } = await import('./agentos-a2a-relay');
  const relay = await sendConnectionRelay({
    connectionId: route.connectionId!,
    fromTileId: tileId,
    text: route.text,
  });
  if (!relay.ok) {
    echo(`\r\n[a2a error] ${relay.message ?? 'relay failed'}\r\n> `);
  }
}

export async function prepareAgentOsTerminalAttach(input: {
  workspaceId?: string;
  tileId: string;
  cols?: number;
  rows?: number;
  instruction?: string;
  software?: string;
  actorName?: string;
}): Promise<{ terminalTarget: string }> {
  const workspaceId = input.workspaceId?.trim() || undefined;
  const tileId = input.tileId.trim();
  if (!tileId) throw new Error(formatAgentOsUnavailable('tileId required'));

  const transport = await transportOrThrow();
  const cols = input.cols ?? 80;
  const rows = input.rows ?? 24;
  const software = resolveSoftware(input.software);
  const actorName = input.actorName?.trim() || 'Agent';

  let attach = tileAttaches.get(tileId);
  if (!attach) {
    await assertClaudeCredentialReady(transport, software);
    const { sessionId } = await transport.createSession(software, {
      workspaceId,
      tileId,
    });
    const { shellId } = await transport.openTerminal(sessionId, cols, rows);
    attach = {
      workspaceId,
      tileId,
      sessionId,
      shellId,
      software,
      actorName,
      terminalUnsub: null,
      sessionEventUnsub: null,
    };
    tileAttaches.set(tileId, attach);
    await registerHostTileSession(tileId, sessionId);
  }

  const instruction = input.instruction?.trim();
  if (instruction) {
    await transport.prompt(attach.sessionId, instruction);
  }

  return {
    terminalTarget: buildAgentOsDisplayTarget(tileId, attach.workspaceId),
  };
}

export async function bindAgentOsPtySession(input: {
  ptySessionId: string;
  workspaceId?: string;
  tileId: string;
  senderWebContentsId?: number;
  cols: number;
  rows: number;
  onData: (sessionId: string, senderId: number | undefined, data: Buffer) => void;
}): Promise<void> {
  const tileId = input.tileId.trim();
  let attach = tileAttaches.get(tileId);
  const transport = await transportOrThrow();

  if (!attach) {
    const prepared = await prepareAgentOsTerminalAttach({
      workspaceId: input.workspaceId,
      tileId,
      cols: input.cols,
      rows: input.rows,
    });
    attach = tileAttaches.get(tileId)!;
    if (!attach) {
      throw new Error(formatAgentOsUnavailable(`attach missing after prepare (${prepared.terminalTarget})`));
    }
  }

  await transport.resizeTerminal(attach.shellId, input.cols, input.rows);
  if (attach.terminalUnsub) attach.terminalUnsub();
  if (attach.sessionEventUnsub) attach.sessionEventUnsub();
  const unsub = transport.onTerminalData(attach.shellId, (chunk) => {
    input.onData(input.ptySessionId, input.senderWebContentsId, encodePtyData(
      Buffer.from(chunk).toString('utf8'),
    ));
  });
  attach.terminalUnsub = unsub;
  attach.sessionEventUnsub = transport.onSessionEvent(attach.sessionId, (event) => {
    const text = acpEventToTerminalText(event);
    if (text) {
      input.onData(input.ptySessionId, input.senderWebContentsId, encodePtyData(text));
    }
  });
  const echo = (text: string) => {
    input.onData(input.ptySessionId, input.senderWebContentsId, encodePtyData(text));
  };
  const bridge: PtyBridge = { shellId: attach.shellId, tileId, unsub, echo };
  if (isAcpPromptSoftware(attach.software)) {
    bridge.acpEditor = createAcpPromptLineEditor({
      onEcho: echo,
      onSubmit: (line) => submitTileChatLine(tileId, attach.sessionId, line, echo),
      onSubmitError: () => echo('\r\n[error: prompt failed]\r\n> '),
    });
  }
  ptyBridges.set(input.ptySessionId, bridge);
  // Defer one tick so the terminal webview can subscribe to pty:data first.
  setImmediate(() => {
    echo(bootstrapAcpTerminalText(attach!.actorName));
  });
}

export function isAgentOsPtySession(sessionId: string): boolean {
  return ptyBridges.has(sessionId);
}

export function getAgentOsPtySessionIdForTile(tileId: string): string | null {
  const normalized = tileId.trim();
  for (const [sessionId, bridge] of ptyBridges.entries()) {
    if (bridge.tileId === normalized) return sessionId;
  }
  return null;
}

export async function writeAgentOsPtySession(sessionId: string, data: string): Promise<void> {
  const bridge = ptyBridges.get(sessionId);
  if (!bridge) return;
  if (bridge.acpEditor) {
    bridge.acpEditor.handleInput(data);
    return;
  }
  const transport = await transportOrThrow();
  await transport.writeTerminal(bridge.shellId, data);
}

export async function resizeAgentOsPtySession(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  const bridge = ptyBridges.get(sessionId);
  if (!bridge) return;
  const transport = await transportOrThrow();
  await transport.resizeTerminal(bridge.shellId, cols, rows);
}

export async function killAgentOsPtySession(sessionId: string): Promise<void> {
  const bridge = ptyBridges.get(sessionId);
  if (!bridge) return;
  bridge.unsub();
  ptyBridges.delete(sessionId);
  releaseTileAttach(bridge.tileId);
  try {
    const transport = await transportOrThrow();
    await transport.closeTerminal(bridge.shellId);
  } catch {
    // A tile close must release local actor resources even if the host has
    // already exited. The next fresh tile will create a new attachment.
  }
}

export function newAgentOsPtySessionId(): string {
  return `agentos-pty-${randomBytes(8).toString('hex')}`;
}

export function getAgentOsTileAttach(tileId: string): Readonly<TileAttach> | null {
  return tileAttaches.get(tileId) ?? null;
}

export async function promptAgentOsTile(
  tileId: string,
  text: string,
): Promise<{ text: string; response?: unknown }> {
  const attach = tileAttaches.get(tileId.trim());
  if (!attach) throw new Error(formatAgentOsUnavailable(`no AgentOS attach for tile ${tileId}`));
  const transport = await transportOrThrow();
  return transport.prompt(attach.sessionId, text);
}

export async function writeAgentOsTileTerminal(tileId: string, text: string): Promise<void> {
  const attach = tileAttaches.get(tileId.trim());
  if (!attach) throw new Error(formatAgentOsUnavailable(`no AgentOS attach for tile ${tileId}`));
  const transport = await transportOrThrow();
  await transport.writeTerminal(attach.shellId, text);
}

export function detachAgentOsTile(tileId: string): void {
  releaseTileAttach(tileId.trim());
}

export async function disposeAgentOsTerminalBridge(): Promise<void> {
  for (const sessionId of [...ptyBridges.keys()]) {
    await killAgentOsPtySession(sessionId);
  }
  tileAttaches.clear();
}
