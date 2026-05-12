import { beforeEach, describe, expect, test } from "bun:test";
import { connections, tiles } from "./canvas-state.js";
import { createCableInspector } from "./cable-inspector.js";

function createClassList(element: any) {
	return {
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
		contains(name: string) {
			return String(element.className || "").split(/\s+/).includes(name);
		},
		toggle(name: string, force?: boolean) {
			const shouldAdd = force ?? !this.contains(name);
			if (shouldAdd) this.add(name);
			else this.remove(name);
			return shouldAdd;
		},
	};
}

function toDatasetKey(name: string) {
	return name
		.replace(/^data-/, "")
		.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function matchSelector(element: any, selector: string) {
	const idMatch = selector.match(/^#([a-zA-Z0-9_-]+)/);
	const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
	const attrMatch = selector.match(/\[data-([a-z-]+)(?:=["']([^"']*)["'])?\]/);
	if (idMatch && element.getAttribute("id") !== idMatch[1]) return false;
	if (classMatch && !element.classList.contains(classMatch[1])) return false;
	if (attrMatch) {
		const key = toDatasetKey(`data-${attrMatch[1]}`);
		if (!(key in element.dataset)) return false;
		if (attrMatch[2] !== undefined && element.dataset[key] !== attrMatch[2]) return false;
	}
	return Boolean(idMatch || classMatch || attrMatch);
}

function createElement(tagName: string) {
	const attributes = new Map<string, string>();
	const listeners = new Map<string, Array<(event: any) => void>>();
	const element: any = {
		tagName: tagName.toUpperCase(),
		children: [],
		parentNode: null,
		style: {},
		dataset: {},
		className: "",
		textContent: "",
		hidden: false,
		value: "",
		clientWidth: 800,
		clientHeight: 600,
		offsetWidth: 0,
		offsetHeight: 0,
		classList: null,
		appendChild(child: any) {
			child.parentNode = this;
			this.children.push(child);
			return child;
		},
		replaceChildren(...childrenToAppend: any[]) {
			for (const child of this.children) child.parentNode = null;
			this.children = [];
			for (const child of childrenToAppend) this.appendChild(child);
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
			if (name === "id") this.id = text;
			if (name.startsWith("data-")) this.dataset[toDatasetKey(name)] = text;
		},
		getAttribute(name: string) {
			return attributes.get(name) ?? null;
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
		getBoundingClientRect() {
			return {
				left: 0,
				top: 0,
				right: this.clientWidth,
				bottom: this.clientHeight,
				width: this.clientWidth,
				height: this.clientHeight,
			};
		},
		focus() {
			globalThis.document.activeElement = this;
		},
	};
	element.classList = createClassList(element);
	return element;
}

function installDomStub() {
	const body = createElement("body");
	globalThis.document = {
		body,
		activeElement: null,
		createElement,
		addEventListener() {},
		removeEventListener() {},
	} as any;
	globalThis.requestAnimationFrame = ((callback: () => void) => {
		callback();
		return 1;
	}) as any;
	globalThis.prompt = (() => null) as any;
}

function createMouseEvent(type: string, overrides: Record<string, unknown> = {}) {
	return {
		type,
		key: "",
		ctrlKey: false,
		metaKey: false,
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

function setupInspector(options: Record<string, any> = {}) {
	const container = createElement("div");
	tiles.push(
		{
			id: "tile-a",
			type: "term",
			x: 0,
			y: 0,
			width: 100,
			height: 100,
			userTitle: "Worker",
			ptySessionId: "session-a",
			ptyStatus: "running",
		},
		{
			id: "tile-b",
			type: "term",
			x: 300,
			y: 0,
			width: 100,
			height: 100,
			userTitle: "Reviewer",
			ptySessionId: "session-b",
			ptyStatus: "running",
		},
	);
	connections.push({
		id: "conn-ab",
		tileAId: "tile-a",
		tileBId: "tile-b",
		label: "review",
		createdAt: 1,
		updatedAt: 1,
	});
	const sendRequests: any[] = [];
	const notifications: any[] = [];
	const removedConnections: string[] = [];
	const states: any[] = [];
	const inspector = createCableInspector({
		containerEl: container,
		viewportState: { panX: 0, panY: 0, zoom: 1 },
		onSendMessage: options.onSendMessage ?? (async (request: any) => {
			sendRequests.push(request);
			return { ok: true };
		}),
		onGetLog: async () => [],
		onNotify: (message: string, tone: string) => notifications.push({ message, tone }),
		onFocusTile: () => {},
		onInjectContext: async () => ({ ok: true }),
		onRemoveConnection: (id: string) => removedConnections.push(id),
		onUpdateLabel: () => {},
		onGetFocusedTileId: () => null,
		onStateChanged: (state: any) => states.push(state),
	});
	return {
		container,
		inspector,
		notifications,
		removedConnections,
		sendRequests,
		states,
	};
}

beforeEach(() => {
	installDomStub();
	tiles.length = 0;
	connections.length = 0;
});

describe("createCableInspector", () => {
	test("opens the cable popover and sends through the supplied relay handler", async () => {
		const { container, inspector, sendRequests, states } = setupInspector();

		const selected = inspector.selectConnection("conn-ab");
		expect(selected?.connection.id).toBe("conn-ab");
		expect(inspector.getSelectedConnectionId()).toBe("conn-ab");
		expect(states.at(-1).selectedConnectionId).toBe("conn-ab");

		const popover = container.querySelector(".cable-popover");
		expect(popover).toBeTruthy();
		expect(popover.querySelector(".cable-dir-btn").textContent)
			.toBe("Worker -> Reviewer");

		const input = popover.querySelector(".cable-input");
		input.value = "please review the patch";
		popover.querySelector(".cable-send-btn").dispatchEvent(createMouseEvent("click"));
		await Promise.resolve();
		await Promise.resolve();

		expect(sendRequests).toEqual([
			{
				connectionId: "conn-ab",
				fromTileId: "tile-a",
				fromLabel: "Worker",
				targetTileId: "tile-b",
				targetSessionId: "session-b",
				text: "please review the patch",
			},
		]);
	});

	test("keeps the draft and reports relay failures", async () => {
		const { container, inspector, notifications } = setupInspector({
			onSendMessage: async () => ({
				ok: false,
				errorCode: "missing_pty",
				message: "Target PTY session is not active.",
			}),
		});

		inspector.selectConnection("conn-ab");
		const popover = container.querySelector(".cable-popover");
		const input = popover.querySelector(".cable-input");
		input.value = "please review the patch";
		popover.querySelector(".cable-send-btn").dispatchEvent(createMouseEvent("click"));
		await Promise.resolve();
		await Promise.resolve();

		expect(container.querySelector(".cable-popover")).toBe(popover);
		expect(input.value).toBe("please review the patch");
		const status = popover.querySelector(".cable-status");
		expect(status.hidden).toBe(false);
		expect(status.dataset.kind).toBe("error");
		expect(status.textContent).toBe("Target PTY session is not active.");
		expect(notifications).toEqual([
			{ message: "Target PTY session is not active.", tone: "error" },
		]);
	});

	test("opens the context menu and removes one connection", () => {
		const { inspector, removedConnections } = setupInspector();

		expect(inspector.openContextMenu("conn-ab", 120, 90)?.id).toBe("conn-ab");
		const menu = document.body.querySelector(".cable-context-menu");
		expect(menu).toBeTruthy();

		const [removeItem] = menu.querySelectorAll(".cable-menu-item");
		removeItem.dispatchEvent(createMouseEvent("click"));
		expect(removedConnections).toEqual(["conn-ab"]);
	});
});
