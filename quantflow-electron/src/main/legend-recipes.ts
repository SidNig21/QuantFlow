import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { HealthLevel } from "./diagnostics/types";
import type { ControllerHealth } from "./diagnostics/types";
import { runPreflight } from "./diagnostics/preflight";
import {
  listRoles,
  type AgentOsSoftware,
  type Role,
  type RoleRuntimeTarget,
  withRoleDiagnostics,
  _setRolesDir,
} from "./role-service";
import { QUANTFLOW_DIR } from "./paths";
import {
  DOCK_SPAWN_ACTOR_IDS,
  buildDockLegendRecipes,
} from "./dock-actors";

/** Verified built-in dock seed from DOCK_SPAWN_ACTOR_IDS. */
export const BUILT_IN_LEGEND_RECIPE_IDS = [...DOCK_SPAWN_ACTOR_IDS] as const;

export type LegendRecipeKind = "generic" | "codex" | "agent" | "worker" | "tool" | "memory" | "eve";

export interface LegendRecipe {
  id: string;
  roleId: string;
  group: "spawn";
  type: LegendRecipeKind;
  name: string;
  description: string;
  runtime: string;
  color: string;
  icon: string;
  disabled?: boolean;
  custom?: boolean;
  /** Mode-1 terminal spawn fields, copied verbatim from the role.json. */
  commandTemplate?: string;
  cwd?: string;
  runtimeTarget?: RoleRuntimeTarget;
  harnessKind?: "eve-harness" | "local-shell" | "herdr-shell" | "agentos";
  agentosSoftware?: AgentOsSoftware;
  agentosInstruction?: string;
  endpoint?: string;
  modelHint?: string;
}

export interface LegendRecipeCreateInput {
  id: string;
  name: string;
  roleId?: string;
  description?: string;
  color: string;
  icon: string;
  type?: LegendRecipeKind;
  commandTemplate?: string;
  cwd?: string;
  runtimeTarget?: RoleRuntimeTarget;
  defaultShell?: "auto" | "powershell" | "wsl" | "shell";
  startupPrompt?: string;
  harnessKind?: LegendRecipe["harnessKind"];
  agentosSoftware?: AgentOsSoftware;
  agentosInstruction?: string;
  endpoint?: string;
  modelHint?: string;
}

export interface LegendRecipeListEntry extends LegendRecipe {
  readiness: HealthLevel;
  readinessBadge: "green" | "amber" | "red";
  capabilityId: string;
}

export const BUILT_IN_LEGEND_RECIPES: LegendRecipe[] = buildDockLegendRecipes() as LegendRecipe[];

let rolesDir = join(QUANTFLOW_DIR, "roles");

export function _setLegendRegistryDirs(input: { rolesDir?: string }): void {
  if (input.rolesDir) {
    rolesDir = input.rolesDir;
    _setRolesDir(input.rolesDir);
  }
}

export function mapHealthLevelToBadge(level: HealthLevel): "green" | "amber" | "red" {
  if (level === "healthy") return "green";
  if (level === "degraded") return "amber";
  return "red";
}

export function resolveRecipeCapabilityId(recipe: Pick<LegendRecipe, "roleId" | "harnessKind">): string {
  if (recipe.harnessKind === "eve-harness") return "provider:eve-openrouter";
  return `role:${recipe.roleId}`;
}

function worstHealthLevel(...levels: HealthLevel[]): HealthLevel {
  if (levels.some((level) => level === "down")) return "down";
  if (levels.some((level) => level === "degraded")) return "degraded";
  return "healthy";
}

function harnessCapabilityId(
  recipe: Pick<LegendRecipe, "runtimeTarget" | "harnessKind">,
): string | null {
  if (recipe.runtimeTarget === "herdr-wsl" || recipe.harnessKind === "herdr-shell") {
    return "harness:herdr-shell";
  }
  if (recipe.runtimeTarget === "windows-pty") return "harness:local-shell";
  return null;
}

export function resolveReadinessForRecipe(
  recipe: LegendRecipe,
  levelsByCapabilityId: ReadonlyMap<string, HealthLevel>,
): HealthLevel {
  const roleLevel = levelsByCapabilityId.get(resolveRecipeCapabilityId(recipe)) ?? "down";
  const harnessId = harnessCapabilityId(recipe);
  if (!harnessId) return roleLevel;
  const harnessLevel = levelsByCapabilityId.get(harnessId) ?? "down";
  return worstHealthLevel(roleLevel, harnessLevel);
}

