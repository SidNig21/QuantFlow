/**
 * WSL agentos-host lifecycle — spawn, health poll, stop.
 * Pattern mirrors quantflow-electron/src/main/herdr-server-bootstrap.ts.
 */
import { execFile } from 'node:child_process';
import { spawn as nodeSpawn } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordHostCredentialReport } from './credential-order';

const execFileAsync = promisify(execFile);

export interface SpawnHandle {
  pid?: number;
  kill(signal?: NodeJS.Signals): void;
}

export type LifecycleSpawn = (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string },
) => SpawnHandle;

export interface AgentOsHostLifecycleOptions {
  repoRoot?: string;
  host?: string;
  port?: number;
  healthTimeoutMs?: number;
  pollIntervalMs?: number;
  spawn?: LifecycleSpawn;
  fetch?: typeof fetch;
}

export interface AgentOsHostHandle {
  host: string;
  port: number;
  wslHostPath: string;
  child: SpawnHandle;
}

/** Cold-WSL first boot budget (V0.2). Override via QF_AGENTOS_HEALTH_TIMEOUT_MS. */
export const DEFAULT_AGENTOS_HEALTH_TIMEOUT_MS = 90_000;

const CREDENTIAL_ENV_NAMES = [
  'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENCODE_API_KEY',
  'OPENCODE_ZEN_API_KEY',
  'OPENCODE_GO_API_KEY',
  'OPENROUTER_API_KEY',
  'ANTHROPIC_API_KEY',
  'AGENTOS_HOST_PORT',
] as const;

/** Host runtime knobs forwarded Win→WSL (override WSL ~/.profile drift). */
const HOST_RUNTIME_ENV_NAMES = ['AGENTOS_MODEL', 'AGENTOS_PROVIDER'] as const;

function defaultRepoRoot(): string {
  return join(fileURLToPath(new URL('../../..', import.meta.url)));
}

export function windowsPathToWslPath(value: string): string | null {
  const input = value.trim();
  const driveMatch = input.match(/^([A-Za-z]):[\\/]*(.*)$/);
  if (!driveMatch) return null;
  const rest = driveMatch[2] ? driveMatch[2].replace(/\\/g, '/') : '';
  const suffix = rest ? `/${rest}` : '';
  return `/mnt/${driveMatch[1].toLowerCase()}${suffix}`;
}

function defaultHost(): string {
  return process.env.QF_AGENTOS_HOST?.trim() || '127.0.0.1';
}

function defaultPort(): number {
  const raw = process.env.QF_AGENTOS_PORT ?? process.env.AGENTOS_HOST_PORT ?? '7430';
  return Number.parseInt(raw, 10);
}

export function resolveAgentOsHealthTimeoutMs(
  overrideMs?: number,
): number {
  if (overrideMs != null && Number.isFinite(overrideMs) && overrideMs > 0) {
    return overrideMs;
  }
  const envRaw = process.env.QF_AGENTOS_HEALTH_TIMEOUT_MS?.trim();
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_AGENTOS_HEALTH_TIMEOUT_MS;
}

function buildSpawnEnv(port: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, AGENTOS_HOST_PORT: String(port) };
  const shared: string[] = [];
  for (const name of CREDENTIAL_ENV_NAMES) {
    const value = process.env[name];
    if (value != null && value !== '') {
      env[name] = value;
      shared.push(name);
    }
  }
  for (const name of HOST_RUNTIME_ENV_NAMES) {
    const value = process.env[name];
    if (value != null && value !== '') {
      env[name] = value;
      shared.push(name);
    }
  }
  if (!shared.includes('AGENTOS_HOST_PORT')) shared.push('AGENTOS_HOST_PORT');
  // WSL imports Windows env vars only when named in WSLENV (/u = Win->WSL only).
  const inherited = process.env.WSLENV?.trim();
  const wslenv = shared.map((name) => `${name}/u`).join(':');
  env.WSLENV = inherited ? `${inherited}:${wslenv}` : wslenv;
  return env;
}

function defaultSpawn(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string },
): SpawnHandle {
  const child = nodeSpawn(command, args, {
    env: options.env,
    cwd: options.cwd,
    stdio: 'ignore',
    windowsHide: true,
    detached: false,
  });
  return {
    pid: child.pid,
    kill(signal = 'SIGTERM') {
      child.kill(signal);
    },
  };
}

