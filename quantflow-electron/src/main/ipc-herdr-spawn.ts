import { ipcMain } from "electron";
import { ensureEnvoyListener } from "./envoy-listener";
import { getEnvoyService } from "./envoy-service";
import { postEnvoySpawnStarted } from "./envoy-spawn-lifecycle";
import { registerHerdrPaneLink } from "./herdr-routes";
import { spawnHerdrRoleSession } from "./herdr-session-spawn";
import { normalizeHerdrSpawnInput } from "./herdr-spawn-input";
import { readVaultConfig } from "./vault-config";
import { ensureObsidianEnvoyMirror } from "./obsidian-envoy-mirror";
import { getRole } from "./role-service";

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

    const result = await spawnHerdrRoleSession(spawnRequest);
    registerHerdrPaneLink(request.tileId, result.herdrPaneId);

    if (envoySpaceId && role?.envoyProfile) {
      await postEnvoySpawnStarted({
        envoySpaceId,
        envoyProfile: role.envoyProfile,
        tileId: request.tileId,
        roleId: request.roleId,
        roleName: request.roleName,
        herdrPaneId: result.herdrPaneId,
        command: request.commandTemplate,
      });
    }

    return result;
  });
}
