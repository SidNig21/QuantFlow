import { ipcMain, type BrowserWindow } from "electron";
import type { FileFilter } from "./file-filter";
import type { AppConfig } from "./config";
import { invalidateImageCache } from "./image-service";
import * as watcher from "./watcher";
import * as wikilinkIndex from "./wikilink-index";
import { trackEvent } from "./analytics";

import {
  registerFilesystemHandlers,
  getRecentlyRenamedRefCounts,
} from "./ipc-filesystem";
import {
  registerWorkspaceHandlers,
  startAllWorkspaceServices,
} from "./ipc-workspace";
import { registerKnowledgeHandlers } from "./ipc-knowledge";
import { registerCanvasHandlers } from "./ipc-canvas";
import { registerMiscHandlers } from "./ipc-misc";
import { registerTileRegistryHandlers } from "./ipc-tile-registry";
import { registerRoleServiceHandlers } from "./ipc-role-service";
import { registerLegendRecipeHandlers } from "./ipc-legend-recipes";
import { registerKernelReadHandlers } from "./ipc-kernel-reads";
import { registerVaultHandlers } from "./ipc-vault";
import { registerContextServiceHandlers } from "./ipc-context-service";
import { registerRuntimeDiagnosticsHandlers } from "./ipc-runtime-diagnostics";
import { registerDiagnosticsHandlers } from "./ipc-diagnostics";
import { registerRuntimeStateHandlers } from "./ipc-runtime-state";
import { registerHerdrHandlers } from "./ipc-herdr";
import { registerHerdrSpawnHandlers } from "./ipc-herdr-spawn";
import { registerOrchestrationHandlers } from "./ipc-orchestration";
import { registerEnvoyHandlers } from "./ipc-envoy";
import { registerWorkflowHandlers } from "./ipc-workflow";
import { registerAgentOsHandlers } from "./ipc-agentos";
import { registerKernelIpcHandlers } from "@qf-v3-main/ipc/kernel-ipc";
import { registerKernelTaskRpc } from "@qf-v3-main/ipc/task-ipc";
import { registerConductorIpc } from "@qf-v3-main/conductor/conductor-ipc";
import { registerMethod } from "./json-rpc-server";
import { spawnRoleViaShell } from "./canvas-rpc";
import { getRole } from "./role-service";
import { getWorkerHarness } from "./harness-service";
import { HARNESS_DESCRIPTORS } from "@qf-harness/registry";
import type { HarnessKind } from "@qf-harness/types";
import { QUANTFLOW_DIR } from "./paths";
import { traceAsync, recordCompletedSpan, isTraceEnabled, wrapIpcInvokeHandler } from "../../../src/kernel/perf";

