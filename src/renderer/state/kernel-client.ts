// Typed contract for window.kernelApi (exposed by quantflow-electron/src/preload/shell.ts).
// Import this in TypeScript renderer code that needs to talk to the Kernel.

export interface KernelEventPayload {
  kind: string;
  correlationId?: string;
  tileId?: string;
  workflowId?: string;
  taskId?: string;
  data?: unknown;
}

export interface CommandResult {
  ok: boolean;
  id?: string;
  error?: string;
  data?: unknown;
}

declare global {
  interface Window {
    kernelApi?: {
      sendCommand(type: string, payload: Record<string, unknown>): Promise<CommandResult>;
      sendQuery(type: string, params?: Record<string, unknown>): Promise<unknown>;
      onEvent(cb: (payload: KernelEventPayload) => void): () => void;
    };
  }
}

export function sendKernelCommand(
  type: string,
  payload: Record<string, unknown>,
): Promise<CommandResult> {
  if (!window.kernelApi) throw new Error('kernelApi not available in this context');
  return window.kernelApi.sendCommand(type, payload);
}

export function sendKernelQuery(
  type: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  if (!window.kernelApi) throw new Error('kernelApi not available in this context');
  return window.kernelApi.sendQuery(type, params);
}

export function onKernelEvent(
  cb: (payload: KernelEventPayload) => void,
): () => void {
  if (!window.kernelApi) throw new Error('kernelApi not available in this context');
  return window.kernelApi.onEvent(cb);
}
