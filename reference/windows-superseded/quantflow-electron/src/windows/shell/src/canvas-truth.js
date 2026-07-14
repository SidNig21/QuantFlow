/**
 * Stage D3 — one-truth flag read once from main-process env via preload.
 * Renderer code gates behavior-risky cache bypasses on this; mechanical fixes
 * (kernel command added where it was missing) stay always-on.
 */
export function isOneTruthEnabled() {
	return window.shellApi?.isOneTruthEnabled?.() === true;
}
