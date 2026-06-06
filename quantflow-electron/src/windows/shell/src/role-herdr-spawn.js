/**
 * @param {import("../../../main/role-service.ts").Role | null | undefined} role
 */
export function requiresHerdrSpawn(role) {
	return role?.runtimeTarget === "herdr-wsl";
}
