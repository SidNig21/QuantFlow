import { LEGEND_RECIPES } from "./legend-dock.js";

export const LEGEND_RECIPE_ROLE_IDS = {
	...Object.fromEntries(LEGEND_RECIPES.map((recipe) => [recipe.id, recipe.roleId])),
};

export const LEGEND_TILE_SIZE = Object.freeze({ width: 280, height: 180 });
export const LEGEND_GHOST_SIZE = Object.freeze({ width: 120, height: 72 });

export function getLegendRoleId(recipeId) {
	return LEGEND_RECIPE_ROLE_IDS[recipeId] ?? null;
}

export function resolveLegendRecipeRole(recipeId, roles) {
	const roleId = getLegendRoleId(recipeId);
	if (!roleId || !Array.isArray(roles)) return null;
	return roles.find((role) => role?.id === roleId) ?? null;
}

export function clampLegendCanvasPosition(point, options = {}) {
	const width = Number(options.tileSize?.width ?? LEGEND_TILE_SIZE.width);
	const height = Number(options.tileSize?.height ?? LEGEND_TILE_SIZE.height);
	const zoom = Number.isFinite(options.zoom) && options.zoom > 0 ? options.zoom : 1;
	const panX = Number.isFinite(options.panX) ? options.panX : 0;
	const panY = Number.isFinite(options.panY) ? options.panY : 0;
	const dockWidth = Number.isFinite(options.dockWidth) ? options.dockWidth : 56;
	const dockGap = Number.isFinite(options.dockGap) ? options.dockGap : 32;
	const minTop = Number.isFinite(options.minTop) ? options.minTop : 40;
	const viewportWidth = Number.isFinite(options.viewportWidth) ? options.viewportWidth : null;
	const viewportHeight = Number.isFinite(options.viewportHeight) ? options.viewportHeight : null;

	const minX = (dockWidth + dockGap - panX) / zoom;
	const minY = (minTop - panY) / zoom;
	let maxX = null;
	let maxY = null;
	if (viewportWidth !== null) {
		maxX = (viewportWidth - width * zoom - panX) / zoom;
	}
	if (viewportHeight !== null) {
		maxY = (viewportHeight - height * zoom - panY) / zoom;
	}

	return {
		x: Math.max(minX, maxX === null ? point.x : Math.min(point.x, Math.max(minX, maxX))),
		y: Math.max(minY, maxY === null ? point.y : Math.min(point.y, Math.max(minY, maxY))),
	};
}

export function getLegendViewportCenterPlacement(options) {
	const width = Number(options.tileSize?.width ?? LEGEND_TILE_SIZE.width);
	const height = Number(options.tileSize?.height ?? LEGEND_TILE_SIZE.height);
	const zoom = Number.isFinite(options.zoom) && options.zoom > 0 ? options.zoom : 1;
	const panX = Number.isFinite(options.panX) ? options.panX : 0;
	const panY = Number.isFinite(options.panY) ? options.panY : 0;
	const viewportWidth = Number(options.viewportWidth ?? 0);
	const viewportHeight = Number(options.viewportHeight ?? 0);
	return clampLegendCanvasPosition({
		x: (viewportWidth / 2 - panX) / zoom - width / 2,
		y: (viewportHeight / 2 - panY) / zoom - height / 2,
	}, options);
}

export function getLegendClickPlacement(options) {
	const width = Number(options.tileSize?.width ?? LEGEND_TILE_SIZE.width);
	const height = Number(options.tileSize?.height ?? LEGEND_TILE_SIZE.height);
	const zoom = Number.isFinite(options.zoom) && options.zoom > 0 ? options.zoom : 1;
	const panX = Number.isFinite(options.panX) ? options.panX : 0;
	const panY = Number.isFinite(options.panY) ? options.panY : 0;
	const rectLeft = Number.isFinite(options.rectLeft) ? options.rectLeft : 0;
	const rectTop = Number.isFinite(options.rectTop) ? options.rectTop : 0;
	return clampLegendCanvasPosition({
		x: (Number(options.clientX ?? 0) - rectLeft - panX) / zoom - width / 2,
		y: (Number(options.clientY ?? 0) - rectTop - panY) / zoom - height / 2,
	}, options);
}
