/**
 * Shared row types for the QuantFlow runtime state layer.
 *
 * These types define the API surface that both the in-memory stub (Phase 2)
 * and the SQLite implementation (Phase 7) must satisfy. All callers import
 * from here — never from the concrete repo files.
 *
 * Column naming follows SQLite conventions (snake_case) so Phase 7 can map
 * rows directly from `better-sqlite3` with zero type changes.
 */

export type TaskStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "cancelled";

/** One unit of work delegated via a cable from one tile to another. */
export interface TaskRow {
  id: string;
  run_id: string | null;
  parent_task_id: string | null;
  /** The cable (connection) that carried the task, if any. */
  cable_id: string | null;
  from_tile_id: string;
  to_tile_id: string;
  correlation_id: string | null;
  thread_id: string | null;
  trace_id: string | null;
  origin: string | null;
  status: TaskStatus;
  /** Raw message text sent as the task payload. */
  payload: string;
  payload_hash: string | null;
  /** Optional contract id for §5 validation (null = legacy untyped payload). */
  schema_id: string | null;
  schema_version: string | null;
  /** Agent response, populated when status reaches 'done'. */
  result: string | null;
  sent_at: number | null;
  delivered_at: number | null;
  completed_at: number | null;
  created_at: number; // ms since epoch
  updated_at: number;
}

/** One discrete event in the system — relay send, relay fail, PTY spawn, etc. */
export interface EventRow {
  id: string;
  run_id: string | null;
  /** Dot-separated kind: 'cable.send', 'cable.fail', 'pty.spawn', 'herdr.status_change' */
  kind: string;
  task_id: string | null;
  tile_id: string | null;
  trace_id: string | null;
  correlation_id: string | null;
  cable_id: string | null;
  level: string | null;
  /** Arbitrary structured payload for the event kind. */
  data: Record<string, unknown>;
  created_at: number;
}

export type RunStatus = "running" | "done" | "error" | "cancelled";

