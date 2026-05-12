export const CABLE_DROP_MESSAGES = Object.freeze({
	invalidSource: "Drag from a terminal.",
	missingTarget: "Drop on a terminal to connect.",
	sameTile: "Drop on a different terminal.",
});

export function normalizeCableSide(side, fallback) {
	return side === "N" || side === "E" || side === "S" || side === "W"
		? side
		: fallback;
}

export function resolveCableDrop({
	sourceTile,
	targetTile,
	connections,
	sourceSide = "E",
	targetSide = "W",
}) {
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

	return {
		ok: true,
		reason: "ready",
		tileAId: sourceTile.id,
		tileBId: targetTile.id,
		from: {
			tileId: sourceTile.id,
			side: normalizeCableSide(sourceSide, "E"),
		},
		to: {
			tileId: targetTile.id,
			side: normalizeCableSide(targetSide, "W"),
		},
	};
}
