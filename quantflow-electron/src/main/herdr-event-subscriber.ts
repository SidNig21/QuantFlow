/**
 * Long-lived herdr events.subscribe client with reconnect and cleanup.
 * One-shot RPC stays in herdr-socket-bridge.ts.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import * as net from "node:net";
import {
  HerdrSocketError,
  resolveHerdrSocketPath,
} from "./herdr-socket-bridge";

const SUBSCRIBE_ID = "qf-events-subscribe";
const DEFAULT_INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

const STATUS_SUBSCRIPTIONS = [
  { type: "pane.agent_status_changed" },
] as const;

export interface HerdrEventSubscriberOptions {
  socketPath?: string;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  platform?: NodeJS.Platform;
}

function makeSubscribeRequest(): string {
  return JSON.stringify({
    id: SUBSCRIBE_ID,
    method: "events.subscribe",
    params: { subscriptions: STATUS_SUBSCRIPTIONS },
  }) + "\n";
}

function wslSubscribeScript(socketPath: string): string {
  const request = makeSubscribeRequest();
  return `
import json, os, socket, sys
path = os.environ.get("HERDR_SOCKET_PATH") or ${JSON.stringify(socketPath)}
req = ${JSON.stringify(request)}
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(path)
s.sendall(req.encode())
buf = b""
while True:
    chunk = s.recv(4096)
    if not chunk:
        break
    buf += chunk
    while b"\\n" in buf:
        line, buf = buf.split(b"\\n", 1)
        if not line:
            continue
        sys.stdout.write(line.decode("utf-8", errors="replace") + "\\n")
        sys.stdout.flush()
`.trim();
}

export class HerdrEventSubscriber {
  private readonly emitter = new EventEmitter();
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly platform: NodeJS.Platform;
  private socketPath?: string;
  private stopped = true;
  private connecting = false;
  private connected = false;
  private backoffMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private socket: net.Socket | null = null;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private lineBuffer = "";

  constructor(options: HerdrEventSubscriberOptions = {}) {
    this.initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.platform = options.platform ?? process.platform;
    this.socketPath = options.socketPath;
    this.backoffMs = this.initialBackoffMs;
  }

  onLine(listener: (line: Record<string, unknown>) => void): () => void {
    this.emitter.on("line", listener);
    return () => this.emitter.off("line", listener);
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.emitter.on("connection", listener);
    return () => this.emitter.off("connection", listener);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    this.teardownConnection();
    this.setConnected(false);
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    try {
      const socketPath = this.socketPath ?? await resolveHerdrSocketPath();
      this.socketPath = socketPath;
      if (this.platform === "win32") {
        await this.connectViaWsl(socketPath);
      } else {
        await this.connectNative(socketPath);
      }
      this.backoffMs = this.initialBackoffMs;
      this.setConnected(true);
    } catch {
      this.teardownConnection();
      this.setConnected(false);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private connectNative(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      this.socket = socket;
      this.lineBuffer = "";

      const fail = (err: Error) => {
        socket.destroy();
        if (this.socket === socket) this.socket = null;
        reject(err);
      };

      socket.on("connect", () => {
        socket.write(makeSubscribeRequest());
        resolve();
      });
      socket.on("data", (chunk) => this.consumeChunk(chunk.toString()));
      socket.on("error", (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ECONNREFUSED") {
          fail(new HerdrSocketError(
            `Cannot connect to herdr socket at ${socketPath} (${code})`,
            "server_down",
          ));
          return;
        }
        fail(new HerdrSocketError(err.message, "transport"));
      });
      socket.on("close", () => {
        if (this.stopped) return;
        this.handleDisconnect();
      });
    });
  }

  private connectViaWsl(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = wslSubscribeScript(socketPath);
      const proc = spawn(
        "wsl.exe",
        ["-e", "python3", "-c", script],
        {
          windowsHide: true,
          env: { ...process.env, HERDR_SOCKET_PATH: socketPath },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      this.proc = proc;
      this.lineBuffer = "";

      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      proc.stdout.on("data", (chunk) => {
        this.consumeChunk(chunk.toString());
        if (!settled) finish();
      });

      proc.stderr.on("data", () => {
        // herdr may log to stderr; stream health is tracked via stdout/exit.
      });

      proc.on("error", (err) => {
        finish(new HerdrSocketError(err.message, "transport"));
      });

      proc.on("exit", (code) => {
        if (!settled && code !== 0) {
          finish(new HerdrSocketError(
            `WSL herdr subscribe exited (${code ?? "unknown"})`,
            "server_down",
          ));
          return;
        }
        if (this.stopped) return;
        this.handleDisconnect();
      });
    });
  }

  private consumeChunk(chunk: string): void {
    this.lineBuffer += chunk;
    let newline: number;
    while ((newline = this.lineBuffer.indexOf("\n")) !== -1) {
      const rawLine = this.lineBuffer.slice(0, newline);
      this.lineBuffer = this.lineBuffer.slice(newline + 1);
      try {
        const parsed = JSON.parse(rawLine) as Record<string, unknown>;
        this.emitter.emit("line", parsed);
      } catch {
        // Ignore malformed frames; subscription stays alive.
      }
    }
  }

  private handleDisconnect(): void {
    this.teardownConnection();
    this.setConnected(false);
    this.scheduleReconnect();
  }

  private teardownConnection(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    if (this.proc) {
      this.proc.removeAllListeners();
      this.proc.kill();
      this.proc = null;
    }
    this.lineBuffer = "";
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delayMs = this.backoffMs;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.emitter.emit("connection", connected);
  }
}