export interface RunRow {
  id: string;
  root_task_id: string | null;
  status: RunStatus;
  title: string | null;
  metadata: Record<string, unknown>;
  started_at: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ArtifactRow {
  id: string;
  run_id: string | null;
  task_id: string | null;
  tile_id: string | null;
  kind: string;
  uri: string | null;
  content_hash: string | null;
  media_type: string | null;
  size_bytes: number | null;
  metadata: Record<string, unknown>;
  created_at: number;
}

export interface TileCapabilityRow {
  id: string;
  tile_id: string;
  capability: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface TileRuntimeRow {
  tile_id: string;
  pane_id: string | null;
  status: string | null;
  presence: string;
  metadata: Record<string, unknown>;
  last_seen_at: number | null;
  created_at: number;
  updated_at: number;
}

/** A herdr agent_status change for a pane — idle → working → done, etc. */
export interface StatusTransitionRow {
  id: string;
  pane_id: string;
  /** QuantFlow tile linked to this herdr pane, if known. */
  tile_id: string | null;
  from_status: string;
  to_status: string;
  created_at: number;
}

/** Lifecycle record for one PTY session. */
export interface PtySessionRow {
  id: string;
  tile_id: string;
  shell: string;
  pid: number | null;
  /** 'sidecar' | 'tmux' | 'local' */
  target: string;
  cwd: string;
  created_at: number;
  ended_at: number | null;
  exit_code: number | null;
}

// ─── Filter types used by list queries ───────────────────────────────────────

export interface TaskFilter {
  runId?: string;
  parentTaskId?: string;
  cableId?: string;
  fromTileId?: string;
  toTileId?: string;
  correlationId?: string;
  traceId?: string;
  status?: TaskStatus;
  since?: number;
  limit?: number;
}

export interface EventFilter {
  runId?: string;
  kind?: string;
  taskId?: string;
  tileId?: string;
  traceId?: string;
  correlationId?: string;
  cableId?: string;
  level?: string;
  since?: number;
  limit?: number;
}

export interface RunFilter {
  rootTaskId?: string;
  status?: RunStatus;
  since?: number;
  limit?: number;
}

export interface ArtifactFilter {
  runId?: string;
  taskId?: string;
  tileId?: string;
  kind?: string;
  contentHash?: string;
  since?: number;
  limit?: number;
}

export interface TileCapabilityFilter {
  tileId?: string;
  capability?: string;
  limit?: number;
}

export interface TileRuntimeFilter {
  paneId?: string;
  status?: string;
  presence?: string;
  since?: number;
  limit?: number;
}

export interface StatusFilter {
  paneId?: string;
  tileId?: string;
  since?: number;
  limit?: number;
}

export interface PtySessionFilter {
  tileId?: string;
  active?: boolean; // true = ended_at IS NULL
  since?: number;
  limit?: number;
}

/**
 * A persisted connection (cable) between two tiles. Canonical per v2 §3.
 * schema_id is intentionally absent here — it lives on TaskRow only (migration 003).
 * Cross-schema compatibility checks are deferred to Goal 4+.
 */
export interface ConnectionRow {
  id: string;
  tile_a_id: string;
  tile_b_id: string;
  from_tile_id: string | null;
  from_side: "N" | "E" | "S" | "W" | null;
  to_tile_id: string | null;
  to_side: "N" | "E" | "S" | "W" | null;
  type: string;
  kind: string;
  label: string | null;
  /** JSON blob for connection config */
  config: string;
  watcher_enabled: number;
  watcher_syntax: string;
  /** In-flight message count for this semantic cable. 0 when idle. */
  queue_depth: number;
  created_at: number;
  updated_at: number;
}

export interface ConnectionFilter {
  tileAId?: string;
  tileBId?: string;
  /** Match connections where either endpoint is this tileId */
  tileId?: string;
  label?: string;
  limit?: number;
}

/** A JSON Schema registered in runtime.db for §5 payload validation. */
export interface SchemaRow {
  schema_id: string;
  schema_version: string;
  /** Raw JSON Schema document (JSON-serialised string). */
  body: string;
  created_at: number;
  updated_at: number;
}

/** Structured rejection when a payload fails schema validation. */
export interface SchemaValidationRejection {
  error: "schema_validation_failed";
  schema_id: string;
  violations: SchemaViolation[];
}

export interface SchemaViolation {
  path: string;
  message: string;
}

// ─── Smart Strings (Goal 5.5) ─────────────────────────────────────────────────

/**
 * String modes supported in v1.
 * `handoff`, `trigger`, `gate`, `pipe` are deferred per CLAUDE.md.
 */
export type SmartStringMode =
  | "message"
  | "watch"
  | "reply"
  | "artifact"
  | "receipt";

export type SmartStringSourceAdapter =
  | "terminal-pty"
  | "runtime-event"
  | "agent-tile";

export type SmartStringTargetAdapter =
  | "terminal-pty"
  | "agent-tile"
  | "runtime-event"
  | "envoy-shared-space"
  | "mcp-send";

export interface SmartStringMatchRule {
  /** "contains" checks substring; "regex" compiles pattern as RegExp */
  type: "contains" | "regex";
  pattern: string;
}

export interface SmartStringTransform {
  /** "passthrough" delivers the matched line as-is; "structured-message" wraps in a typed envelope */
  type: "passthrough" | "structured-message";
  /** Handlebars-style template for structured-message: {{line}}, {{connectionId}}, {{tileId}}, {{ts}} */
  template?: string;
}

export type SmartStringDeliveryPolicy = "fire-and-forget" | "await-ack";

export interface SmartStringConfig {
  mode: SmartStringMode;
  enabled: boolean;
  source_adapter?: SmartStringSourceAdapter;
  target_adapter?: SmartStringTargetAdapter;
  match_rule?: SmartStringMatchRule;
  transform?: SmartStringTransform;
  delivery_policy?: SmartStringDeliveryPolicy;
  schema_id?: string | null;
  metadata?: Record<string, unknown>;
}

/** Parsed connection config including optional smart string config. */
export interface ConnectionConfig {
  smartString?: SmartStringConfig;
  [key: string]: unknown;
}
