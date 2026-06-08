import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { appendEvent } from "./runtime-state/events-repo";

export interface NormalizedEnvoyPacket {
  envoySpaceId: string;
  packetId: string | null;
  correlationId: string | null;
  connectionId: string | null;
  raw: Record<string, unknown>;
  timestamp: number;
}

export interface EnvoyListenerOptions {
  envoySpaceId: string;
  maxRestarts?: number;
  backoffMs?: number;
  spawnProcess?: typeof spawn;
}

export function normalizeEnvoyPacket(
  envoySpaceId: string,
  line: Record<string, unknown>,
): NormalizedEnvoyPacket {
  const data =
    line.data && typeof line.data === "object" && !Array.isArray(line.data)
      ? line.data as Record<string, unknown>
      : line;
  return {
    envoySpaceId,
    packetId: stringOrNull(line.message_id ?? line.msg_id ?? line.id ?? data.message_id),
    correlationId: stringOrNull(data.correlation_id ?? line.correlation_id),
    connectionId: stringOrNull(data.connection_id ?? line.connection_id),
    raw: line,
    timestamp: Date.now(),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export class EnvoyListener {
  private readonly emitter = new EventEmitter();
  private readonly envoySpaceId: string;
  private readonly maxRestarts: number;
  private readonly backoffMs: number;
  private readonly spawnProcess: typeof spawn;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private restarts = 0;
  private stopped = true;
  private lineBuffer = "";
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: EnvoyListenerOptions) {
    this.envoySpaceId = options.envoySpaceId;
    this.maxRestarts = options.maxRestarts ?? 3;
    this.backoffMs = options.backoffMs ?? 1_000;
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  onPacket(listener: (packet: NormalizedEnvoyPacket) => void): () => void {
    this.emitter.on("packet", listener);
    return () => this.emitter.off("packet", listener);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.startProcess();
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.proc) {
      this.proc.removeAllListeners();
      this.proc.kill();
      this.proc = null;
    }
    this.lineBuffer = "";
  }

  private startProcess(): void {
    if (this.stopped) return;
    const command = process.platform === "win32" ? "wsl.exe" : "envoy";
    const envoyArgs = ["--json", "listen", "--space", this.envoySpaceId, "--no-history"];
    const args = process.platform === "win32"
      ? ["-e", "bash", "-lc", ["envoy", ...envoyArgs].map(shellQuote).join(" ")]
      : envoyArgs;
    this.proc = this.spawnProcess(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.proc.stdout.on("data", (chunk) => this.consumeChunk(chunk.toString()));
    this.proc.stderr.on("data", (chunk) => {
      appendEvent({
        kind: "envoy.listen.stderr",
        level: "warn",
        data: {
          envoy_space_id: this.envoySpaceId,
          text: chunk.toString(),
        },
      });
    });
    this.proc.on("error", (err) => this.handleExit(err.message));
    this.proc.on("exit", (code) => this.handleExit(`exit ${code ?? "unknown"}`));
  }

  private consumeChunk(chunk: string): void {
    this.lineBuffer += chunk;
    let newline: number;
    while ((newline = this.lineBuffer.indexOf("\n")) !== -1) {
      const rawLine = this.lineBuffer.slice(0, newline).trim();
      this.lineBuffer = this.lineBuffer.slice(newline + 1);
      if (!rawLine) continue;
      try {
        const parsed = JSON.parse(rawLine) as Record<string, unknown>;
        const packet = normalizeEnvoyPacket(this.envoySpaceId, parsed);
        appendEvent({
          kind: "envoy.packet",
          correlationId: packet.correlationId,
          cableId: packet.connectionId,
          data: {
            envoy_space_id: packet.envoySpaceId,
            packet_id: packet.packetId,
            raw: packet.raw,
          },
        });
        this.emitter.emit("packet", packet);
      } catch {
        appendEvent({
          kind: "envoy.listen.malformed",
          level: "warn",
          data: {
            envoy_space_id: this.envoySpaceId,
            line: rawLine,
          },
        });
      }
    }
  }

  private handleExit(reason: string): void {
    if (this.stopped) return;
    this.proc = null;
    if (this.restarts >= this.maxRestarts) {
      appendEvent({
        kind: "envoy.listen.error",
        level: "error",
        data: {
          envoy_space_id: this.envoySpaceId,
          reason,
          restarts: this.restarts,
        },
      });
      return;
    }
    this.restarts += 1;
    const delay = this.backoffMs * this.restarts;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startProcess();
    }, delay);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const listeners = new Map<string, EnvoyListener>();

export function ensureEnvoyListener(envoySpaceId: string): EnvoyListener {
  const existing = listeners.get(envoySpaceId);
  if (existing) return existing;
  const listener = new EnvoyListener({ envoySpaceId });
  listeners.set(envoySpaceId, listener);
  listener.start();
  return listener;
}

export function stopAllEnvoyListeners(): void {
  for (const listener of listeners.values()) {
    listener.stop();
  }
  listeners.clear();
}
