/**
 * Tile — renderer projector contract (Goal 4).
 *
 * A tile has a front face (live content, e.g. a terminal) and a back face (its
 * State Card, see ../TileBack). This module defines the flip-state contract the
 * renderer uses; the canonical tile/State Card data lives in the Kernel, not
 * here. The renderer only tracks ephemeral UI flip state.
 */

export type TileFace = 'front' | 'back';

export interface TileFlipState {
  tileId: string;
  face: TileFace;
}

export function toggleFace(face: TileFace): TileFace {
  return face === 'front' ? 'back' : 'front';
}

export function isFlipped(state: TileFlipState): boolean {
  return state.face === 'back';
}
