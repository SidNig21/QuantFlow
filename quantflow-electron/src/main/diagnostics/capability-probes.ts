import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  commandExists,
  getRoleCommandName,
  listRoles,
  type Role,
} from "../role-service";
import { getCredential, type CredentialStorage } from "../credentials/credential-accessor";
import { pingHerdrSocket } from "../herdr-socket-bridge";
import { isAgentPromptReady } from "../workflow-agent-ready";
import type {
  CapabilityDetail,
  CapabilityKind,
  HealthProbe,
  ProbeCheckResult,
  ProbeContext,
} from "./types";

const execFileAsync = promisify(execFile);
const DEFAULT_EVE_INFO_URL = "https://api.vercel.com/eve/v1/info";
const DEFAULT_OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface CliAuthResult {
  authed: boolean | null;
  message: string;
  remediation?: string;
  detail?: Record<string, unknown>;
}

export interface HerdrReachabilityResult {
  present: boolean;
  reachable: boolean;
  message: string;
  remediation?: string;
  detail?: Record<string, unknown>;
}

export interface ProviderReachabilityResult {
  present: boolean;
  reachable: boolean;
  authed: boolean | null;
  message: string;
  remediation?: string;
  detail?: Record<string, unknown>;
}

export interface CapabilityProbeDeps {
  listRoles?: () => Promise<Role[]>;
  commandExists?: (command: string) => boolean | Promise<boolean>;
  checkCliAuth?: (role: Role, command: string) => Promise<CliAuthResult>;
  readExistingPromptText?: (role: Role, command: string) => Promise<string | null>;
  checkHerdrReachability?: (ctx: ProbeContext) => Promise<HerdrReachabilityResult>;
  checkOpenRouter?: () => Promise<ProviderReachabilityResult>;
  checkEve?: () => Promise<ProviderReachabilityResult>;
  credentialStorage?: CredentialStorage;
  fetch?: typeof fetch;
  eveInfoUrl?: string;
  openRouterModelsUrl?: string;
}

const AUTH_COMMANDS: Record<string, {
  args: string[];
  unauthenticated: RegExp[];
}> = {
  codex: {
    args: ["auth", "status"],
    unauthenticated: [/not\s+(logged|signed)\s+in/i, /unauth/i, /login required/i],
  },
  claude: {
    args: ["doctor"],
    unauthenticated: [/not\s+(logged|signed)\s+in/i, /unauth/i, /login required/i],
  },
  hermes: {
    args: ["--version"],
    unauthenticated: [/not found/i, /command not found/i],
  },
  opencode: {
    args: ["auth", "status"],
    unauthenticated: [/not\s+(logged|signed)\s+in/i, /unauth/i, /login required/i],
  },
};

function checkedAt(ctx: ProbeContext): string {
  return new Date(ctx.now()).toISOString();
}

function makeDetail(
  ctx: ProbeContext,
  params: Omit<CapabilityDetail, "checkedAt">,
  extra?: Record<string, unknown>,
): CapabilityDetail {
  return {
    ...params,
    checkedAt: checkedAt(ctx),
    ...(extra ?? {}),
  };
}

function capabilityResult(
  detail: CapabilityDetail,
  message: string,
  remediation?: string,
): ProbeCheckResult {
  const level = detail.ready
    ? "healthy"
    : detail.present && detail.reachable
      ? "degraded"
      : "down";
  return {
    ok: detail.ready,
    level,
    message,
    detail,
    ...(remediation ? { remediation } : {}),
  };
}

function roleProbeName(role: Role): string {
  return `capability.role.${role.id}`;
}

function capabilityId(kind: CapabilityKind, id: string): string {
  return `${kind}:${id}`;
}

function usesHerdrWsl(role: Role): boolean {
  return role.runtimeTarget === "herdr-wsl" || role.harnessKind === "herdr-shell";
}

function usesEveLocalPackage(role: Role, command: string): boolean {
  return role.runtimeTarget === "windows-pty"
    && command === "npm"
    && Boolean(role.cwd?.trim());
}

async function execWslBash(
  script: string,
  timeoutMs = 7000,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(
    "wsl.exe",
    ["-e", "bash", "-lc", script],
    { encoding: "utf-8", timeout: timeoutMs, windowsHide: true },
  );
}

async function wslCommandExists(command: string): Promise<boolean> {
  try {
    await execWslBash(`command -v ${JSON.stringify(command)} >/dev/null 2>&1`);
    return true;
  } catch {
    return false;
  }
}

