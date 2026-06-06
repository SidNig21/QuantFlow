import { describe, expect, test } from "bun:test";
import { shouldSpawnRoleViaHerdr } from "./role-herdr-spawn.js";

describe("shouldSpawnRoleViaHerdr", () => {
	test("routes only Hermes through herdr for 2B", () => {
		expect(shouldSpawnRoleViaHerdr({ id: "hermes" })).toBe(true);
		expect(shouldSpawnRoleViaHerdr({ id: "codex" })).toBe(false);
		expect(shouldSpawnRoleViaHerdr({ id: "shell" })).toBe(false);
		expect(shouldSpawnRoleViaHerdr(null)).toBe(false);
	});
});
