import { useEffect, useState } from "react";
import { TerminalTab } from "@collab/components/Terminal";
import { parseTerminalTileLaunchParams } from "./session-start";

/** Approximate terminal dimensions from the viewport before xterm mounts. */
function estimateTermSize(): { cols: number; rows: number } {
  const CHAR_WIDTH = 7.22; // Menlo 12px on macOS
  const CELL_HEIGHT = 17; // xterm line height at fontSize 12
  const w = document.documentElement.clientWidth;
  const h = document.documentElement.clientHeight;
  return {
    cols: Math.max(80, Math.floor(w / CHAR_WIDTH)),
    rows: Math.max(24, Math.floor(h / CELL_HEIGHT)),
  };
}

function App() {
  const [sessionId, setSessionId] = useState<string | null>(
    null,
  );
  const [exited, setExited] = useState(false);
  const [restored, setRestored] = useState(false);
  const [scrollbackData, setScrollbackData] =
    useState<string | null>(null);
  const [sessionMode, setSessionMode] =
    useState<"tmux" | "sidecar" | undefined>(undefined);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    const {
      existingSessionId,
      isRestored,
      isPending,
      cwd,
      target,
      tileId,
    } = parseTerminalTileLaunchParams(window.location.search);

    let sessionRestoreAttempted = false;

    const createFreshSession = (
      target?: string,
      nextCwd?: string,
    ) => {
      const est = estimateTermSize();
      window.api
        .ptyCreate(nextCwd ?? cwd, est.cols, est.rows, target, tileId)
        .then((result) => {
          if (sessionRestoreAttempted) {
            window.api.runtimeAppendEvent?.({
              kind: "terminal.restore.started",
              tileId: tileId ?? null,
              data: { oldSessionId: existingSessionId, newSessionId: result.sessionId },
              level: "info",
            });
          }
          setSessionId(result.sessionId);
          window.api.notifyPtySessionId(
            result.sessionId,
          );
        })
        .catch((err) => {
          const message = err instanceof Error
            ? err.message
            : "Terminal PTY failed to start.";
          if (sessionRestoreAttempted) {
            window.api.runtimeAppendEvent?.({
              kind: "terminal.restore.failed",
              tileId: tileId ?? null,
              data: { message, oldSessionId: existingSessionId },
              level: "error",
            });
          }
          setStartError(message);
          window.api.notifyPtyStartFailed?.({
            message,
            tileId,
            cwd: nextCwd ?? cwd,
            target,
          });
          setExited(true);
        });
    };

    if (isPending && !existingSessionId) {
      return;
    }

    if (isRestored && existingSessionId) {
      setRestored(true);
      const { cols, rows } = estimateTermSize();

      window.api
        .ptyDiscover()
        .then((sessions) => {
          const found = sessions.some(
            (session) => session.sessionId === existingSessionId,
          );
          if (!found) {
            throw new Error("Missing restored session");
          }
          return window.api.ptyReconnect(
            existingSessionId,
            cols,
            rows,
          );
        })
        .then((result) => {
          if (result.scrollback) {
            setScrollbackData(result.scrollback);
          }
          if (result.mode) {
            setSessionMode(result.mode);
          }
          setSessionId(existingSessionId);
        })
        .catch(async () => {
          setRestored(false);
          sessionRestoreAttempted = true;
          window.api.runtimeAppendEvent?.({
            kind: "terminal.restore.attempted",
            tileId: tileId ?? null,
            data: { oldSessionId: existingSessionId },
            level: "info",
          });
          // Notify canvas that this tile's session is stale so it can
          // show a "restoring" status badge while the fresh session starts.
          window.api.sendToHost("pty-restore-stale", {
            tileId,
            oldSessionId: existingSessionId,
          });
          // Recover the original working directory from session
          // metadata so the fallback session opens in the right place.
          let fallbackCwd = cwd;
          let fallbackTarget: string | undefined;
          if (existingSessionId) {
            try {
              const meta = await window.api.ptyReadMeta(
                existingSessionId,
              );
              if (!fallbackCwd && meta?.cwd) fallbackCwd = meta.cwd;
              if (meta?.target) fallbackTarget = meta.target;
            } catch {
              // Metadata unavailable — fall through to default
            }
          }
          createFreshSession(fallbackTarget, fallbackCwd);
        });

      return;
    }

    if (existingSessionId) {
      setSessionId(existingSessionId);
      return;
    }

    createFreshSession(target);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const handleExit = (payload: {
      sessionId: string;
      exitCode: number;
    }) => {
      if (payload.sessionId === sessionId) {
        setExited(true);
      }
    };
    window.api.onPtyExit(sessionId, handleExit);
    return () => window.api.offPtyExit(sessionId, handleExit);
  }, [sessionId]);

  if (exited) {
    return (
      <div className="terminal-tile-exited" data-error={startError ? "true" : "false"}>
        <span>{startError ? "PTY start failed" : "Session ended"}</span>
        {startError ? (
          <small>{startError}</small>
        ) : null}
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="terminal-tile-pending" aria-label="Terminal pending" />
    );
  }

  return (
    <TerminalTab
      sessionId={sessionId}
      visible={true}
      restored={restored}
      scrollbackData={scrollbackData}
      mode={sessionMode}
    />
  );
}

export default App;
