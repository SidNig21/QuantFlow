import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  getEnvoySpace,
  listEnvoySpaces,
  upsertEnvoySpace,
} from "./runtime-state/envoy-repo";
import type { EnvoySpaceRow } from "./runtime-state/types";
import { appendEvent } from "./runtime-state/events-repo";

export interface EnvoyCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type EnvoyCliRunner = (
  args: string[],
  input?: string,
) => Promise<EnvoyCliResult>;

export interface EnvoyServiceOptions {
  runner?: EnvoyCliRunner;
}

const DEFAULT_TIMEOUT_MS = 30_000;

let runnerOverride: EnvoyCliRunner | null = null;

export function setEnvoyCliRunnerForTesting(runner: EnvoyCliRunner | null): void {
  runnerOverride = runner;
}

function defaultEnvoyRunner(args: string[], input?: string): Promise<EnvoyCliResult> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const command = isWin ? "wsl.exe" : "envoy";
    const commandArgs = isWin
      ? ["-e", "bash", "-lc", ["envoy", ...args].map(shellQuote).join(" ")]
      : args;
    const proc = spawn(command, commandArgs, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`envoy timed out after ${DEFAULT_TIMEOUT_MS}ms: ${args.join(" ")}`));
    }, DEFAULT_TIMEOUT_MS);

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    if (input) proc.stdin.write(input);
    proc.stdin.end();
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function sanitizeEnvoyName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "canvas";
}

export function workspaceHash(input = "default"): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}

export function makeEnvoySpaceName(params: {
  canvasId: string;
  workspaceId?: string | null;
}): string {
  const hash = workspaceHash(params.workspaceId ?? "default");
  return `qf.${hash}.${sanitizeEnvoyName(params.canvasId)}`;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const firstJson = trimmed
      .split(/\r?\n/)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .find((value) => value && typeof value === "object" && !Array.isArray(value));
    return firstJson as Record<string, unknown> | null;
  }
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function extractSpaces(record: Record<string, unknown>): Array<Record<string, unknown>> {
  const spaces = record.spaces;
  if (Array.isArray(spaces)) {
    return spaces.filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item),
    );
  }
  const rooms = record.rooms;
  if (Array.isArray(rooms)) {
    return rooms.filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item),
    );
  }
  return [];
}

export function extractEnvoySpaceId(output: string, expectedName?: string): string | null {
  const parsed = parseJsonObject(output);
  if (!parsed) return null;
  const direct = pickString(parsed, ["space_id", "room_id", "id"]);
  if (direct) return direct;
  for (const space of extractSpaces(parsed)) {
    const name = pickString(space, ["space_name", "room_name", "name"]);
    if (!expectedName || name === expectedName) {
      const id = pickString(space, ["space_id", "room_id", "id"]);
      if (id) return id;
    }
  }
  return null;
}

export function extractEnvoyMessageId(output: string): string | null {
  const parsed = parseJsonObject(output);
  if (!parsed) return null;
  return pickString(parsed, [
    "message_id",
    "msg_id",
    "task_id",
    "id",
    "receipt_id",
  ]);
}

export function extractEnvoyInviteCode(output: string): string | null {
  const parsed = parseJsonObject(output);
  if (!parsed) return null;
  const direct = pickString(parsed, ["code", "invite_code"]);
  if (direct) return direct;
  const invites = parsed.invites;
  if (!Array.isArray(invites)) return null;
  for (const invite of invites) {
    if (!invite || typeof invite !== "object" || Array.isArray(invite)) continue;
    const code = pickString(invite as Record<string, unknown>, ["code", "invite_code"]);
    if (code) return code;
  }
  return null;
}

export function isEnvoyEpochRevokedError(raw: string): boolean {
  return raw.toLowerCase().includes("epoch_revoked");
}

function envoyFailureText(result: EnvoyCliResult): string {
  return result.stderr || result.stdout;
}

function requireOk(result: EnvoyCliResult, args: string[]): void {
  if (result.exitCode === 0) return;
  throw new Error(
    `envoy ${args.join(" ")} failed (${result.exitCode}): ${envoyFailureText(result)}`,
  );
}

