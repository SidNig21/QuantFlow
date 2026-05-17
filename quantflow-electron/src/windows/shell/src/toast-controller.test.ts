import { describe, expect, test } from "bun:test";
import {
	createToastController,
	normalizeToast,
} from "./toast-controller.js";

function createElement(tagName: string) {
	const children: ReturnType<typeof createElement>[] = [];
	const listeners = new Map<string, () => void>();
	const attributes = new Map<string, string>();
	const el = {
		tagName: tagName.toUpperCase(),
		children,
		parentNode: null as null | ReturnType<typeof createElement>,
		className: "",
		dataset: {} as Record<string, string>,
		textContent: "",
		type: "",
		appendChild(child: ReturnType<typeof createElement>) {
			child.parentNode = el;
			children.push(child);
			return child;
		},
		remove() {
			if (!el.parentNode) return;
			const index = el.parentNode.children.indexOf(el);
			if (index >= 0) el.parentNode.children.splice(index, 1);
			el.parentNode = null;
		},
		setAttribute(name: string, value: string) {
			attributes.set(name, String(value));
		},
		getAttribute(name: string) {
			return attributes.get(name) ?? null;
		},
		addEventListener(name: string, handler: () => void) {
			listeners.set(name, handler);
		},
		dispatchEvent(event: Event) {
			listeners.get(event.type)?.();
			return true;
		},
		querySelector(selector: string): ReturnType<typeof createElement> | null {
			const className = selector.startsWith(".") ? selector.slice(1) : "";
			for (const child of children) {
				if (child.className === className) return child;
				const nested = child.querySelector(selector);
				if (nested) return nested;
			}
			return null;
		},
	};
	return el;
}

function createDocument() {
	return {
		body: createElement("body"),
		createElement,
	};
}

describe("normalizeToast", () => {
	test("normalizes a string toast", () => {
		expect(normalizeToast(" Saved ")).toEqual({
			message: "Saved",
			tone: "info",
			timeout: 3200,
			dismissible: true,
		});
	});

	test("keeps supported tones and clamps timeout", () => {
		expect(normalizeToast({
			message: "No route",
			tone: "warn",
			timeout: -10,
		})).toEqual({
			message: "No route",
			tone: "warn",
			timeout: 0,
			dismissible: true,
		});
	});

	test("keeps success and falls back from unsupported tones", () => {
		expect(normalizeToast({
			message: "Done",
			tone: "success",
			timeout: 100,
		})).toEqual({
			message: "Done",
			tone: "success",
			timeout: 100,
			dismissible: true,
		});
		expect(normalizeToast({
			message: "Odd",
			tone: "custom",
			dismissible: false,
		})).toEqual({
			message: "Odd",
			tone: "info",
			timeout: 3200,
			dismissible: false,
		});
	});

	test("creates dismissible stacked toasts", () => {
		const document = createDocument();
		const parent = document.createElement("div");
		const controller = createToastController({
			document,
			parent,
			maxVisible: 2,
		});

		controller.show({ message: "One", timeout: 0 });
		controller.show({ message: "Two", tone: "success", timeout: 0 });
		const third = controller.show({
			message: "Three",
			tone: "error",
			timeout: 0,
		});

		expect(controller.host.children.length).toBe(2);
		expect(controller.host.children[0].dataset.tone).toBe("success");
		expect(third?.getAttribute("role")).toBe("alert");

		const dismiss = third?.querySelector(".app-toast-dismiss");
		expect(dismiss).toBeTruthy();
		dismiss?.dispatchEvent(new Event("click"));
		expect(controller.host.children.length).toBe(1);
	});
});
