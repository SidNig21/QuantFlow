import { beforeEach, describe, expect, test } from "bun:test";
import { connections, tiles } from "./canvas-state.js";
import {
	clampFloatingPosition,
	createCableOverlay,
	formatCableContextRelay,
	formatCableLabel,
	getCableDefaultDirection,
	getCableHitStrokeWidth,
	formatCableLogDetail,
	formatCableLogEntry,
	formatCableEndpointSummary,
	formatCableRelayFailure,
	getCableRelayResultFeedback,
	getCableRenderDescriptors,
	getCableSendBlockMessage,
	getDirectedCableTiles,
	getCableEndpointStatus,
	getCableLabelLayout,
	getConnectionPresentation,
	getRetryCableRelayRequest,
	shouldSubmitCableMessage,
} from "./cable-overlay.js";

function createClassList(element) {
	return {
		add(name) {
			const values = new Set(
				String(element.className || "").split(/\s+/).filter(Boolean),
			);
			values.add(name);
			element.className = [...values].join(" ");
		},
		remove(name) {
			const values = new Set(
				String(element.className || "").split(/\s+/).filter(Boolean),
			);
			values.delete(name);
			element.className = [...values].join(" ");
		},
		contains(name) {
			return String(element.className || "").split(/\s+/).includes(name);
		},
		toggle(name, force) {
			const shouldAdd = force ?? !this.contains(name);
			if (shouldAdd) this.add(name);
			else this.remove(name);
			return shouldAdd;
		},
	};
}

