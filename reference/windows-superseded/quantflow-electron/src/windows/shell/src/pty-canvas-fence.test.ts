import { describe, expect, test } from "bun:test";
import {
	applyPtyCwdMilestone,
	applyTerminalStatusMilestones,
	extractOsc7CwdPaths,
	handlePtyExitMilestone,
	processPtyDataForCanvas,
} from "./pty-canvas-fence.js";

describe("pty-canvas-fence", () => {
	test("processPtyDataForCanvas is a no-op", () => {
		expect(
			processPtyDataForCanvas({
				sessionId: "s1",
				data: new Uint8Array([1, 2, 3]),
			}),
		).toEqual({ canvasEffects: 0 });
	});

	test("extractOsc7CwdPaths parses file URLs", () => {
		const data = `\x1b]7;file://host/home/user/proj\x07noise`;
		expect(extractOsc7CwdPaths(data)).toEqual(["/home/user/proj"]);
	});

	test("applyPtyCwdMilestone is edge-triggered", () => {
		const tile = { autoTitle: "/a", cwd: "/a" };
		let saves = 0;
		expect(
			applyPtyCwdMilestone(tile, "/a", {
				saveCanvasDebounced: () => {
					saves += 1;
				},
			}).applied,
		).toBe(false);
		expect(
			applyPtyCwdMilestone(tile, "/b", {
				saveCanvasDebounced: () => {
					saves += 1;
				},
			}).applied,
		).toBe(true);
		expect(saves).toBe(1);
		expect(tile.autoTitle).toBe("/b");
	});

	test("applyTerminalStatusMilestones batches cable sync", () => {
		const tile = { id: "t1", type: "term", ptyStatus: "idle" };
		let batches = 0;
		const result = applyTerminalStatusMilestones(
			[{ tileId: "t1", status: "running" }],
			{
				getTile: () => tile,
				onBatchChanged: () => {
					batches += 1;
				},
			},
		);
		expect(result.statusUpdates).toBe(1);
		expect(batches).toBe(1);
		expect(tile.ptyStatus).toBe("running");
	});

	test("handlePtyExitMilestone closes via callback", () => {
		const tiles = [
			{ id: "t1", type: "term", ptySessionId: "sess-1" },
		];
		const closed: string[] = [];
		const result = handlePtyExitMilestone(
			{ sessionId: "sess-1", exitCode: 0 },
			tiles,
			(id) => {
				closed.push(id);
			},
		);
		expect(result.closed).toBe(true);
		expect(closed).toEqual(["t1"]);
	});
});
