/**
 * IPC handlers for the qf:runtime:* channel namespace.
 *
 * Channel naming convention: qf:runtime:<entity>.<verb>
 * All handlers use ipcMain.handle (request/response).
 *
 * These channels are intentionally thin — they just validate the argument
 * shape and delegate to the repo layer. When Phase 7 swaps in SQLite, only
 * the repos change; these handlers and all renderer callers stay unchanged.
 */

import { ipcMain } from "electron";
import {
  createTask,
  updateTask,
  getTask,
  listTasks,
} from "./runtime-state/tasks-repo";
import {
  createSchema,
  getSchema,
  listSchemas,
  deleteSchema,
  validatePayload,
} from "./runtime-state/schemas-repo";
import {
  createConnection,
  getConnection,
  listConnections,
  updateConnection,
  deleteConnection,
} from "./runtime-state/connections-repo";
import {
  appendEvent,
  listEvents,
  listEventCorrelationGroups,
} from "./runtime-state/events-repo";
import {
  appendStatusTransition,
  listStatusTransitions,
  latestStatus,
} from "./runtime-state/status-repo";
import {
  createPtySession,
  endPtySession,
  getPtySession,
  listPtySessions,
} from "./runtime-state/pty-sessions-repo";
import type {
  TaskFilter,
  EventFilter,
  StatusFilter,
  PtySessionFilter,
  ConnectionFilter,
} from "./runtime-state/types";

export function registerRuntimeStateHandlers(): void {
  // ── Tasks ──────────────────────────────────────────────────────────────────

  ipcMain.handle(
    "qf:runtime:tasks.create",
    (
      _,
      params: {
        cableId: string | null;
        fromTileId: string;
        toTileId: string;
        payload: string;
      },
    ) => createTask(params),
  );

  ipcMain.handle(
    "qf:runtime:tasks.update",
    (_, id: string, changes: { status?: string; result?: string }) =>
      updateTask(id, changes),
  );

  ipcMain.handle("qf:runtime:tasks.get", (_, id: string) => getTask(id));

  ipcMain.handle(
    "qf:runtime:tasks.list",
    (_, filter: TaskFilter = {}) => listTasks(filter),
  );

  // ── Events ─────────────────────────────────────────────────────────────────

  ipcMain.handle(
    "qf:runtime:events.append",
    (
      _,
      params: {
        kind: string;
        taskId?: string | null;
        tileId?: string | null;
        data?: Record<string, unknown>;
      },
    ) => appendEvent(params),
  );

  ipcMain.handle(
    "qf:runtime:events.list",
    (_, filter: EventFilter = {}) => listEvents(filter),
  );

  ipcMain.handle(
    "qf:runtime:events.correlationGroups",
    (_, filter: EventFilter = {}) => listEventCorrelationGroups(filter),
  );

  // ── Status transitions ─────────────────────────────────────────────────────

  ipcMain.handle(
    "qf:runtime:status.append",
    (
      _,
      params: {
        paneId: string;
        tileId?: string | null;
        fromStatus: string;
        toStatus: string;
      },
    ) => appendStatusTransition(params),
  );

  ipcMain.handle(
    "qf:runtime:status.list",
    (_, filter: StatusFilter = {}) => listStatusTransitions(filter),
  );

  ipcMain.handle(
    "qf:runtime:status.latest",
    (_, paneId: string) => latestStatus(paneId),
  );

  // ── PTY sessions ───────────────────────────────────────────────────────────

  ipcMain.handle(
    "qf:runtime:pty-sessions.create",
    (
      _,
      params: {
        sessionId: string;
        tileId: string;
        shell: string;
        pid?: number | null;
        target: string;
        cwd: string;
      },
    ) => createPtySession(params),
  );

  ipcMain.handle(
    "qf:runtime:pty-sessions.end",
    (_, sessionId: string, exitCode?: number | null) =>
      endPtySession(sessionId, exitCode),
  );

  ipcMain.handle(
    "qf:runtime:pty-sessions.get",
    (_, sessionId: string) => getPtySession(sessionId),
  );

  ipcMain.handle(
    "qf:runtime:pty-sessions.list",
    (_, filter: PtySessionFilter = {}) => listPtySessions(filter),
  );

  // ── Schemas ────────────────────────────────────────────────────────────────

  ipcMain.handle(
    "qf:runtime:schemas.create",
    (_, params: { schemaId: string; schemaVersion?: string; body: string }) =>
      createSchema(params),
  );

  ipcMain.handle(
    "qf:runtime:schemas.get",
    (_, schemaId: string) => getSchema(schemaId),
  );

  ipcMain.handle(
    "qf:runtime:schemas.list",
    () => listSchemas(),
  );

  ipcMain.handle(
    "qf:runtime:schemas.delete",
    (_, schemaId: string) => deleteSchema(schemaId),
  );

  ipcMain.handle(
    "qf:runtime:schemas.validate",
    (_, schemaId: string, payload: string) => validatePayload(schemaId, payload),
  );

  // ── Connections ────────────────────────────────────────────────────────────

  ipcMain.handle(
    "qf:runtime:connections.create",
    (
      _,
      params: {
        id?: string;
        tileAId: string;
        tileBId: string;
        fromTileId?: string | null;
        fromSide?: "N" | "E" | "S" | "W" | null;
        toTileId?: string | null;
        toSide?: "N" | "E" | "S" | "W" | null;
        type?: string;
        kind?: string;
        label?: string | null;
        config?: Record<string, unknown>;
        watcherEnabled?: boolean;
        watcherSyntax?: string;
      },
    ) => createConnection(params),
  );

  ipcMain.handle(
    "qf:runtime:connections.get",
    (_, id: string) => getConnection(id),
  );

  ipcMain.handle(
    "qf:runtime:connections.list",
    (_, filter: ConnectionFilter = {}) => listConnections(filter),
  );

  ipcMain.handle(
    "qf:runtime:connections.update",
    (
      _,
      id: string,
      changes: {
        fromTileId?: string | null;
        fromSide?: "N" | "E" | "S" | "W" | null;
        toTileId?: string | null;
        toSide?: "N" | "E" | "S" | "W" | null;
        type?: string;
        kind?: string;
        label?: string | null;
        config?: Record<string, unknown>;
        watcherEnabled?: boolean;
        watcherSyntax?: string;
      },
    ) => updateConnection(id, changes),
  );

  ipcMain.handle(
    "qf:runtime:connections.delete",
    (_, id: string) => deleteConnection(id),
  );
}
