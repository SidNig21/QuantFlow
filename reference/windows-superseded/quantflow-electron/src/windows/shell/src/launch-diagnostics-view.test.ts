import { describe, expect, test } from "bun:test";
import {
	createPtyStartFailureDiagnostic,
	createPtyRestoreFailureDiagnostic,
} from "./launch-diagnostics-view.js";

describe("launch diagnostics view", () => {
	test("creates a PTY start failure diagnostic", () => {
		expect(createPtyStartFailureDiagnostic(
			{ message: "spawn ENOENT", tileId: "tile-a" },
			{ id: "tile-a", userTitle: "Reviewer" },
		)).toMatchObject({
			id: "pty-start-failed:tile-a",
			severity: "error",
			title: "PTY start failed",
			message: "Reviewer: spawn ENOENT",
		});
	});

	test("creates a PTY restore failure diagnostic", () => {
		expect(createPtyRestoreFailureDiagnostic(
			{ message: "session gone", tileId: "tile-b" },
			{ id: "tile-b", userTitle: "Worker" },
		)).toMatchObject({
			id: "pty-restore-failed:tile-b",
			title: "Terminal restore failed",
			message: "Worker: session gone",
		});
	});
});
