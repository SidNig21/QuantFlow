/**
 * P6 scripted AgentOS loop proof — launches Electron with sim transport and
 * captures screenshots to docs/v5/reports/evidence/.
 *
 * Run: bun run proof:agentos-loop   (from quantflow-electron/)
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ELECTRON_DIR = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(ELECTRON_DIR, "..");
const EVIDENCE_DIR = join(REPO_ROOT, "docs", "v5", "reports", "evidence");
const TIMEOUT_MS = 120_000;

function resolveElectronCli(): string {
  const cli = join(ELECTRON_DIR, "node_modules", "electron", "cli.js");
  if (!existsSync(cli)) {
    throw new Error(`electron cli not found at ${cli}`);
  }
  return cli;
}

function ensureBuilt(): void {
  const mainOut = join(ELECTRON_DIR, "out", "main", "index.js");
  if (existsSync(mainOut)) return;
  console.log("proof:agentos-loop — building electron bundle first");
  const build = Bun.spawnSync(
    ["node", "./scripts/run-local-bin.mjs", "electron-vite", "build"],
    { cwd: ELECTRON_DIR, stdout: "inherit", stderr: "inherit" },
  );
  if (build.exitCode !== 0) {
    throw new Error(`electron-vite build failed (exit ${build.exitCode})`);
  }
}

async function main(): Promise<void> {
  ensureBuilt();

  const dataRoot = mkdtempSync(join(tmpdir(), "qf-agentos-loop-proof-"));
  const quantflowDir = join(dataRoot, "quantflow");
  const userDataDir = join(dataRoot, "userData");
  // 0 = OS-assigned ephemeral port; random picks can hit Windows excluded ranges (EACCES).
  const relayTcpPort = "0";

  const electronCli = resolveElectronCli();
  const proc = Bun.spawn({
    cmd: [process.execPath, electronCli, "."],
    cwd: ELECTRON_DIR,
    env: {
      ...process.env,
      QF_AGENTOS_SIM: "1",
      QF_AGENTOS_LOOP_PROOF: "1",
      QF_LOOP_PROOF_EVIDENCE_DIR: EVIDENCE_DIR,
      QF_QUANTFLOW_DIR: quantflowDir,
      QF_USER_DATA_DIR: userDataDir,
      QF_RELAY_TCP_PORT: relayTcpPort,
      QUANTFLOW_DEV_WORKTREE_ROOT: ELECTRON_DIR,
    },
    // Pipe (not inherit) both streams: orphaned Electron descendants otherwise
    // inherit the caller's console handles and keep outer pipelines open.
    stdout: "pipe",
    stderr: "pipe",
  });

  const stderrPump = (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      process.stderr.write(decoder.decode(value, { stream: true }));
    }
  })();
  void stderrPump;

  const stdout = proc.stdout;
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let exitCode: number | null = null;
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, TIMEOUT_MS);

  const readLoop = async (): Promise<void> => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      process.stdout.write(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("LOOP-PROOF:")) {
          // Machine-readable proof lines stream to parent stdout.
        }
      }
    }
    if (buffer) process.stdout.write(buffer);
  };

  await Promise.race([
    readLoop(),
    proc.exited.then((code) => {
      exitCode = code;
    }),
  ]);

  clearTimeout(timeout);
  if (exitCode === null) {
    exitCode = await proc.exited;
  }

  if (timedOut) {
    console.error(`proof:agentos-loop timed out after ${TIMEOUT_MS}ms`);
    process.exit(1);
  }

  if (exitCode !== 0) {
    console.error(`proof:agentos-loop electron exited ${exitCode}`);
    process.exit(exitCode ?? 1);
  }

  for (const name of [
    "01-blocked-approval.png",
    "02-approved-timeline.png",
  ]) {
    const path = join(EVIDENCE_DIR, name);
    if (!existsSync(path)) {
      console.error(`proof:agentos-loop missing required screenshot: ${path}`);
      process.exit(1);
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
