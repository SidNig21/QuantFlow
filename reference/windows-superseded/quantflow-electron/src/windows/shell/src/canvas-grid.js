import { CANVAS_GRID_TOKENS } from "@qf-renderer/canvas/grid";

export const GRID_TOKENS = CANVAS_GRID_TOKENS;

function finiteOr(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}

function snapNumber(value, step, origin = 0) {
	return origin + Math.round((value - origin) / step) * step;
}

function lockContains(locks, id) {
	if (!locks || !id) return false;
	if (locks instanceof Set) return locks.has(id);
	if (Array.isArray(locks)) return locks.includes(id);
	if (typeof locks === "object") return locks[id] === true;
	return false;
}

export function isGridLocked(tile, options = {}) {
	return tile?.locked === true ||
		tile?.userPlaced === true ||
		lockContains(options.locks, tile?.id);
}

export function snapRectToGrid(position, size, options = {}) {
	const tokens = options.tokens ?? GRID_TOKENS;
	const bounds = options.regionBounds ?? null;
	const originX = bounds ? finiteOr(bounds.x, 0) + tokens.margin : 0;
	const originY = bounds ? finiteOr(bounds.y, 0) + tokens.margin : 0;
	const rect = {
		x: finiteOr(position?.x, 0),
		y: finiteOr(position?.y, 0),
		width: finiteOr(size?.width, 0),
		height: finiteOr(size?.height, 0),
	};
	if (options.locked === true) return rect;
	return {
		x: snapNumber(rect.x, tokens.baseline, originX),
		y: snapNumber(rect.y, tokens.baseline, originY),
		width: Math.max(tokens.baseline, snapNumber(rect.width, tokens.baseline)),
		height: Math.max(tokens.baseline, snapNumber(rect.height, tokens.baseline)),
	};
}

export function snapToGrid(target, sizeOrOptions, maybeOptions) {
	if (sizeOrOptions && Number.isFinite(sizeOrOptions.width) && Number.isFinite(sizeOrOptions.height)) {
		return snapRectToGrid(target, sizeOrOptions, maybeOptions ?? {});
	}
	const tile = target;
	const options = sizeOrOptions ?? {};
	if (isGridLocked(tile, options)) return tile;
	const snapped = snapRectToGrid(tile, tile, options);
	tile.x = snapped.x;
	tile.y = snapped.y;
	tile.width = snapped.width;
	tile.height = snapped.height;
	return tile;
}

export function alignTilesToGrid(layout, options = {}) {
	const tiles = Array.isArray(layout) ? layout : [];
	let aligned = 0;
	let skipped = 0;
	for (const tile of tiles) {
		if (tile?.userPlaced === true) markUserPlaced(tile, false);
		if (tile?.locked === true || lockContains(options.locks, tile?.id)) {
			skipped++;
			continue;
		}
		const before = {
			x: tile.x,
			y: tile.y,
			width: tile.width,
			height: tile.height,
		};
		snapToGrid(tile, options);
		if (
			tile.x !== before.x ||
			tile.y !== before.y ||
			tile.width !== before.width ||
			tile.height !== before.height
		) {
			aligned++;
		}
	}
	return { aligned, skipped };
}

