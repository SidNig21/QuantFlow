const DENSITY_MODES = new Set(["comfortable", "compact"]);

export function normalizeDensity(value) {
	return DENSITY_MODES.has(value) ? value : "comfortable";
}

export function applyDensity(value, {
	root = document.documentElement,
} = {}) {
	const density = normalizeDensity(value);
	root.dataset.density = density;
	root.classList.toggle("density-compact", density === "compact");
	return density;
}
