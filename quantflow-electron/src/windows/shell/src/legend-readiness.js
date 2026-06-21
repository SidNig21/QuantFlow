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

export function resolveReadinessBadge(recipe, readinessByCapabilityId = {}) {
	const capabilityId = resolveRecipeCapabilityId(recipe);
	const level = readinessByCapabilityId[capabilityId] ?? "down";
	return mapHealthLevelToBadge(level);
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
