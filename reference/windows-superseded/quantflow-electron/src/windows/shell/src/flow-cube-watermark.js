// flow-cube-watermark.js
//
// QuantFlow brand watermark for the shell canvas field floor. A corner-on
// wireframe cube spun about its body diagonal, live nodes routing its edge
// loop ("Pulse Swarm"), QUANTFLOW wordmark beneath.
//
// V2 treatment: adaptive empty-state presence. The mark reads boldly when the
// canvas is empty and smoothly recedes to a quiet watermark once tiles exist.

const SVG_NS = "http://www.w3.org/2000/svg";

const CUBE_V = [
	[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
	[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
const CUBE_E = [
	[0, 1], [1, 2], [2, 3], [3, 0],
	[4, 5], [5, 6], [6, 7], [7, 4],
	[0, 4], [1, 5], [2, 6], [3, 7],
];
const FLOOP = [0, 1, 2, 3, 7, 6, 5, 4];
const SPECTRUM = ["#B7FF00", "#2fe6cf", "#c79bff"];

function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
function mul(m, n) {
	const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
	for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
		let s = 0;
		for (let k = 0; k < 3; k++) s += m[i][k] * n[k][j];
		r[i][j] = s;
	}
	return r;
}
function apply(m, v) {
	return [
		m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
		m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
		m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
	];
}
function axisAngle(ax, ang) {
	const L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
	const x = ax[0] / L, y = ax[1] / L, z = ax[2] / L;
	const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
	return [
		[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
		[t * x * y + s * z, t * y * y + c, t * y * z - s * x],
		[t * x * z - s * y, t * y * z + s * x, t * z * z + c],
	];
}

const VIEW = mul(rotY(-Math.PI / 2), mul(rotZ(-Math.atan(1 / Math.SQRT2)), rotY(Math.PI / 4)));
const DIAG = [1, 1, 1];
const depthOf = (z) => (z + 1.6) / 3.2;
const lerp = (a, b, t) => a + (b - a) * t;

function transform(spin, tilt, tiltZ) {
	let view = mul(rotX(tilt), VIEW);
	if (tiltZ) view = mul(rotZ(tiltZ), view);
	return mul(view, axisAngle(DIAG, spin));
}

function createFlowCubeStage(container, opts = {}) {
	if (!container) return () => {};

	const W = opts.width || 1600;
	const H = opts.height || 1000;
	const cx = opts.cx || W / 2;
	const cy = opts.cy || 432;
	const scale = opts.scale || 184;
	const ink = opts.ink || "#f2f0ec";
	const nodeScale = opts.nodeScale || 0.95;
	const withWordmark = opts.wordmark !== false;
	const getTileCount = opts.getTileCount || (() => 0);
	const adaptivePresence = opts.adaptivePresence === true;
	const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

	if (adaptivePresence) {
		container.style.opacity = "1";
	}

	const stage = document.createElementNS(SVG_NS, "svg");
	stage.setAttribute("viewBox", `0 0 ${W} ${H}`);
	stage.setAttribute("preserveAspectRatio", "xMidYMid meet");
	stage.setAttribute("width", "100%");
	stage.setAttribute("height", "100%");
	stage.style.overflow = "visible";
	stage.style.display = "block";

	const append = (tag) => stage.appendChild(document.createElementNS(SVG_NS, tag));
	let scrim = null;
	if (withWordmark) {
		const defs = append("defs");
		const rg = defs.appendChild(document.createElementNS(SVG_NS, "radialGradient"));
		rg.id = "qf-wm-scrim";
		[
			["0%", "rgba(8,10,15,0.9)"],
			["55%", "rgba(8,10,15,0.45)"],
			["80%", "rgba(8,10,15,0)"],
		].forEach(([offset, color]) => {
			const stop = rg.appendChild(document.createElementNS(SVG_NS, "stop"));
			stop.setAttribute("offset", offset);
			stop.setAttribute("stop-color", color);
		});

		scrim = append("ellipse");
		scrim.setAttribute("cx", String(cx));
		scrim.setAttribute("cy", String(cy));
		scrim.setAttribute("rx", "520");
		scrim.setAttribute("ry", "430");
		scrim.setAttribute("fill", "url(#qf-wm-scrim)");
	}

	const edges = CUBE_E.map(() => {
		const l = append("line");
		l.setAttribute("stroke-linecap", "round");
		return l;
	});
	const halos = [0, 1, 2].map(() => {
		const c = append("circle");
		c.setAttribute("opacity", "0");
		return c;
	});
	const cores = [0, 1, 2].map(() => append("circle"));
	let wmText = null;
	let wmUnder = null;

	if (withWordmark) {
		const fo = append("foreignObject");
		fo.setAttribute("x", "0");
		fo.setAttribute("y", "780");
		fo.setAttribute("width", String(W));
		fo.setAttribute("height", "190");
		const wm = document.createElement("div");
		wm.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
		wm.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:16px;font-family:'Space Grotesk',system-ui,sans-serif;";

		wmText = document.createElement("div");
		wmText.textContent = "QuantFlow";
		wmText.style.cssText = `font-weight:650;color:${ink};font-size:56px;letter-spacing:.42em;text-transform:uppercase;padding-left:.42em;`;

		wmUnder = document.createElement("div");
		wmUnder.style.cssText = "width:360px;height:3px;background:#B7FF00;border-radius:2px;box-shadow:0 0 22px rgba(183,255,0,.45),0 0 8px rgba(183,255,0,.5);";

		wm.appendChild(wmText);
		wm.appendChild(wmUnder);
		fo.appendChild(wm);
	}

	container.appendChild(stage);

	const setNode = (core, halo, x, y, d, col, scl) => {
		const r = (4.5 + d * 5.5) * scl;
		core.setAttribute("cx", x.toFixed(2));
		core.setAttribute("cy", y.toFixed(2));
		core.setAttribute("r", r.toFixed(2));
		core.setAttribute("fill", col);
		core.setAttribute("opacity", "1");
		core.style.filter = `drop-shadow(0 0 ${(7 + d * 10).toFixed(1)}px ${col}) drop-shadow(0 0 2px ${col})`;

		halo.setAttribute("cx", x.toFixed(2));
		halo.setAttribute("cy", y.toFixed(2));
		halo.setAttribute("r", (r * 2.8).toFixed(2));
		halo.setAttribute("fill", col);
		halo.setAttribute("opacity", (0.12 + d * 0.08).toFixed(3));
	};

	let present = 1;
	function draw(t) {
		// Operator preference: the brand mark stays at FULL presence at all
		// times. It never recedes or dims when tiles exist, the wordmark keeps
		// full size, and the cube keeps spinning with full-size circulating
		// nodes regardless of tile count.
		present = 1;
		const presence = present;

		if (adaptivePresence) {
			container.style.opacity = lerp(0.16, 1, presence).toFixed(3);
		}
		if (scrim) {
			scrim.setAttribute("opacity", (presence * 0.85).toFixed(3));
		}
		if (wmText && wmUnder) {
			wmText.style.fontSize = `${lerp(46, 64, presence).toFixed(1)}px`;
			wmText.style.color = presence > 0.5 ? "#fbfaf7" : ink;
			wmText.style.textShadow = `0 0 ${(presence * 26).toFixed(0)}px rgba(0,0,0,.6)`;
			wmUnder.style.width = `${lerp(300, 420, presence).toFixed(0)}px`;
			wmUnder.style.boxShadow = `0 0 ${(8 + presence * 18).toFixed(0)}px rgba(183,255,0,${(0.3 + presence * 0.35).toFixed(2)})`;
		}

		const m = transform(t * 0.46, 0.17 + Math.sin(t * 0.3) * 0.04, Math.cos(t * 0.22) * 0.04);
		const pts = CUBE_V.map((v) => {
			const r = apply(m, v);
			return { x: cx + r[0] * scale, y: cy - r[1] * scale, z: r[2] };
		});
		let bi = 0;
		for (let i = 1; i < 8; i++) if (pts[i].z < pts[bi].z) bi = i;

		CUBE_E.forEach((ev, i) => {
			const A = pts[ev[0]], B = pts[ev[1]], mz = (A.z + B.z) / 2, d = depthOf(mz);
			const hidden = ev[0] === bi || ev[1] === bi;
			const l = edges[i];
			l.setAttribute("x1", A.x.toFixed(2));
			l.setAttribute("y1", A.y.toFixed(2));
			l.setAttribute("x2", B.x.toFixed(2));
			l.setAttribute("y2", B.y.toFixed(2));
			l.setAttribute("stroke", ink);
			l.setAttribute("stroke-dasharray", "7 9");
			l.setAttribute("stroke-dashoffset", (-t * 22).toFixed(1));
			l.setAttribute("stroke-width", (1.4 + d * 1.9).toFixed(2));
			l.setAttribute("opacity", (hidden ? 0.24 : (0.45 + d * 0.5)).toFixed(2));
		});

		const liveNodeScale = nodeScale * lerp(1, 1.35, presence);
		for (let n = 0; n < 3; n++) {
			const pn = t * 1.15 + n * (8 / 3);
			const f = ((pn / 8) % 1 + 1) % 1 * FLOOP.length;
			const ii = Math.floor(f), frac = f - ii;
			const A = pts[FLOOP[ii % FLOOP.length]], B = pts[FLOOP[(ii + 1) % FLOOP.length]];
			const x = A.x + (B.x - A.x) * frac;
			const y = A.y + (B.y - A.y) * frac;
			const z = A.z + (B.z - A.z) * frac;
			setNode(cores[n], halos[n], x, y, depthOf(z), SPECTRUM[n], liveNodeScale);
		}
	}

	let raf = 0, t0 = performance.now(), running = false, acc = 0;
	const loop = (now) => {
		draw((now - t0) / 1000);
		raf = requestAnimationFrame(loop);
	};
	function start() {
		if (running || reduce) return;
		running = true;
		t0 = performance.now() - acc;
		raf = requestAnimationFrame(loop);
	}
	function stop() {
		if (!running) return;
		running = false;
		cancelAnimationFrame(raf);
		acc = performance.now() - t0;
	}
	// Keep the mark animating whenever the window is visible. Focusing a tile
	// (a webview/terminal) blurs the shell window, so we must NOT pause on blur
	// — only stop when the window is genuinely hidden/minimized to avoid burning
	// cycles offscreen.
	const onVis = () => (document.hidden ? stop() : start());
	document.addEventListener("visibilitychange", onVis);

	present = 1;
	draw(0.0001);
	if (!document.hidden) start();

	return function dispose() {
		stop();
		document.removeEventListener("visibilitychange", onVis);
		stage.remove();
	};
}

export function createFlowCubeWatermark(container, opts = {}) {
	return createFlowCubeStage(container, {
		...opts,
		adaptivePresence: true,
	});
}

export function createFlowCubeLoadingMark(container) {
	return createFlowCubeStage(container, {
		width: 120,
		height: 120,
		cx: 60,
		cy: 58,
		scale: 25,
		nodeScale: 0.46,
		wordmark: false,
	});
}
