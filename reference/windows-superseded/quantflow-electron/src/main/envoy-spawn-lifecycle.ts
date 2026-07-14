import { getEnvoyService } from "./envoy-service";

export interface EnvoySpawnLifecycleParams {
  envoySpaceId: string;
  envoyProfile: string;
  tileId: string;
  roleId: string;
  roleName: string;
  herdrPaneId: string;
  command?: string;
}

export async function postEnvoySpawnStarted(
  params: EnvoySpawnLifecycleParams,
): Promise<void> {
  const body = JSON.stringify({
    kind: "spawn.started",
    tile_id: params.tileId,
    role_id: params.roleId,
    role_name: params.roleName,
    herdr_pane_id: params.herdrPaneId,
    command: params.command ?? null,
    timestamp: new Date().toISOString(),
  });
  await getEnvoyService().sendMessage({
    envoySpaceId: params.envoySpaceId,
    body,
    profile: params.envoyProfile,
  });
}
