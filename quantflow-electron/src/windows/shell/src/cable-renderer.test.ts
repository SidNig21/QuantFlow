import { beforeEach, describe, expect, test } from "bun:test";
import {
	getCableBundleKey,
	getCableRenderGroups,
	isCableSourceRunning,
	clearCablePreview,
	renderCablePreview,
	renderCables,
} from "./cable-renderer.js";

function toDatasetKey(name: string) {
	return name
		.replace(/^data-/, "")
		.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function matchSelector(element: any, selector: string) {
	const idMatch = selector.match(/^#([a-zA-Z0-9_-]+)/);
	const tagMatch = selector.match(/^([a-zA-Z0-9_-]+)/);
	const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
	const attrMatch = selector.match(
		/\[data-([a-z-]+)(?:=["']([^"']*)["'])?\]/,
	);
	if (idMatch && element.getAttribute("id") !== idMatch[1]) return false;
	if (tagMatch && element.tagName !== tagMatch[1].toUpperCase()) return false;
	if (classMatch && !element.classList.contains(classMatch[1])) return false;
	if (attrMatch) {
		const key = toDatasetKey(`data-${attrMatch[1]}`);
		if (!(key in element.dataset)) return false;
		if (attrMatch[2] !== undefined && element.dataset[key] !== attrMatch[2]) return false;
	}
	return Boolean(idMatch || tagMatch || classMatch || attrMatch);
}

function createElement(tagName: string) {
	const attributes = new Map<string, string>();
	const listeners = new Map<string, Array<(event: any) => void>>();
	const element: any = {
		tagName: tagName.toUpperCase(),
		children: [],
		parentNode: null,
		dataset: {},
		className: "",
		classList: {
			contains(name: string) {
				return String(element.className || "").split(/\s+/).includes(name);
			},
			add(name: string) {
				const values = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
				values.add(name);
				element.className = [...values].join(" ");
			},
			remove(name: string) {
				const values = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
				values.delete(name);
				element.className = [...values].join(" ");
			},
			toggle(name: string, force?: boolean) {
				const shouldAdd = force ?? !this.contains(name);
				if (shouldAdd) this.add(name);
				else this.remove(name);
				return shouldAdd;
			},
		},
		appendChild(child: any) {
			child.parentNode = this;
			this.children.push(child);
			return child;
		},
		remove() {
			if (!this.parentNode) return;
			const siblings = this.parentNode.children;
			const index = siblings.indexOf(this);
			if (index >= 0) siblings.splice(index, 1);
			this.parentNode = null;
		},
		setAttribute(name: string, value: string) {
			const text = String(value);
			attributes.set(name, text);
			if (name === "class") this.className = text;
			if (name.startsWith("data-")) this.dataset[toDatasetKey(name)] = text;
		},
		getAttribute(name: string) {
			return attributes.get(name) ?? null;
		},
		removeAttribute(name: string) {
			attributes.delete(name);
			if (name.startsWith("data-")) delete this.dataset[toDatasetKey(name)];
		},
		addEventListener(name: string, handler: (event: any) => void) {
			const handlers = listeners.get(name) ?? [];
			handlers.push(handler);
			listeners.set(name, handlers);
		},
		dispatchEvent(event: any) {
			event.target ??= this;
			for (const handler of listeners.get(event.type) ?? []) handler(event);
			return !event.defaultPrevented;
		},
		querySelectorAll(selector: string) {
			const matches: any[] = [];
			function visit(node: any) {
				if (matchSelector(node, selector)) matches.push(node);
				for (const child of node.children ?? []) visit(child);
			}
			for (const child of this.children) visit(child);
			return matches;
		},
		querySelector(selector: string) {
			return this.querySelectorAll(selector)[0] ?? null;
		},
	};
	return element;
}

function installDomStub() {
	globalThis.document = {
		createElementNS(_namespace: string, tagName: string) {
			return createElement(tagName);
		},
	} as any;
}

function createMouseEvent(type: string, overrides: Record<string, unknown> = {}) {
	return {
		type,
		shiftKey: false,
		clientX: 10,
		clientY: 20,
		defaultPrevented: false,
		propagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
		...overrides,
	};
}

const tiles = [
	{ id: "tile-a", type: "term", x: 0, y: 0, width: 100, height: 80 },
	{ id: "tile-b", x: 240, y: 20, width: 100, height: 80 },
	{ id: "tile-c", x: 480, y: 40, width: 100, height: 80 },
];

describe("cable render grouping", () => {
	test("groups by tile pair and side pair regardless of direction", () => {
		expect(getCableBundleKey({
			id: "a",
			tileAId: "tile-a",
			tileBId: "tile-b",
			from: { tileId: "tile-a", side: "E" },
			to: { tileId: "tile-b", side: "W" },
		})).toBe(getCableBundleKey({
			id: "b",
			tileAId: "tile-b",
			tileBId: "tile-a",
			from: { tileId: "tile-b", side: "W" },
			to: { tileId: "tile-a", side: "E" },
		}));
	});

	test("marks groups active when a source terminal is running", () => {
		const tilesById = new Map([
			["tile-a", { ...tiles[0], ptyStatus: "running" }],
			["tile-b", tiles[1]],
		]);
		const groups = getCableRenderGroups([
			{ id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" },
		], tilesById);

		expect(groups).toHaveLength(1);
		expect(groups[0].active).toBe(true);
		expect(isCableSourceRunning({ type: "term", ptySessionId: "pty-1" })).toBe(true);
		expect(isCableSourceRunning({ type: "term", ptyStatus: "idle", ptySessionId: "pty-1" }))
			.toBe(false);
	});
});

describe("renderCables interactions", () => {
	beforeEach(() => {
		installDomStub();
	});

	test("shift-clicking a cable hit path requests deletion for one connection", () => {
		const contentG = createElement("g");
		const deleted: string[] = [];
		renderCables(
			contentG,
			[
				{ id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" },
				{ id: "conn-b", tileAId: "tile-b", tileBId: "tile-c" },
			],
			tiles,
			{ panX: 0, panY: 0, zoom: 1 },
			{ onShiftDelete: (id) => deleted.push(id) },
		);

		const hitPath = contentG
			.querySelector('g[data-cable-id="conn-b"]')
			.querySelector(".cable-hit");
		const event = createMouseEvent("click", { shiftKey: true });
		hitPath.dispatchEvent(event);

		expect(deleted).toEqual(["conn-b"]);
		expect(event.defaultPrevented).toBe(true);
		expect(event.propagationStopped).toBe(true);
	});

	test("plain clicks select a single SVG cable for inspector UX", () => {
		const contentG = createElement("g");
		const selected: string[] = [];
		renderCables(
			contentG,
			[{ id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" }],
			tiles,
			{ panX: 0, panY: 0, zoom: 1 },
			{ onSelect: (id) => selected.push(id) },
		);

		const hitPath = contentG
			.querySelector('g[data-cable-id="conn-a"]')
			.querySelector(".cable-hit");
		const event = createMouseEvent("click");
		hitPath.dispatchEvent(event);

		expect(selected).toEqual(["conn-a"]);
		expect(event.defaultPrevented).toBe(true);
		expect(event.propagationStopped).toBe(true);
	});

	test("contextmenu selects one SVG cable for menu UX", () => {
		const contentG = createElement("g");
		const opened: Array<{ id: string, x: number, y: number }> = [];
		renderCables(
			contentG,
			[{ id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" }],
			tiles,
			{ panX: 0, panY: 0, zoom: 1 },
			{
				onContextMenu: (id, event) =>
					opened.push({ id, x: event.clientX, y: event.clientY }),
			},
		);

		const hitPath = contentG
			.querySelector('g[data-cable-id="conn-a"]')
			.querySelector(".cable-hit");
		const event = createMouseEvent("contextmenu", { clientX: 45, clientY: 60 });
		hitPath.dispatchEvent(event);

		expect(opened).toEqual([{ id: "conn-a", x: 45, y: 60 }]);
		expect(event.defaultPrevented).toBe(true);
		expect(event.propagationStopped).toBe(true);
	});

	test("renders running source glow and flow paths", () => {
		const contentG = createElement("g");
		renderCables(
			contentG,
			[{ id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" }],
			[{ ...tiles[0], ptyStatus: "running" }, tiles[1]],
			{ panX: 0, panY: 0, zoom: 1 },
		);

		const group = contentG.querySelector('g[data-cable-id="conn-a"]');
		expect(group.querySelector(".cable-glow").getAttribute("hidden")).toBe(null);
		expect(group.querySelector(".cable-flow").getAttribute("hidden")).toBe(null);
		expect(group.querySelector(".cable-main").getAttribute("stroke-width")).toBe("1.6");
	});

	test("applies selected and relay state classes from inspector state", () => {
		const contentG = createElement("g");
		renderCables(
			contentG,
			[{ id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" }],
			tiles,
			{ panX: 0, panY: 0, zoom: 1 },
			{
				selectedConnectionId: "conn-a",
				getRelayState: () => "sending",
			},
		);

		const group = contentG.querySelector('g[data-cable-id="conn-a"]');
		expect(group.classList.contains("cable-selected")).toBe(true);
		expect(group.classList.contains("cable-sending")).toBe(true);
		expect(group.classList.contains("cable-sent")).toBe(false);
	});

	test("collapses bundled cables into one path with a count badge", () => {
		const contentG = createElement("g");
		const deleted: string[] = [];
		renderCables(
			contentG,
			[
				{ id: "conn-a", tileAId: "tile-a", tileBId: "tile-b" },
				{ id: "conn-b", tileAId: "tile-b", tileBId: "tile-a" },
			],
			tiles,
			{ panX: 0, panY: 0, zoom: 1 },
			{ onShiftDelete: (id) => deleted.push(id) },
		);

		const groups = contentG.querySelectorAll("[data-cable-id]");
		expect(groups).toHaveLength(1);
		expect(groups[0].getAttribute("data-cable-count")).toBe("2");
		expect(groups[0].querySelector(".cable-main").getAttribute("stroke-width")).toBe("5");
		expect(groups[0].querySelector(".cable-badge").getAttribute("hidden")).toBe(null);
		expect(groups[0].querySelector(".cable-badge-count").textContent).toBe("2");

		const event = createMouseEvent("click", { shiftKey: true });
		groups[0].querySelector(".cable-hit").dispatchEvent(event);
		expect(deleted).toEqual(["conn-a"]);
	});
});

describe("renderCablePreview", () => {
	beforeEach(() => {
		installDomStub();
	});

	test("draws and updates a dashed preview path toward the cursor", () => {
		const contentG = createElement("g");
		const first = renderCablePreview(
			contentG,
			tiles[0],
			"E",
			{ x: 180, y: 40 },
		);
		const firstD = first.getAttribute("d");
		const second = renderCablePreview(
			contentG,
			tiles[0],
			"E",
			{ x: 220, y: 60 },
		);

		expect(contentG.querySelectorAll("#cable-preview")).toHaveLength(1);
		expect(second).toBe(first);
		expect(second.getAttribute("class")).toBe("cable-preview");
		expect(second.getAttribute("d")).not.toBe(firstD);
		expect(second.getAttribute("d")).toContain("220 60");
	});

	test("clears the SVG cable preview", () => {
		const contentG = createElement("g");
		renderCablePreview(contentG, tiles[0], "S", { x: 80, y: 150 });
		clearCablePreview(contentG);
		expect(contentG.querySelector("#cable-preview")).toBeNull();
	});
});
