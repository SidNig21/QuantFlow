/**
 * Eve AgentOS live A2A cable relay proof launcher.
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { reserveProofAgentOsPort } from "./proof-agentos-port";

const ELECTRON_DIR = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(ELECTRON_DIR, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "docs", "v7", "reports", "evidence");
const TIMEOUT_MS = 480_000;

function resolveElectronCli(): string {
  const cli = join(ELECTRON_DIR, "node_modules", "electron", "cli.js");
  if (!existsSync(cli)) throw new Error(`electron cli not found at ${cli}`);
  return cli;
}

function ensureBuilt(): void {
  const build = Bun.spawnSync(
    ["node", "./scripts/run-local-bin.mjs", "electron-vite", "build"],
    { cwd: ELECTRON_DIR, stdout: "inherit", stderr: "inherit" },
  );
  if (build.exitCode !== 0) throw new Error(`electron-vite build failed (exit ${build.exitCode})`);
}

async function main(): Promise<void> {
  ensureBuilt();
  const dataRoot = mkdtempSync(join(tmpdir(), "qf-agentos-eve-a2a-proof-"));
  const agentOsPort = reserveProofAgentOsPort();
  const proc = Bun.spawn({
    cmd: [process.execPath, resolveElectronCli(), "."],
    cwd: ELECTRON_DIR,
    env: {
      ...process.env,
      QF_AGENTOS_EVE_A2A_PROOF: "1",
      QF_TERMINAL_PROOF_EVIDENCE_DIR: EVIDENCE_DIR,
      QF_QUANTFLOW_DIR: join(dataRoot, "quantflow"),
      QF_USER_DATA_DIR: join(dataRoot, "userData"),
      QF_AGENTOS_PORT: String(agentOsPort),
      AGENTOS_HOST_PORT: String(agentOsPort),
      // Proof-only Eve port range: never collide with the live app's pool (3010-3909).
      EVE_PORT_BASE: process.env.EVE_PORT_BASE ?? "4200",
      EVE_PORT_RANGE: process.env.EVE_PORT_RANGE ?? "300",
      QF_RELAY_TCP_PORT: "0",
      QF_AGENTOS_HEALTH_TIMEOUT_MS: process.env.QF_AGENTOS_HEALTH_TIMEOUT_MS ?? "180000",
      QUANTFLOW_DEV_WORKTREE_ROOT: REPO_ROOT,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const decoder = new TextDecoder();
  const timeout = setTimeout(() => proc.kill(), TIMEOUT_MS);
  const pump = async (stream: ReadableStream<Uint8Array>, write: (chunk: string) => void) => {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      write(decoder.decode(value, { stream: true }));
    }
  };
  await Promise.all([
    pump(proc.stdout, (chunk) => process.stdout.write(chunk)),
    pump(proc.stderr, (chunk) => process.stderr.write(chunk)),
  ]);
  clearTimeout(timeout);

  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode ?? 1);
  const shot = join(EVIDENCE_DIR, "V7-02-agentos-eve-a2a-live.png");
  if (!existsSync(shot)) {
    console.error(`proof:agentos-eve-a2a missing screenshot: ${shot}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
