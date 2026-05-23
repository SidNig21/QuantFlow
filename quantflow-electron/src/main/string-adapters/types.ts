import type {
  SmartStringSourceAdapter,
  SmartStringTargetAdapter,
  SmartStringConfig,
} from "../runtime-state/types";

export type { SmartStringSourceAdapter, SmartStringTargetAdapter };

// ─── Shared context passed to every adapter call ──────────────────────────────

export interface AdapterContext {
  connectionId: string;
  runId?: string | null;
  traceId?: string | null;
  correlationId?: string | null;
  tileId?: string | null;
}

// ─── Result contract — every adapter returns this ─────────────────────────────

export type AdapterResult =
  | { ok: true; detail?: unknown }
  | { ok: false; code: string; message: string; detail?: unknown };

// ─── Source adapter — captures/reads from a tile ──────────────────────────────

export interface SourceCapture {
  /** Raw text captured from the source (may be a single line or chunk) */
  text: string;
  tileId: string;
  connectionId: string;
  ts: number;
}

// ─── Target delivery request ──────────────────────────────────────────────────

export interface DeliveryRequest {
  /** The text to deliver to the target */
  text: string;
  /** Target tile ID, if the adapter needs it */
  targetTileId?: string;
  config: SmartStringConfig;
  ctx: AdapterContext;
}

// ─── Adapter registry shape ───────────────────────────────────────────────────

export interface TargetAdapter {
  kind: SmartStringTargetAdapter;
  deliver(req: DeliveryRequest): Promise<AdapterResult> | AdapterResult;
}
