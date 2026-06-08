import { ipcMain } from "electron";
import { registerHerdrPaneLink } from "./herdr-routes";
import { normalizeHerdrSpawnInput } from "./herdr-spawn-input";
import { spawnHerdrRoleSession } from "./herdr-session-spawn";

export function registerHerdrSpawnHandlers(): void {
  ipcMain.handle("herdr:spawn-role", async (_event, input: unknown) => {
    const request = normalizeHerdrSpawnInput(input);
    const result = await spawnHerdrRoleSession(request);
    registerHerdrPaneLink(request.tileId, result.herdrPaneId);
    return result;
  });
}
