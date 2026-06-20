import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  commandExists,
  getRoleCommandName,
  listRoles,
  type Role,
} from "../role-service";
import { getCredential, type CredentialStorage } from "../credentials/credential-accessor";
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

async function defaultCliAuth(role: Role, command: string): Promise<CliAuthResult> {
  if (command === "hermes") {
    return {
      authed: null,
      message: `${role.name} is available; no credential check is required.`,
    };
  }

  const check = AUTH_COMMANDS[command];
  if (!check) {
    return {
      authed: false,
      message: `${role.name} is installed, but no bounded auth-status command is configured.`,
      remediation: `Authenticate ${command} or add a bounded status command for this CLI.`,
      detail: { authCheck: "not-configured" },
    };
  }

  try {
    const result = await execFileAsync(command, check.args, {
      encoding: "utf-8",
      timeout: 7000,
      windowsHide: true,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    if (check.unauthenticated.some((pattern) => pattern.test(output))) {
      return {
        authed: false,
        message: `${role.name} is installed but not authenticated.`,
        remediation: `Run ${command} login, then rerun capability preflight.`,
        detail: { authCheck: check.args.join(" "), exitCode: 0 },
      };
    }
    return {
      authed: true,
      message: `${role.name} auth-status command completed successfully.`,
      detail: { authCheck: check.args.join(" "), exitCode: 0 },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      authed: false,
      message: `${role.name} is installed, but readiness could not be proven.`,
      remediation: `Authenticate ${command} and confirm its status command can run non-interactively.`,
      detail: { authCheck: check.args.join(" "), error: message },
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
      const exists = await (deps.commandExists ?? commandExists)(command);
      if (!exists) {
        return capabilityResult(
          makeDetail(ctx, {
            capabilityId: capabilityId("role", role.id),
            kind: "role",
            present: false,
            reachable: false,
            authed: false,
            ready: false,
          }, { command }),
          `${role.name} command is not installed or not on PATH.`,
          `Install ${command} and ensure it is on PATH/WSL PATH.`,
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
          }, { command, promptReady: true }),
          `${role.name} has an existing ready prompt.`,
        );
      }

      const auth = await (deps.checkCliAuth ?? defaultCliAuth)(role, command);
      const ready = auth.authed !== false;
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
      return capabilityResult(
        makeDetail(ctx, {
          capabilityId: capabilityId("harness", "herdr-shell"),
          kind: "harness",
          present: result.present,
          reachable: result.reachable,
          authed: null,
          ready: result.present && result.reachable,
        }, result.detail),
        result.message,
        result.remediation,
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