function toDatasetKey(name) {
	return name
		.replace(/^data-/, "")
		.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function matchSelector(element, selector) {
	const attrMatch = selector.match(
		/\[data-([a-z-]+)(?:=["']([^"']*)["'])?\]/,
	);
	const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
	if (classMatch && !element.classList.contains(classMatch[1])) return false;
	if (attrMatch) {
		const key = toDatasetKey(`data-${attrMatch[1]}`);
		if (!(key in element.dataset)) return false;
		if (attrMatch[2] !== undefined && element.dataset[key] !== attrMatch[2]) return false;
	}
	return Boolean(classMatch || attrMatch);
}

function createElement(tagName) {
	const attributes = new Map();
	const listeners = new Map();
	const element = {
		tagName: String(tagName).toUpperCase(),
		children: [],
		parentNode: null,
		style: {},
		dataset: {},
		className: "",
		textContent: "",
		hidden: false,
		clientWidth: 0,
		clientHeight: 0,
		offsetWidth: 0,
		offsetHeight: 0,
		classList: null,
		appendChild(child) {
			child.parentNode = this;
			this.children.push(child);
			return child;
		},
		append(...childrenToAppend) {
			for (const child of childrenToAppend) this.appendChild(child);
		},
		replaceChildren(...childrenToAppend) {
			for (const child of this.children) child.parentNode = null;
			this.children = [];
			this.append(...childrenToAppend);
		},
		remove() {
			if (!this.parentNode) return;
			const siblings = this.parentNode.children;
			const index = siblings.indexOf(this);
			if (index >= 0) siblings.splice(index, 1);
			this.parentNode = null;
		},
		setAttribute(name, value) {
			const text = String(value);
			attributes.set(name, text);
			if (name === "class") this.className = text;
			if (name.startsWith("data-")) this.dataset[toDatasetKey(name)] = text;
		},
		getAttribute(name) {
			return attributes.get(name) ?? null;
		},
		addEventListener(name, handler) {
			const handlers = listeners.get(name) ?? [];
			handlers.push(handler);
			listeners.set(name, handlers);
		},
		dispatchEvent(event) {
			event.target ??= this;
			for (const handler of listeners.get(event.type) ?? []) handler(event);
			return !event.defaultPrevented;
		},
		querySelectorAll(selector) {
			const matches = [];
			function visit(node) {
				if (matchSelector(node, selector)) matches.push(node);
				for (const child of node.children ?? []) visit(child);
			}
			for (const child of this.children) visit(child);
			return matches;
		},
		querySelector(selector) {
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
		createElementNS(_namespace, tagName) {
			return createElement(tagName);
		},
		addEventListener() {},
		removeEventListener() {},
	};
	globalThis.window = {};
	globalThis.requestAnimationFrame = (callback) => {
		callback();
		return 1;
	};
}

function createMouseEvent(type, overrides = {}) {
	return {
		type,
		clientX: 200,
		clientY: 50,
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

beforeEach(() => {
	installDomStub();
	tiles.length = 0;
	connections.length = 0;
});

describe("clampFloatingPosition", () => {
	test("keeps an in-bounds position unchanged", () => {
		expect(clampFloatingPosition(100, 80, 250, 120, 800, 600)).toEqual({
			x: 100,
			y: 80,
		});
	});

	test("clamps against the right and bottom edges", () => {
		expect(clampFloatingPosition(760, 580, 250, 120, 800, 600)).toEqual({
			x: 538,
			y: 468,
		});
	});

	test("clamps against the left and top edges", () => {
		expect(clampFloatingPosition(-40, -30, 250, 120, 800, 600)).toEqual({
			x: 12,
			y: 12,
		});
	});
});

describe("getConnectionPresentation", () => {
	const viewport = { panX: 0, panY: 0, zoom: 1 };
	const tiles = [
		{ id: "tile-a", x: 0, y: 0, width: 100, height: 100 },
		{ id: "tile-b", x: 300, y: 0, width: 100, height: 100 },
	];
	const connections = [
		{ id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" },
	];

	test("returns endpoint tiles and cable midpoint for a connection", () => {
		const result = getConnectionPresentation(
			"conn-ab",
			connections,
			tiles,
			viewport,
		);

		expect(result?.tileA.id).toBe("tile-a");
		expect(result?.tileB.id).toBe("tile-b");
		expect(result?.mid).toEqual({ x: 200, y: 50 });
		expect(result?.d).toBe("M 100 50 C 180 50, 220 50, 300 50");
	});

	test("returns null when the connection is missing", () => {
		expect(getConnectionPresentation("missing", connections, tiles, viewport))
			.toBeNull();
	});

	test("returns null when an endpoint tile is missing", () => {
		expect(getConnectionPresentation(
			"conn-ab",
			connections,
			tiles.slice(0, 1),
			viewport,
		)).toBeNull();
	});
});

describe("formatCableLabel", () => {
	test("normalizes and truncates cable labels", () => {
		expect(formatCableLabel("  review   loop  ")).toBe("review loop");
		expect(formatCableLabel("abcdefghijklmnopqrstuvwxyz", 8)).toBe("abcdefg…");
	});
});

describe("getCableLabelLayout", () => {
	test("centers readable labels near the cable midpoint", () => {
		const layout = getCableLabelLayout(
			"review",
			{ x: 200, y: 80 },
			800,
			600,
		);

		expect(layout.text).toBe("review");
		expect(layout.textX).toBeCloseTo(200, 1);
		expect(layout.y).toBe(56);
		expect(layout.height).toBe(18);
	});

	test("keeps labels inside the canvas viewport", () => {
		const layout = getCableLabelLayout(
			"a very long cable label near the edge",
			{ x: 2, y: 4 },
			240,
			160,
		);

		expect(layout.text).toBe("a very long cable label nea…");
		expect(layout.x).toBe(6);
		expect(layout.y).toBe(6);
		expect(layout.x + layout.width).toBeLessThanOrEqual(234);
	});
});

describe("getCableHitStrokeWidth", () => {
	test("keeps cable hit targets generous at required zoom checkpoints", () => {
		expect(getCableHitStrokeWidth(0.5)).toBe(30);
		expect(getCableHitStrokeWidth(1)).toBe(24);
		expect(getCableHitStrokeWidth(1.5)).toBe(20);
	});

	test("adds selected hit affordance without trusting CSS fallback", () => {
		expect(getCableHitStrokeWidth(0.5, { selected: true })).toBe(34);
		expect(getCableHitStrokeWidth(1, { selected: true })).toBe(28);
		expect(getCableHitStrokeWidth(1.5, { selected: true })).toBe(24);
	});

	test("handles invalid zoom values conservatively", () => {
		expect(getCableHitStrokeWidth(0)).toBe(24);
		expect(getCableHitStrokeWidth(Number.NaN)).toBe(24);
	});
});

describe("getCableRenderDescriptors", () => {
	const tiles = [
		{ id: "tile-a", x: 0, y: 0, width: 100, height: 100 },
		{ id: "tile-b", x: 300, y: 0, width: 100, height: 100 },
	];

	test("describes visible cable paths, hit targets, and labels", () => {
		const [descriptor] = getCableRenderDescriptors({
			connectionList: [
				{
					id: "conn-ab",
					tileAId: "tile-a",
					tileBId: "tile-b",
					label: "review handoff",
				},
			],
			tileList: tiles,
			viewport: { panX: 0, panY: 0, zoom: 1.5 },
			selectedConnectionId: "conn-ab",
			viewportWidth: 800,
			viewportHeight: 600,
		});

		expect(descriptor.conn.id).toBe("conn-ab");
		expect(descriptor.tileA.id).toBe("tile-a");
		expect(descriptor.tileB.id).toBe("tile-b");
		expect(descriptor.d).toBe("M 150 75 C 270 75, 330 75, 450 75");
		expect(descriptor.selected).toBe(true);
		expect(descriptor.hitStrokeWidth).toBe(24);
		expect(descriptor.labelLayout?.text).toBe("review handoff");
	});

	test("skips connections with missing endpoints", () => {
		const descriptors = getCableRenderDescriptors({
			connectionList: [
				{ id: "conn-missing", tileAId: "tile-a", tileBId: "tile-missing" },
			],
			tileList: tiles,
			viewport: { panX: 0, panY: 0, zoom: 1 },
		});

		expect(descriptors).toEqual([]);
	});
});

describe("shouldSubmitCableMessage", () => {
	test("submits only deliberate modified Enter", () => {
		expect(shouldSubmitCableMessage({
			key: "Enter",
			ctrlKey: true,
			metaKey: false,
		})).toBe(true);
		expect(shouldSubmitCableMessage({
			key: "Enter",
			ctrlKey: false,
			metaKey: true,
		})).toBe(true);
		expect(shouldSubmitCableMessage({
			key: "Enter",
			ctrlKey: false,
			metaKey: false,
		})).toBe(false);
		expect(shouldSubmitCableMessage({
			key: "a",
			ctrlKey: true,
			metaKey: false,
		})).toBe(false);
	});
});

describe("formatCableLogEntry", () => {
	test("formats sent relay entries for display", () => {
		expect(formatCableLogEntry({
			ok: true,
			fromLabel: "Worker",
			targetTileId: "tile-b",
			routeMethod: "manual",
			formatted: "[Worker]: done",
		})).toEqual({
			ok: true,
			label: "Worker",
			text: "[Worker]: done",
			detail: "manual / Worker -> tile-b",
		});
	});

	test("formats failed relay entries for display", () => {
		expect(formatCableLogEntry({
			ok: false,
			errorCode: "missing_pty",
			fromLabel: "Worker",
			targetLabel: "Reviewer",
			routeMethod: "agent",
			message: "Target exited",
		})).toEqual({
			ok: false,
			label: "missing_pty",
			text: "Target exited",
			detail: "agent / Worker -> @Reviewer / missing_pty",
		});
	});
});

describe("formatCableLogDetail", () => {
	test("falls back when route fields are missing", () => {
		expect(formatCableLogDetail({
			ok: false,
			errorCode: "no_route",
		})).toBe("manual / unknown -> unresolved / no_route");
	});
});

describe("getCableEndpointStatus", () => {
	test("marks attached terminal endpoints as sendable", () => {
		expect(getCableEndpointStatus({
			id: "tile-a",
			ptySessionId: "session-a",
		})).toEqual({
			label: "ready",
			tone: "ok",
			sendable: true,
		});
	});

	test("surfaces missing and errored PTYs", () => {
		expect(getCableEndpointStatus({ id: "tile-a" })).toEqual({
			label: "no PTY",
			tone: "error",
			sendable: false,
			message: "No active PTY session is attached.",
		});

		expect(getCableEndpointStatus({
			id: "tile-b",
			ptySessionId: "session-b",
			ptyStatus: "error",
			ptyError: "spawn ENOENT",
		})).toEqual({
			label: "error",
			tone: "error",
			sendable: false,
			message: "spawn ENOENT",
		});
	});
});

describe("formatCableEndpointSummary", () => {
	test("includes route handles and status for inspector rows", () => {
		expect(formatCableEndpointSummary({
			id: "tile-a",
			routeHandle: "worker-a",
			ptySessionId: "session-a",
			ptyStatus: "running",
		}, "From")).toEqual({
			label: "From @worker-a",
			status: "running",
			tone: "ok",
			message: "",
			sendable: true,
		});
	});
});

describe("formatCableRelayFailure", () => {
	test("adds target health to failed relay messages", () => {
		expect(formatCableRelayFailure(
			{ ok: false, message: "Target session is not active." },
			{ id: "tile-b" },
		)).toBe(
			"Target session is not active. Target status: No active PTY session is attached.",
		);
	});

	test("keeps the structured relay message when target is healthy", () => {
		expect(formatCableRelayFailure(
			{ ok: false, message: "No route." },
			{ id: "tile-b", ptySessionId: "session-b" },
		)).toBe("No route.");
	});
});

describe("getCableRelayResultFeedback", () => {
	test("keeps manual drafts open and focused after failed relay", () => {
		expect(getCableRelayResultFeedback(
			{ ok: false, message: "Target session is not active." },
			{ id: "tile-b" },
			{ clearInputOnSuccess: true, focusInputOnFailure: true },
		)).toEqual({
			ok: false,
			relayState: "failed",
			status: "Target session is not active. Target status: No active PTY session is attached.",
			statusKind: "error",
			shouldClearInput: false,
			shouldFocusInput: true,
			shouldRemovePopover: false,
		});
	});

	test("clears drafts and closes popover only after successful relay", () => {
		expect(getCableRelayResultFeedback(
			{ ok: true, message: "Relay sent" },
			{ id: "tile-b", ptySessionId: "session-b" },
			{ clearInputOnSuccess: true, focusInputOnFailure: true },
		)).toEqual({
			ok: true,
			relayState: "sent",
			status: "",
			statusKind: "",
			shouldClearInput: true,
			shouldFocusInput: false,
			shouldRemovePopover: true,
		});
	});
});

describe("getCableSendBlockMessage", () => {
	test("returns null for sendable terminal endpoints", () => {
		expect(getCableSendBlockMessage({
			id: "tile-b",
			userTitle: "Reviewer",
			ptySessionId: "session-b",
		}, (tile) => tile.userTitle)).toBeNull();
	});

	test("explains why the inspector should block sends to unhealthy endpoints", () => {
		expect(getCableSendBlockMessage({
			id: "tile-b",
			userTitle: "Reviewer",
			ptyStatus: "exited",
		}, (tile) => tile.userTitle)).toBe(
			"Reviewer cannot receive yet. Terminal session has exited.",
		);

		expect(getCableSendBlockMessage(null)).toBe(
			"Target cannot receive yet. No active PTY session.",
		);
	});
});

describe("getDirectedCableTiles", () => {
	const tileA = { id: "tile-a" };
	const tileB = { id: "tile-b" };

	test("returns A to B by default", () => {
		expect(getDirectedCableTiles("AtoB", tileA, tileB)).toEqual({
			fromTile: tileA,
			toTile: tileB,
		});
	});

	test("returns B to A when direction is reversed", () => {
		expect(getDirectedCableTiles("BtoA", tileA, tileB)).toEqual({
			fromTile: tileB,
			toTile: tileA,
		});
	});
});

describe("getCableDefaultDirection", () => {
	const viewport = { panX: 0, panY: 0, zoom: 1 };
	const tileA = { id: "tile-a", x: 0, y: 0, width: 100, height: 100 };
	const tileB = { id: "tile-b", x: 300, y: 0, width: 100, height: 100 };

	test("uses the focused endpoint as the source", () => {
		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			focusedTileId: "tile-b",
			pointerX: 80,
			pointerY: 50,
		})).toBe("BtoA");

		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			focusedTileId: "tile-a",
			pointerX: 350,
			pointerY: 50,
		})).toBe("AtoB");
	});

	test("falls back to the endpoint nearest the click", () => {
		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			pointerX: 340,
			pointerY: 50,
		})).toBe("BtoA");

		expect(getCableDefaultDirection({
			tileA,
			tileB,
			viewport,
			pointerX: 60,
			pointerY: 50,
		})).toBe("AtoB");
	});

	test("defaults to A to B without usable focus or pointer data", () => {
		expect(getCableDefaultDirection({ tileA, tileB }))
			.toBe("AtoB");
		expect(getCableDefaultDirection()).toBe("AtoB");
	});
});

