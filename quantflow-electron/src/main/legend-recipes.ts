import { readFile, readdir, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { HealthLevel } from "./diagnostics/types";
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
  DOCK_ACTOR_IDS,
  buildDockLegendRecipes,
} from "./dock-actors";

/** Built-in dock seed — four actors from dock-actors.ts. */
export const BUILT_IN_LEGEND_RECIPE_IDS = [...DOCK_ACTOR_IDS] as const;

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

export function resolveReadinessForRecipe(
  recipe: LegendRecipe,
  levelsByCapabilityId: ReadonlyMap<string, HealthLevel>,
): HealthLevel {
  const capabilityId = resolveRecipeCapabilityId(recipe);
  return levelsByCapabilityId.get(capabilityId) ?? "down";
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

export async function listLegendRecipesWithReadiness(): Promise<LegendRecipeListEntry[]> {
  const recipes = await listLegendRecipes();
  const preflight = await runPreflight();
  const levels = new Map<string, HealthLevel>();
  for (const probe of preflight.probes) {
    const capabilityId = typeof probe.detail?.capabilityId === "string"
      ? probe.detail.capabilityId
      : null;
    if (capabilityId) levels.set(capabilityId, probe.level);
  }
  return recipes.map((recipe) => {
    const readiness = resolveReadinessForRecipe(recipe, levels);
    return {
      ...recipe,
      readiness,
      readinessBadge: mapHealthLevelToBadge(readiness),
      capabilityId: resolveRecipeCapabilityId(recipe),
    };
  });
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
