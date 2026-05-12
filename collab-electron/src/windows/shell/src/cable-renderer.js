import { bezierPath, portPosition } from "./cable-math.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_CABLE_WIDTH = 1.6;

/**
 * Resolve a connection's endpoints to PortPoints in world space.
 * Falls back to default sides (E for source, W for target) when the
 * connection lacks `from`/`to` side metadata.
 *
 * @param {{
 *   tileAId: string, tileBId: string,
 *   from?: {tileId: string, side: 'N'|'E'|'S'|'W'},
 *   to?:   {tileId: string, side: 'N'|'E'|'S'|'W'},
 * }} connection
 * @param {Map<string, {x:number,y:number,width:number,height:number}>} tilesById
 */
export function resolveEndpoints(connection, tilesById) {
	const fromTileId = connection.from?.tileId ?? connection.tileAId;
	const toTileId = connection.to?.tileId ?? connection.tileBId;
	const fromTile = tilesById.get(fromTileId);
	const toTile = tilesById.get(toTileId);
	if (!fromTile || !toTile) return null;
	const fromSide = connection.from?.side ?? "E";
	const toSide = connection.to?.side ?? "W";
	return {
		a: portPosition(fromTile, fromSide),
		b: portPosition(toTile, toSide),
	};
}

export function getCableBundleKey(connection) {
	const fromTileId = connection.from?.tileId ?? connection.tileAId;
	const toTileId = connection.to?.tileId ?? connection.tileBId;
	const fromSide = connection.from?.side ?? "E";
	const toSide = connection.to?.side ?? "W";
	const tilePairKey = [fromTileId, toTileId].sort().join("|");
	const sidePairKey = [fromSide, toSide].sort().join(",");
	return `${tilePairKey}:${sidePairKey}`;
}

export function isCableSourceRunning(tile) {
	if (tile?.type !== "term") return false;
	const status = String(tile.ptyStatus ?? "").toLowerCase();
	if (status === "running" || status === "active") return true;
	if (status === "idle" || status === "exited" || status === "error") return false;
	return Boolean(tile.ptySessionId);
}

export function getCableRenderGroups(connections, tilesById) {
	const bundles = new Map();
	for (const conn of connections) {
		const points = resolveEndpoints(conn, tilesById);
		if (!points) continue;
		const key = getCableBundleKey(conn);
		if (!bundles.has(key)) bundles.set(key, []);
		bundles.get(key).push({ conn, ...points });
	}

	return Array.from(bundles.values()).map((items) => {
		const sorted = [...items].sort((a, b) =>
			String(a.conn.id).localeCompare(String(b.conn.id)),
		);
		const activeItem = items.find((item) => {
			const sourceTileId = item.conn.from?.tileId ?? item.conn.tileAId;
			return isCableSourceRunning(tilesById.get(sourceTileId));
		});
		const pathItem = activeItem ?? sorted[0];
		const count = items.length;
		const width = count > 1 ? 3 + Math.min(count, 5) : DEFAULT_CABLE_WIDTH;
		return {
			id: sorted[0].conn.id,
			deleteId: sorted[0].conn.id,
			count,
			active: Boolean(activeItem),
			width,
			a: pathItem.a,
			b: pathItem.b,
			connections: sorted.map((item) => item.conn),
		};
	});
}

export function renderCablePreview(contentG, sourceTile, sourceSide, point) {
	if (!contentG || !sourceTile || !point) return null;
	const start = portPosition(sourceTile, sourceSide ?? "E");
	const end = {
		x: point.x,
		y: point.y,
		dx: -start.dx,
		dy: -start.dy,
	};
	let path = contentG.querySelector("#cable-preview");
	if (!path) {
		path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("id", "cable-preview");
		path.setAttribute("class", "cable-preview");
		contentG.appendChild(path);
	}
	path.setAttribute("d", bezierPath(start, end));
	return path;
}

export function clearCablePreview(contentG) {
	contentG?.querySelector?.("#cable-preview")?.remove();
}

/**
 * Render all cables into the cable layer SVG.
 *
 * Cables are drawn in WORLD coordinates inside the <g id="cable-layer-content">
 * element, which is transformed by the viewport's pan/zoom. This means cable
 * stroke widths scale with zoom — that matches the prototype.
 *
 * @param {SVGElement} contentG - the <g> child of #cable-layer
 * @param {Array<object>} connections - canvas-state connections array
 * @param {Array<{id:string,x:number,y:number,width:number,height:number}>} tiles
 * @param {{panX:number,panY:number,zoom:number}} viewport
 * @param {{
 *   onShiftDelete?: (connectionId:string, event:MouseEvent) => void,
 *   onSelect?: (connectionId:string, event:MouseEvent) => void,
 *   onContextMenu?: (connectionId:string, event:MouseEvent) => void,
 * }} [options]
 */
