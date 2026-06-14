/**
 * TileBack — renderer projector contract (Goal 4).
 *
 * The back face of a tile shows its State Card. This module defines the
 * contract for the flip state and re-exports the StateCardView projection so
 * the live shell renderer and any future framework renderer share one source
 * of truth for what the back face contains.
 *
 * The terminal/live content remains the front face and is never replaced — the
 * back face is an overlay revealed by flipping. The front (terminal) must not
 * be degraded by the flip.
 */

import {
  formatStateCard,
  type StateCardSnapshotLike,
  type StateCardSection,
} from '../StateCardView/state-card-view';

export interface TileBackModel {
  tileId: string;
  flipped: boolean;
  sections: StateCardSection[];
}

/** Build the back-face model from a (possibly null) State Card snapshot. */
export function buildTileBack(
  tileId: string,
  card: StateCardSnapshotLike | null,
  flipped: boolean,
): TileBackModel {
  return { tileId, flipped, sections: formatStateCard(card) };
}

export type { StateCardSection, StateCardSnapshotLike };
