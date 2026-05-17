/**
 * Dark mode detection and canvas opacity management.
 */
import { applyThemeMode } from "./theme-controller.js";

export function initDarkMode(_onThemeChange) {
	applyThemeMode("dark");
}

export function applyCanvasOpacity(percent) {
	const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
	document.documentElement.style.setProperty(
		"--canvas-opacity",
		String(clamped / 100),
	);
}