function runtimeLabelForRole(role: Role): string {
  if (role.harnessKind === "eve-harness") return "eve-harness";
  if (role.runtimeTarget === "agentos") return "agentos";
  if (role.runtimeTarget === "windows-pty") return "windows-pty";
  if (role.runtimeTarget === "herdr-wsl") return "herdr-wsl";
  return role.runtimeTarget ?? "local";
}

function roleToLegendRecipe(role: Role & {
  legendType?: LegendRecipeKind;
  harnessKind?: LegendRecipe["harnessKind"];
  endpoint?: string;
  modelHint?: string;
}): LegendRecipe {
  return {
    id: role.id,
    roleId: role.id,
    group: "spawn",
    type: role.legendType ?? (role.harnessKind === "eve-harness" ? "eve" : "tool"),
    name: role.name,
    description: role.description,
    runtime: runtimeLabelForRole(role),
    color: role.color,
    icon: role.icon ?? "shell",
    custom: true,
    commandTemplate: role.commandTemplate,
    cwd: role.cwd,
    runtimeTarget: role.runtimeTarget,
    harnessKind: role.harnessKind,
    agentosSoftware: role.agentosSoftware,
    agentosInstruction: role.agentosInstruction,
    endpoint: role.endpoint,
    modelHint: role.modelHint,
  };
}

async function readCustomLegendRoles(): Promise<LegendRecipe[]> {
  await mkdir(rolesDir, { recursive: true });
  const files = await readdir(rolesDir);
  const builtInIds = new Set<string>(BUILT_IN_LEGEND_RECIPE_IDS);
  const recipes: LegendRecipe[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(rolesDir, file), "utf-8");
      const parsed = JSON.parse(raw) as Role & {
        legendType?: LegendRecipeKind;
        showInLegend?: boolean;
        harnessKind?: LegendRecipe["harnessKind"];
        endpoint?: string;
        modelHint?: string;
      };
      if (!parsed.id || !parsed.name || !parsed.color) continue;
      if (builtInIds.has(parsed.id)) continue;
      if (parsed.showInLegend === false) continue;
      recipes.push(roleToLegendRecipe(parsed));
    } catch {
      // skip invalid custom role files
    }
  }
  return recipes.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listLegendRecipes(): Promise<LegendRecipe[]> {
  const customRoles = await readCustomLegendRoles();
  const extraById = new Map<string, LegendRecipe>();
  for (const recipe of customRoles) extraById.set(recipe.id, recipe);
  const builtInIds = new Set<string>(BUILT_IN_LEGEND_RECIPE_IDS);
  return [
    ...BUILT_IN_LEGEND_RECIPES,
    ...[...extraById.values()].filter((recipe) => !builtInIds.has(recipe.id)),
  ];
}

export interface LegendReadinessOptions {
  /** Full capability preflight can touch WSL/network; keep dock startup cheap. */
  runPreflight?: boolean;
  preflight?: ControllerHealth;
}

function readinessEntries(
  recipes: LegendRecipe[],
  levels: ReadonlyMap<string, HealthLevel> | null,
): LegendRecipeListEntry[] {
  return recipes.map((recipe) => {
    const readiness = levels
      ? resolveReadinessForRecipe(recipe, levels)
      : "degraded";
    return {
      ...recipe,
      readiness,
      readinessBadge: mapHealthLevelToBadge(readiness),
      capabilityId: resolveRecipeCapabilityId(recipe),
    };
  });
}

export async function listLegendRecipesWithReadiness(
  options: LegendReadinessOptions = {},
): Promise<LegendRecipeListEntry[]> {
  const recipes = await listLegendRecipes();
  if (options.runPreflight === false) {
    return readinessEntries(recipes, null);
  }
  const preflight = options.preflight ?? await runPreflight();
  const levels = new Map<string, HealthLevel>();
  for (const probe of preflight.probes) {
    const capabilityId = typeof probe.detail?.capabilityId === "string"
      ? probe.detail.capabilityId
      : null;
    if (capabilityId) levels.set(capabilityId, probe.level);
  }
  return readinessEntries(recipes, levels);
}

function assertCustomId(id: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error("legend recipe id must be lowercase kebab-case starting with a letter");
  }
  if ((BUILT_IN_LEGEND_RECIPE_IDS as readonly string[]).includes(id)) {
    throw new Error(`legend recipe id is reserved: ${id}`);
  }
}

