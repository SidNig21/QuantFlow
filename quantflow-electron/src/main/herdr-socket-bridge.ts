/**
 * herdr-socket-bridge.ts
 *
 * v2: Electron main → herdr Unix socket API (newline-delimited JSON).
 * Scope: typed RPC helper for ping plus v2 spawn operations.
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

interface HerdrSocketEnvelope<T = Record<string, unknown>> {
  id?: string;
  result?: T;
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

function parseEnvelope<T = Record<string, unknown>>(
  line: string,
): HerdrSocketEnvelope<T> {
  try {
    return JSON.parse(line) as HerdrSocketEnvelope<T>;
  } catch {
    throw new HerdrSocketError("Invalid JSON from herdr socket", "protocol");
  }
}

function assertResult<T>(envelope: HerdrSocketEnvelope<T>): T {
  if (envelope.error) {
    throw new HerdrSocketError(
      envelope.error.message ?? "herdr socket error",
      "protocol",
    );
  }
  if (envelope.result === undefined || envelope.result === null) {
    throw new HerdrSocketError("herdr socket response had no result", "protocol");
  }
  return envelope.result;
}

function assertPong(result: unknown): HerdrPong {
  if (!result || typeof result !== "object") {
    throw new HerdrSocketError("Expected pong, got no result", "protocol");
  }
  const record = result as HerdrPong & Record<string, unknown>;
  if (record.type !== "pong") {
    throw new HerdrSocketError(
      `Expected pong, got ${record.type ?? "no result"}`,
      "protocol",
    );
  }
  return {
    type: "pong",
    version: typeof record.version === "string" ? record.version : undefined,
    protocol:
      typeof record.protocol === "number" ? record.protocol : undefined,
  };
}

function makeRpcRequest(
  method: string,
  params: Record<string, unknown> | undefined,
): { id: string; request: string } {
  const id = `qf-${method.replace(/[^a-z0-9_.:-]/gi, "-")}-${Date.now()}`;
  const request = JSON.stringify({ id, method, params: params ?? {} }) + "\n";
  return { id, request };
}

function rpcOnce<T>(
  socketPath: string,
  method: string,
  params: Record<string, unknown> | undefined,
  timeoutMs: number,
): Promise<T> {
  const { id, request } = makeRpcRequest(method, params);

  return new Promise((resolve, reject) => {
    let buf = "";
    const socket = net.createConnection(socketPath, () => {
      socket.write(request);
    });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new HerdrSocketError(`herdr ${method} timed out (${timeoutMs}ms)`, "timeout"));
    }, timeoutMs);

    const finish = (err: Error | null, result?: T) => {
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(result!);
    };

    socket.on("data", (chunk) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try {
          const envelope = parseEnvelope<T>(line);
          if (envelope.id && envelope.id !== id) continue;
          finish(null, assertResult(envelope));
        } catch (e) {
          finish(e instanceof Error ? e : new HerdrSocketError(String(e)));
        }
        return;
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

/** Python one-liner in WSL (node may not be on non-login PATH). */
function wslRpcScript(
  socketPath: string,
  request: string,
  timeoutMs: number,
): string {
  return `
import json, os, socket, sys
path = os.environ.get("HERDR_SOCKET_PATH") or ${JSON.stringify(socketPath)}
timeout = ${timeoutMs} / 1000.0
req = ${JSON.stringify(request)}.encode()
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

async function rpcViaWsl<T>(
  socketPath: string,
  method: string,
  params: Record<string, unknown> | undefined,
  timeoutMs: number,
): Promise<T> {
  const { request } = makeRpcRequest(method, params);
  const script = wslRpcScript(socketPath, request, timeoutMs);
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
        stderr.trim() || "Empty response from WSL herdr RPC",
        "transport",
      );
    }
    return assertResult(parseEnvelope<T>(stdout.trim()));
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

export async function callHerdrSocket<T = Record<string, unknown>>(
  method: string,
  params?: Record<string, unknown>,
  options?: {
    socketPath?: string;
    timeoutMs?: number;
  },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const socketPath = options?.socketPath ?? (await resolveSocketPath());

  if (process.platform === "win32") {
    return rpcViaWsl<T>(socketPath, method, params, timeoutMs);
  }
  return rpcOnce<T>(socketPath, method, params, timeoutMs);
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
  return assertPong(await callHerdrSocket("ping", {}, options));
}