export type IpcInvokeHandler = (
  event: import("electron").IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown | Promise<unknown>;

export { wrapIpcInvokeHandler };

export function registerTracedIpcHandler(
  channel: string,
  handler: IpcInvokeHandler,
): void {
  ipcMain.handle(channel, (event, ...args) =>
    wrapIpcInvokeHandler(channel, (...innerArgs: unknown[]) => handler(event, ...innerArgs))(...args),
  );
}

export function registerPerfTraceHandlers(): void {
  ipcMain.handle("perf:recordSpan", (_event, input: Record<string, unknown>) => {
    if (!isTraceEnabled()) return { ok: true, skipped: true };
    const durationMs = typeof input.duration_ms === "number" ? input.duration_ms : 0;
    const startedAt = typeof input.started_at === "number"
      ? input.started_at
      : Date.now() - durationMs;
    recordCompletedSpan({
      layer: (input.layer as "canvas") ?? "canvas",
      name: typeof input.name === "string" ? input.name : "renderer.projection.refresh",
      started_at: startedAt,
      duration_ms: durationMs,
      status: "ok",
      workflow_id: typeof input.workflow_id === "string" ? input.workflow_id : undefined,
    });
    return { ok: true };
  });
}

const FS_CHANGE_DELETED = 3;

let appConfig: AppConfig;
let mainWindow: BrowserWindow | null = null;
const fileFilterRef: { current: FileFilter | null } = {
  current: null,
};

function forwardToWebview(
  target: string,
  channel: string,
  ...args: unknown[]
): void {
  mainWindow?.webContents.send(
    "shell:forward",
    target,
    channel,
    ...args,
  );
}

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

export function registerIpcHandlers(config: AppConfig): void {
  appConfig = config;

  if (appConfig.workspaces.length > 0) {
    startAllWorkspaceServices(appConfig.workspaces, (f) => {
      fileFilterRef.current = f;
    });
  }

  // File watcher notifications
  watcher.setNotifyFn((events) => {
    const changedPaths = events.flatMap(
      (event) => event.changes.map((change) => change.path),
    );
    fileFilterRef.current?.invalidateBinaryCache(changedPaths);
    invalidateImageCache(changedPaths);

    forwardToWebview("nav", "fs-changed", events);
    forwardToWebview("viewer", "fs-changed", events);

    for (const event of events) {
      for (const change of event.changes) {
        if (!change.path.endsWith(".md")) continue;
        if (change.type === FS_CHANGE_DELETED) {
          wikilinkIndex.removeFile(change.path);
        } else {
          void wikilinkIndex.updateFile(change.path);
        }
      }
    }

    const recentlyRenamed = getRecentlyRenamedRefCounts();
    const deletedPaths = events.flatMap((e) =>
      e.changes
        .filter(
          (c) =>
            c.type === FS_CHANGE_DELETED &&
            !recentlyRenamed.has(c.path),
        )
        .map((c) => c.path),
    );
    if (deletedPaths.length > 0) {
      forwardToWebview("nav", "files-deleted", deletedPaths);
      forwardToWebview(
        "viewer", "files-deleted", deletedPaths,
      );
    }
  });

  // Shared context for domain modules
  const fsCtx = {
    mainWindow: () => mainWindow,
    workspaces: () => appConfig.workspaces,
    fileFilter: () => fileFilterRef.current,
    forwardToWebview,
    trackEvent,
  };

  const wsCtx = {
    mainWindow: () => mainWindow,
    forwardToWebview,
  };

  const knowledgeCtx = {
    mainWindow: () => mainWindow,
    fileFilter: () => fileFilterRef.current as any,
    workspaces: () => appConfig.workspaces,
    forwardToWebview,
    trackEvent,
  };

  const canvasCtx = {
    mainWindow: () => mainWindow,
    forwardToWebview,
  };

  const miscCtx = {
    mainWindow: () => mainWindow,
    workspaces: () => appConfig.workspaces,
    forwardToWebview,
    trackEvent,
  };

  // Register domain handlers
  registerFilesystemHandlers(fsCtx);
  registerWorkspaceHandlers(wsCtx, appConfig, fileFilterRef);
  registerKnowledgeHandlers(knowledgeCtx);
  registerCanvasHandlers(canvasCtx);
  registerMiscHandlers(miscCtx);
  registerTileRegistryHandlers();
  registerRoleServiceHandlers();
  registerLegendRecipeHandlers();
  registerKernelReadHandlers();
  registerVaultHandlers(() => mainWindow);
  registerContextServiceHandlers();
  registerRuntimeDiagnosticsHandlers();
  registerDiagnosticsHandlers();
  registerRuntimeStateHandlers();
  registerHerdrHandlers();
  registerHerdrSpawnHandlers();
  registerOrchestrationHandlers();
  registerEnvoyHandlers();
  registerWorkflowHandlers();
  registerAgentOsHandlers();
  registerPerfTraceHandlers();
  registerKernelIpcHandlers(QUANTFLOW_DIR);
  // Kernel task lifecycle + receipt chain over JSON-RPC (MCP gate tools).
  registerKernelTaskRpc(registerMethod);
  // Conductor IPC (Goal 5A read view + 5C actions). spawn_role routes through the
  // approved shell role-spawn path (canvas.roleSpawn → spawnRoleTileAt), which
  // starts the shipped runtime and is gated by kernel.worker.spawn (Goal 6A).
  // Goal 6: the live worker-harness seam. Goal 5D will call getWorkerHarness(kind)
  // to spawn/send/readState/collectReceipts/stop workers. These read-only probes
  // prove the live app can construct/use the seam now (no spawn here).
  registerTracedIpcHandler("harness:list", () =>
    HARNESS_DESCRIPTORS.map((d) => ({ kind: d.kind, description: d.description })),
  );
  registerTracedIpcHandler("harness:probe", (_event, kind: HarnessKind) => ({
    kind: getWorkerHarness(kind).kind,
  }));

  registerConductorIpc({
    spawnRole: async (args) => {
      const roleId = String((args as { roleId?: unknown }).roleId ?? "");
      if (!roleId) return { ok: false, error: "spawn_role: roleId required" };
      const role = await getRole(roleId);
      if (!role) return { ok: false, error: `spawn_role: role not found: ${roleId}` };
      try {
        const a = args as Record<string, unknown>;
        const result = await spawnRoleViaShell({
          role,
          ...(a["tileId"] ? { tileId: a["tileId"] } : {}),
          ...(a["cwd"] ? { cwd: a["cwd"] } : {}),
          ...(a["position"] ? { position: a["position"] } : {}),
          ...(a["size"] ? { size: a["size"] } : {}),
          // Thread workflow context so the worker is tied to the active workflow.
          ...(a["workflowId"] ? { workflowId: a["workflowId"] } : {}),
          ...(a["workflowTaskId"] ? { workflowTaskId: a["workflowTaskId"] } : {}),
          ...(a["workflowCorrelationId"] ? { workflowCorrelationId: a["workflowCorrelationId"] } : {}),
          ...(a["workflowEnvoySpaceId"] ? { workflowEnvoySpaceId: a["workflowEnvoySpaceId"] } : {}),
          ...(a["canvasId"] ? { canvasId: a["canvasId"] } : {}),
          ...(a["workspaceId"] ? { workspaceId: a["workspaceId"] } : {}),
        });
        return { ok: true, data: result };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  });
}
