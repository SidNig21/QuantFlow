import { ipcMain } from "electron";
import { ensureEnvoyListener } from "./envoy-listener";
import { getEnvoyService } from "./envoy-service";
import { postEnvoySpawnStarted } from "./envoy-spawn-lifecycle";
import { appendEvent } from "./runtime-state/events-repo";
import { registerHerdrPaneLink } from "./herdr-routes";
import { spawnHerdrRoleSession } from "./herdr-session-spawn";
import { normalizeHerdrSpawnInput } from "./herdr-spawn-input";
import { readVaultConfig } from "./vault-config";
import { ensureObsidianEnvoyMirror } from "./obsidian-envoy-mirror";
import { getRole } from "./role-service";
import { getEnvoyTask } from "./runtime-state/envoy-repo";
import {
  buildCodexWorkerCommand,
  buildWorkflowActivationLine,
  readCanvasSkill,
} from "./workflow-service";

export function registerHerdrSpawnHandlers(): void {
  ipcMain.handle("herdr:spawn-role", async (_event, input: unknown) => {
    const request = normalizeHerdrSpawnInput(input);
    const role = await getRole(request.roleId);
    const canvasId = request.canvasId ?? "main";
    let spawnRequest = { ...request };
    let envoySpaceId: string | undefined;

    if (role?.envoyProfile) {
      const space = await getEnvoyService().ensureEnvoySpace({
        canvasId,
        workspaceId: request.workspaceId,
      });
      envoySpaceId = space.envoy_space_id ?? undefined;
      if (envoySpaceId) {
        ensureEnvoyListener(envoySpaceId);
        const cfg = await readVaultConfig();
        await ensureObsidianEnvoyMirror({
          canvasId,
          envoySpaceId,
          vaultPath: cfg.vaultPath,
        });
        spawnRequest = {
          ...spawnRequest,
          envoySpaceId,
          envoyProfile: role.envoyProfile,
          envoyWrapCommand: role.envoyWrapCommand ?? false,
        };
      }
    }

    let workflowSkill: Awaited<ReturnType<typeof readCanvasSkill>> | undefined;
    if (request.workflowTaskId && request.workflowCorrelationId) {
      const cfg = await readVaultConfig();
      workflowSkill = await readCanvasSkill({ vaultPath: cfg.vaultPath });
      const workflowTask = getEnvoyTask(request.workflowTaskId);
      const workflowEnvoySpaceId = workflowTask?.envoy_space_id
        ?? request.workflowEnvoySpaceId
        ?? envoySpaceId;
      if (workflowEnvoySpaceId) {
        ensureEnvoyListener(workflowEnvoySpaceId);
        await ensureObsidianEnvoyMirror({
          canvasId: workflowTask?.canvas_id ?? canvasId,
          envoySpaceId: workflowEnvoySpaceId,
          vaultPath: cfg.vaultPath,
        });
      }
      if (request.roleId === "codex") {
        spawnRequest = {
          ...spawnRequest,
          commandTemplate: buildCodexWorkerCommand({
            command: request.commandTemplate ?? "codex",
            taskId: request.workflowTaskId,
            correlationId: request.workflowCorrelationId,
            canvasId: workflowTask?.canvas_id ?? canvasId,
            envoySpaceId: workflowEnvoySpaceId,
            claimingTileId: request.tileId,
            skillPath: workflowSkill.path,
          }),
          startupPrompt: undefined,
          postLaunchPrompt: undefined,
        };
      } else {
        spawnRequest.postLaunchPrompt = buildWorkflowActivationLine({
          taskId: request.workflowTaskId,
          correlationId: request.workflowCorrelationId,
          canvasId: workflowTask?.canvas_id ?? canvasId,
          envoySpaceId: workflowEnvoySpaceId,
          claimingTileId: request.tileId,
          skillPath: workflowSkill.path,
        });
      }
    }

    const result = await spawnHerdrRoleSession(spawnRequest);
    registerHerdrPaneLink(request.tileId, result.herdrPaneId);

    if (spawnRequest.postLaunchPrompt && request.workflowTaskId && request.workflowCorrelationId) {
      appendEvent({
        kind: "workflow.context.injected",
        taskId: request.workflowTaskId,
        correlationId: request.workflowCorrelationId,
        data: {
          herdr_pane_id: result.herdrPaneId,
          skill_path: workflowSkill?.path,
          skill_truncated: workflowSkill?.truncated,
          via_spawn: true,
        },
      });
      appendEvent({
        kind: "workflow.activated",
        taskId: request.workflowTaskId,
        correlationId: request.workflowCorrelationId,
        data: {
          herdr_pane_id: result.herdrPaneId,
          command: request.commandTemplate ?? "hermes",
          via_spawn: true,
        },
      });
    }

    if (envoySpaceId && role?.envoyProfile) {
      try {
        await getEnvoyService().ensureEnvoyProfileInSpace({
          envoySpaceId,
          profile: role.envoyProfile,
        });
        await postEnvoySpawnStarted({
          envoySpaceId,
          envoyProfile: role.envoyProfile,
          tileId: request.tileId,
          roleId: request.roleId,
          roleName: request.roleName,
          herdrPaneId: result.herdrPaneId,
          command: request.commandTemplate,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        appendEvent({
          kind: "envoy.spawn.notify_failed",
          level: "warn",
          tileId: request.tileId,
          data: {
            role_id: request.roleId,
            envoy_space_id: envoySpaceId,
            envoy_profile: role.envoyProfile,
            error: message,
          },
        });
      }
    }

    return result;
  });
}
