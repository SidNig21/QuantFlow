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
