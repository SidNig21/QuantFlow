import { ipcMain } from "electron";
import { registerMethod } from "./json-rpc-server";
import { listRoles, getRole } from "./role-service";

export function registerRoleServiceHandlers(): void {
  ipcMain.handle("roles:list", async () => {
    return listRoles();
  });

  ipcMain.handle("roles:get", async (_event, id: string) => {
    return getRole(id);
  });

  registerMethod(
    "role.list",
    () => listRoles(),
    {
      description: "List available QuantFlow terminal roles",
      params: {},
    },
  );

  registerMethod(
    "role.get",
    (params) => {
      const input = params as { id?: unknown } | null;
      return getRole(String(input?.id ?? ""));
    },
    {
      description: "Get one QuantFlow terminal role by ID",
      params: { id: "Role ID" },
    },
  );
}
