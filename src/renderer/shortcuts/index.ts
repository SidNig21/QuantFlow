/**
 * Renderer keyboard shortcut contract (Goal 4).
 *
 * Canonical shortcut keys shared between the live shell renderer and any future
 * framework renderer so bindings stay consistent.
 */

/** Flip the focused tile between its terminal front and State Card back. */
export const FLIP_TILE_KEY = 'f';

/** True when an event should trigger the tile flip (no modifiers, key F). */
export function isFlipTileShortcut(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  return (
    e.key.toLowerCase() === FLIP_TILE_KEY &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  );
}
