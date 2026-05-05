/**
 * Dark mode detection and canvas opacity management.
 */

export function initDarkMode(_onThemeChange) {
	document.documentElement.classList.add("dark");
}

export function applyCanvasOpacity(percent) {
	const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
	document.documentElement.style.setProperty(
		"--canvas-opacity",
		String(clamped / 100),
	);
}
