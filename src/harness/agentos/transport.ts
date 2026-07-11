/**
 * AgentOS transport seam — localhost HTTP/JSON-RPC shape the WSL host process
 * exposes. The adapter depends on this interface only; the durable
 * @rivet-dev/agentos actor wrapper stays in the host process.
 */

export interface AgentOsPermissionRequest {
  requestId: string;
  action?: string;
  toolCallId?: string;
  source?: 'toolkit' | 'acp';
  raw?: unknown;
}

export interface AgentOsSessionOptions {
  env?: Record<string, string>;
  /** Durable actor address, used together with tileId when both are present. */
  workspaceId?: string;
  tileId?: string;
}

export interface AgentOsTransport {
  createSession(
    software: string,
    options?: AgentOsSessionOptions,
  ): Promise<{ sessionId: string }>;
  prompt(sessionId: string, text: string): Promise<{ text: string; response?: unknown }>;
  onSessionEvent(sessionId: string, handler: (event: unknown) => void): () => void;
  onPermissionRequest(
    sessionId: string,
    handler: (request: AgentOsPermissionRequest) => void | Promise<void>,
  ): () => void;
  respondPermission(sessionId: string, requestId: string, approved: boolean): Promise<void>;
  readFile(path: string, sessionId?: string): Promise<Uint8Array>;
  dispose(): Promise<void>;
  health(): Promise<{ ok: boolean; hasCredential?: boolean }>;
  /** V1: interactive terminal attach for actor tiles. */
  openTerminal(sessionId: string, cols: number, rows: number): Promise<{ shellId: string }>;
  writeTerminal(shellId: string, data: string): Promise<void>;
  resizeTerminal(shellId: string, cols: number, rows: number): Promise<void>;
  onTerminalData(shellId: string, handler: (data: Uint8Array) => void): () => void;
  closeTerminal(shellId: string): Promise<void>;
}
