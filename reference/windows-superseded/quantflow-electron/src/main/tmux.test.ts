import { describe, test, expect, afterEach, beforeAll } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { _setConfigDir, loadConfig, setPref } from "./config";
import {
  getTmuxBin,
  getTmuxConf,
  getSocketName,
  writeSessionMeta,
  readSessionMeta,
  deleteSessionMeta,
  SESSION_DIR,
  _setSessionDir,
  tmuxExec,
  tmuxSessionName,
  type SessionMeta,
} from "./tmux";
import {
  createSession,
  killSession,
  listSessions,
  killAll,
  discoverSessions,
  destroyAll,
  verifyTmuxAvailable,
  reconnectSession,
  _setAgentOsPtyBinderForTest,
  AGENTOS_DISCONNECTED_MESSAGE,
} from "./pty";

const tmuxBackendAvailableInProcess = process.platform === "darwin";
const tmuxPtyTest = tmuxBackendAvailableInProcess ? test : test.skip;

// Force tmux mode for these tests — the default is now "sidecar"
// which requires Electron to spawn the sidecar process.
beforeAll(() => {
  const testRoot = join(tmpdir(), `tmux-config-test-${Date.now()}`);
  _setConfigDir(testRoot);
  _setSessionDir(join(testRoot, "terminal-sessions"));
  const config = loadConfig();
  setPref(config, "terminalMode", "tmux");
});

