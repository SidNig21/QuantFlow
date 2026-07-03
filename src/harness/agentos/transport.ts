/**
 * AgentOS transport seam — localhost HTTP/JSON-RPC shape the WSL host process
 * will expose. The adapter depends on this interface only; @rivet-dev/agentos-core
 * stays in the host process (next chunk).
 */

export interface AgentOsPermissionRequest {
  requestId: string;
  action?: string;
  toolCallId?: string;
  source?: 'toolkit' | 'acp';
  raw?: unknown;
}

export interface AgentOsTransport {
  createSession(
    software: string,
    options?: { env?: Record<string, string> },
  ): Promise<{ sessionId: string }>;
  prompt(sessionId: string, text: string): Promise<void>;
  onSessionEvent(sessionId: string, handler: (event: unknown) => void): () => void;
  onPermissionRequest(
    sessionId: string,
    handler: (request: AgentOsPermissionRequest) => void | Promise<void>,
  ): () => void;
  respondPermission(sessionId: string, requestId: string, approved: boolean): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  dispose(): Promise<void>;
  health(): Promise<{ ok: boolean }>;
}