describe("getRetryCableRelayRequest", () => {
	const conn = { id: "conn-ab", tileAId: "tile-a", tileBId: "tile-b" };
	const tileA = { id: "tile-a", userTitle: "Worker", ptySessionId: "session-a" };
	const tileB = { id: "tile-b", userTitle: "Reviewer", ptySessionId: "session-b" };
	const labelFor = (tile) => tile.userTitle || tile.id;

	test("builds a cable-bounded retry request from a failed entry", () => {
		expect(getRetryCableRelayRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: "please retry",
		}, conn, tileA, tileB, labelFor)).toEqual({
			connectionId: "conn-ab",
			fromTileId: "tile-a",
			fromLabel: "Worker",
			targetTileId: "tile-b",
			targetSessionId: "session-b",
			text: "please retry",
		});
	});

	test("rejects entries that cannot be retried on this cable", () => {
		expect(getRetryCableRelayRequest({
			ok: true,
			fromTileId: "tile-a",
			targetTileId: "tile-b",
			text: "sent",
		}, conn, tileA, tileB, labelFor)).toBeNull();
		expect(getRetryCableRelayRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: null,
			text: "missing target",
		}, conn, tileA, tileB, labelFor)).toBeNull();
		expect(getRetryCableRelayRequest({
			ok: false,
			fromTileId: "tile-a",
			targetTileId: "tile-c",
			text: "off cable",
		}, conn, tileA, tileB, labelFor)).toBeNull();
	});
});

