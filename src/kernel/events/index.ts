/**
 * CANONICAL Kernel event path (Stage E1).
 * emitKernelEvent is the sole fan-out for KERNEL_EVENT_KINDS → in-process
 * listeners (onKernelEvent) and renderer IPC (kernel:event). No other module
 * may send kernel:event or re-emit taxonomy kind strings.
 */
import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { traceSync } from '../perf/trace';
import type { KernelEventKind } from './taxonomy';

export type { KernelEventKind } from './taxonomy';
export { KERNEL_EVENT_KINDS } from './taxonomy';

export interface KernelEventPayload {
  kind: KernelEventKind;
  correlationId?: string;
  tileId?: string;
  workflowId?: string;
  taskId?: string;
  data?: unknown;
}

const emitter = new EventEmitter();
const subscribers = new Set<WebContents>();

export function emitKernelEvent(payload: KernelEventPayload): void {
  traceSync(
    {
      layer: 'kernel',
      name: 'kernel.event.fanout',
      phase: payload.kind,
      workflow_id: payload.workflowId,
      tile_id: payload.tileId,
      task_id: payload.taskId,
      correlation_id: payload.correlationId,
      payload_size_bytes: payload.data === undefined ? 0 : JSON.stringify(payload.data).length,
    },
    () => {
      emitter.emit('kernel-event', payload);
      for (const wc of subscribers) {
        if (!wc.isDestroyed()) {
          wc.send('kernel:event', payload);
        } else {
          subscribers.delete(wc);
        }
      }
    },
  );
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
