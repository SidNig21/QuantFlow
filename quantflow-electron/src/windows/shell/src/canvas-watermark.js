// Steady brand-mark opacity. The watermark no longer fades as tiles appear —
// the fade-with-tile-count behavior was removed per operator preference. The
// `data-empty` flag still drives the empty-canvas quick-action hints; the brand
// logo itself holds a constant opacity whether or not tiles exist.
export const WATERMARK_OPACITY = 0.45;

export function getWatermarkOpacity() {
	return WATERMARK_OPACITY;
}

export function updateCanvasWatermark(element, tileCount) {
	if (!element) return;

	const isEmpty = tileCount === 0;
	element.style.opacity = String(WATERMARK_OPACITY);
	element.dataset.empty = isEmpty ? "true" : "false";
	element.setAttribute("aria-hidden", isEmpty ? "false" : "true");
}
