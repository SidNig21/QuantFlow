import { bezierPath, portPosition } from "./cable-math.js";

const SVG_NS = "http://www.w3.org/2000/svg";

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
 */
export function renderCables(contentG, connections, tiles, viewport) {
	const { panX, panY, zoom } = viewport;
	contentG.setAttribute(
		"transform",
		`translate(${panX} ${panY}) scale(${zoom})`,
	);

	const tilesById = new Map(tiles.map((t) => [t.id, t]));

	const desired = new Map();
	for (const conn of connections) {
		const points = resolveEndpoints(conn, tilesById);
		if (!points) continue;
		desired.set(conn.id, { conn, ...points });
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
		updateCableGroup(group, info);
	}
}

function createCableGroup(id) {
	const g = document.createElementNS(SVG_NS, "g");
	g.setAttribute("data-cable-id", id);

	const hit = document.createElementNS(SVG_NS, "path");
	hit.setAttribute("class", "cable-hit");
	g.appendChild(hit);

	const main = document.createElementNS(SVG_NS, "path");
	main.setAttribute("class", "cable-main");
	g.appendChild(main);

	return g;
}

function updateCableGroup(group, info) {
	const d = bezierPath(info.a, info.b);
	for (const path of group.querySelectorAll("path")) {
		path.setAttribute("d", d);
	}
}

function cssEscape(value) {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(value);
	}
	return String(value).replace(/[^\w-]/g, (c) => `\\${c}`);
}
