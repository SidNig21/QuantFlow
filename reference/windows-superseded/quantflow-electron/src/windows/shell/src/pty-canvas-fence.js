/**
 * E2/PF2 — PTY stream / canvas separation (shell renderer boundary).
 *
 * Contract: `pty:data` is terminal-webview surface only. This module owns
 * milestone handlers that may touch canvas cache (title, ptyStatus) and must
 * never run per stdout chunk. Coalescers debounce cwd/title-adjacent work;
 * status updates are edge-triggered on value change only.
 */

/** Debounce cwd-derived canvas writes (OSC 7 precmd bursts). */
export const PTY_CWD_COALESCE_MS = 200;

/**
 * Canvas seam for raw PTY stream batches — intentional no-op.
 * @param {{ sessionId: string, data: Uint8Array | Buffer | string }} _payload
 */
export function processPtyDataForCanvas(_payload) {
	return { canvasEffects: 0 };
}

const OSC7_RE = /\x1b\]7;([^\x07\x1b]+)(?:\x07|\x1b\\)/g;

/**
 * Scan PTY bytes for OSC 7 cwd reports (same family TerminalTab parses).
 * @param {Uint8Array | Buffer | string} data
 * @returns {string[]}
 */
export function extractOsc7CwdPaths(data) {
	const text =
		typeof data === "string"
			? data
			: new TextDecoder("utf-8", { fatal: false }).decode(
					data instanceof Uint8Array ? data : new Uint8Array(data),
				);
	const paths = [];
	for (const match of text.matchAll(OSC7_RE)) {
		try {
			const url = new URL(match[1]);
			if (url.protocol === "file:") {
				const cwd = decodeURIComponent(url.pathname);
				if (cwd) paths.push(cwd);
			}
		} catch {
			// Malformed OSC 7 — ignore
		}
	}
	return paths;
}

/**
 * @param {{ debounceMs?: number, onFlush: (item: { tileId: string, cwd: string }) => void }} options
 */
export function createPtyCwdCoalescer(options) {
	const debounceMs = options.debounceMs ?? PTY_CWD_COALESCE_MS;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let timer = null;
	/** @type {Map<string, string>} */
	const pending = new Map();

	function flush() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		const batch = new Map(pending);
		pending.clear();
		for (const [tileId, cwd] of batch) {
			options.onFlush({ tileId, cwd });
		}
	}

	return {
		schedule(tileId, cwd) {
			if (!tileId || !cwd) return;
			pending.set(tileId, cwd);
			if (timer) clearTimeout(timer);
			timer = setTimeout(flush, debounceMs);
		},
		flush,
		cancel() {
			if (timer) clearTimeout(timer);
			timer = null;
			pending.clear();
		},
	};
}

/**
 * Milestone: cwd change from terminal webview (OSC 7 → pty-cwd-changed).
 * Edge-triggered on cwd !== autoTitle; no syncTileList/updateCables here.
 * @returns {{ applied: boolean }}
 */
export function applyPtyCwdMilestone(tile, cwd, hooks = {}) {
	if (!tile || !cwd || cwd === tile.autoTitle) {
		return { applied: false };
	}
	tile.cwd = cwd;
	tile.autoTitle = cwd;
	hooks.ensureRouteHandle?.(tile);
	hooks.updateTileTitle?.(tile);
	hooks.saveCanvasDebounced?.();
	hooks.registerTerminalTileSession?.(tile);
	hooks.onTerminalCwdChanged?.(cwd);
	return { applied: true };
}

/**
 * @param {Array<{ id?: string, type?: string, ptySessionId?: string }>} tiles
 * @param {string} sessionId
 */
export function findTermTileBySessionId(tiles, sessionId) {
	return (
		tiles.find(
			(t) => t?.type === "term" && t.ptySessionId === sessionId,
		) ?? null
	);
}

/**
 * Milestone: PTY session exit → close tile via Kernel path (closeTile dispatches
 * kernel.tile.remove before local teardown).
 * @returns {{ closed: boolean, tileId?: string }}
 */
export function handlePtyExitMilestone(payload, tiles, closeTile) {
	const tile = findTermTileBySessionId(tiles, payload?.sessionId);
	if (!tile) return { closed: false };
	closeTile(tile.id);
	return { closed: true, tileId: tile.id };
}

/**
 * Milestone batch from watchtower agent snapshot — status edge-trigger only.
 * @returns {{ changed: boolean, statusUpdates: number }}
 */
export function applyTerminalStatusMilestones(items, hooks) {
	if (!Array.isArray(items)) return { changed: false, statusUpdates: 0 };
	let changed = false;
	let statusUpdates = 0;
	for (const item of items) {
		const tile = item?.tileId ? hooks.getTile(item.tileId) : null;
		if (!tile || tile.type !== "term") continue;
		const next = item.status || "";
		if (tile.ptyStatus === next) continue;
		tile.ptyStatus = next;
		statusUpdates += 1;
		const dom = hooks.getTileDOM?.(tile.id);
		if (dom) hooks.updateTileTitle?.(dom, tile);
		changed = true;
	}
	if (changed) hooks.onBatchChanged?.();
	return { changed, statusUpdates };
}
