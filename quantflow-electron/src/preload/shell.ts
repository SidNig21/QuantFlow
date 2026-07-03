import { contextBridge, ipcRenderer, webUtils } from "electron";

interface ViewConfig {
  src: string;
  preload: string;
}

interface AllViewConfigs {
  nav: ViewConfig;
  viewer: ViewConfig;
  terminal: ViewConfig;
  terminalTile: ViewConfig;
  graphTile: ViewConfig;
  settings: ViewConfig;
  tileList: ViewConfig;
  agentChat: ViewConfig;
}

const ALLOWED_PANELS = new Set([
  "nav", "viewer", "terminal", "terminalTile",
  "graphTile", "settings", "tile-list", "agent-chat",
]);

// Buffer loading-done signal so it isn't lost if it arrives before
// React mounts and registers the onLoadingDone listener (race between
// did-finish-load firing and useEffect running).
let loadingDoneReceived = false;
ipcRenderer.on("shell:loading-done", () => {
  loadingDoneReceived = true;
});

// Buffer shell:forward messages that arrive before the renderer
// registers its onForwardToWebview callback (cold-launch race).
const pendingForwards: [string, string, ...unknown[]][] = [];
ipcRenderer.on("shell:forward", (_event, target, channel, ...args) => {
  pendingForwards.push([target, channel, ...args]);
});

const perfTraceEnabled = process.env.QUANTFLOW_TRACE === "1" || process.env.QF_PERF_TRACE === "1";
const oneTruthEnabled = process.env.QF_ONE_TRUTH === "1";