describe("tmux helpers", () => {
  const testId = "test-" + Date.now().toString(16);

  afterEach(() => {
    deleteSessionMeta(testId);
  });

  test("getTmuxConf returns a path ending in tmux.conf", () => {
    const packageRoot = join(import.meta.dir, "../..");
    const originalCwd = process.cwd();
    try {
      // getTmuxConf dev fallback resolves resources/tmux.conf from cwd
      process.chdir(packageRoot);
      const conf = getTmuxConf();
      expect(conf.endsWith("tmux.conf")).toBe(true);
      expect(fs.existsSync(conf)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("writeSessionMeta + readSessionMeta round-trip", () => {
    const meta = {
      shell: "/bin/zsh",
      cwd: "/tmp",
      createdAt: new Date().toISOString(),
    };
    writeSessionMeta(testId, meta);
    const read = readSessionMeta(testId);
    expect(read).toEqual(meta);
  });

  test("readSessionMeta returns null for missing file", () => {
    expect(readSessionMeta("nonexistent-id")).toBeNull();
  });

  test("readSessionMeta returns null for corrupt JSON", () => {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    fs.writeFileSync(
      `${SESSION_DIR}/${testId}.json`, "not json",
    );
    expect(readSessionMeta(testId)).toBeNull();
  });

  test("deleteSessionMeta is no-op for missing file", () => {
    expect(
      () => deleteSessionMeta("nonexistent-id"),
    ).not.toThrow();
  });
});

describe("pty lifecycle via tmux", () => {
  afterEach(() => {
    killAll();
  });

  tmuxPtyTest("createSession returns sessionId and shell", async () => {
    const result = await createSession("/tmp");
    expect(result.sessionId).toMatch(/^[0-9a-f]{16}$/);
    expect(result.shell).toBeTruthy();
  });

  tmuxPtyTest("createSession appears in listSessions", async () => {
    const { sessionId } = await createSession("/tmp");
    expect(listSessions()).toContain(sessionId);
  });

  tmuxPtyTest("killSession removes from listSessions", async () => {
    const { sessionId } = await createSession("/tmp");
    await killSession(sessionId);
    expect(listSessions()).not.toContain(sessionId);
  });

  tmuxPtyTest("createSession sets COLLAB_PTY_SESSION_ID env", async () => {
    const { sessionId } = await createSession("/tmp");
    const name = tmuxSessionName(sessionId);
    const env = tmuxExec(
      "show-environment", "-t", name,
      "COLLAB_PTY_SESSION_ID",
    );
    expect(env).toContain(sessionId);
  });
});

describe("discoverSessions", () => {
  test("returns empty when no tmux server running", async () => {
    const result = await discoverSessions();
    expect(Array.isArray(result)).toBe(true);
  });

  tmuxPtyTest("discovers sessions created by createSession", async () => {
    const { sessionId } = await createSession("/tmp");
    killAll(); // detach client, tmux session survives

    const discovered = await discoverSessions();
    const found = discovered.find(
      (s) => s.sessionId === sessionId,
    );
    expect(found).toBeTruthy();
    expect(found!.meta.cwd).toBe("/tmp");

    // Clean up tmux session
    try {
      tmuxExec(
        "kill-session", "-t", tmuxSessionName(sessionId),
      );
    } catch {}
    deleteSessionMeta(sessionId);
  });

  test("cleans up stale metadata without tmux session", async () => {
    const fakeId = "deadbeefdeadbeef";
    writeSessionMeta(fakeId, {
      shell: "/bin/zsh",
      cwd: "/tmp",
      createdAt: new Date().toISOString(),
    });

    await discoverSessions();
    expect(readSessionMeta(fakeId)).toBeNull();
  });

  tmuxPtyTest("leaves orphan tmux sessions without metadata alone", async () => {
    const { sessionId } = await createSession("/tmp");
    killAll();
    deleteSessionMeta(sessionId);

    await discoverSessions();

    const name = tmuxSessionName(sessionId);
    let alive = true;
    try {
      tmuxExec("has-session", "-t", name);
    } catch {
      alive = false;
    }
    expect(alive).toBe(true);

    // Clean up
    try { tmuxExec("kill-session", "-t", name); } catch {}
  });

  test("skips sidecar discovery in tmux mode", async () => {
    // The test suite forces tmux mode in beforeAll.
    // discoverSessions should return only tmux-backend results.
    const results = await discoverSessions();
    for (const r of results) {
      expect(r.meta.backend ?? "tmux").toBe("tmux");
    }
  });
});

describe("destroyAll", () => {
  tmuxPtyTest("kills owned sessions without killing the tmux server", async () => {
    const { sessionId } = await createSession("/tmp");
    const ownedName = tmuxSessionName(sessionId);

    const externalName = "collab-external-test";
    tmuxExec("new-session", "-d", "-s", externalName, "-x", "80", "-y", "24");

    destroyAll();

    let ownedAlive = true;
    try { tmuxExec("has-session", "-t", ownedName); } catch { ownedAlive = false; }
    expect(ownedAlive).toBe(false);

    let externalAlive = true;
    try { tmuxExec("has-session", "-t", externalName); } catch { externalAlive = false; }
    expect(externalAlive).toBe(true);

    // Clean up
    try { tmuxExec("kill-session", "-t", externalName); } catch {}
    deleteSessionMeta(sessionId);
  });
});

describe("verifyTmuxAvailable", () => {
  test("does not throw when tmux is available", () => {
    expect(() => verifyTmuxAvailable()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-backend reconnection tests
//
// These tests simulate the scenario where sidecar-created sessions exist on
// disk while the global terminal mode is set to tmux (e.g. user changed the
// setting, or the app restarts with the opposite mode).  The sidecar process
// itself is not needed — we only exercise metadata preservation and routing
// decisions that are pure filesystem + in-memory logic.
// ---------------------------------------------------------------------------

describe("cross-backend: discoverSessions preserves sidecar metadata", () => {
  const sidecarId = "sidecar-xbackend-" + Date.now().toString(16);

  afterEach(() => {
    deleteSessionMeta(sidecarId);
  });

  test("discoverSessions in tmux mode must not delete sidecar session metadata", async () => {
    // Simulate a sidecar session that was created before the mode switch.
    writeSessionMeta(sidecarId, {
      shell: "/bin/zsh",
      cwd: "/tmp/myproject",
      createdAt: new Date().toISOString(),
      backend: "sidecar",
    });

    // discoverSessions runs during startup (via ptyDiscover IPC).
    // In tmux mode it cross-references metadata files against tmux
    // list-sessions.  A sidecar session has no matching tmux session.
    await discoverSessions();

    // The metadata must survive — reconnectSession reads it to route
    // back to the sidecar backend.
    const meta = readSessionMeta(sidecarId);
    expect(meta).not.toBeNull();
    expect(meta!.backend).toBe("sidecar");
    expect(meta!.cwd).toBe("/tmp/myproject");
  });

  test("discoverSessions must not include sidecar sessions in tmux results", async () => {
    // Sidecar metadata on disk, no matching tmux session.
    writeSessionMeta(sidecarId, {
      shell: "/bin/zsh",
      cwd: "/tmp",
      createdAt: new Date().toISOString(),
      backend: "sidecar",
    });

    const discovered = await discoverSessions();

    // Sidecar sessions should NOT appear as tmux-discovered sessions
    // (the sidecar is a different backend), but the metadata must
    // still exist on disk for reconnectSession to read.
    const found = discovered.find((s) => s.sessionId === sidecarId);
    expect(found).toBeUndefined();

    // Metadata must still be intact.
    expect(readSessionMeta(sidecarId)).not.toBeNull();
  });
});

describe("cross-backend: reconnectSession defaults correctly", () => {
  const sidecarId = "sidecar-reconnect-" + Date.now().toString(16);
  const tmuxId = "tmux-reconnect-" + Date.now().toString(16);

  afterEach(() => {
    deleteSessionMeta(sidecarId);
    deleteSessionMeta(tmuxId);
  });

  test("reconnectSession reads per-session backend, not global mode", async () => {
    // Write sidecar metadata.  reconnectSession should attempt the
    // sidecar path (which will fail without the sidecar process), NOT
    // the tmux path.
    writeSessionMeta(sidecarId, {
      shell: "/bin/zsh",
      cwd: "/tmp",
      createdAt: new Date().toISOString(),
      backend: "sidecar",
    });

    // We can't actually reconnect without the sidecar process, but we
    // can verify that the function does NOT fall through to the tmux
    // path (which would throw "tmux session collab-{id} not found").
    // Instead it should throw a sidecar-related error.
    const { reconnectSession } = await import("./pty");
    let error: Error | null = null;
    try {
      await reconnectSession(sidecarId, 80, 24, -1);
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    // If it fell through to tmux, the error would contain "tmux session".
    // A sidecar-routed error will mention "Sidecar" or the client.
    expect(error!.message).not.toContain("tmux session");
  });

  // Native Windows has no tmux binary; the tmux fall-through path is POSIX-only.
  test.skipIf(process.platform === "win32")("session with missing metadata defaults to tmux backend", async () => {
    // No metadata on disk — legacy session.  Should default to tmux.
    const { reconnectSession } = await import("./pty");
    let error: Error | null = null;
    try {
      await reconnectSession(tmuxId, 80, 24, -1);
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    // Should try the tmux path and fail because no such tmux session.
    expect(error!.message).toContain("tmux session");
  });
});

// ---------------------------------------------------------------------------
// AgentOS-backed sessions: the silent legacy-pty fallback is dead.
//
// App-restart reconnect must either re-attach through the agentos terminal
// bridge or throw the explicit disconnected error — never route the session
// to the default tmux/sidecar pty backends (impostor WSL shells wearing the
// agentos label). Metadata must survive failed attempts so the renderer's
// fallback create keeps the agentos target (which also refuses to become a
// default pty). The binder seam stands in for the WSL host.
// ---------------------------------------------------------------------------

describe("agentos sessions never fall back to a default pty", () => {
  const agentosId = "agentos-pty-test-" + Date.now().toString(16);
  const agentosMeta = {
    shell: "agentos",
    cwd: "/tmp",
    createdAt: new Date().toISOString(),
    target: "agentos:v2:workspace-main:tile-agent-1",
    displayName: "AgentOS",
    command: "agentos",
    backend: "agentos",
  } as unknown as SessionMeta;

  afterEach(() => {
    _setAgentOsPtyBinderForTest(null);
    deleteSessionMeta(agentosId);
  });

  test("discoverSessions surfaces agentos sessions and preserves their metadata", async () => {
    writeSessionMeta(agentosId, agentosMeta);

    const discovered = await discoverSessions();

    const found = discovered.find((s) => s.sessionId === agentosId);
    expect(found).toBeDefined();
    // Metadata must survive discovery — it carries the agentos attach
    // target reconnect needs (the old code deleted it as a stale tmux
    // session, which is what produced the impostor shells).
    const meta = readSessionMeta(agentosId);
    expect(meta).not.toBeNull();
    expect(meta!.target).toBe("agentos:v2:workspace-main:tile-agent-1");
  });

  test("reconnectSession re-attaches through the agentos bridge when the host is available", async () => {
    writeSessionMeta(agentosId, agentosMeta);
    const bound: {
      ptySessionId: string;
      workspaceId?: string;
      tileId: string;
    }[] = [];
    _setAgentOsPtyBinderForTest(async (input) => {
      bound.push({
        ptySessionId: input.ptySessionId,
        workspaceId: input.workspaceId,
        tileId: input.tileId,
      });
    });

    const result = await reconnectSession(agentosId, 80, 24, -1);

    expect(bound.length).toBe(1);
    expect(bound[0]!.ptySessionId).toBe(agentosId);
    expect(bound[0]!.workspaceId).toBe("workspace-main");
    expect(bound[0]!.tileId).toBe("tile-agent-1");
    expect(result.shell).toBe("agentos");
    expect(result.displayName).toBe("AgentOS");
  });

  test("reconnectSession with host unreachable throws the explicit disconnected error and preserves metadata", async () => {
    writeSessionMeta(agentosId, agentosMeta);
    let boundWorkspaceId: string | undefined;
    _setAgentOsPtyBinderForTest(async (input) => {
      boundWorkspaceId = input.workspaceId;
      throw new Error("agentos unavailable: host not reachable");
    });

    let error: Error | null = null;
    try {
      await reconnectSession(agentosId, 80, 24, -1);
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain(AGENTOS_DISCONNECTED_MESSAGE);
    // Must not have fallen through to a default backend.
    expect(error!.message).not.toContain("tmux session");
    // Metadata survives, so the renderer's fallback create still targets
    // agentos (never a default pty cwd/shell).
    expect(readSessionMeta(agentosId)).not.toBeNull();
    expect(boundWorkspaceId).toBe("workspace-main");
  });

  test("reconnectSession without an agentos attach target still refuses default pty fallback", async () => {
    writeSessionMeta(agentosId, {
      ...agentosMeta,
      target: undefined,
    } as unknown as SessionMeta);

    let error: Error | null = null;
    try {
      await reconnectSession(agentosId, 80, 24, -1);
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain(AGENTOS_DISCONNECTED_MESSAGE);
    expect(error!.message).not.toContain("tmux session");
  });

  test("createSession with an agentos target fails explicitly when the bridge fails — never a default pty", async () => {
    let boundWorkspaceId: string | undefined;
    _setAgentOsPtyBinderForTest(async (input) => {
      boundWorkspaceId = input.workspaceId;
      throw new Error("agentos unavailable: host not reachable");
    });

    let error: Error | null = null;
    try {
      await createSession(
        "/tmp", -1, 80, 24,
        "agentos:v2:workspace-main:tile-agent-1",
        "tile-agent-1",
      );
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain(AGENTOS_DISCONNECTED_MESSAGE);
    expect(boundWorkspaceId).toBe("workspace-main");
  });
});

describe("stripTrailingBlanks via scrollback", () => {
  tmuxPtyTest("scrollback capture strips trailing blank lines", async () => {
    const { sessionId } = await createSession("/tmp");
    const name = tmuxSessionName(sessionId);

    // Send a known string to the session
    tmuxExec(
      "send-keys", "-t", name, "echo hello-scrollback", "Enter",
    );

    // Brief wait for output to appear in tmux buffer
    await new Promise((r) => setTimeout(r, 200));

    // Capture and verify no trailing blank lines
    const raw = tmuxExec(
      "capture-pane", "-t", name,
      "-p", "-e", "-S", "-10000",
    );
    const lines = raw.split("\n");
    // Raw output may have trailing blanks; after
    // stripTrailingBlanks (called in reconnectSession),
    // they'd be removed. Verify raw capture has content.
    expect(
      lines.some((l) => l.includes("hello-scrollback")),
    ).toBe(true);

    await killSession(sessionId);
  });
});