async function checkEveLocalPackage(role: Role): Promise<CliAuthResult> {
  const cwd = role.cwd?.trim();
  if (!cwd) {
    return {
      authed: false,
      message: `${role.name} has no package folder configured.`,
      remediation: "Set the Eve package cwd on this role.",
    };
  }
  if (!existsSync(cwd)) {
    return {
      authed: false,
      message: `${role.name} package folder is missing.`,
      remediation: `Create or fix cwd: ${cwd}`,
      detail: { cwd },
    };
  }
  if (!commandExists("node") || !commandExists("npm")) {
    return {
      authed: false,
      message: `${role.name} requires Node.js and npm on Windows PATH.`,
      remediation: "Install Node.js 24+ and ensure npm is on PATH.",
    };
  }
  const envPath = join(cwd, ".env.local");
  if (!existsSync(envPath)) {
    return {
      authed: false,
      message: `${role.name} is missing .env.local in its package folder.`,
      remediation: `Add OPENCODE_GO_API_KEY to ${envPath} and restart the tile.`,
      detail: { cwd, envPath },
    };
  }
  try {
    const envText = readFileSync(envPath, "utf-8");
    const hasKey = /^\s*OPENCODE_GO_API_KEY\s*=\s*\S+/m.test(envText);
    if (!hasKey) {
      return {
        authed: false,
        message: `${role.name} .env.local has no OPENCODE_GO_API_KEY.`,
        remediation: "Add OPENCODE_GO_API_KEY=sk-... to .env.local (see docs/v4/EVE_SETUP.md).",
        detail: { cwd, envPath },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      authed: false,
      message: `${role.name} .env.local could not be read.`,
      remediation: "Fix permissions or recreate .env.local with OPENCODE_GO_API_KEY.",
      detail: { cwd, envPath, error: message },
    };
  }
  return {
    authed: true,
    message: `${role.name} package, Node/npm, and OPENCODE_GO_API_KEY are ready.`,
    detail: { cwd, envPath },
  };
}

async function defaultCliAuth(role: Role, command: string): Promise<CliAuthResult> {
  if (usesEveLocalPackage(role, command)) {
    return checkEveLocalPackage(role);
  }

  const viaWsl = usesHerdrWsl(role);
  const exists = viaWsl
    ? await wslCommandExists(command)
    : commandExists(command);
  if (!exists) {
    return {
      authed: false,
      message: viaWsl
        ? `${role.name} command is not installed in WSL PATH.`
        : `${role.name} command is not installed or not on PATH.`,
      remediation: viaWsl
        ? `Install ${command} in WSL and ensure it is on PATH.`
        : `Install ${command} and ensure it is on PATH.`,
      detail: { command, viaWsl },
    };
  }

  const check = AUTH_COMMANDS[command];
  if (!check) {
    return {
      authed: false,
      message: `${role.name} is installed, but no bounded auth-status command is configured.`,
      remediation: `Authenticate ${command} or add a bounded status command for this CLI.`,
      detail: { authCheck: "not-configured", viaWsl },
    };
  }

  const argList = check.args.map((arg) => JSON.stringify(arg)).join(" ");
  const script = `${JSON.stringify(command)} ${argList}`;
  try {
    const result = viaWsl
      ? await execWslBash(script)
      : await execFileAsync(command, check.args, {
        encoding: "utf-8",
        timeout: 7000,
        windowsHide: true,
      });
    const output = `${result.stdout}\n${result.stderr}`;
    if (check.unauthenticated.some((pattern) => pattern.test(output))) {
      return {
        authed: false,
        message: `${role.name} is installed but not authenticated${viaWsl ? " in WSL" : ""}.`,
        remediation: viaWsl
          ? `Run ${command} login inside WSL, then refresh readiness.`
          : `Run ${command} login, then rerun capability preflight.`,
        detail: { authCheck: check.args.join(" "), exitCode: 0, viaWsl },
      };
    }
    return {
      authed: true,
      message: `${role.name} CLI is installed, reachable, and authenticated${viaWsl ? " in WSL" : ""}.`,
      detail: { authCheck: check.args.join(" "), exitCode: 0, viaWsl },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      authed: false,
      message: `${role.name} is installed, but readiness could not be proven${viaWsl ? " in WSL" : ""}.`,
      remediation: viaWsl
        ? `Authenticate ${command} in WSL and confirm its status command runs non-interactively.`
        : `Authenticate ${command} and confirm its status command can run non-interactively.`,
      detail: { authCheck: check.args.join(" "), error: message, viaWsl },
    };
  }
}

async function defaultHerdrReachability(ctx: ProbeContext): Promise<HerdrReachabilityResult> {
  if (process.platform !== "win32") {
    return {
      present: commandExists("herdr"),
      reachable: commandExists("herdr"),
      message: "herdr shell reachability checked on the local platform.",
    };
  }

  const cwd = process.cwd();
  if (cwd.startsWith("\\\\")) {
    return {
      present: true,
      reachable: false,
      message: "herdr-wsl may be blocked by a UNC working directory.",
      remediation: "Use a drive-letter workspace path before spawning herdr-wsl workers.",
      detail: { cwd },
    };
  }

  try {
    await execFileAsync("wsl.exe", ["-e", "bash", "-lc", "command -v bash >/dev/null"], {
      encoding: "utf-8",
      timeout: 7000,
      windowsHide: true,
    });
    return {
      present: true,
      reachable: true,
      message: "WSL is reachable for herdr-shell workers.",
      detail: { cwd, quantflowDir: ctx.quantflowDir },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      present: false,
      reachable: false,
      message: "WSL is not reachable for herdr-shell workers.",
      remediation: "Install/start WSL and verify the herdr-wsl spawn path.",
      detail: { cwd, error: message },
    };
  }
}

async function defaultFetchCheck(
  fetchImpl: typeof fetch,
  url: string,
  options: RequestInit,
  okMessage: string,
  missingMessage: string,
  storage?: CredentialStorage,
): Promise<ProviderReachabilityResult> {
  const key = await getCredential("OPENROUTER_API_KEY", storage);
  if (!key) {
    return {
      present: false,
      reachable: false,
      authed: false,
      message: missingMessage,
      remediation: "Store OPENROUTER_API_KEY through the QuantFlow credential accessor.",
    };
  }

  try {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${key}`,
      },
    });
    const reachable = response.ok;
    return {
      present: true,
      reachable,
      authed: reachable ? true : false,
      message: reachable
        ? okMessage
        : `Provider endpoint returned HTTP ${response.status}.`,
      remediation: reachable ? undefined : "Check OPENROUTER_API_KEY and provider service status.",
      detail: { url, status: response.status },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      present: true,
      reachable: false,
      authed: false,
      message: "Provider endpoint was not reachable.",
      remediation: "Check network access and provider service status.",
      detail: { url, error: message },
    };
  }
}

function makeRoleProbe(role: Role, deps: CapabilityProbeDeps): HealthProbe | null {
  const command = getRoleCommandName(role);
  if (!command) return null;
  return {
    name: roleProbeName(role),
    group: "capability",
    description: `${role.name} spawn-rail CLI readiness.`,
    intervalMs: 60_000,
    timeoutMs: 15_000,
    check: async (ctx) => {
      const existsFn = deps.commandExists ?? commandExists;
      const exists = usesHerdrWsl(role)
        ? await wslCommandExists(command)
        : await Promise.resolve(existsFn(command));
      if (!exists) {
        return capabilityResult(
          makeDetail(ctx, {
            capabilityId: capabilityId("role", role.id),
            kind: "role",
            present: false,
            reachable: false,
            authed: false,
            ready: false,
          }, { command, viaWsl: usesHerdrWsl(role) }),
          `${role.name} command is not installed${usesHerdrWsl(role) ? " in WSL" : ""}.`,
          `Install ${command}${usesHerdrWsl(role) ? " in WSL" : ""} and ensure it is on PATH.`,
        );
      }

      const promptText = await deps.readExistingPromptText?.(role, command);
      if (promptText && isAgentPromptReady(promptText, command)) {
        return capabilityResult(
          makeDetail(ctx, {
            capabilityId: capabilityId("role", role.id),
            kind: "role",
            present: true,
            reachable: true,
            authed: true,
            ready: true,
          }, { command, promptReady: true, viaWsl: usesHerdrWsl(role) }),
          `${role.name} has an existing ready prompt.`,
        );
      }

      const auth = await (deps.checkCliAuth ?? defaultCliAuth)(role, command);
      const ready = auth.authed === true;
      return capabilityResult(
        makeDetail(ctx, {
          capabilityId: capabilityId("role", role.id),
          kind: "role",
          present: true,
          reachable: true,
          authed: auth.authed,
          ready,
        }, { command, ...(auth.detail ?? {}) }),
        auth.message,
        auth.remediation,
      );
    },
  };
}

function makeHerdrProbe(deps: CapabilityProbeDeps): HealthProbe {
  return {
    name: "capability.harness.herdr-shell",
    group: "capability",
    description: "herdr-wsl harness reachability.",
    intervalMs: 60_000,
    timeoutMs: 12_000,
    check: async (ctx) => {
      const result = await (deps.checkHerdrReachability ?? defaultHerdrReachability)(ctx);
      let socketReady = false;
      if (result.reachable) {
        try {
          await pingHerdrSocket({ timeoutMs: 2_000 });
          socketReady = true;
        } catch {
          socketReady = false;
        }
      }
      const ready = result.present && result.reachable && socketReady;
      return capabilityResult(
        makeDetail(ctx, {
          capabilityId: capabilityId("harness", "herdr-shell"),
          kind: "harness",
          present: result.present,
          reachable: result.reachable && socketReady,
          authed: null,
          ready,
        }, { ...result.detail, socketReady }),
        socketReady
          ? "WSL and herdr socket are reachable for herdr-shell workers."
          : result.message,
        socketReady ? undefined : (result.remediation ?? "Start herdr in WSL or wait for bootstrap."),
      );
    },
  };
}

function makeLocalShellProbe(): HealthProbe {
  return {
    name: "capability.harness.local-shell",
    group: "capability",
    description: "local-shell/windows-pty baseline.",
    intervalMs: 60_000,
    timeoutMs: 2_000,
    check: async (ctx) => capabilityResult(
      makeDetail(ctx, {
        capabilityId: capabilityId("harness", "local-shell"),
        kind: "harness",
        present: true,
        reachable: true,
        authed: null,
        ready: true,
      }, { platform: process.platform }),
      "local-shell is available on this platform.",
    ),
  };
}

function makeManualProviderProbe(): HealthProbe {
  return {
    name: "capability.provider.manual",
    group: "capability",
    description: "manual deterministic Conductor provider.",
    intervalMs: 60_000,
    timeoutMs: 2_000,
    check: async (ctx) => capabilityResult(
      makeDetail(ctx, {
        capabilityId: capabilityId("provider", "manual"),
        kind: "provider",
        present: true,
        reachable: true,
        authed: null,
        ready: true,
      }),
      "manual provider needs no network or credential.",
    ),
  };
}

function makeOpenRouterProbe(deps: CapabilityProbeDeps): HealthProbe {
  return {
    name: "capability.provider.openrouter",
    group: "capability",
    description: "OpenRouter credential and cheap models-list reachability.",
    intervalMs: 60_000,
    timeoutMs: 10_000,
    check: async (ctx) => {
      const result = await (deps.checkOpenRouter
        ? deps.checkOpenRouter()
        : defaultFetchCheck(
          deps.fetch ?? fetch,
          deps.openRouterModelsUrl ?? DEFAULT_OPENROUTER_MODELS_URL,
          { method: "GET" },
          "OpenRouter models endpoint is reachable with the stored key.",
          "OPENROUTER_API_KEY is not present in safeStorage.",
          deps.credentialStorage,
        ));
      return capabilityResult(
        makeDetail(ctx, {
          capabilityId: capabilityId("provider", "openrouter"),
          kind: "provider",
          present: result.present,
          reachable: result.reachable,
          authed: result.authed,
          ready: result.present && result.reachable && result.authed !== false,
        }, result.detail),
        result.message,
        result.remediation,
      );
    },
  };
}

function makeEveProbe(deps: CapabilityProbeDeps): HealthProbe {
  return {
    name: "capability.provider.eve-openrouter",
    group: "capability",
    description: "Eve info endpoint plus OpenRouter credential readiness.",
    intervalMs: 60_000,
    timeoutMs: 10_000,
    check: async (ctx) => {
      const result = await (deps.checkEve
        ? deps.checkEve()
        : defaultFetchCheck(
          deps.fetch ?? fetch,
          deps.eveInfoUrl ?? DEFAULT_EVE_INFO_URL,
          { method: "GET" },
          "Eve info endpoint is reachable and OpenRouter key is present.",
          "OPENROUTER_API_KEY is not present for the Eve lane.",
          deps.credentialStorage,
        ));
      return capabilityResult(
        makeDetail(ctx, {
          capabilityId: capabilityId("provider", "eve-openrouter"),
          kind: "provider",
          present: result.present,
          reachable: result.reachable,
          authed: result.authed,
          ready: result.present && result.reachable && result.authed !== false,
        }, result.detail),
        result.message,
        result.remediation,
      );
    },
  };
}

export async function discoverCapabilityProbes(
  deps: CapabilityProbeDeps = {},
): Promise<HealthProbe[]> {
  const roles = await (deps.listRoles ?? listRoles)();
  const roleProbes = roles
    .map((role) => makeRoleProbe(role, deps))
    .filter((probe): probe is HealthProbe => probe != null);
  return [
    ...roleProbes,
    makeHerdrProbe(deps),
    makeLocalShellProbe(),
    makeManualProviderProbe(),
    makeOpenRouterProbe(deps),
    makeEveProbe(deps),
  ];
}

export function createStaticCapabilityProbes(
  roles: Role[],
  deps: CapabilityProbeDeps = {},
): HealthProbe[] {
  const roleProbes = roles
    .map((role) => makeRoleProbe(role, deps))
    .filter((probe): probe is HealthProbe => probe != null);
  return [
    ...roleProbes,
    makeHerdrProbe(deps),
    makeLocalShellProbe(),
    makeManualProviderProbe(),
    makeOpenRouterProbe(deps),
    makeEveProbe(deps),
  ];
}
