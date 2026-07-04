/**
 * AgentOS terminal PTY bridge — maps canvas PTY sessions to transport shells (V1).
 */
import { randomBytes } from 'node:crypto';
import type { AgentOsTransport } from '@qf-harness/agentos/transport';
import { resolveAgentOsCredential } from '@qf-harness/agentos/credential-order';
import { formatAgentOsUnavailable } from '@qf-harness/agentos/error-messages';
import { getAgentOsTransport } from './agentos-service';
import {
  buildAgentOsDisplayTarget,
  parseAgentOsAttachTarget,
} from './pty-spawn-params';

export { buildAgentOsDisplayTarget, parseAgentOsAttachTarget };

interface TileAttach {
  tileId: string;
  sessionId: string;
  shellId: string;
  software: string;
  terminalUnsub: (() => void) | null;
}

const tileAttaches = new Map<string, TileAttach>();
const ptyBridges = new Map<string, { shellId: string; tileId: string; unsub: () => void }>();

function resolveSoftware(input?: string): string {
  const trimmed = input?.trim();
  if (trimmed === 'pi' || trimmed === 'opencode' || trimmed === 'claude-code') return trimmed;
  return resolveAgentOsCredential()?.software ?? 'pi';
}

async function transportOrThrow(): Promise<AgentOsTransport> {
  return getAgentOsTransport();
}

export async function prepareAgentOsTerminalAttach(input: {
  tileId: string;
  cols?: number;
  rows?: number;
  instruction?: string;
  software?: string;
}): Promise<{ terminalTarget: string }> {
  const tileId = input.tileId.trim();
  if (!tileId) throw new Error(formatAgentOsUnavailable('tileId required'));

  const transport = await transportOrThrow();
  const cols = input.cols ?? 80;
  const rows = input.rows ?? 24;
  const software = resolveSoftware(input.software);

  let attach = tileAttaches.get(tileId);
  if (!attach) {
    const { sessionId } = await transport.createSession(software, {});
    const { shellId } = await transport.openTerminal(sessionId, cols, rows);
    attach = { tileId, sessionId, shellId, software, terminalUnsub: null };
    tileAttaches.set(tileId, attach);
  }

  const instruction = input.instruction?.trim();
  if (instruction) {
    await transport.prompt(attach.sessionId, instruction);
  }

  return { terminalTarget: buildAgentOsDisplayTarget(tileId) };
}

export async function bindAgentOsPtySession(input: {
  ptySessionId: string;
  tileId: string;
  senderWebContentsId?: number;
  cols: number;
  rows: number;
  onData: (sessionId: string, senderId: number | undefined, data: string) => void;
}): Promise<void> {
  const tileId = input.tileId.trim();
  let attach = tileAttaches.get(tileId);
  const transport = await transportOrThrow();

  if (!attach) {
    const prepared = await prepareAgentOsTerminalAttach({
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
  const unsub = transport.onTerminalData(attach.shellId, (chunk) => {
    input.onData(input.ptySessionId, input.senderWebContentsId, Buffer.from(chunk).toString('utf8'));
  });
  attach.terminalUnsub = unsub;
  ptyBridges.set(input.ptySessionId, { shellId: attach.shellId, tileId, unsub });
}

export function isAgentOsPtySession(sessionId: string): boolean {
  return ptyBridges.has(sessionId);
}

export async function writeAgentOsPtySession(sessionId: string, data: string): Promise<void> {
  const bridge = ptyBridges.get(sessionId);
  if (!bridge) return;
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
  const transport = await transportOrThrow();
  await transport.closeTerminal(bridge.shellId);
}

export function newAgentOsPtySessionId(): string {
  return `agentos-pty-${randomBytes(8).toString('hex')}`;
}

export function getAgentOsTileAttach(tileId: string): Readonly<TileAttach> | null {
  return tileAttaches.get(tileId) ?? null;
}

export async function promptAgentOsTile(tileId: string, text: string): Promise<void> {
  const attach = tileAttaches.get(tileId.trim());
  if (!attach) throw new Error(formatAgentOsUnavailable(`no AgentOS attach for tile ${tileId}`));
  const transport = await transportOrThrow();
  await transport.prompt(attach.sessionId, text);
}

export async function writeAgentOsTileTerminal(tileId: string, text: string): Promise<void> {
  const attach = tileAttaches.get(tileId.trim());
  if (!attach) throw new Error(formatAgentOsUnavailable(`no AgentOS attach for tile ${tileId}`));
  const transport = await transportOrThrow();
  await transport.writeTerminal(attach.shellId, text);
}

export function detachAgentOsTile(tileId: string): void {
  tileAttaches.delete(tileId.trim());
}

export async function disposeAgentOsTerminalBridge(): Promise<void> {
  for (const sessionId of [...ptyBridges.keys()]) {
    await killAgentOsPtySession(sessionId);
  }
  tileAttaches.clear();
}