export function renderCables(contentG, connections, tiles, viewport, options = {}) {
	const { panX, panY, zoom } = viewport;
	contentG.setAttribute(
		"transform",
		`translate(${panX} ${panY}) scale(${zoom})`,
	);

	const tilesById = new Map(tiles.map((t) => [t.id, t]));

	const desired = new Map();
	for (const info of getCableRenderGroups(connections, tilesById)) {
		const relayState = info.connections
			.map((conn) => options.getRelayState?.(conn.id) ?? "")
			.find(Boolean) ?? "";
		desired.set(info.id, {
			...info,
			selected: info.connections.some((conn) => conn.id === options.selectedConnectionId),
			relayState,
		});
	}

	for (const node of Array.from(contentG.querySelectorAll("[data-cable-id]"))) {
		const id = node.getAttribute("data-cable-id");
		if (!desired.has(id)) node.remove();
	}

	for (const [id, info] of desired) {
		let group = contentG.querySelector(`g[data-cable-id="${cssEscape(id)}"]`);
		if (!group) {
			group = createCableGroup(id);
			contentG.appendChild(group);
		}
		group.__onShiftDelete = options.onShiftDelete ?? null;
		group.__onSelect = options.onSelect ?? null;
		group.__onContextMenu = options.onContextMenu ?? null;
		group.__deleteConnectionId = info.deleteId;
		updateCableGroup(group, info);
	}
}

function createCableGroup(id) {
	const g = document.createElementNS(SVG_NS, "g");
	g.setAttribute("data-cable-id", id);

	const hit = document.createElementNS(SVG_NS, "path");
	hit.setAttribute("class", "cable-hit");
	hit.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		const connectionId = g.__deleteConnectionId ?? id;
		if (event.shiftKey) {
			if (typeof g.__onShiftDelete === "function") {
				g.__onShiftDelete(connectionId, event);
			}
			return;
		}
		if (typeof g.__onSelect === "function") {
			g.__onSelect(connectionId, event);
		}
	});
	hit.addEventListener("contextmenu", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (typeof g.__onContextMenu === "function") {
			g.__onContextMenu(g.__deleteConnectionId ?? id, event);
		}
	});
	g.appendChild(hit);

	const glow = document.createElementNS(SVG_NS, "path");
	glow.setAttribute("class", "cable-glow");
	g.appendChild(glow);

	const main = document.createElementNS(SVG_NS, "path");
	main.setAttribute("class", "cable-main");
	g.appendChild(main);

	const flow = document.createElementNS(SVG_NS, "path");
	flow.setAttribute("class", "cable-flow");
	g.appendChild(flow);

	const badge = document.createElementNS(SVG_NS, "g");
	badge.setAttribute("class", "cable-badge");
	const badgeBg = document.createElementNS(SVG_NS, "circle");
	badgeBg.setAttribute("class", "cable-badge-bg");
	badgeBg.setAttribute("r", "11");
	badge.appendChild(badgeBg);
	const badgeText = document.createElementNS(SVG_NS, "text");
	badgeText.setAttribute("class", "cable-badge-count");
	badgeText.setAttribute("text-anchor", "middle");
	badgeText.setAttribute("dominant-baseline", "central");
	badge.appendChild(badgeText);
	g.appendChild(badge);

	return g;
}

function updateCableGroup(group, info) {
	const d = bezierPath(info.a, info.b);
	for (const path of group.querySelectorAll("path")) {
		path.setAttribute("d", d);
	}
	group.setAttribute("data-cable-count", String(info.count));
	group.setAttribute("data-cable-delete-id", info.deleteId);
	group.classList.toggle("cable-selected", Boolean(info.selected));
	group.classList.toggle("cable-sending", info.relayState === "sending");
	group.classList.toggle("cable-sent", info.relayState === "sent");
	group.classList.toggle("cable-failed", info.relayState === "failed");

	const hit = group.querySelector(".cable-hit");
	if (hit) hit.setAttribute("stroke-width", "14");

	const glow = group.querySelector(".cable-glow");
	if (glow) {
		glow.setAttribute("stroke-width", String(info.width + 6));
		setHidden(glow, !info.active);
	}

	const main = group.querySelector(".cable-main");
	if (main) main.setAttribute("stroke-width", String(info.width));

	const flow = group.querySelector(".cable-flow");
	if (flow) {
		flow.setAttribute("stroke-width", String(info.width));
		setHidden(flow, !info.active);
	}

	const badge = group.querySelector(".cable-badge");
	if (badge) {
		const mx = (info.a.x + info.b.x) / 2;
		const my = (info.a.y + info.b.y) / 2;
		badge.setAttribute("transform", `translate(${mx} ${my})`);
		const text = badge.querySelector(".cable-badge-count");
		if (text) text.textContent = String(info.count);
		setHidden(badge, info.count <= 1);
	}
}

function setHidden(element, hidden) {
	if (hidden) element.setAttribute("hidden", "");
	else element.removeAttribute("hidden");
}

function cssEscape(value) {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(value);
	}
	return String(value).replace(/[^\w-]/g, (c) => `\\${c}`);
}
