/**
 * QF Dock — canonical actor roster (single source of truth).
 *
 * Agent actors (Claude/Codex/Hermes) run as AgentOS sessions on the canvas.
 * Scripts use herdr-wsl; Eve personas use windows-pty.
 */

import type { AgentOsSoftware, Role, RoleRuntimeTarget } from "./role-service";
import type { AgentAdapter } from "./agent-adapter";
import { resolveRoleLaunchFields } from "./agent-adapter";
import { DOCK_ACTOR_CATALOG, DOCK_ACTOR_IDS } from "./dock-catalog";
import type { DockActorId, DockActorKind } from "./dock-catalog";
import {
  DOCK_ACTOR_LAUNCH_PROFILES,
  resolveDefaultEveCwd,
  resolveEveAgentCwd,
} from "./launch-profiles";

export { DOCK_ACTOR_IDS };
export type { DockActorId, DockActorKind };


/** One row in the spawn rail — maps 1:1 to a Role and LegendRecipe. */
export interface DockActorDefinition {
  id: DockActorId;
  name: string;
  /** Long description (settings, tooltips). */
  description: string;
  /** Short subtitle under the name in QF Dock. */
  dockSubtitle: string;
  color: string;
  /** Hex for role registry / readiness (legend may use CSS var separately). */
  roleColor: string;
  icon: string;
  kind: DockActorKind;
  runtimeTarget: RoleRuntimeTarget;
  harnessKind?: Role["harnessKind"];
  agentosSoftware?: AgentOsSoftware;
  agentosInstruction?: string;
  commandTemplate?: string;
  /** Static cwd, or resolved at read time (Eve package folder). */
  resolveCwd?: () => string;
  cwdPolicy?: Role["cwdPolicy"];
  defaultShell?: Role["defaultShell"];
  systemPrompt?: string;
  startupPrompt?: string;
  legacyRuntimeTarget?: RoleRuntimeTarget;
  envoyProfile?: string;
  modelHint?: string;
  statusParser?: Role["statusParser"];
  /** How to run and message this agent over the tile PTY. */
  agentAdapter?: AgentAdapter;
}

export { resolveDefaultEveCwd, resolveEveAgentCwd };

const LAUNCH_PROFILE_BY_ID = new Map(
  DOCK_ACTOR_LAUNCH_PROFILES.map((profile) => [profile.id, profile]),
);

export const DOCK_ACTORS: readonly DockActorDefinition[] = DOCK_ACTOR_CATALOG.map((catalog) => {
  const profile = LAUNCH_PROFILE_BY_ID.get(catalog.id);
  if (!profile) {
    throw new Error(`Missing launch profile for dock actor ${catalog.id}`);
  }
  return { ...catalog, ...profile };
});

const DOCK_ACTOR_BY_ID = new Map(DOCK_ACTORS.map((actor) => [actor.id, actor]));

export function getDockActor(id: string): DockActorDefinition | undefined {
  if (id === "claude-worker") return DOCK_ACTOR_BY_ID.get("claude");
  return DOCK_ACTOR_BY_ID.get(id as DockActorId);
}

function runtimeLabel(actor: DockActorDefinition): string {
  if (actor.harnessKind === "agentos") return "agentos";
  if (actor.runtimeTarget === "windows-pty") return "windows-pty";
  if (actor.runtimeTarget === "herdr-wsl") return "herdr-wsl";
  return actor.runtimeTarget;
}

export function getAgentAdapterForRole(
  roleId: string | undefined | null,
): AgentAdapter | null {
  if (!roleId?.trim()) return null;
  return getDockActor(roleId.trim())?.agentAdapter ?? null;
}

export function dockActorToRole(actor: DockActorDefinition): Role {
  const launchFields = resolveRoleLaunchFields(
    actor.agentAdapter,
    actor.startupPrompt,
    actor.commandTemplate ?? actor.agentAdapter?.launch,
  );

  return {
    id: actor.id,
    name: actor.name,
    description: actor.description,
    color: actor.roleColor,
    icon: actor.icon,
    commandTemplate: launchFields.commandTemplate,
    cwd: actor.resolveCwd?.(),
    cwdPolicy: actor.cwdPolicy,
    defaultShell: actor.defaultShell,
    runtimeTarget: actor.runtimeTarget,
    harnessKind: actor.harnessKind,
    agentosSoftware: actor.agentosSoftware,
    agentosInstruction: actor.agentosInstruction,
    legacyRuntimeTarget: actor.legacyRuntimeTarget,
    startupPrompt: launchFields.startupPrompt,
    systemPrompt: actor.systemPrompt,
    statusParser: actor.statusParser,
    envoyProfile: actor.envoyProfile,
    envoyWrapCommand: false,
    showInLegend: true,
    legendType: actor.kind,
    modelHint: actor.modelHint,
    agentAdapter: actor.agentAdapter,
  };
}

export function dockActorToLegendRecipe(actor: DockActorDefinition) {
  const type =
    actor.kind === "codex" ? "codex"
      : actor.kind === "eve" ? "eve"
        : actor.kind === "agent" ? "agent"
          : "worker";
  // Carry the SAME resolved launch fields the role gets (folded prompt for
  // promptArg agents like Claude), so a legend/recipe spawn is self-sufficient
  // even on the synthesize fallback path.
  const launchFields = resolveRoleLaunchFields(
    actor.agentAdapter,
    actor.startupPrompt,
    actor.commandTemplate ?? actor.agentAdapter?.launch,
  );

  return {
    id: actor.id,
    roleId: actor.id,
    group: "spawn",
    type,
    name: actor.name,
    description: actor.dockSubtitle,
    runtime: runtimeLabel(actor),
    color: actor.color,
    icon: actor.icon,
    commandTemplate: launchFields.commandTemplate,
    startupPrompt: launchFields.startupPrompt,
    agentAdapter: actor.agentAdapter,
    cwd: actor.resolveCwd?.(),
    runtimeTarget: actor.runtimeTarget,
    harnessKind: actor.harnessKind,
    agentosSoftware: actor.agentosSoftware,
    agentosInstruction: actor.agentosInstruction,
    modelHint: actor.modelHint,
  };
}

export function buildDockLegendRecipes() {
  return DOCK_ACTORS.map(dockActorToLegendRecipe);
}

export function buildDockRoles(): Role[] {
  return DOCK_ACTORS.map(dockActorToRole);
}
