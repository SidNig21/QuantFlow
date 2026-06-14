import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';

export interface KernelEventPayload {
  kind: string;
  correlationId?: string;
  tileId?: string;
  workflowId?: string;
  taskId?: string;
  data?: unknown;
}

const emitter = new EventEmitter();
const subscribers = new Set<WebContents>();

export function emitKernelEvent(payload: KernelEventPayload): void {
  emitter.emit('kernel-event', payload);
  for (const wc of subscribers) {
    if (!wc.isDestroyed()) {
      wc.send('kernel:event', payload);
    } else {
      subscribers.delete(wc);
    }
  }
}

export function subscribeWebContents(wc: WebContents): () => void {
  subscribers.add(wc);
  return () => { subscribers.delete(wc); };
}

export function onKernelEvent(
  listener: (payload: KernelEventPayload) => void,
): void {
  emitter.on('kernel-event', listener);
}
