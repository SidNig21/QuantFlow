import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	getRegionRenderModels,
	renderWorkflowRegions,
} from "./workflow-region-overlay.js";

// --- Minimal SVG-ish DOM mock (enough for renderWorkflowRegions) ---

function createElement(tagName: string) {
	const attributes = new Map<string, string>();
	const element: any = {
		tagName: tagName.toUpperCase(),
		children: [] as any[],
		parentNode: null as any,
		_text: "",
		setAttribute(name: string, value: string) {
			attributes.set(name, String(value));
		},
		getAttribute(name: string) {
			return attributes.has(name) ? attributes.get(name) : null;
		},
		get className() {
			return attributes.get("class") ?? "";
		},
		set textContent(value: string) {
			element._text = String(value);
		},
		get textContent() {
			return element._text;
		},
		appendChild(child: any) {
			child.parentNode = element;
			element.children.push(child);
			return child;
		},
		remove() {
			if (element.parentNode) {
				const arr = element.parentNode.children;
				const idx = arr.indexOf(element);
				if (idx !== -1) arr.splice(idx, 1);
				element.parentNode = null;
			}
		},
		querySelectorAll(selector: string) {
			const out: any[] = [];
			walk(element, (node: any) => {
				if (node !== element && matches(node, selector)) out.push(node);
			});
			return out;
		},
		querySelector(selector: string) {
			let found: any = null;
			walk(element, (node: any) => {
				if (!found && node !== element && matches(node, selector)) found = node;
			});
			return found;
		},
	};
	return element;
}

function walk(node: any, fn: (n: any) => void) {
	fn(node);
	for (const child of node.children) walk(child, fn);
}

function matches(node: any, selector: string): boolean {
	const classMatch = selector.match(/\.([\w-]+)/);
	const attrMatch = selector.match(/\[data-([\w-]+)(?:="([^"]*)")?\]/);
	const gAttrMatch = selector.match(/^g\[data-([\w-]+)="([^"]*)"\]/);
	if (gAttrMatch) {
		return (
			node.tagName === "G" &&
			node.getAttribute(`data-${gAttrMatch[1]}`) === gAttrMatch[2]
		);
	}
	if (classMatch) {
		return String(node.className).split(/\s+/).includes(classMatch[1]);
	}
	if (attrMatch) {
		const v = node.getAttribute(`data-${attrMatch[1]}`);
		if (attrMatch[2] !== undefined) return v === attrMatch[2];
		return v !== null;
	}
	return false;
}

let originalDocument: any;
beforeEach(() => {
	originalDocument = (globalThis as any).document;
	(globalThis as any).document = {
		createElementNS: (_ns: string, tag: string) => createElement(tag),
	};
});
afterEach(() => {
	(globalThis as any).document = originalDocument;
});

const region = (id: string, bounds: any, extra: any = {}) => ({
	id,
	name: `WF ${id}`,
	objective: "obj",
	status: "active",
	tileIds: ["a", "b"],
	tileCount: 2,
	bounds,
	taskCount: 1,
	receiptCount: 0,
	openTaskCount: 1,
	blockedTaskCount: 0,
	blockedTaskIds: [],
	connectionTypeCounts: {},
	...extra,
});

describe("getRegionRenderModels", () => {
	test("drops regions with no bounds, keeps drawable ones", () => {
		const models = getRegionRenderModels([
			region("wf1", { x: 0, y: 0, width: 100, height: 100 }),
			region("wf2", null, { tileCount: 0, tileIds: [] }),
		]);
		expect(models.map((m) => m.id)).toEqual(["wf1"]);
	});

	test("marks blocked regions", () => {
		const [m] = getRegionRenderModels([
			region("wf1", { x: 0, y: 0, width: 100, height: 100 }, {
				blockedTaskCount: 1,
				blockedTaskIds: ["k2"],
			}),
		]);
		expect(m.hasBlockers).toBe(true);
	});
});

describe("renderWorkflowRegions", () => {
	const viewport = { panX: 10, panY: 20, zoom: 2 };

	test("creates a group per drawable region and sets the world transform", () => {
		const g = createElement("g");
		renderWorkflowRegions(g, [region("wf1", { x: 5, y: 5, width: 200, height: 120 })], viewport);
		expect(g.getAttribute("transform")).toBe("translate(10 20) scale(2)");
		const group = g.querySelector('g[data-region-id="wf1"]');
		expect(group).toBeTruthy();
		const box = group.querySelector(".region-box");
		expect(box.getAttribute("x")).toBe("5");
		expect(box.getAttribute("width")).toBe("200");
		expect(group.querySelector(".region-label").textContent).toBe("WF wf1");
	});

	test("blocked region gets the alert class", () => {
		const g = createElement("g");
		renderWorkflowRegions(g, [
			region("wf1", { x: 0, y: 0, width: 100, height: 100 }, {
				blockedTaskCount: 1,
				blockedTaskIds: ["k2"],
			}),
		], viewport);
		const group = g.querySelector('g[data-region-id="wf1"]');
		expect(String(group.className)).toContain("region-blocked");
		expect(group.querySelector(".region-sub").textContent).toContain("blocked");
	});

	test("reconciles: removes regions that disappear", () => {
		const g = createElement("g");
		renderWorkflowRegions(g, [
			region("wf1", { x: 0, y: 0, width: 100, height: 100 }),
			region("wf2", { x: 0, y: 0, width: 100, height: 100 }),
		], viewport);
		expect(g.querySelectorAll("[data-region-id]").length).toBe(2);
		renderWorkflowRegions(g, [region("wf1", { x: 0, y: 0, width: 100, height: 100 })], viewport);
		expect(g.querySelectorAll("[data-region-id]").length).toBe(1);
		expect(g.querySelector('g[data-region-id="wf1"]')).toBeTruthy();
		expect(g.querySelector('g[data-region-id="wf2"]')).toBeNull();
	});

	test("null layer is a safe no-op", () => {
		expect(() => renderWorkflowRegions(null as any, [], viewport)).not.toThrow();
	});
});