contextBridge.exposeInMainWorld("shellApi", {
  getPlatform: (): NodeJS.Platform => process.platform,
  isOneTruthEnabled: (): boolean => oneTruthEnabled,
  minimizeWindow: (): void => ipcRenderer.send("window:minimize"),
  maximizeWindow: (): void => ipcRenderer.send("window:maximize"),
  closeWindow: (): void => ipcRenderer.send("window:close"),
  appVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),

  getViewConfig: (): Promise<AllViewConfigs> =>
    ipcRenderer.invoke("shell:get-view-config"),

  ...(perfTraceEnabled
    ? {
        recordPerfSpan: (input: Record<string, unknown>): Promise<unknown> =>
          ipcRenderer.invoke("perf:recordSpan", input),
      }
    : {}),

  getPref: (key: string): Promise<unknown> =>
    ipcRenderer.invoke("pref:get", key),
  setPref: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke("pref:set", key, value),

  onForwardToWebview: (
    cb: (target: string, channel: string, ...args: unknown[]) => void,
  ) => {
    // Replay any messages that arrived before this callback registered
    for (const [target, channel, ...args] of pendingForwards) {
      cb(target, channel, ...args);
    }
    pendingForwards.length = 0;

    // Replace the buffer listener with the real handler
    ipcRenderer.removeAllListeners("shell:forward");
    const handler = (
      _event: unknown,
      target: string,
      channel: string,
      ...args: unknown[]
    ) => cb(target, channel, ...args);
    ipcRenderer.on("shell:forward", handler);
    return () => ipcRenderer.removeListener("shell:forward", handler);
  },

  onSettingsToggle: (cb: (action: "open" | "close") => void) => {
    const handler = (_event: unknown, action: "open" | "close") =>
      cb(action);
    ipcRenderer.on("shell:settings", handler);
    return () => ipcRenderer.removeListener("shell:settings", handler);
  },

  onLoadingStatus: (cb: (message: string) => void) => {
    const handler = (_event: unknown, message: string) => cb(message);
    ipcRenderer.on("shell:loading-status", handler);
    return () =>
      ipcRenderer.removeListener("shell:loading-status", handler);
  },

  onLoadingDone: (cb: () => void) => {
    if (loadingDoneReceived) {
      cb();
      return () => {};
    }
    const handler = () => {
      loadingDoneReceived = true;
      cb();
    };
    ipcRenderer.on("shell:loading-done", handler);
    return () =>
      ipcRenderer.removeListener("shell:loading-done", handler);
  },

  onShortcut: (cb: (action: string) => void) => {
    const handler = (_event: unknown, action: string) => cb(action);
    ipcRenderer.on("shell:shortcut", handler);
    return () =>
      ipcRenderer.removeListener("shell:shortcut", handler);
  },

  onBrowserTileFocusUrl: (cb: (webContentsId: number) => void) => {
    const handler = (_event: unknown, id: number) => cb(id);
    ipcRenderer.on("browser-tile:focus-url", handler);
    return () =>
      ipcRenderer.removeListener("browser-tile:focus-url", handler);
  },

  onPrefChanged: (cb: (key: string, value: unknown) => void) => {
    const handler = (_event: unknown, key: string, value: unknown) =>
      cb(key, value);
    ipcRenderer.on("pref:changed", handler);
    return () => ipcRenderer.removeListener("pref:changed", handler);
  },

  openSettings: () => ipcRenderer.send("settings:open"),
  closeSettings: () => ipcRenderer.send("settings:close"),
  toggleSettings: () => ipcRenderer.send("settings:toggle"),

  logFromWebview: (
    panel: string,
    level: number,
    message: string,
    source: string,
  ) => {
    if (!ALLOWED_PANELS.has(panel)) return;
    ipcRenderer.send(
      "webview:console",
      panel,
      level,
      message,
      source,
    );
  },

  selectFile: (path: string) => ipcRenderer.send("nav:select-file", path),

  updateGetStatus: () => ipcRenderer.invoke("update:getStatus"),
  updateCheck: () => ipcRenderer.invoke("update:check"),
  updateDownload: () => ipcRenderer.invoke("update:download"),
  updateInstall: () => ipcRenderer.send("update:install"),
  onUpdateStatus: (cb: (state: unknown) => void) => {
    const handler = (_event: unknown, state: unknown) => cb(state);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },

  canvasLoadState: () => ipcRenderer.invoke("canvas:load-state"),
  canvasSaveState: (state: unknown) =>
    ipcRenderer.invoke("canvas:save-state", state),
  canvasExportState: (targetPath?: string) =>
    ipcRenderer.invoke("canvas:export-state", targetPath),

  getDragPaths: () => ipcRenderer.invoke("drag:get-paths"),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  isDirectory: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke("fs:is-directory", filePath),

  workspaceAdd: () => ipcRenderer.invoke("workspace:add"),
  workspaceRemove: (index: number) =>
    ipcRenderer.invoke("workspace:remove", index),
  workspaceList: () => ipcRenderer.invoke("workspace:list"),

  onWorkspaceAdded: (cb: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => cb(path);
    ipcRenderer.on("workspace-added", handler);
    return () =>
      ipcRenderer.removeListener("workspace-added", handler);
  },
  onWorkspaceRemoved: (cb: (path: string) => void) => {
    const handler = (_event: unknown, path: string) => cb(path);
    ipcRenderer.on("workspace-removed", handler);
    return () =>
      ipcRenderer.removeListener("workspace-removed", handler);
  },

  onCanvasPinch: (cb: (deltaY: number) => void) => {
    const handler = (_event: unknown, deltaY: number) => cb(deltaY);
    ipcRenderer.on("canvas:pinch", handler);
    return () => ipcRenderer.removeListener("canvas:pinch", handler);
  },

  onCanvasRpcRequest: (
    cb: (request: { requestId: string; method: string; params: Record<string, unknown> }) => void,
  ) => {
    const handler = (
      _event: unknown,
      request: { requestId: string; method: string; params: Record<string, unknown> },
    ) => cb(request);
    ipcRenderer.on("canvas:rpc-request", handler);
    return () => ipcRenderer.removeListener("canvas:rpc-request", handler);
  },

  canvasRpcResponse: (response: {
    requestId: string;
    result?: unknown;
    error?: { code: number; message: string };
  }) => ipcRenderer.send("canvas:rpc-response", response),

  showConfirmDialog: (opts: {
    message: string;
    detail?: string;
    buttons?: string[];
  }): Promise<number> => ipcRenderer.invoke("dialog:confirm", opts),

  showContextMenu: (
    items: Array<{ id: string; label: string; enabled?: boolean }>,
  ) => ipcRenderer.invoke("context-menu:show", items),

  openExternal: (url: string) => ipcRenderer.send("shell:open-external", url),

  trackEvent: (name: string, properties?: Record<string, unknown>) => {
    ipcRenderer.send("analytics:track-event", name, properties);
  },

  // Integrations
  getAgents: () =>
    ipcRenderer.invoke("integrations:get-agents"),
  installSkill: (agentId: string) =>
    ipcRenderer.invoke("integrations:install-skill", agentId),
  hasOfferedPlugin: () =>
    ipcRenderer.invoke("integrations:has-offered-plugin"),
  markPluginOffered: () =>
    ipcRenderer.invoke("integrations:mark-plugin-offered"),

  getHomePath: (): string => ipcRenderer.sendSync("get-home-path"),

  runtimeDiagnostics: (): Promise<unknown[]> =>
    ipcRenderer.invoke("runtime:diagnostics"),
  diagnosticsHealth: (): Promise<unknown> =>
    ipcRenderer.invoke("qf:diagnostics:health"),
  capabilityRun: (): Promise<unknown> =>
    ipcRenderer.invoke("capability:run"),
  capabilitySnapshot: (): Promise<unknown> =>
    ipcRenderer.invoke("capability:snapshot"),
  diagnosticsRunProbe: (name: string): Promise<unknown> =>
    ipcRenderer.invoke("qf:diagnostics:run-probe", name),
  diagnosticsTailLogs: (request?: unknown): Promise<unknown> =>
    ipcRenderer.invoke("qf:diagnostics:tail-logs", request ?? {}),
  diagnosticsBackupDb: (): Promise<unknown> =>
    ipcRenderer.invoke("qf:diagnostics:backup-db"),
  diagnosticsListCrashes: (): Promise<unknown> =>
    ipcRenderer.invoke("qf:diagnostics:list-crashes"),
  diagnosticsListLaunchTraces: (): Promise<unknown> =>
    ipcRenderer.invoke("qf:diagnostics:list-launch-traces"),

  ptyKillSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke("pty:kill", { sessionId }),

  ptyWrite: (sessionId: string, data: string): void => {
    ipcRenderer.send("pty:write", { sessionId, data });
  },

  ptyCapture: (
    sessionId: string, lines?: number,
  ): Promise<string> =>
    ipcRenderer.invoke("pty:capture", { sessionId, lines }),

  onPtyStatusChanged: (
    cb: (payload: { sessionId: string; foreground: string }) => void,
  ) => {
    const handler = (
      _event: unknown,
      payload: { sessionId: string; foreground: string },
    ) => cb(payload);
    ipcRenderer.on("pty:status-changed", handler);
    return () =>
      ipcRenderer.removeListener("pty:status-changed", handler);
  },

  onPtyExit: (
    cb: (payload: { sessionId: string; exitCode: number }) => void,
  ) => {
    const handler = (
      _event: unknown,
      payload: { sessionId: string; exitCode: number },
    ) => cb(payload);
    ipcRenderer.on("pty:exit", handler);
    return () =>
      ipcRenderer.removeListener("pty:exit", handler);
  },

  ptyDiscover: () => ipcRenderer.invoke("pty:discover"),

  browserNavigate: (
    webContentsId: number, url: string,
  ): Promise<{ url: string }> =>
    ipcRenderer.invoke("browser:navigate", { webContentsId, url }),

  browserScreenshot: (
    webContentsId: number,
  ): Promise<{ data: string }> =>
    ipcRenderer.invoke("browser:screenshot", { webContentsId }),

  browserSnapshot: (
    webContentsId: number,
  ): Promise<unknown> =>
    ipcRenderer.invoke("browser:snapshot", { webContentsId }),

  browserClick: (
    webContentsId: number, selector: string,
  ): Promise<void> =>
    ipcRenderer.invoke("browser:click", { webContentsId, selector }),

  browserType: (
    webContentsId: number, selector: string, text: string,
  ): Promise<void> =>
    ipcRenderer.invoke("browser:type", { webContentsId, selector, text }),

  // -- ACP agent forwarding --
  onAgentUpdate: (cb: (params: unknown) => void) => {
    const handler = (_event: unknown, params: unknown) =>
      cb(params);
    ipcRenderer.on("agent:update", handler);
    return () =>
      ipcRenderer.removeListener("agent:update", handler);
  },
  onAgentPromptComplete: (
    cb: (data: unknown) => void,
  ) => {
    const handler = (_event: unknown, data: unknown) =>
      cb(data);
    ipcRenderer.on("agent:prompt-complete", handler);
    return () =>
      ipcRenderer.removeListener(
        "agent:prompt-complete", handler,
      );
  },
  onAgentPromptError: (cb: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) =>
      cb(data);
    ipcRenderer.on("agent:prompt-error", handler);
    return () =>
      ipcRenderer.removeListener(
        "agent:prompt-error", handler,
      );
  },
  onAgentExit: (cb: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) =>
      cb(data);
    ipcRenderer.on("agent:exit", handler);
    return () =>
      ipcRenderer.removeListener("agent:exit", handler);
  },
  onAgentSessionReady: (cb: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) =>
      cb(data);
    ipcRenderer.on("agent:session-ready", handler);
    return () =>
      ipcRenderer.removeListener(
        "agent:session-ready", handler,
      );
  },
  onAgentSessionFailed: (cb: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) =>
      cb(data);
    ipcRenderer.on("agent:session-failed", handler);
    return () =>
      ipcRenderer.removeListener(
        "agent:session-failed", handler,
      );
  },

  browserScroll: (
    webContentsId: number, x: number, y: number,
  ): Promise<void> =>
    ipcRenderer.invoke("browser:scroll", { webContentsId, x, y }),

  browserEvaluate: (
    webContentsId: number, expression: string,
  ): Promise<{ value: unknown }> =>
    ipcRenderer.invoke(
      "browser:evaluate", { webContentsId, expression },
    ),

  browserWait: (
    webContentsId: number, timeout?: number,
  ): Promise<{ status: string }> =>
    ipcRenderer.invoke(
      "browser:wait", { webContentsId, timeout },
    ),

  browserInfo: (
    webContentsId: number,
  ): Promise<{
    url: string; title: string; loading: boolean;
    canGoBack: boolean; canGoForward: boolean;
  }> =>
    ipcRenderer.invoke("browser:info", { webContentsId }),

  // ── String relay ──
  stringRelay: (req: {
    connectionId: string;
    fromTileId: string;
    fromLabel: string;
    targetTileId: string;
    targetSessionId: string | null;
    text: string;
  }) => ipcRenderer.invoke("string:relay", req),

  stringGetLog: (
    connectionId: string,
    limit?: number,
  ) => ipcRenderer.invoke("string:get-log", connectionId, limit),

  stringRegisterTileSession: (
    tileId: string,
    sessionId: string,
    label: string,
    routeHandle?: string,
    statusParser?: { waiting?: string[]; blocked?: string[] },
  ) => ipcRenderer.invoke(
    "string:register-tile-session",
    tileId,
    sessionId,
    label,
    routeHandle,
    statusParser,
  ),

  stringUnregisterTileSession: (
    tileId: string,
  ) => ipcRenderer.invoke("string:unregister-tile-session", tileId),

  stringSyncConnections: (
    connections: Array<{
      id: string;
      tileAId: string;
      tileBId: string;
      label?: string;
    }>,
  ) => ipcRenderer.invoke("string:sync-connections", connections),

  // ── Watchtower ──
  watchtowerSnapshot: (): Promise<unknown[]> =>
    ipcRenderer.invoke("watchtower:snapshot"),
  watchtowerRelayLog: (limit?: number): Promise<unknown[]> =>
    ipcRenderer.invoke("watchtower:relay-log", limit),
  watchtowerRuntimeEvents: (filter?: Record<string, unknown>): Promise<unknown[]> =>
    ipcRenderer.invoke("qf:runtime:events.list", filter ?? {}),
  watchtowerRuntimeEventCorrelationGroups: (
    filter?: Record<string, unknown>,
  ): Promise<unknown[]> =>
    ipcRenderer.invoke("qf:runtime:events.correlationGroups", filter ?? {}),
  watchtowerRuntimeConnections: (filter?: Record<string, unknown>): Promise<unknown[]> =>
    ipcRenderer.invoke("qf:runtime:connections.list", filter ?? {}),

  // ── Role service ──
  rolesList: () => ipcRenderer.invoke("roles:list"),
  rolesGet: (id: string) => ipcRenderer.invoke("roles:get", id),
  legendList: () => ipcRenderer.invoke("legend:list"),
  legendCreate: (payload: Record<string, unknown>) => ipcRenderer.invoke("legend:create", payload),
  legendRemove: (id: string) => ipcRenderer.invoke("legend:remove", id),

  // ── Obsidian vault ──
  vaultGetPath: (): Promise<string | null> =>
    ipcRenderer.invoke("vault:get-path"),
  vaultSetPath: (path: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("vault:set-path", path),
  vaultPickFile: (): Promise<string | null> =>
    ipcRenderer.invoke("vault:pick-file"),
  vaultReadFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke("vault:read-file", filePath),

  // ── herdr bridge ──
  herdrAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke("herdr:available"),
  herdrList: (): Promise<unknown[]> =>
    ipcRenderer.invoke("herdr:list"),
  herdrRead: (paneId: string, lines?: number): Promise<string> =>
    ipcRenderer.invoke("herdr:read", paneId, lines),
  herdrSend: (paneId: string, text: string): Promise<void> =>
    ipcRenderer.invoke("herdr:send", paneId, text),
  herdrGetStatus: (paneId: string): Promise<string> =>
    ipcRenderer.invoke("herdr:status", paneId),
  onHerdrStatusChanged: (
    cb: (payload: {
      paneId: string;
      tileId: string | null;
      status: string;
      fromStatus: string;
      timestamp: number;
    }) => void,
  ) => {
    const handler = (
      _event: unknown,
      payload: {
        paneId: string;
        tileId: string | null;
        status: string;
        fromStatus: string;
        timestamp: number;
      },
    ) => cb(payload);
    ipcRenderer.on("herdr:status-changed", handler);
    return () =>
      ipcRenderer.removeListener("herdr:status-changed", handler);
  },
  herdrLinkPane: (tileId: string, paneId: string): Promise<void> =>
    ipcRenderer.invoke("herdr:link-pane", tileId, paneId),
  herdrUnlinkPane: (tileId: string): Promise<void> =>
    ipcRenderer.invoke("herdr:unlink-pane", tileId),
  herdrSpawnRole: (params: {
    tileId: string;
    roleId: string;
    roleName: string;
    cwd?: string;
    commandTemplate?: string;
    startupPrompt?: string;
    canvasId?: string;
    workspaceId?: string;
    workflowTaskId?: string;
    workflowCorrelationId?: string;
  }): Promise<unknown> =>
    ipcRenderer.invoke("herdr:spawn-role", params),

  // ── AgentOS approvals ──
  agentosListApprovals: (): Promise<
    Array<{
      requestId: string;
      action: string;
      source: "toolkit" | "acp";
      toolCallId?: string | null;
      startedAt: number;
      tileId?: string | null;
      workflowId?: string | null;
      taskId?: string | null;
      workerId?: string | null;
    }>
  > => ipcRenderer.invoke("agentos:approvals"),
  agentosApprove: (params: {
    requestId: string;
    approved: boolean;
  }): Promise<{ ok: boolean; requestId?: string; approved?: boolean; error?: string }> =>
    ipcRenderer.invoke("agentos:approve", params),

  // ── Run Workflow ──
  workflowSubmit: (params: {
    canvasId?: string;
    prompt: string;
  }): Promise<{
    taskId: string;
    envoyTaskId: string;
    envoySpaceId: string;
    correlationId: string;
    canvasId: string;
    title: string;
  }> => ipcRenderer.invoke("workflow:submit", params),
  workflowInject: (params: {
    herdrPaneId: string;
    taskId: string;
    correlationId: string;
    command?: string;
    agentAlreadyLaunched?: boolean;
  }): Promise<{
    skillPath: string;
    skillTruncated: boolean;
    command: string;
    activationLine: string;
  }> => ipcRenderer.invoke("workflow:inject", params),

  // ── Shared context ──
  contextGet: (): Promise<unknown> =>
    ipcRenderer.invoke("context:get"),
  contextPinFile: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke("context:pin-file", filePath),
  contextUnpinFile: (filePath: string): Promise<unknown> =>
    ipcRenderer.invoke("context:unpin-file", filePath),
  contextSetFileMode: (
    filePath: string,
    mode: "full" | "summary-header" | "excerpt",
    excerpt?: string,
  ): Promise<unknown> =>
    ipcRenderer.invoke("context:set-file-mode", { filePath, mode, excerpt }),
  contextAddDecision: (text: string, metadata?: Record<string, unknown>): Promise<unknown> =>
    ipcRenderer.invoke("context:add-decision", text, metadata),
  contextPreviewForTile: (): Promise<unknown> =>
    ipcRenderer.invoke("context:preview-for-tile"),
  contextInjectToTile: (sessionId: string): Promise<unknown> =>
    ipcRenderer.invoke("context:inject-to-tile", sessionId),
});

