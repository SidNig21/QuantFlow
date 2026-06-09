export function getWatermarkOpacity(tileCount) {
	if (tileCount === 0) return 0.22;
	if (tileCount <= 2) return 0.12;
	return 0.04;
}

export function updateCanvasWatermark(element, tileCount) {
	if (!element) return;

	const isEmpty = tileCount === 0;
	element.style.opacity = String(getWatermarkOpacity(tileCount));
	element.dataset.empty = isEmpty ? "true" : "false";
	element.setAttribute("aria-hidden", isEmpty ? "false" : "true");
}
