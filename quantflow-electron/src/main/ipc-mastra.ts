/**
 * Mastra runtime wiring — makes the embedded qf-conductor + delegate tool
 * reachable from the app (closes the "brain is a dead module" gap).
 *
 * - `qf:mastra:delegate` calls the delegate tool DIRECTLY and needs NO model key.
 *   It proves the A2A round-trip: cable-checked delegate → peer PTY → real reply.
 * - `qf:mastra:conductor` runs the LLM supervisor (decides who to delegate to).
 *   Needs QF_MASTRA_MODEL + a provider key; fails soft with a clear message so a
 *   missing key never crashes the app (kill-switch stays green).
 *
 * Importing `./mastra` here is also the real runtime smoke: it forces the main
 * bundle to actually load @mastra/core (the electron-vite build alone did not,
 * because nothing imported it).
 */
import { ipcMain } from "electron";
import { qfMastra, delegateToTileTool } from "./mastra";

export interface MastraDelegateInput {
  fromTileId: string;
  toTileId: string;
  connectionId: string;
  message: string;
}

let registered = false;

/** Register the Mastra IPC channels. Idempotent. */
export function registerMastraIpc(): void {
  if (registered) return;
  registered = true;

  // No model key required — the operator/proof can trigger a real delegate.
  ipcMain.handle(
    "qf:mastra:delegate",
    async (_event, input: MastraDelegateInput) => {
      return delegateToTileTool.execute(input as never);
    },
  );

  // LLM supervisor path. Needs QF_MASTRA_MODEL + provider key; never throws.
  ipcMain.handle(
    "qf:mastra:conductor",
    async (_event, goal: string) => {
      try {
        const agent = qfMastra.getAgent("qfConductor");
        const result = await agent.generate(goal);
        return { ok: true, text: result.text };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          message:
            "conductor unavailable (set QF_MASTRA_MODEL + provider key): " +
            message,
        };
      }
    },
  );
}