// Kernel authority API — separate namespace from shellApi
contextBridge.exposeInMainWorld("kernelApi", {
  sendCommand: (type: string, payload: Record<string, unknown>) =>
    ipcRenderer.invoke("kernel:command", type, payload),

  sendQuery: (type: string, params?: Record<string, unknown>) =>
    ipcRenderer.invoke("kernel:query", type, params ?? {}),

  onEvent: (cb: (payload: unknown) => void) => {
    const handler = (_event: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on("kernel:event", handler);
    return () => ipcRenderer.removeListener("kernel:event", handler);
  },
});

// Embedded read-only Conductor (Goal 5A): read the assembled planning view and
// run a plan (which appends a single planning receipt). No spawn/assign here.
contextBridge.exposeInMainWorld("conductorApi", {
  readView: (params?: { workflowId?: string }) =>
    ipcRenderer.invoke("conductor:read-view", params ?? {}),
  run: (params?: { workflowId?: string }) =>
    ipcRenderer.invoke("conductor:run", params ?? {}),
  // Goal 5C: operator triggers one Conductor action at a time.
  action: (action: string, args?: Record<string, unknown>) =>
    ipcRenderer.invoke("conductor:action", { action, args: args ?? {} }),
  // Goal 5D: advance the approval-gated loop by one step. approve/deny must
  // carry the proposalToken from the awaiting-approval result (binds the
  // decision to the exact proposal shown).
  loopStep: (input?: { workflowId?: string; approve?: boolean; proposalToken?: string }) =>
    ipcRenderer.invoke("conductor:loop-step", input ?? {}),
});
