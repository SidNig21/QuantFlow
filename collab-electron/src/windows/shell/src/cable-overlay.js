import { connections, tiles } from "./canvas-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function getAnchor(fromTile, toTile, vp) {
	const { panX, panY, zoom } = vp;
	const ax = fromTile.x * zoom + panX + (fromTile.width * zoom) / 2;
	const ay = fromTile.y * zoom + panY + (fromTile.height * zoom) / 2;
	const bx = toTile.x * zoom + panX + (toTile.width * zoom) / 2;
	const by = toTile.y * zoom + panY + (toTile.height * zoom) / 2;
	const dx = bx - ax;
	const dy = by - ay;
	const hw = (fromTile.width * zoom) / 2;
	const hh = (fromTile.height * zoom) / 2;
	if (dx === 0 && dy === 0) return { x: ax, y: ay };
	const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
	const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
	const t = Math.min(tx, ty);
	return { x: ax + dx * t, y: ay + dy * t };
}

function bezierMid(ax, ay, cx1, cy1, cx2, cy2, bx, by) {
	return {
		x: 0.125 * ax + 0.375 * cx1 + 0.375 * cx2 + 0.125 * bx,
		y: 0.125 * ay + 0.375 * cy1 + 0.375 * cy2 + 0.125 * by,
	};
}

function makePath(ax, ay, bx, by) {
	const dx = bx - ax;
	const cx1 = ax + dx * 0.4;
	const cy1 = ay;
	const cx2 = bx - dx * 0.4;
	const cy2 = by;
	const d = `M ${ax} ${ay} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${bx} ${by}`;
	const mid = bezierMid(ax, ay, cx1, cy1, cx2, cy2, bx, by);
	return { d, mid };
}

