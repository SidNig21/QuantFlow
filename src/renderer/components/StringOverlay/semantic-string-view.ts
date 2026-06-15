/**
 * Semantic string view — renderer projector contract (Goal 7).
 *
 * Pure, framework-agnostic mapping from a Kernel connection's `semantic_type`
 * to how the canvas should present that string: a human label, a CSS class hook,
 * whether it is directional (delegation/verification/handoff point one way), and
 * whether it should read as an alert (a blocker). The renderer is a projector —
 * the meaning lives in the Kernel `connections.semantic_type` column; this only
 * decides presentation.
 *
 * No DOM, no imports from src/main or src/kernel internals — input is the
 * connection's structural shape as returned by the Kernel query boundary.
 */

export type SemanticStringType =
  | 'delegation'
  | 'context_flow'
  | 'artifact_dependency'
  | 'verification'
  | 'blocker'
  | 'receipt_handoff'
  | 'manual_connection';

export interface SemanticStringStyle {
  /** Short human label shown on/near the string. */
  label: string;
  /** CSS class hook, e.g. `string-semantic--delegation`. */
  className: string;
  /** Whether the relationship has a meaningful from→to direction (draw arrow). */
  directional: boolean;
  /** Whether the string should read as an alert / draw attention. */
  alert: boolean;
}

/** Presentation table for every canonical semantic type. */
export const SEMANTIC_STRING_STYLES: Record<SemanticStringType, SemanticStringStyle> = {
  delegation: { label: 'Delegation', className: 'string-semantic--delegation', directional: true, alert: false },
  context_flow: { label: 'Context', className: 'string-semantic--context', directional: true, alert: false },
  artifact_dependency: {
    label: 'Artifact',
    className: 'string-semantic--artifact',
    directional: true,
    alert: false,
  },
  verification: { label: 'Verification', className: 'string-semantic--verification', directional: true, alert: false },
  blocker: { label: 'Blocker', className: 'string-semantic--blocker', directional: true, alert: true },
  receipt_handoff: {
    label: 'Receipt',
    className: 'string-semantic--receipt',
    directional: true,
    alert: false,
  },
  manual_connection: { label: 'Link', className: 'string-semantic--manual', directional: false, alert: false },
};

export const SEMANTIC_STRING_TYPES = Object.keys(SEMANTIC_STRING_STYLES) as SemanticStringType[];

const STYLE_SET = new Set<string>(SEMANTIC_STRING_TYPES);

/** Coerce an arbitrary value to a known semantic type (default manual). */
export function normalizeStringType(value: unknown): SemanticStringType {
  return typeof value === 'string' && STYLE_SET.has(value)
    ? (value as SemanticStringType)
    : 'manual_connection';
}

export interface SemanticConnectionLike {
  id: string;
  semanticType?: string | null;
  label?: string | null;
  fromTileId?: string | null;
  toTileId?: string | null;
  tileAId?: string;
  tileBId?: string;
}

export interface ResolvedSemanticString {
  id: string;
  type: SemanticStringType;
  /** The connection's own label if set, else the type's default label. */
  label: string;
  className: string;
  directional: boolean;
  alert: boolean;
  /** Directional endpoints, falling back to the canonical A/B endpoints. */
  fromTileId: string | null;
  toTileId: string | null;
}

/**
 * Resolve one connection into its presentation descriptor. The connection's own
 * `label` wins over the type default when present and non-empty.
 */
export function resolveSemanticString(conn: SemanticConnectionLike): ResolvedSemanticString {
  const type = normalizeStringType(conn.semanticType);
  const style = SEMANTIC_STRING_STYLES[type];
  const ownLabel = typeof conn.label === 'string' ? conn.label.trim() : '';
  return {
    id: conn.id,
    type,
    label: ownLabel || style.label,
    className: style.className,
    directional: style.directional,
    alert: style.alert,
    fromTileId: conn.fromTileId ?? conn.tileAId ?? null,
    toTileId: conn.toTileId ?? conn.tileBId ?? null,
  };
}

export function resolveSemanticStrings(
  connections: SemanticConnectionLike[],
): ResolvedSemanticString[] {
  return connections.map(resolveSemanticString);
}
