import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { AgentOsSoftware, Role, RoleRuntimeTarget } from "./role-service";
import type { AgentAdapter } from "./agent-adapter";
import {
  CLAUDE_NATIVE_TUI_ADAPTER,
  CODEX_NATIVE_TUI_ADAPTER,
  SERVER_AGENT_ADAPTER,
} from "./agent-adapter";
import type { DockActorId } from "./dock-catalog";

export interface DockActorLaunchProfile {
  id: DockActorId;
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

/** Override with QUANTFLOW_EVE_DIR when the Eve package is not ~/quantflow-eve. */
export function resolveDefaultEveCwd(): string {
  const fromEnv = process.env.QUANTFLOW_EVE_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), "quantflow-eve");
}

/** Resolve an Eve agent package folder (eve-agents/<id> under the repo by default). */
export function resolveEveAgentCwd(agentId: string): string {
  const fromEnv = process.env.QUANTFLOW_EVE_AGENTS_DIR?.trim();
  if (fromEnv) return join(resolve(fromEnv), agentId);

  const candidates: string[] = [];
  const addRoot = (root: string | undefined) => {
    const trimmed = root?.trim();
    if (!trimmed) return;
    const resolved = resolve(trimmed);
    candidates.push(join(resolved, "eve-agents", agentId));
    candidates.push(join(resolve(resolved, ".."), "eve-agents", agentId));
  };

  addRoot(process.env.QUANTFLOW_DEV_WORKTREE_ROOT);
  addRoot(process.env.COLLAB_DEV_WORKTREE_ROOT);
  addRoot(process.cwd());
  candidates.push(join(homedir(), "QuantFlow", "eve-agents", agentId));

  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates.find((candidate) => existsSync(candidate))
    ?? uniqueCandidates[0]
    ?? join(homedir(), "QuantFlow", "eve-agents", agentId);
}

// Secondary Eve personas stay on Eve's local rail until their own proofs land:
// local `npm run dev` in their package folder, authed by each package's
// .env.local. Main `eve` is the first AgentOS custom software proof.
const EVE_LOCAL_PROFILE = {
  runtimeTarget: "windows-pty" as const,
  commandTemplate: "npm run dev",
  agentAdapter: SERVER_AGENT_ADAPTER,
  cwdPolicy: "inherit" as const,
  defaultShell: "powershell" as const,
  modelHint: "deepseek-v4-pro",
};

export const DOCK_ACTOR_LAUNCH_PROFILES: readonly DockActorLaunchProfile[] = [
  {
    id: "pi-stick",
    runtimeTarget: "agentos",
    harnessKind: "agentos",
    agentosSoftware: "pi",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    startupPrompt: "You are Pi Stick — a minimal AgentOS projection witness. Reply briefly.",
  },
  {
    id: "codex",
    runtimeTarget: "windows-pty",
    agentAdapter: CODEX_NATIVE_TUI_ADAPTER,
    legacyRuntimeTarget: "agentos",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    startupPrompt: "Review the current task context and wait for QuantFlow operator instructions.",
    statusParser: {
      waiting: ["approval required", "continue?", "waiting for", "confirm"],
      blocked: ["error:", "failed:", "panic", "traceback"],
    },
    envoyProfile: "codex-agent",
  },
  {
    id: "claude",
    runtimeTarget: "windows-pty",
    agentAdapter: CLAUDE_NATIVE_TUI_ADAPTER,
    legacyRuntimeTarget: "agentos",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    startupPrompt: "Act as the implementation worker for this QuantFlow workspace.",
    statusParser: {
      waiting: ["do you want", "proceed?", "continue?", "yes/no"],
      blocked: ["error:", "failed:", "exception", "traceback"],
    },
    envoyProfile: "claude-worker",
  },
  {
    id: "hermes",
    runtimeTarget: "agentos",
    harnessKind: "agentos",
    agentosSoftware: "claude-code",
    legacyRuntimeTarget: "herdr-wsl",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    startupPrompt:
      "You are Hermes, the orchestrator lead on the QuantFlow canvas. Delegate work to worker sessions via AgentOS; wait for operator goals.",
    envoyProfile: "hermes-agent",
  },
  {
    id: "eve",
    runtimeTarget: "agentos",
    harnessKind: "agentos",
    agentosSoftware: "eve",
    cwdPolicy: "workspace",
    defaultShell: "auto",
    modelHint: "deepseek-v4-pro",
    envoyProfile: "eve-agent",
  },
  {
    id: "bovada-odds",
    ...EVE_LOCAL_PROFILE,
    resolveCwd: () => resolveEveAgentCwd("bovada-odds"),
    envoyProfile: "eve-bovada-odds",
  },
  {
    id: "canvas-scout",
    ...EVE_LOCAL_PROFILE,
    resolveCwd: () => resolveEveAgentCwd("canvas-scout"),
    modelHint: "deepseek-v4-flash",
    envoyProfile: "eve-canvas-scout",
  },
] as const;