function getViewportWorldWidth(viewport, tokens) {
	const rawWidth = Number.isFinite(viewport?.worldWidth)
		? viewport.worldWidth
		: Number.isFinite(viewport?.width)
			? viewport.width
			: tokens.columns * (tokens.columnWidth + tokens.gutter) + tokens.margin * 2;
	const zoom = Number.isFinite(viewport?.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
	return viewport?.screenSpace === true ? rawWidth / zoom : rawWidth;
}

function tileRect(tile) {
	return {
		x: finiteOr(tile?.x, 0),
		y: finiteOr(tile?.y, 0),
		width: finiteOr(tile?.width, 0),
		height: finiteOr(tile?.height, 0),
	};
}

function stablePackOrder(a, b) {
	return finiteOr(a?.y, 0) - finiteOr(b?.y, 0) ||
		finiteOr(a?.x, 0) - finiteOr(b?.x, 0) ||
		finiteOr(a?.zIndex, 0) - finiteOr(b?.zIndex, 0) ||
		String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

export function repackTilesToGrid(layout, options = {}) {
	const tokens = options.tokens ?? GRID_TOKENS;
	const tiles = Array.isArray(layout) ? layout : [];
	const pitch = tokens.columnWidth + tokens.gutter;
	const viewportWidth = Math.max(
		tokens.margin + tokens.columnWidth,
		getViewportWorldWidth(options.viewport, tokens),
	);
	const rightLimit = viewportWidth - tokens.margin;
	const lockedRects = tiles
		.filter((tile) => tile?.locked === true || lockContains(options.locks, tile?.id))
		.map(tileRect);
	const movingTiles = tiles
		.filter((tile) => tile?.locked !== true && !lockContains(options.locks, tile?.id))
		.slice()
		.sort(stablePackOrder);
	const occupied = [...lockedRects];
	let tidied = 0;
	let skipped = lockedRects.length;
	let rowY = tokens.margin;
	let rowHeight = 0;
	let col = 0;

	function makeCandidate(tile, column, y) {
		const x = tokens.margin + column * pitch;
		return snapRectToGrid({ x, y }, tile, { tokens });
	}

	function exceedsRow(rect) {
		return rect.x > tokens.margin && rect.x + rect.width > rightLimit;
	}

	function nextRow(seedHeight) {
		const advance = Math.max(rowHeight, finiteOr(seedHeight, 0), tokens.majorBaseline ?? tokens.baseline);
		rowY = snapNumber(rowY + advance + tokens.gutter, tokens.baseline);
		rowHeight = 0;
		col = 0;
	}

	for (const tile of movingTiles) {
		const before = tileRect(tile);
		const wasPinned = tile.userPlaced === true;
		const snappedSize = snapRectToGrid(tile, tile, { tokens });
		let candidate = makeCandidate(snappedSize, col, rowY);
		while (
			exceedsRow(candidate) ||
			occupied.some((rect) => overlaps(candidate, rect))
		) {
			col++;
			candidate = makeCandidate(snappedSize, col, rowY);
			if (exceedsRow(candidate)) {
				nextRow(snappedSize.height);
				candidate = makeCandidate(snappedSize, col, rowY);
			}
		}

		markUserPlaced(tile, false);
		tile.x = candidate.x;
		tile.y = candidate.y;
		tile.width = candidate.width;
		tile.height = candidate.height;
		occupied.push(candidate);
		rowHeight = Math.max(rowHeight, candidate.height);
		col += Math.max(1, Math.ceil((candidate.width + tokens.gutter) / pitch));
		if (
			wasPinned ||
			tile.x !== before.x ||
			tile.y !== before.y ||
			tile.width !== before.width ||
			tile.height !== before.height
		) {
			tidied++;
		}
	}

	return { tidied, skipped };
}

export function formatRepackTilesToast(result = {}) {
	const tidied = Math.max(0, Number.isFinite(result.tidied) ? result.tidied : 0);
	const skipped = Math.max(0, Number.isFinite(result.skipped) ? result.skipped : 0);
	const base = tidied > 0
		? `Tidied ${tidied} tile${tidied === 1 ? "" : "s"}`
		: "No tiles to tidy";
	if (!skipped) return base;
	return `${base}; ${skipped} locked skipped`;
}

export function markUserPlaced(tile, value = true) {
	if (tile) tile.userPlaced = value;
	return tile;
}

function isOnGrid(value, tokens = GRID_TOKENS) {
	return Math.abs(value / tokens.baseline - Math.round(value / tokens.baseline)) < 0.0001;
}

function overlaps(a, b) {
	return a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y;
}

export function verifyCanvasAlignment(layout, options = {}) {
	const tokens = options.tokens ?? GRID_TOKENS;
	const tiles = Array.isArray(layout) ? layout : [];
	const offGridTileIds = [];
	const overlappingPairs = [];
	for (const tile of tiles) {
		if (
			!isOnGrid(tile.x, tokens) ||
			!isOnGrid(tile.y, tokens) ||
			!isOnGrid(tile.width, tokens) ||
			!isOnGrid(tile.height, tokens)
		) {
			offGridTileIds.push(tile.id);
		}
	}
	for (let i = 0; i < tiles.length; i++) {
		for (let j = i + 1; j < tiles.length; j++) {
			if (overlaps(tiles[i], tiles[j])) {
				overlappingPairs.push([tiles[i].id, tiles[j].id]);
			}
		}
	}
	const errors = [
		...offGridTileIds.map((id) => `off-grid:${id}`),
		...overlappingPairs.map(([a, b]) => `overlap:${a}:${b}`),
	];
	return {
		ok: errors.length === 0,
		errors,
		offGridTileIds,
		overlappingPairs,
	};
}

export function buildGridOverlayGeometry(viewport, viewportSize, options = {}) {
	const tokens = options.tokens ?? GRID_TOKENS;
	const zoom = finiteOr(viewport?.zoom, 1);
	const panX = finiteOr(viewport?.panX, 0);
	const panY = finiteOr(viewport?.panY, 0);
	const width = finiteOr(viewportSize?.width, 0);
	const height = finiteOr(viewportSize?.height, 0);
	const moduleWidth = tokens.columnWidth + tokens.gutter;
	const gridWidth = tokens.columns * tokens.columnWidth + (tokens.columns - 1) * tokens.gutter;
	const worldLeft = -panX / zoom;
	const worldTop = -panY / zoom;
	const worldRight = (width - panX) / zoom;
	const worldBottom = (height - panY) / zoom;
	const span = gridWidth + tokens.margin * 2;
	const firstGroup = Math.floor((worldLeft - tokens.margin) / span) * span + tokens.margin;
	const columns = [];
	for (let groupX = firstGroup; groupX <= worldRight + span; groupX += span) {
		for (let index = 0; index < tokens.columns; index++) {
			const x = groupX + index * moduleWidth;
			if (x + tokens.columnWidth < worldLeft || x > worldRight) continue;
			columns.push({
				index,
				x: x * zoom + panX,
				width: tokens.columnWidth * zoom,
			});
		}
	}
	const firstLine = Math.floor(worldTop / tokens.baseline) * tokens.baseline;
	const baselines = [];
	for (let y = firstLine; y <= worldBottom + tokens.baseline; y += tokens.baseline) {
		baselines.push(y * zoom + panY);
	}
	return { columns, baselines };
}
