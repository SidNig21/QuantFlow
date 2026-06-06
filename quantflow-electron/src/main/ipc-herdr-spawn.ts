import { ipcMain } from "electron";
import { normalizeHerdrSpawnInput } from "./herdr-spawn-input";
import { spawnHerdrRoleSession } from "./herdr-session-spawn";

export function registerHerdrSpawnHandlers(): void {
  ipcMain.handle("herdr:spawn-role", async (_event, input: unknown) => {
    return spawnHerdrRoleSession(normalizeHerdrSpawnInput(input));
  });
}
