import { describe, expect, mock, test } from "bun:test";
import {
	closeConfirmationCopy,
	confirmTileClose,
	isRunningTerminalTile,
	shouldConfirmTileClose,
} from "./pty-close-confirmation.js";

describe("pty close confirmation", () => {
	test("detects running terminal tiles", () => {
		expect(isRunningTerminalTile({ type: "term", ptySessionId: "s1" })).toBe(true);
		expect(isRunningTerminalTile({ type: "term", ptySessionId: "s1", ptyStatus: "idle" })).toBe(false);
		expect(isRunningTerminalTile({ type: "note", ptySessionId: "s1" })).toBe(false);
	});

	test("allows shift bypass", () => {
		const tile = { type: "term", ptySessionId: "s1" };
		expect(shouldConfirmTileClose(tile, { shiftKey: false })).toBe(true);
		expect(shouldConfirmTileClose(tile, { shiftKey: true })).toBe(false);
	});

	test("formats and resolves confirmation", async () => {
		expect(closeConfirmationCopy({ userTitle: "Worker" }).message).toBe("Close Worker?");
		const showConfirmDialog = mock(async () => 1);
		await expect(confirmTileClose(
			{ type: "term", ptySessionId: "s1" },
			{ showConfirmDialog },
		)).resolves.toBe(true);
		expect(showConfirmDialog).toHaveBeenCalled();
	});
});