async function getWslPrimaryIp(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execFileAsync(
      'wsl.exe',
      ['-e', 'bash', '-lc', 'hostname -I'],
      { encoding: 'utf8', timeout: 5_000, windowsHide: true },
    );
    return stdout.trim().split(/\s+/)[0] ?? null;
  } catch {
    return null;
  }
}

async function probeHealth(
  fetchImpl: typeof fetch,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`http://${host}:${port}/health`, { signal: controller.signal });
    if (!res.ok) return false;
    const body = await res.json() as { ok?: boolean; hasCredential?: boolean };
    if (body.ok !== true) return false;
    // Cache the host's boolean credential report (WSL env visibility).
    recordHostCredentialReport(typeof body.hasCredential === 'boolean' ? body.hasCredential : null);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask a reachable host whether ITS environment (WSL) holds an AgentOS
 * credential. Returns the host's boolean report, or null when the host is
 * unreachable, unhealthy, or predates the report. Boolean only — no
 * credential name-with-value, value, or length ever crosses this seam.
 * Successful reads are cached via recordHostCredentialReport.
 */
export async function probeAgentOsHostCredential(options: {
  host?: string;
  port?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
} = {}): Promise<boolean | null> {
  const port = options.port ?? defaultPort();
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 2_000;
  const host = options.host
    ?? await resolveAgentOsHostAddress({ port, fetch: fetchImpl });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`http://${host}:${port}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.json() as { ok?: boolean; hasCredential?: boolean };
    if (body.ok !== true) return null;
    const report = typeof body.hasCredential === 'boolean' ? body.hasCredential : null;
    recordHostCredentialReport(report);
    return report;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a host address reachable from the current OS (WSL IP fallback on Windows). */
export async function resolveAgentOsHostAddress(options: {
  port?: number;
  fetch?: typeof fetch;
  preferredHost?: string;
} = {}): Promise<string> {
  const port = options.port ?? defaultPort();
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const candidates: string[] = [];
  const preferred = options.preferredHost ?? defaultHost();
  if (preferred) candidates.push(preferred);
  if (process.platform === 'win32') {
    const wslIp = await getWslPrimaryIp();
    if (wslIp && !candidates.includes(wslIp)) candidates.push(wslIp);
  }
  for (const host of candidates) {
    if (await probeHealth(fetchImpl, host, port, 2_000)) return host;
  }
  return preferred;
}

async function pollHealth(
  fetchImpl: typeof fetch,
  host: string,
  port: number,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<boolean> {
  const started = Date.now();
  const url = `http://${host}:${port}/health`;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) {
        const body = await res.json() as { ok?: boolean };
        if (body.ok === true) return true;
      }
    } catch {
      // Host still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

export async function startAgentOsHost(
  options: AgentOsHostLifecycleOptions = {},
): Promise<AgentOsHostHandle> {
  const repoRoot = options.repoRoot ?? defaultRepoRoot();
  const host = options.host ?? defaultHost();
  const port = options.port ?? defaultPort();
  const healthTimeoutMs = resolveAgentOsHealthTimeoutMs(options.healthTimeoutMs);
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const spawnImpl = options.spawn ?? defaultSpawn;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  const wslHostPath = windowsPathToWslPath(join(repoRoot, 'tools', 'agentos-host'));
  if (!wslHostPath) {
    throw new Error(`cannot convert repo path to WSL: ${repoRoot}`);
  }

  const spawnEnv = buildSpawnEnv(port);
  const script = `cd ${JSON.stringify(wslHostPath)} && node host.js`;
  const child = spawnImpl('wsl.exe', ['-e', 'bash', '-lc', script], { env: spawnEnv });

  const reachableHost = await (async () => {
    const started = Date.now();
    while (Date.now() - started < healthTimeoutMs) {
      const candidate = await resolveAgentOsHostAddress({ port, fetch: fetchImpl, preferredHost: host });
      if (await probeHealth(fetchImpl, candidate, port, pollIntervalMs + 100)) {
        return candidate;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return null;
  })();

  if (!reachableHost) {
    child.kill('SIGTERM');
    throw new Error(`agentos-host did not become healthy within ${healthTimeoutMs}ms`);
  }

  return { host: reachableHost, port, wslHostPath, child };
}

export async function stopAgentOsHost(
  handle: AgentOsHostHandle,
  options: { fetch?: typeof fetch } = {},
): Promise<void> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  try {
    await fetchImpl(`http://${handle.host}:${handle.port}/dispose`, { method: 'POST' });
  } catch {
    // Host may already be gone.
  }
  handle.child.kill('SIGTERM');
}
