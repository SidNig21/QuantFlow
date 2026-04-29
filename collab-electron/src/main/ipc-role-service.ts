import { ipcMain } from "electron";
import { listRoles, getRole } from "./role-service";

export function registerRoleServiceHandlers(): void {
  ipcMain.handle("roles:list", async () => {
    return listRoles();
  });

  ipcMain.handle("roles:get", async (_event, id: string) => {
    return getRole(id);
  });
}
