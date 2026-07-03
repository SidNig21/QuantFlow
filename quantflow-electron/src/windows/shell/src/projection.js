/**
 * Kernel projection read path for the shell renderer (extracted from renderer.js).
 *
 * Owns query invocation, result caching, and read-only access to workflow regions
 * and canvas snapshots. No mutations — sendQuery only.
 */

/**
 * @typedef {(name: string, args: Record<string, unknown>) => Promise<unknown>} SendQueryFn
 */

/**
 * Build a map of connection id → semantic type from a canvas snapshot.
 * @param {unknown} snapshot
 * @returns {Map<string, string|null>}
 */
function buildConnectionSemanticTypes(snapshot) {
	const map = new Map();
	for (const conn of snapshot?.connections ?? []) {
		if (conn?.id) map.set(conn.id, conn.semanticType ?? null);
	}
	return map;
}

/**
 * @param {object} deps
 * @param {SendQueryFn|undefined|null} deps.sendQuery - injected Kernel query transport
 */
export function createProjectionReader({ sendQuery } = {}) {
	/** @type {unknown[]} */
	let lastRegions = [];
	/** @type {unknown} */
	let lastSnapshot = null;
	/** @type {Map<string, string|null>} */
	let lastConnectionSemanticTypes = new Map();

	function hasTransport() {
		return typeof sendQuery === "function";
	}

	/**
	 * @returns {Promise<unknown>|null}
	 */
	async function readRegionList() {
		if (!hasTransport()) return null;
		return sendQuery("kernel.workflow.region_list", {});
	}

	/**
	 * @returns {Promise<unknown>|null}
	 */
	async function readCanvasSnapshot() {
		if (!hasTransport()) return null;
		return sendQuery("kernel.canvas.snapshot", {});
	}

	/**
	 * @param {string} tileId
	 * @returns {Promise<unknown>|null}
	 */
	async function readStateCard(tileId) {
		if (!hasTransport()) return null;
		return sendQuery("kernel.state_card.get", { tileId });
	}

	/**
	 * @returns {Promise<unknown>|null}
	 */
	async function readConductorContext() {
		if (!hasTransport()) return null;
		return sendQuery("kernel.conductor.context", {});
	}

	/**
	 * Parallel refresh of region list + canvas snapshot; updates cache on success.
	 * Failed reads leave the last frame intact.
	 *
	 * @returns {Promise<boolean>} true when transport ran (regardless of success)
	 */
	async function refreshWorkflowProjectionCache() {
		if (!hasTransport()) return false;
		try {
			const [regions, snapshot] = await Promise.all([
				readRegionList(),
				readCanvasSnapshot(),
			]);
			lastRegions = Array.isArray(regions) ? regions : [];
			lastSnapshot = snapshot ?? null;
			lastConnectionSemanticTypes = buildConnectionSemanticTypes(lastSnapshot);
		} catch {
			// Read-only projection: a failed read just leaves the last frame.
		}
		return true;
	}

	return {
		readRegionList,
		readCanvasSnapshot,
		readStateCard,
		readConductorContext,
		refreshWorkflowProjectionCache,
		getRegions: () => lastRegions,
		getSnapshot: () => lastSnapshot,
		getConnectionSemanticTypes: () => lastConnectionSemanticTypes,
	};
}