export async function createLegendRecipe(input: LegendRecipeCreateInput): Promise<LegendRecipe> {
  assertCustomId(input.id);
  await mkdir(rolesDir, { recursive: true });

  // Every recipe — CLI, script, or Eve — is a single `roles/*.json` shape. An Eve
  // persona is just a role whose commandTemplate runs `npm run dev` in its package
  // `cwd` (see docs/v4/SPAWN_MODEL.md). The legend never owns a separate manifest.
  const role: Role & {
    legendType?: LegendRecipeKind;
    showInLegend: boolean;
    harnessKind?: LegendRecipe["harnessKind"];
    agentosSoftware?: AgentOsSoftware;
    agentosInstruction?: string;
    endpoint?: string;
    modelHint?: string;
  } = {
    id: input.id,
    name: input.name,
    description: input.description ?? input.commandTemplate ?? "custom agent",
    color: input.color,
    icon: input.icon,
    commandTemplate: input.commandTemplate,
    cwd: input.cwd,
    runtimeTarget: input.runtimeTarget ?? "herdr-wsl",
    startupPrompt: input.startupPrompt,
    cwdPolicy: "workspace",
    defaultShell: input.defaultShell ?? "auto",
    legendType: input.type ?? "tool",
    showInLegend: true,
    harnessKind: input.harnessKind
      ?? (input.runtimeTarget === "agentos" ? "agentos" : undefined),
    agentosSoftware: input.agentosSoftware,
    agentosInstruction: input.agentosInstruction,
    endpoint: input.endpoint,
    modelHint: input.modelHint,
  };
  await writeFile(join(rolesDir, `${input.id}.json`), `${JSON.stringify(role, null, 2)}\n`, "utf-8");
  return roleToLegendRecipe(withRoleDiagnostics(role));
}

// Operator-facing Path A card. The verified dock rail (DOCK_SPAWN_ACTOR_IDS)
// stays empty until U7 sign-off; until then this seeded custom recipe is the
// documented manual spawn path for AgentOS Eve. Mirrors the proven U4 proof
// recipe (agentos-eve-proof.ts) — the proof persists only into an isolated
// temp profile, so the operator's userData needs its own copy.
export const EVE_AGENTOS_RECIPE_ID = "eve-agentos";

export async function seedOperatorLegendRecipes(): Promise<boolean> {
  const existing = await listLegendRecipes();
  if (existing.some((recipe) => recipe.id === EVE_AGENTOS_RECIPE_ID)) return false;
  await createLegendRecipe({
    id: EVE_AGENTOS_RECIPE_ID,
    name: "Eve",
    description: "Eve on the AgentOS rail",
    color: "#8b5cf6",
    icon: "agentos",
    type: "agent",
    runtimeTarget: "agentos",
    harnessKind: "agentos",
    agentosSoftware: "eve",
  });
  return true;
}

export async function removeLegendRecipe(id: string): Promise<boolean> {
  assertCustomId(id);
  const rolePath = join(rolesDir, `${id}.json`);
  try {
    await rm(rolePath);
  } catch {
    throw new Error(`legend recipe not found: ${id}`);
  }
  return true;
}

export async function updateLegendRecipe(
  id: string,
  patch: Partial<LegendRecipeCreateInput>,
): Promise<LegendRecipe> {
  assertCustomId(id);
  const recipes = await listLegendRecipes();
  const existing = recipes.find((recipe) => recipe.id === id && recipe.custom);
  if (!existing) throw new Error(`custom legend recipe not found: ${id}`);
  const merged: LegendRecipeCreateInput = {
    id,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    color: patch.color ?? existing.color,
    icon: patch.icon ?? existing.icon,
    type: patch.type ?? existing.type,
    commandTemplate: patch.commandTemplate ?? existing.commandTemplate,
    cwd: patch.cwd ?? existing.cwd,
    runtimeTarget: patch.runtimeTarget ?? existing.runtimeTarget,
    defaultShell: patch.defaultShell,
    startupPrompt: patch.startupPrompt,
    harnessKind: patch.harnessKind ?? existing.harnessKind,
    agentosSoftware: patch.agentosSoftware ?? existing.agentosSoftware,
    agentosInstruction: patch.agentosInstruction ?? existing.agentosInstruction,
    endpoint: patch.endpoint ?? existing.endpoint,
    modelHint: patch.modelHint ?? existing.modelHint,
  };
  await removeLegendRecipe(id);
  return createLegendRecipe(merged);
}