describe("formatCableContextRelay", () => {
	test("wraps preview text for cable relay", () => {
		expect(formatCableContextRelay({ text: "## Context" })).toBe(
			"--- Shared Context ---\n## Context\n--- End Context ---",
		);
	});

	test("returns empty string for empty preview text", () => {
		expect(formatCableContextRelay({ text: "   " })).toBe("");
	});
});

describe("createCableOverlay interactions", () => {
	function setupOverlay(options = {}) {
		const container = document.createElement("div");
		container.clientWidth = 800;
		container.clientHeight = 600;
		document.body.appendChild(container);
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
		const focusedTileIds = [];
		const removedConnections = [];
		const notifications = [];
		const sendRequests = [];
		const overlay = createCableOverlay({
			containerEl: container,
			viewportState: { panX: 0, panY: 0, zoom: 1 },
			onSendMessage: options.onSendMessage ?? (async (request) => {
				sendRequests.push(request);
				return { ok: true };
			}),
			onGetLog: async () => [],
			onNotify: (message, tone) => notifications.push({ message, tone }),
			onFocusTile: (id) => focusedTileIds.push(id),
			onRemoveConnection: (id) => removedConnections.push(id),
			onUpdateLabel: () => {},
			onGetFocusedTileId: () => null,
		});
		overlay.update();
		return {
			container,
			overlay,
			focusedTileIds,
			notifications,
			removedConnections,
			sendRequests,
		};
	}

	test("opens the cable popover from the SVG hit path", () => {
		const { container, focusedTileIds } = setupOverlay();
		const hit = container.querySelector(".cable-hit");
		expect(hit?.getAttribute("data-conn-id")).toBe("conn-ab");
		expect(hit?.style.strokeWidth).toBe("24px");

		const event = createMouseEvent("click");
		hit.dispatchEvent(event);

		expect(event.propagationStopped).toBe(true);
		const popover = container.querySelector(".cable-popover");
		expect(popover).toBeTruthy();
		expect(popover.querySelector(".cable-dir-btn")?.textContent)
			.toBe("Worker → Reviewer");
		expect(popover.querySelectorAll(".cable-endpoint-row")).toHaveLength(2);

		const [focusWorker] = popover.querySelectorAll(".cable-action-btn");
		focusWorker.dispatchEvent(createMouseEvent("click"));
		expect(focusedTileIds).toEqual(["tile-a"]);
	});

	test("opens the cable context menu from the SVG hit path", () => {
		const { container, removedConnections } = setupOverlay();
		const hit = container.querySelector(".cable-hit");
		const event = createMouseEvent("contextmenu", { clientX: 240, clientY: 80 });

		hit.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		expect(event.propagationStopped).toBe(true);
		const menu = document.body.querySelector(".cable-context-menu");
		expect(menu).toBeTruthy();
		expect(menu.querySelectorAll(".cable-menu-item")).toHaveLength(2);

		const [removeItem] = menu.querySelectorAll(".cable-menu-item");
		removeItem.dispatchEvent(createMouseEvent("click"));
		expect(removedConnections).toEqual(["conn-ab"]);
	});

	test("opens the cable context menu from the public overlay API", () => {
		const { overlay, removedConnections } = setupOverlay();

		expect(overlay.openContextMenu("conn-ab", 120, 90)?.id).toBe("conn-ab");
		const menu = document.body.querySelector(".cable-context-menu");
		expect(menu).toBeTruthy();

		const [removeItem] = menu.querySelectorAll(".cable-menu-item");
		removeItem.dispatchEvent(createMouseEvent("click"));
		expect(removedConnections).toEqual(["conn-ab"]);
	});

	test("returns null when opening a context menu for a missing connection", () => {
		const { overlay } = setupOverlay();
		expect(overlay.openContextMenu("missing", 120, 90)).toBeNull();
	});

	test("keeps the draft and shows status when manual relay fails", async () => {
		const { container, notifications, sendRequests } = setupOverlay({
			onSendMessage: async (request) => {
				sendRequests.push(request);
				return {
					ok: false,
					errorCode: "missing_pty",
					message: "Target PTY session is not active.",
				};
			},
		});
		container.querySelector(".cable-hit").dispatchEvent(createMouseEvent("click"));
		const popover = container.querySelector(".cable-popover");
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
});