export function createCableOverlay({
	containerEl,
	viewportState,
	onSendMessage,
	onRemoveConnection,
	onUpdateLabel,
}) {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.id = "cable-overlay";
	svg.setAttribute("aria-hidden", "true");
	containerEl.appendChild(svg);

	let popoverEl = null;
	let contextMenuEl = null;

	const previewState = { active: false, startTile: null, mouseX: 0, mouseY: 0 };

	function removePopover() {
		popoverEl?.remove();
		popoverEl = null;
	}

	function removeContextMenu() {
		contextMenuEl?.remove();
		contextMenuEl = null;
	}

	function tileLabel(tile) {
		return tile.userTitle || tile.autoTitle || tile.id;
	}

	function showPopover(conn, mx, my, tileA, tileB) {
		removePopover();
		removeContextMenu();

		let direction = "AtoB";

		popoverEl = document.createElement("div");
		popoverEl.className = "cable-popover";
		popoverEl.style.left = `${mx}px`;
		popoverEl.style.top = `${my + 12}px`;

		const dirBtn = document.createElement("button");
		dirBtn.type = "button";
		dirBtn.className = "cable-dir-btn";

		function refreshDirLabel() {
			const la = tileLabel(tileA);
			const lb = tileLabel(tileB);
			dirBtn.textContent = direction === "AtoB" ? `${la} → ${lb}` : `${lb} → ${la}`;
		}
		refreshDirLabel();

		dirBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			direction = direction === "AtoB" ? "BtoA" : "AtoB";
			refreshDirLabel();
		});

		const input = document.createElement("input");
		input.type = "text";
		input.placeholder = "Message…";
		input.className = "cable-input";

		const sendBtn = document.createElement("button");
		sendBtn.type = "button";
		sendBtn.textContent = "Send";
		sendBtn.className = "cable-send-btn";

		function doSend() {
			const text = input.value.trim();
			if (!text) return;
			const fromTile = direction === "AtoB" ? tileA : tileB;
			const toTile = direction === "AtoB" ? tileB : tileA;
			onSendMessage?.({
				connectionId: conn.id,
				fromTileId: fromTile.id,
				fromLabel: tileLabel(fromTile),
				targetTileId: toTile.id,
				targetSessionId: toTile.ptySessionId ?? null,
				text,
			});
			pulseCable(conn.id);
			input.value = "";
			removePopover();
		}

		sendBtn.addEventListener("click", (e) => { e.stopPropagation(); doSend(); });
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") doSend();
			if (e.key === "Escape") removePopover();
			e.stopPropagation();
		});

		popoverEl.appendChild(dirBtn);
		popoverEl.appendChild(input);
		popoverEl.appendChild(sendBtn);
		containerEl.appendChild(popoverEl);

		requestAnimationFrame(() => input.focus());

		setTimeout(() => {
			document.addEventListener("click", removePopover, { once: true });
		}, 0);
	}

	function showContextMenu(conn, clientX, clientY) {
		removeContextMenu();
		removePopover();

		contextMenuEl = document.createElement("div");
		contextMenuEl.className = "cable-context-menu";
		contextMenuEl.style.cssText = `left:${clientX}px;top:${clientY}px;`;

		const removeItem = document.createElement("div");
		removeItem.className = "cable-menu-item";
		removeItem.textContent = "Remove connection";
		removeItem.addEventListener("click", (e) => {
			e.stopPropagation();
			removeContextMenu();
			onRemoveConnection?.(conn.id);
		});

		const labelItem = document.createElement("div");
		labelItem.className = "cable-menu-item";
		labelItem.textContent = "Label…";
		labelItem.addEventListener("click", (e) => {
			e.stopPropagation();
			removeContextMenu();
			const next = prompt("Cable label:", conn.label ?? "");
			if (next !== null) onUpdateLabel?.(conn.id, next);
		});

		contextMenuEl.appendChild(removeItem);
		contextMenuEl.appendChild(labelItem);
		document.body.appendChild(contextMenuEl);

		setTimeout(() => {
			document.addEventListener("click", removeContextMenu, { once: true });
		}, 0);
	}

	function pulseCable(connectionId) {
		const paths = svg.querySelectorAll(
			`.cable-path[data-conn-id="${connectionId}"]`,
		);
		for (const p of paths) {
			p.classList.remove("cable-pulse");
			// Force reflow so removing then re-adding restarts animation
			void p.offsetWidth;
			p.classList.add("cable-pulse");
			setTimeout(() => p.classList.remove("cable-pulse"), 650);
		}
	}

	function drawConnections() {
		// Remove old connection paths (keep preview)
		const old = svg.querySelectorAll("[data-conn-id]");
		for (const el of old) el.remove();
		const oldLabels = svg.querySelectorAll(".cable-label");
		for (const el of oldLabels) el.remove();

		const vp = viewportState;

		for (const conn of connections) {
			const tileA = tiles.find((t) => t.id === conn.tileAId);
			const tileB = tiles.find((t) => t.id === conn.tileBId);
			if (!tileA || !tileB) continue;

			const a = getAnchor(tileA, tileB, vp);
			const b = getAnchor(tileB, tileA, vp);
			const { d, mid } = makePath(a.x, a.y, b.x, b.y);

			// Visible cable path
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("d", d);
			path.setAttribute("class", "cable-path");
			path.setAttribute("data-conn-id", conn.id);
			svg.appendChild(path);

			// Hit path (wide, transparent, receives pointer events)
			const hit = document.createElementNS(SVG_NS, "path");
			hit.setAttribute("d", d);
			hit.setAttribute("class", "cable-hit");
			hit.setAttribute("data-conn-id", conn.id);

			hit.addEventListener("click", (e) => {
				e.stopPropagation();
				showPopover(conn, mid.x, mid.y, tileA, tileB);
			});
			hit.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				showContextMenu(conn, e.clientX, e.clientY);
			});
			svg.appendChild(hit);

			// Label
			if (conn.label) {
				const txt = document.createElementNS(SVG_NS, "text");
				txt.setAttribute("x", mid.x);
				txt.setAttribute("y", mid.y - 8);
				txt.setAttribute("class", "cable-label");
				txt.textContent = conn.label;
				svg.appendChild(txt);
			}
		}
	}

	function drawPreview() {
		const prev = svg.querySelector(".cable-preview");
		if (prev) prev.remove();

		if (!previewState.active || !previewState.startTile) return;

		const vp = viewportState;
		const tile = previewState.startTile;
		const ax = tile.x * vp.zoom + vp.panX + (tile.width * vp.zoom) / 2;
		const ay = tile.y * vp.zoom + vp.panY + (tile.height * vp.zoom) / 2;
		const bx = previewState.mouseX;
		const by = previewState.mouseY;
		const { d } = makePath(ax, ay, bx, by);

		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", d);
		path.setAttribute("class", "cable-preview");
		svg.appendChild(path);
	}

	function update() {
		drawConnections();
		drawPreview();
	}

	function startPreview(startTile) {
		previewState.active = true;
		previewState.startTile = startTile;
	}

	function updatePreview(mouseX, mouseY) {
		previewState.mouseX = mouseX;
		previewState.mouseY = mouseY;
		if (previewState.active) drawPreview();
	}

	function cancelPreview() {
		previewState.active = false;
		previewState.startTile = null;
		const prev = svg.querySelector(".cable-preview");
		if (prev) prev.remove();
	}

	function destroy() {
		svg.remove();
		removePopover();
		removeContextMenu();
	}

	return { update, startPreview, updatePreview, cancelPreview, pulseCable, destroy };
}
