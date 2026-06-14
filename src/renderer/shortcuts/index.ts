/**
 * Renderer keyboard shortcut contract (Goal 4).
 *
 * Canonical shortcut keys shared between the live shell renderer and any future
 * framework renderer so bindings stay consistent.
 *
 * Flip is bound to Shift+F (not plain F) so a lone `f` stays typeable in
 * terminals. It flips ALL tiles together. The live binding is enforced by the
 * main-process shortcut keymap (quantflow-electron/src/main/index.ts).
 */

/** Flip all tiles between their terminal front and State Card back. */
export const FLIP_TILES_KEY = 'f';

/** True when an event should trigger the flip-all shortcut (Shift+F, no other modifiers). */
export function isFlipTilesShortcut(e: {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}): boolean {
  return (
    e.key.toLowerCase() === FLIP_TILES_KEY &&
    e.shiftKey === true &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  );
}
