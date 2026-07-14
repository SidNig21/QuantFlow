export function slugifyRouteHandle(value) {
	const base = String(value || "terminal")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return base || "terminal";
}

export function getTileIdHandleSuffix(tile) {
	const compact = String(tile?.id || "").replace(/[^a-z0-9]/gi, "");
	return compact.slice(-5).toLowerCase() || "local";
}

export function createRouteHandle(tile, existingTiles = []) {
	const seed = tile?.userTitle || tile?.roleId || tile?.autoTitle || tile?.cwd || "terminal";
	const base = slugifyRouteHandle(seed);
	let handle = `${base}-${getTileIdHandleSuffix(tile)}`;
	let n = 2;
	while (
		existingTiles.some((candidate) =>
			candidate?.id !== tile?.id &&
			candidate?.routeHandle?.toLowerCase() === handle.toLowerCase(),
		)
	) {
		handle = `${base}-${getTileIdHandleSuffix(tile)}-${n}`;
		n++;
	}
	return handle;
}

export function ensureRouteHandle(tile, existingTiles = []) {
	if (tile?.type !== "term") return tile?.routeHandle ?? null;
	if (tile.routeHandle) return tile.routeHandle;
	tile.routeHandle = createRouteHandle(tile, existingTiles);
	return tile.routeHandle;
}
