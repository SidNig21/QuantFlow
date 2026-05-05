/**
 * Pure math for cable rendering. World-space coordinates.
 * Source: design_handoff_quantflow_cables/artboards/04_cable_lab.jsx
 */

export const SIDES = ["N", "E", "S", "W"];

/**
 * @typedef {Object} PortPoint
 * @property {number} x - World-space x of the port
 * @property {number} y - World-space y of the port
 * @property {number} dx - Outward normal x component (-1, 0, or 1)
 * @property {number} dy - Outward normal y component (-1, 0, or 1)
 */

/**
 * @param {{x: number, y: number, width: number, height: number}} tile
 * @param {'N'|'E'|'S'|'W'} side
 * @returns {PortPoint}
 */
export function portPosition(tile, side) {
	const { x, y, width: w, height: h } = tile;
	switch (side) {
		case "N":
			return { x: x + w / 2, y, dx: 0, dy: -1 };
		case "S":
			return { x: x + w / 2, y: y + h, dx: 0, dy: 1 };
		case "E":
			return { x: x + w, y: y + h / 2, dx: 1, dy: 0 };
		case "W":
			return { x, y: y + h / 2, dx: -1, dy: 0 };
		default:
			throw new Error(`Unknown port side: ${side}`);
	}
}

/**
 * Smooth bezier with directional handles based on each end's outward normal.
 * Curvature ramp: short cables stay tight, long cables get rounder.
 * @param {PortPoint} a
 * @param {PortPoint} b
 * @param {number} [curvature=0.45]
 * @returns {string} SVG path "d" attribute value
 */
export function bezierPath(a, b, curvature = 0.45) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const dist = Math.hypot(dx, dy);
	const k = Math.min(180, Math.max(40, dist * curvature));
	const c1 = { x: a.x + a.dx * k, y: a.y + a.dy * k };
	const c2 = { x: b.x + b.dx * k, y: b.y + b.dy * k };
	return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}
