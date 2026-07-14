import { describe, expect, test } from "bun:test";

import { createProjectionReader } from "./projection.js";

function createMockSendQuery(
	impl?: (name: string, args: Record<string, unknown>) => Promise<unknown>,
) {
	const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const sendQuery = async (name: string, args: Record<string, unknown>) => {
		calls.push({ name, args });
		if (impl) return impl(name, args);
		return null;
	};
	return { sendQuery, calls };
}

describe("createProjectionReader", () => {
	test("readRegionList calls injected transport with kernel.workflow.region_list", async () => {
		const { sendQuery, calls } = createMockSendQuery(async () => [{ id: "r1" }]);
		const projection = createProjectionReader({ sendQuery });

		const regions = await projection.readRegionList();

		expect(calls).toEqual([{ name: "kernel.workflow.region_list", args: {} }]);
		expect(regions).toEqual([{ id: "r1" }]);
	});

	test("readCanvasSnapshot calls injected transport with kernel.canvas.snapshot", async () => {
		const { sendQuery, calls } = createMockSendQuery(async () => ({
			connections: [],
		}));
		const projection = createProjectionReader({ sendQuery });

		await projection.readCanvasSnapshot();

		expect(calls).toEqual([{ name: "kernel.canvas.snapshot", args: {} }]);
	});

	test("readStateCard passes tileId to kernel.state_card.get", async () => {
		const { sendQuery, calls } = createMockSendQuery(async () => ({ tileId: "t1" }));
		const projection = createProjectionReader({ sendQuery });

		await projection.readStateCard("t1");

		expect(calls).toEqual([
			{ name: "kernel.state_card.get", args: { tileId: "t1" } },
		]);
	});

	test("readConductorContext calls kernel.conductor.context", async () => {
		const { sendQuery, calls } = createMockSendQuery(async () => ({ workflow: null }));
		const projection = createProjectionReader({ sendQuery });

		await projection.readConductorContext();

		expect(calls).toEqual([{ name: "kernel.conductor.context", args: {} }]);
	});

	test("successful refreshWorkflowProjectionCache updates cache", async () => {
		const { sendQuery } = createMockSendQuery(async (name) => {
			if (name === "kernel.workflow.region_list") return [{ id: "region-a" }];
			if (name === "kernel.canvas.snapshot") {
				return {
					connections: [{ id: "c1", semanticType: "delegation" }],
				};
			}
			return null;
		});
		const projection = createProjectionReader({ sendQuery });

		await projection.refreshWorkflowProjectionCache();

		expect(projection.getRegions()).toEqual([{ id: "region-a" }]);
		expect(projection.getSnapshot()).toEqual({
			connections: [{ id: "c1", semanticType: "delegation" }],
		});
		expect(projection.getConnectionSemanticTypes().get("c1")).toBe("delegation");
	});

	test("failed refresh leaves last frame intact", async () => {
		let fail = false;
		const { sendQuery } = createMockSendQuery(async (name) => {
			if (name === "kernel.workflow.region_list") {
				if (fail) throw new Error("read failed");
				return [{ id: "stable" }];
			}
			if (name === "kernel.canvas.snapshot") {
				if (fail) throw new Error("read failed");
				return { connections: [{ id: "c1", semanticType: "manual_connection" }] };
			}
			return null;
		});
		const projection = createProjectionReader({ sendQuery });

		await projection.refreshWorkflowProjectionCache();
		expect(projection.getRegions()).toEqual([{ id: "stable" }]);

		fail = true;
		await projection.refreshWorkflowProjectionCache();
		expect(projection.getRegions()).toEqual([{ id: "stable" }]);
		expect(projection.getConnectionSemanticTypes().get("c1")).toBe(
			"manual_connection",
		);
	});

	test("refreshWorkflowProjectionCache returns false without transport", async () => {
		const projection = createProjectionReader({ sendQuery: undefined });
		expect(await projection.refreshWorkflowProjectionCache()).toBe(false);
	});

	test("read functions return null without transport", async () => {
		const projection = createProjectionReader({});
		expect(await projection.readRegionList()).toBeNull();
		expect(await projection.readCanvasSnapshot()).toBeNull();
		expect(await projection.readStateCard("t1")).toBeNull();
		expect(await projection.readConductorContext()).toBeNull();
	});

	test("exports no mutation surface", () => {
		const reader = createProjectionReader({ sendQuery: async () => null });
		const keys = Object.keys(reader).sort();
		expect(keys).toEqual([
			"getConnectionSemanticTypes",
			"getRegions",
			"getSnapshot",
			"readCanvasSnapshot",
			"readConductorContext",
			"readRegionList",
			"readStateCard",
			"refreshWorkflowProjectionCache",
		]);
	});
});
