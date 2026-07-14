import { buildGridOverlayGeometry, GRID_TOKENS } from "./canvas-grid.js";

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 1;
const ZOOM_RUBBER_BAND_K = 400;
const CELL = GRID_TOKENS.baseline;
const MAJOR = GRID_TOKENS.majorBaseline;
const MINOR_PER_MAJOR = MAJOR / CELL;

const isMac = globalThis.window?.shellApi?.getPlatform?.() === "darwin";

export function shouldZoom(e, mac = isMac) {
	return e.ctrlKey || (mac && e.metaKey);
}

function isDark() {
	return document.documentElement.classList.contains("dark");
}

export function createViewport(canvasEl, gridCanvas, tilesRef) {
	const gridCtx = gridCanvas.getContext("2d");
	let state = null;
	let onUpdate = null;
	let zoomSnapTimer = null;
	let zoomSnapRaf = null;
	let lastZoomFocalX = 0;
	let lastZoomFocalY = 0;
	let zoomIndicatorTimer = null;
	let prevCanvasW = canvasEl.clientWidth;
	let prevCanvasH = canvasEl.clientHeight;
	let frameRaf = null;
	let gridOverlayVisible = false;

	const zoomIndicatorEl = document.getElementById("zoom-indicator");

	function resizeGridCanvas() {
		const dpr = window.devicePixelRatio || 1;
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		gridCanvas.width = w * dpr;
		gridCanvas.height = h * dpr;
		gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	// The dot grid is rendered from a small cached pattern tile (one major
	// cell) instead of per-dot fillRect calls. Rebuilt only when zoom or
	// theme changes; panning just shifts the pattern offset.
	let gridPatternCache = { key: "", pattern: null, sizeDev: 0 };

	function buildGridPattern(dark) {
		const dpr = window.devicePixelRatio || 1;
		const majorStepCss = MAJOR * state.zoom;
		const sizeDev = Math.max(4, Math.round(majorStepCss * dpr));
		const stepDev = sizeDev / MINOR_PER_MAJOR;
		const dotSize = Math.max(1, 1.5 * state.zoom) * dpr;
		const majorDotSize = Math.max(1.5, 1.5 * state.zoom) * dpr;
		const minorFade = Math.min(1, Math.max(0,
			(state.zoom - 0.5) / (0.75 - 0.5),
		));
		const majorFade = Math.min(1, Math.max(0,
			(state.zoom - ZOOM_MIN) / (0.5 - ZOOM_MIN),
		));

		const key = [
			dark, sizeDev, dotSize.toFixed(2),
			minorFade.toFixed(3), majorFade.toFixed(3),
		].join("|");
		if (key === gridPatternCache.key && gridPatternCache.pattern) {
			return gridPatternCache;
		}

		const tile = document.createElement("canvas");
		tile.width = sizeDev;
		tile.height = sizeDev;
		const c = tile.getContext("2d");

		// Draw positions one cell beyond each edge so dots that straddle the
		// pattern seam render their full shape on both sides.
		if (minorFade > 0) {
			const minorAlpha = dark ? 0.15 * minorFade : 0.25 * minorFade;
			c.fillStyle = dark
				? `rgba(255,255,255,${minorAlpha})`
				: `rgba(0,0,0,${minorAlpha})`;
			const half = dotSize / 2;
			for (let i = -1; i <= MINOR_PER_MAJOR; i++) {
				for (let j = -1; j <= MINOR_PER_MAJOR; j++) {
					const onMajor =
						((i % MINOR_PER_MAJOR) + MINOR_PER_MAJOR) % MINOR_PER_MAJOR === 0 &&
						((j % MINOR_PER_MAJOR) + MINOR_PER_MAJOR) % MINOR_PER_MAJOR === 0;
					if (onMajor) continue;
					c.fillRect(i * stepDev - half, j * stepDev - half, dotSize, dotSize);
				}
			}
		}

		if (majorFade > 0) {
			const majorAlpha = dark ? 0.25 * majorFade : 0.40 * majorFade;
			c.fillStyle = dark
				? `rgba(255,255,255,${majorAlpha})`
				: `rgba(0,0,0,${majorAlpha})`;
			const half = majorDotSize / 2;
			for (const px of [0, sizeDev]) {
				for (const py of [0, sizeDev]) {
					c.fillRect(px - half, py - half, majorDotSize, majorDotSize);
				}
			}
		}

		gridPatternCache = {
			key,
			pattern: gridCtx.createPattern(tile, "repeat"),
			sizeDev,
		};
		return gridPatternCache;
	}

	function drawGrid() {
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		if (w === 0 || h === 0) return;

		gridCtx.clearRect(0, 0, w, h);

		const { pattern, sizeDev } = buildGridPattern(isDark());
		if (!pattern || sizeDev <= 0) return;

		// The pattern tile is in device pixels; paint it with an identity
		// transform so it repeats at exactly one major cell per tile.
		const dpr = window.devicePixelRatio || 1;
		const offX = (((state.panX * dpr) % sizeDev) + sizeDev) % sizeDev;
		const offY = (((state.panY * dpr) % sizeDev) + sizeDev) % sizeDev;

		gridCtx.save();
		gridCtx.setTransform(1, 0, 0, 1, 0, 0);
		gridCtx.translate(offX - sizeDev, offY - sizeDev);
		gridCtx.fillStyle = pattern;
		gridCtx.fillRect(0, 0, w * dpr + 2 * sizeDev, h * dpr + 2 * sizeDev);
		gridCtx.restore();
		drawGridOverlay(w, h);
	}

	function drawGridOverlay(w, h) {
		if (!gridOverlayVisible) return;
		const geometry = buildGridOverlayGeometry(state, { width: w, height: h });
		gridCtx.save();
		gridCtx.setTransform(1, 0, 0, 1, 0, 0);
		gridCtx.fillStyle = isDark()
			? "rgba(183,255,0,0.045)"
			: "rgba(0,0,0,0.035)";
		for (const col of geometry.columns) {
			gridCtx.fillRect(col.x, 0, col.width, h);
		}
		gridCtx.strokeStyle = isDark()
			? "rgba(183,255,0,0.12)"
			: "rgba(0,0,0,0.10)";
		gridCtx.lineWidth = 1;
		gridCtx.beginPath();
		for (const col of geometry.columns) {
			gridCtx.moveTo(Math.round(col.x) + 0.5, 0);
			gridCtx.lineTo(Math.round(col.x) + 0.5, h);
			gridCtx.moveTo(Math.round(col.x + col.width) + 0.5, 0);
			gridCtx.lineTo(Math.round(col.x + col.width) + 0.5, h);
		}
		for (let i = 0; i < geometry.baselines.length; i += 4) {
			const y = Math.round(geometry.baselines[i]) + 0.5;
			gridCtx.moveTo(0, y);
			gridCtx.lineTo(w, y);
		}
		gridCtx.stroke();
		gridCtx.restore();
	}

	function showZoomIndicator() {
		const pct = Math.round(state.zoom * 100);
		zoomIndicatorEl.textContent = `${pct}%`;
		zoomIndicatorEl.classList.add("visible");
		clearTimeout(zoomIndicatorTimer);
		zoomIndicatorTimer = setTimeout(() => {
			zoomIndicatorEl.classList.remove("visible");
		}, 1200);
	}

	function renderFrame() {
		frameRaf = null;
		drawGrid();
		if (onUpdate) onUpdate();
	}

	// All viewport mutations funnel through here; actual rendering is
	// coalesced to one pass per display frame no matter how fast wheel or
	// drag events arrive.
	function updateCanvas() {
		if (frameRaf != null) return;
		frameRaf = requestAnimationFrame(renderFrame);
	}

	function snapBackZoom() {
		const fx = lastZoomFocalX;
		const fy = lastZoomFocalY;
		const target = state.zoom > ZOOM_MAX ? ZOOM_MAX : ZOOM_MIN;

		function animate() {
			const prevScale = state.zoom;
			state.zoom += (target - state.zoom) * 0.15;

			if (Math.abs(state.zoom - target) < 0.001) {
				state.zoom = target;
			}

			const ratio = state.zoom / prevScale - 1;
			state.panX -= (fx - state.panX) * ratio;
			state.panY -= (fy - state.panY) * ratio;
			showZoomIndicator();
			updateCanvas();

			if (state.zoom === target) {
				zoomSnapRaf = null;
				return;
			}
			zoomSnapRaf = requestAnimationFrame(animate);
		}

		zoomSnapRaf = requestAnimationFrame(animate);
	}

	function applyZoom(deltaY, focalX, focalY) {
		if (zoomSnapRaf) {
			cancelAnimationFrame(zoomSnapRaf);
			zoomSnapRaf = null;
		}
		clearTimeout(zoomSnapTimer);

		const prevScale = state.zoom;
		const MAX_ZOOM_DELTA = 25;
		const clamped = Math.sign(deltaY)
			* Math.min(Math.abs(deltaY), MAX_ZOOM_DELTA);
		let factor = Math.exp((-clamped * 0.6) / 100);

		if (state.zoom >= ZOOM_MAX && factor > 1) {
			const overshoot = state.zoom / ZOOM_MAX - 1;
			const damping = 1 / (1 + overshoot * ZOOM_RUBBER_BAND_K);
			factor = 1 + (factor - 1) * damping;
			state.zoom *= factor;
		} else if (state.zoom <= ZOOM_MIN && factor < 1) {
			const overshoot = ZOOM_MIN / state.zoom - 1;
			const damping = 1 / (1 + overshoot * ZOOM_RUBBER_BAND_K);
			factor = 1 - (1 - factor) * damping;
			state.zoom *= factor;
		} else {
			state.zoom *= factor;
		}

		const ratio = state.zoom / prevScale - 1;
		state.panX -= (focalX - state.panX) * ratio;
		state.panY -= (focalY - state.panY) * ratio;
		lastZoomFocalX = focalX;
		lastZoomFocalY = focalY;

		if (state.zoom > ZOOM_MAX || state.zoom < ZOOM_MIN) {
			zoomSnapTimer = setTimeout(snapBackZoom, 150);
		}

		showZoomIndicator();
		updateCanvas();
	}

	canvasEl.addEventListener("wheel", (e) => {
		e.preventDefault();

		if (shouldZoom(e)) {
			const rect = canvasEl.getBoundingClientRect();
			applyZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
		} else {
			state.panX -= e.deltaX * 1.2;
			state.panY -= e.deltaY * 1.2;
			updateCanvas();
		}
	}, { passive: false });

	new ResizeObserver(() => {
		const w = canvasEl.clientWidth;
		const h = canvasEl.clientHeight;
		if (!state) { prevCanvasW = w; prevCanvasH = h; return; }
		state.panX += (w - prevCanvasW) / 2;
		state.panY += (h - prevCanvasH) / 2;
		prevCanvasW = w;
		prevCanvasH = h;
		resizeGridCanvas();
		updateCanvas();
	}).observe(canvasEl);

	resizeGridCanvas();

	return {
		init(viewportState, callback) {
			state = viewportState;
			onUpdate = callback;
			updateCanvas();
		},
		updateCanvas,
		redrawGrid: drawGrid,
		applyZoom,
		isGridOverlayVisible() {
			return gridOverlayVisible;
		},
		setGridOverlayVisible(visible) {
			gridOverlayVisible = visible === true;
			updateCanvas();
			return gridOverlayVisible;
		},
		toggleGridOverlay() {
			gridOverlayVisible = !gridOverlayVisible;
			updateCanvas();
			return gridOverlayVisible;
		},
		setPan(x, y) {
			state.panX = x;
			state.panY = y;
			updateCanvas();
		},
	};
}
