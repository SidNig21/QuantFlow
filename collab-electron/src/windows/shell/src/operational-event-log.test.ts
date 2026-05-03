import { describe, expect, test } from "bun:test";
import {
	createOperationalEventLog,
	normalizeOperationalEvent,
} from "./operational-event-log.js";

describe("normalizeOperationalEvent", () => {
	test("normalizes event fields", () => {
		expect(normalizeOperationalEvent({
			type: "role.failed",
			severity: "error",
			summary: "Codex missing command",
			detail: "codex was not found",
			meta: { roleId: "codex" },
		}, 123)).toMatchObject({
			type: "role.failed",
			severity: "error",
			timestamp: 123,
			summary: "Codex missing command",
			detail: "codex was not found",
			meta: { roleId: "codex" },
		});
	});

	test("defaults invalid severity and summary", () => {
		expect(normalizeOperationalEvent({
			type: "connection.created",
			severity: "loud",
			summary: "   ",
		}, 456)).toMatchObject({
			type: "connection.created",
			severity: "info",
			timestamp: 456,
			summary: "connection.created",
		});
	});
});

describe("createOperationalEventLog", () => {
	test("keeps newest events within the cap", () => {
		let timestamp = 0;
		const log = createOperationalEventLog({
			limit: 2,
			now: () => ++timestamp,
		});
		log.record({ type: "first" });
		log.record({ type: "second" });
		log.record({ type: "third" });

		expect(log.list().map((event) => event.type)).toEqual([
			"second",
			"third",
		]);
	});
});
