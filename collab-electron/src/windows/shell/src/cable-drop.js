export const CABLE_DROP_MESSAGES = Object.freeze({
	duplicate: "Connection already exists.",
	invalidSource: "Drag from a terminal.",
	missingTarget: "Drop on a terminal to connect.",
	sameTile: "Drop on a different terminal.",
});

export function resolveCableDrop({ sourceTile, targetTile, connections }) {
	if (sourceTile?.type !== "term") {
		return {
			ok: false,
			reason: "invalid_source",
			message: CABLE_DROP_MESSAGES.invalidSource,
		};
	}

	if (!targetTile || targetTile.type !== "term") {
		return {
			ok: false,
			reason: "missing_target",
			message: CABLE_DROP_MESSAGES.missingTarget,
		};
	}

	if (targetTile.id === sourceTile.id) {
		return {
			ok: false,
			reason: "same_tile",
			message: CABLE_DROP_MESSAGES.sameTile,
		};
	}

	const duplicate = connections.some(
		(conn) =>
			(conn.tileAId === sourceTile.id && conn.tileBId === targetTile.id) ||
			(conn.tileAId === targetTile.id && conn.tileBId === sourceTile.id),
	);
	if (duplicate) {
		return {
			ok: false,
			reason: "duplicate",
			message: CABLE_DROP_MESSAGES.duplicate,
		};
	}

	return {
		ok: true,
		reason: "ready",
		tileAId: sourceTile.id,
		tileBId: targetTile.id,
	};
}
