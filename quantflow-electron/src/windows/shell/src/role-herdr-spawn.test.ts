import { describe, expect, test } from "bun:test";
import { requiresHerdrSpawn } from "./role-herdr-spawn.js";

describe("requiresHerdrSpawn", () => {
	test("routes WSL agent roles through herdr via runtimeTarget", () => {
		expect(requiresHerdrSpawn({ runtimeTarget: "herdr-wsl" })).toBe(true);
		expect(requiresHerdrSpawn({ runtimeTarget: "windows-pty" })).toBe(false);
		expect(requiresHerdrSpawn({ id: "hermes" })).toBe(false);
		expect(requiresHerdrSpawn(null)).toBe(false);
	});
});