export class EnvoyService {
  private readonly runner: EnvoyCliRunner;

  constructor(options: EnvoyServiceOptions = {}) {
    this.runner = options.runner ?? runnerOverride ?? defaultEnvoyRunner;
  }

  async ensureEnvoySpace(params: {
    canvasId: string;
    workspaceId?: string | null;
  }): Promise<EnvoySpaceRow> {
    const spaceName = makeEnvoySpaceName(params);
    const hash = workspaceHash(params.workspaceId ?? "default");
    const existing = getEnvoySpace(params.canvasId);

    try {
      const listed = await this.runner(["--json", "spaces"]);
      requireOk(listed, ["--json", "spaces"]);
      const listedSpaceId = extractEnvoySpaceId(listed.stdout, spaceName);

      if (
        existing?.status === "ready"
        && existing.envoy_space_id
        && listedSpaceId
        && existing.envoy_space_id === listedSpaceId
      ) {
        return existing;
      }

      if (listedSpaceId) {
        const row = upsertEnvoySpace({
          canvasId: params.canvasId,
          workspaceHash: hash,
          spaceName,
          envoySpaceId: listedSpaceId,
          status: "ready",
          error: null,
        });
        if (existing?.envoy_space_id && existing.envoy_space_id !== listedSpaceId) {
          appendEvent({
            kind: "envoy.space.rebound",
            level: "warn",
            data: {
              canvas_id: params.canvasId,
              previous_envoy_space_id: existing.envoy_space_id,
              envoy_space_id: listedSpaceId,
              space_name: spaceName,
            },
          });
        } else if (!existing?.envoy_space_id) {
          appendEvent({
            kind: "envoy.space.ready",
            level: "info",
            data: {
              canvas_id: params.canvasId,
              envoy_space_id: listedSpaceId,
              space_name: spaceName,
            },
          });
        }
        return row;
      }

      upsertEnvoySpace({
        canvasId: params.canvasId,
        workspaceHash: hash,
        spaceName,
        status: "pending",
        error: null,
      });

      const envoySpaceId = await this.createSpace(spaceName);
      const row = upsertEnvoySpace({
        canvasId: params.canvasId,
        workspaceHash: hash,
        spaceName,
        envoySpaceId,
        status: "ready",
        error: null,
      });
      appendEvent({
        kind: "envoy.space.ready",
        level: "info",
        data: {
          canvas_id: params.canvasId,
          envoy_space_id: envoySpaceId,
          space_name: spaceName,
        },
      });
      return row;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      upsertEnvoySpace({
        canvasId: params.canvasId,
        workspaceHash: hash,
        spaceName,
        status: "error",
        error: message,
      });
      appendEvent({
        kind: "envoy.space.error",
        level: "error",
        data: {
          canvas_id: params.canvasId,
          space_name: spaceName,
          error: message,
        },
      });
      throw err;
    }
  }

  /**
   * Ensure a named Envoy profile can read/send in a space. Joins via a fresh
   * invite when the profile's capability epoch was revoked.
   */
  async ensureEnvoyProfileInSpace(params: {
    envoySpaceId: string;
    profile: string;
  }): Promise<void> {
    const envoySpaceId = params.envoySpaceId.trim();
    const profile = params.profile.trim();
    if (!envoySpaceId || !profile) return;

    const probeArgs = [
      "--profile",
      profile,
      "--json",
      "history",
      envoySpaceId,
      "--limit",
      "1",
    ];
    const probe = await this.runner(probeArgs);
    if (probe.exitCode === 0) return;

    const failure = envoyFailureText(probe);
    if (!isEnvoyEpochRevokedError(failure)) {
      requireOk(probe, probeArgs);
    }

    const inviteArgs = ["--json", "invite", envoySpaceId];
    const invite = await this.runner(inviteArgs);
    requireOk(invite, inviteArgs);
    const code = extractEnvoyInviteCode(invite.stdout);
    if (!code) {
      throw new Error(`envoy invite did not return a code for ${envoySpaceId}`);
    }

    const joinArgs = ["--profile", profile, "--json", "join", code];
    const joined = await this.runner(joinArgs);
    requireOk(joined, joinArgs);

    appendEvent({
      kind: "envoy.profile.joined",
      level: "info",
      data: {
        envoy_space_id: envoySpaceId,
        profile,
      },
    });
  }

