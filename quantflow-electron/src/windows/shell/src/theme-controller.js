const THEME_MODES = new Set(["system", "light", "dark", "high-contrast"]);
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function normalizeThemeMode(value) {
	return THEME_MODES.has(value) ? value : "system";
}

function resolveSystemDark(matchMedia) {
	if (typeof matchMedia !== "function") return true;
	try {
		return Boolean(matchMedia(DARK_QUERY).matches);
	} catch {
		return true;
	}
}

export function applyThemeMode(mode, {
	root = document.documentElement,
	matchMedia = globalThis.window?.matchMedia,
} = {}) {
	const normalized = normalizeThemeMode(mode);
	const dark = normalized === "dark" ||
		normalized === "high-contrast" ||
		(normalized === "system" && resolveSystemDark(matchMedia));

	root.classList.toggle("dark", dark);
	root.classList.toggle("theme-light", normalized === "light");
	root.classList.toggle("theme-high-contrast", normalized === "high-contrast");
	root.dataset.theme = normalized;
	return normalized;
}

export function watchSystemTheme(onChange, {
	matchMedia = globalThis.window?.matchMedia,
} = {}) {
	if (typeof matchMedia !== "function") return () => {};
	const query = matchMedia(DARK_QUERY);
	const handler = () => onChange();
	if (typeof query.addEventListener === "function") {
		query.addEventListener("change", handler);
		return () => query.removeEventListener("change", handler);
	}
	if (typeof query.addListener === "function") {
		query.addListener(handler);
		return () => query.removeListener(handler);
	}
	return () => {};
}
