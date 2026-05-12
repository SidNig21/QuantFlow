import { describe, expect, test } from "bun:test";
import {
	createRouteHandle,
	ensureRouteHandle,
	getTileIdHandleSuffix,
	slugifyRouteHandle,
} from "./tile-route-handles.js";

describe("slugifyRouteHandle", () => {
	test("creates relay-safe handle bases from display text", () => {
		expect(slugifyRouteHandle("Codex Reviewer")).toBe("codex-reviewer");
		expect(slugifyRouteHandle("  Claude: Worker!  ")).toBe("claude-worker");
		expect(slugifyRouteHandle("")).toBe("terminal");
	});
});

describe("getTileIdHandleSuffix", () => {
	test("uses a short stable suffix from the tile id", () => {
		expect(getTileIdHandleSuffix({ id: "tile-abc-12345" })).toBe("12345");
		expect(getTileIdHandleSuffix({ id: "" })).toBe("local");
	});
});

describe("createRouteHandle", () => {
	test("uses title, role, auto title, then cwd as stable seed order", () => {
		expect(createRouteHandle({
			id: "tile-11111",
			userTitle: "Reviewer",
			roleId: "codex",
			autoTitle: "Shell",
			cwd: "/repo",
		})).toBe("reviewer-11111");

		expect(createRouteHandle({
			id: "tile-22222",
			roleId: "codex-reviewer",
			autoTitle: "Shell",
		})).toBe("codex-reviewer-22222");

		expect(createRouteHandle({
			id: "tile-33333",
			cwd: "/Users/rybow/QuantFlow",
		})).toBe("users-rybow-quantflow-33333");
	});

	test("adds a numeric suffix for rare route handle collisions", () => {
		expect(createRouteHandle({
			id: "tile-12345",
			userTitle: "Reviewer",
		}, [
			{ id: "other", routeHandle: "reviewer-12345" },
			{ id: "another", routeHandle: "reviewer-12345-2" },
		])).toBe("reviewer-12345-3");
	});
});

describe("ensureRouteHandle", () => {
	test("assigns handles only to terminal tiles", () => {
		const terminal = { id: "tile-abcde", type: "term", userTitle: "Worker" };
		expect(ensureRouteHandle(terminal)).toBe("worker-abcde");
		expect(terminal.routeHandle).toBe("worker-abcde");

		const note = { id: "note-abcde", type: "note", userTitle: "Notes" };
		expect(ensureRouteHandle(note)).toBeNull();
		expect(note).not.toHaveProperty("routeHandle");
	});

	test("does not rewrite an existing route handle after title changes", () => {
		const terminal = {
			id: "tile-abcde",
			type: "term",
			userTitle: "Worker",
			routeHandle: "worker-abcde",
		};
		terminal.userTitle = "Reviewer";

		expect(ensureRouteHandle(terminal)).toBe("worker-abcde");
		expect(terminal.routeHandle).toBe("worker-abcde");
	});
});
