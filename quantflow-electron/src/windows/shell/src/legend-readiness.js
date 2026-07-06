/** Pure readiness helpers — shared by legend-dock and tests. */

export function mapHealthLevelToBadge(level) {
	if (level === "healthy") return "green";
	if (level === "degraded") return "amber";
	return "red";
}

export function resolveRecipeCapabilityId(recipe) {
	if (recipe?.harnessKind === "eve-harness") return "provider:eve-openrouter";
	return `role:${recipe?.roleId ?? recipe?.id ?? "unknown"}`;
}

function worstHealthLevel(...levels) {
	if (levels.includes("down")) return "down";
	if (levels.includes("degraded")) return "degraded";
	return "healthy";
}

function harnessCapabilityId(recipe) {
	if (recipe?.runtimeTarget === "herdr-wsl" || recipe?.harnessKind === "herdr-shell") {
		return "harness:herdr-shell";
	}
	if (recipe?.runtimeTarget === "windows-pty") return "harness:local-shell";
	return null;
}

export function resolveReadinessLevel(recipe, readinessByCapabilityId = {}) {
	const roleLevel = readinessByCapabilityId[resolveRecipeCapabilityId(recipe)] ?? "down";
	const harnessId = harnessCapabilityId(recipe);
	if (!harnessId) return roleLevel;
	const harnessLevel = readinessByCapabilityId[harnessId] ?? "down";
	return worstHealthLevel(roleLevel, harnessLevel);
}

export function resolveReadinessBadge(recipe, readinessByCapabilityId = {}) {
	return mapHealthLevelToBadge(resolveReadinessLevel(recipe, readinessByCapabilityId));
}

export const LEGEND_ICON_OPTIONS = [
	"shell",
	"codex",
	"hermes",
	"claude",
	"puffer",
	"python",
	"memory",
];