  async spaceStatus(canvasId?: string): Promise<EnvoySpaceRow | EnvoySpaceRow[] | null> {
    return canvasId ? getEnvoySpace(canvasId) : listEnvoySpaces();
  }

  async postTask(params: {
    envoySpaceId: string;
    body: string;
  }): Promise<{ envoyMessageId: string | null; raw: string }> {
    const args = [
      "--json",
      "task",
      "create",
      "--space",
      params.envoySpaceId,
      "--body",
      params.body,
    ];
    const result = await this.runner(args);
    requireOk(result, args);
    return {
      envoyMessageId: extractEnvoyMessageId(result.stdout),
      raw: result.stdout,
    };
  }

  async updateTaskStatus(params: {
    envoySpaceId: string;
    envoyTaskId: string | null;
    status: "assigned" | "in_progress" | "completed" | "blocked";
  }): Promise<{ envoyMessageId: string | null; raw: string | null }> {
    if (!params.envoyTaskId) return { envoyMessageId: null, raw: null };
    const args = params.status === "assigned"
      ? [
          "--json",
          "task",
          "claim",
          "--space",
          params.envoySpaceId,
          "--task-id",
          params.envoyTaskId,
        ]
      : [
          "--json",
          "task",
          "set",
          "--space",
          params.envoySpaceId,
          params.envoyTaskId,
          params.status,
        ];
    const result = await this.runner(args);
    requireOk(result, args);
    return {
      envoyMessageId: extractEnvoyMessageId(result.stdout),
      raw: result.stdout,
    };
  }

  async sendMessage(params: {
    envoySpaceId: string;
    body: string;
    profile?: string;
  }): Promise<{ envoyMessageId: string | null; raw: string }> {
    const args = params.profile
      ? [
          "--profile",
          params.profile,
          "--json",
          "send",
          "--space",
          params.envoySpaceId,
          "--stdin",
        ]
      : ["--json", "send", "--space", params.envoySpaceId, "--stdin"];
    const result = await this.runner(args, params.body);
    requireOk(result, args);
    return {
      envoyMessageId: extractEnvoyMessageId(result.stdout),
      raw: result.stdout,
    };
  }

  async listTasks(params: {
    envoySpaceId: string;
    includeCompleted?: boolean;
  }): Promise<string> {
    const args = [
      "--json",
      "task",
      "list",
      "--space",
      params.envoySpaceId,
    ];
    if (params.includeCompleted) args.push("--include-completed");
    const result = await this.runner(args);
    requireOk(result, args);
    return result.stdout;
  }

  async getHistory(params: {
    envoySpaceId: string;
    limit?: number;
  }): Promise<string> {
    const args = [
      "--json",
      "history",
      params.envoySpaceId,
      "--limit",
      String(params.limit ?? 200),
    ];
    const result = await this.runner(args);
    requireOk(result, args);
    return result.stdout;
  }

  private async createSpace(spaceName: string): Promise<string> {
    const args = [
      "--json",
      "space",
      "create",
      "--name",
      spaceName,
      "--description",
      "QuantFlow canvas task bus",
    ];
    const created = await this.runner(args);
    requireOk(created, args);
    const spaceId = extractEnvoySpaceId(created.stdout, spaceName);
    if (!spaceId) {
      throw new Error(`envoy did not return a space id for ${spaceName}`);
    }
    return spaceId;
  }
}

let defaultService: EnvoyService | null = null;

export function getEnvoyService(): EnvoyService {
  defaultService ??= new EnvoyService();
  return defaultService;
}

export function resetEnvoyServiceForTesting(): void {
  defaultService = null;
  setEnvoyCliRunnerForTesting(null);
}

export function newCorrelationId(): string {
  return `corr-${randomUUID()}`;
}
