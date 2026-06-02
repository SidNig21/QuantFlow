/**
 * herdr-socket-bridge.ts
 *
 * v2 Slice 1: Electron main → herdr Unix socket API (newline-delimited JSON).
 * Scope: ping → pong only. CLI wrapper remains in herdr-bridge.ts until later slices.
 *
 * @see https://herdr.dev/docs/socket-api/
 */

import { execFile } from "node:child_process";
import * as net from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WSL_SOCKET = "~/.config/herdr/herdr.sock";

export interface HerdrPong {
  type: "pong";
  version?: string;
  protocol?: number;
}

interface HerdrSocketEnvelope {
  id?: string;
  result?: HerdrPong & Record<string, unknown>;
  error?: { message?: string; code?: string };
}

export class HerdrSocketError extends Error {
  constructor(
    message: string,
    readonly code: "server_down" | "timeout" | "protocol" | "transport" = "transport",
  ) {
    super(message);
    this.name = "HerdrSocketError";
  }
}

function parseEnvelope(line: string): HerdrSocketEnvelope {
  try {
    return JSON.parse(line) as HerdrSocketEnvelope;
  } catch {
    throw new HerdrSocketError("Invalid JSON from herdr socket", "protocol");
  }
}

function assertPong(envelope: HerdrSocketEnvelope): HerdrPong {
  if (envelope.error) {
    throw new HerdrSocketError(
      envelope.error.message ?? "herdr socket error",
      "protocol",
    );
  }
  const result = envelope.result;
  if (!result || result.type !== "pong") {
    throw new HerdrSocketError(
      `Expected pong, got ${result?.type ?? "no result"}`,
      "protocol",
    );
  }
  return {
    type: "pong",
    version: typeof result.version === "string" ? result.version : undefined,
    protocol:
      typeof result.protocol === "number" ? result.protocol : undefined,
  };
}

async function resolveSocketPath(): Promise<string> {
  if (process.env.HERDR_SOCKET_PATH?.trim()) {
    return process.env.HERDR_SOCKET_PATH.trim();
  }
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync(
      "wsl.exe",
      [
        "-e",
        "bash",
        "-lc",
        "herdr status server 2>/dev/null | sed -n 's/^socket: //p' | head -1",
      ],
      { timeout: DEFAULT_TIMEOUT_MS, windowsHide: true, encoding: "utf8" },
    );
    const path = stdout.trim();
    if (path) return path;
    const { stdout: homeSock } = await execFileAsync(
      "wsl.exe",
      ["-e", "bash", "-lc", `echo ${DEFAULT_WSL_SOCKET}`],
      { timeout: 5_000, windowsHide: true, encoding: "utf8" },
    );
    return homeSock.trim() || "/home/rybowen21/.config/herdr/herdr.sock";
  }
  const home = process.env.HOME ?? "/tmp";
  return `${home}/.config/herdr/herdr.sock`;
}

function rpcPingOnce(
  socketPath: string,
  timeoutMs: number,
): Promise<HerdrPong> {
  const id = `qf-ping-${Date.now()}`;
  const request = JSON.stringify({ id, method: "ping", params: {} }) + "\n";

  return new Promise((resolve, reject) => {
    let buf = "";
    const socket = net.createConnection(socketPath, () => {
      socket.write(request);
    });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new HerdrSocketError(`herdr ping timed out (${timeoutMs}ms)`, "timeout"));
    }, timeoutMs);

    const finish = (err: Error | null, pong?: HerdrPong) => {
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(pong!);
    };

    socket.on("data", (chunk) => {
      buf += chunk.toString();
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      try {
        finish(null, assertPong(parseEnvelope(buf.slice(0, nl))));
      } catch (e) {
        finish(e instanceof Error ? e : new HerdrSocketError(String(e)));
      }
    });

    socket.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ECONNREFUSED") {
        finish(
          new HerdrSocketError(
            `Cannot connect to herdr socket at ${socketPath} (${code}). Is herdr server running?`,
            "server_down",
          ),
        );
        return;
      }
      finish(new HerdrSocketError(err.message, "transport"));
    });
  });
}

/** Python one-liner in WSL (node may not be on non-login PATH). */
function wslPingScript(socketPath: string, timeoutMs: number): string {
  const escapedPath = socketPath.replace(/'/g, "'\\''");
  return `
import json, os, socket, sys
path = os.environ.get("HERDR_SOCKET_PATH") or "${escapedPath}"
timeout = ${timeoutMs} / 1000.0
req = (json.dumps({"id": "qf-ping-wsl", "method": "ping", "params": {}}) + "\\n").encode()
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(timeout)
try:
    s.connect(path)
    s.sendall(req)
    buf = b""
    while b"\\n" not in buf:
        chunk = s.recv(4096)
        if not chunk:
            break
        buf += chunk
    line = buf.split(b"\\n", 1)[0].decode()
    sys.stdout.write(line)
except OSError as e:
    print(str(e), file=sys.stderr)
    sys.exit(3)
finally:
    s.close()
`.trim();
}

async function pingViaWsl(
  socketPath: string,
  timeoutMs: number,
): Promise<HerdrPong> {
  const script = wslPingScript(socketPath, timeoutMs);
  try {
    const { stdout, stderr } = await execFileAsync(
      "wsl.exe",
      ["-e", "python3", "-c", script],
      {
        timeout: timeoutMs + 2_000,
        windowsHide: true,
        encoding: "utf8",
        env: { ...process.env, HERDR_SOCKET_PATH: socketPath },
      },
    );
    if (!stdout.trim()) {
      throw new HerdrSocketError(
        stderr.trim() || "Empty response from WSL herdr ping",
        "transport",
      );
    }
    return assertPong(parseEnvelope(stdout.trim()));
  } catch (err) {
    if (err instanceof HerdrSocketError) throw err;
    const exit = err as { code?: number; stderr?: string; message?: string };
    if (exit.code === 3 || exit.code === 2) {
      throw new HerdrSocketError(
        exit.stderr?.trim() ||
          exit.message ||
          "herdr socket unreachable in WSL",
        exit.code === 2 ? "timeout" : "server_down",
      );
    }
    throw new HerdrSocketError(
      err instanceof Error ? err.message : String(err),
      "transport",
    );
  }
}

/**
 * Sends herdr socket API `ping` and returns `pong`.
 * Windows: RPC runs inside WSL against the Unix socket.
 * Linux / WSL dev: connects to the socket directly.
 */
export async function pingHerdrSocket(options?: {
  socketPath?: string;
  timeoutMs?: number;
}): Promise<HerdrPong> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const socketPath = options?.socketPath ?? (await resolveSocketPath());

  if (process.platform === "win32") {
    return pingViaWsl(socketPath, timeoutMs);
  }
  return rpcPingOnce(socketPath, timeoutMs);
}
