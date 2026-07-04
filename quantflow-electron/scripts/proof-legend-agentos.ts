/**
 * V2 legend-agentos proof launcher.
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ELECTRON_DIR = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(ELECTRON_DIR, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "docs", "v6", "reports", "evidence");
const TIMEOUT_MS = 120_000;

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
  const dataRoot = mkdtempSync(join(tmpdir(), "qf-legend-agentos-proof-"));
  const proc = Bun.spawn({
    cmd: [process.execPath, resolveElectronCli(), "."],
    cwd: ELECTRON_DIR,
    env: {
      ...process.env,
      QF_AGENTOS_SIM: "1",
      QF_LEGEND_AGENTOS_PROOF: "1",
      QF_TERMINAL_PROOF_EVIDENCE_DIR: EVIDENCE_DIR,
      QF_QUANTFLOW_DIR: join(dataRoot, "quantflow"),
      QF_USER_DATA_DIR: join(dataRoot, "userData"),
      QF_RELAY_TCP_PORT: "0",
      QUANTFLOW_DEV_WORKTREE_ROOT: ELECTRON_DIR,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  const timeout = setTimeout(() => proc.kill(), TIMEOUT_MS);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value, { stream: true }));
  }
  clearTimeout(timeout);
  const exitCode = await proc.exited;
  if (exitCode !== 0) process.exit(exitCode ?? 1);
  const shot = join(EVIDENCE_DIR, "V2-00-legend-agentos.png");
  if (!existsSync(shot)) {
    console.error(`proof:legend-agentos missing screenshot: ${shot}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
