import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";
import { validatePerfBaselineFile } from "./lib/perf-baseline-schema";

const REPO_ROOT = join(import.meta.dir, "..");

type Check = {
  name: string;
  description: string;
  run: () => boolean | Promise<boolean>;
};

function walkTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function scanForPattern(
  files: string[],
  pattern: RegExp,
): { file: string; line: number; match: string }[] {
  const hits: { file: string; line: number; match: string }[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf-8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const re = new RegExp(pattern.source, pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i]!)) !== null) {
        hits.push({
          file: relative(REPO_ROOT, file),
          line: i + 1,
          match: m[0],
        });
      }
    }
  }
  return hits;
}

function runBunTest(args: string[], cwd: string): boolean {
  const result = Bun.spawnSync(["bun", "test", ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  return result.exitCode === 0;
}

const checks: Check[] = [
  {
    name: "contract-nouns",
    description: "A3 forbidden vocabulary zero-hit checks",
    run() {
      const srcPattern =
        /WorkflowRun\b|runGet|'budget-paused'|kind: 'pause'/;
      const evePattern = /state\.sessionId|EveState.*sessionId/;

      const srcHits = scanForPattern(
        walkTsFiles(join(REPO_ROOT, "src")),
        srcPattern,
      );
      const eveHits = scanForPattern(
        walkTsFiles(join(REPO_ROOT, "src", "harness", "eve")),
        evePattern,
      );

      const allHits = [...srcHits, ...eveHits];
      if (allHits.length === 0) return true;

      for (const { file, line, match } of allHits) {
        console.error(`${file}:${line}:${match}`);
      }
      return false;
    },
  },
  {
    name: "unit-kernel",
    description: "scoped kernel/conductor/harness/evals suite",
    run() {
      return runBunTest(
        ["src/kernel", "src/harness", "src/main/conductor", "src/evals"],
        REPO_ROOT,
      );
    },
  },
  {
    name: "unit-kernel-full",
    description: "full repo-root src suite",
    run() {
      return runBunTest(["src"], REPO_ROOT);
    },
  },
  {
    name: "unit-shell",
    description: "Electron shell unit suite",
    run() {
      return runBunTest([], join(REPO_ROOT, "quantflow-electron"));
    },
  },
  {
    name: "perf-baseline",
    description: "recapture qa/perf-baseline.json (5 trials per benchmark)",
    async run() {
      const { capturePerfBaseline, writePerfBaseline } = await import(
        "./perf-baseline-capture"
      );
      const baseline = await capturePerfBaseline();
      writePerfBaseline(baseline);
      return true;
    },
  },
  {
    name: "perf-baseline-present",
    description: "assert qa/perf-baseline.json exists and is well-formed",
    run() {
      return validatePerfBaselineFile();
    },
  },
  {
    name: "taxonomy-sync",
    description: "EVENT_TAXONOMY.md kind list == KERNEL_EVENT_KINDS; all kinds have call sites",
    async run() {
      const { runTaxonomySyncCheck } = await import("./lib/taxonomy-sync");
      return runTaxonomySyncCheck();
    },
  },
  {
    name: "golden-capture",
    description: "capture normalized task-atom receipt chain to qa/golden/",
    async run() {
      const { captureGoldenReceiptsJsonl, writeGoldenReceipts } = await import(
        "./lib/golden-task-atom"
      );
      writeGoldenReceipts(await captureGoldenReceiptsJsonl());
      return true;
    },
  },
  {
    name: "golden",
    description: "byte-diff task-atom receipts against committed golden",
    async run() {
      const { compareGoldenReceipts } = await import("./lib/golden-task-atom");
      return compareGoldenReceipts();
    },
  },
  {
    name: "storm",
    description:
      "PF1 storm: 100 receipt.posted → 0 full refetches; tile burst coalesces to 1",
    async run() {
      const { runStormCheck } = await import("./lib/storm-check");
      return runStormCheck();
    },
  },
  {
    name: "pty-flood",
    description:
      "E3/PF2 B7: 5000 pty:data chunks → 0 canvas projection churn; O(1) cwd milestones",
    async run() {
      const { runPtyFloodCheck } = await import("./lib/pty-flood-check");
      return runPtyFloodCheck();
    },
  },
  {
    name: "one-truth-boot",
    description:
      "D1 boot parity: JSON-authoritative load == Kernel boot (QF_ONE_TRUTH=1) after dual-write",
    async run() {
      const { runOneTruthBootCheck } = await import("./lib/one-truth-boot");
      return runOneTruthBootCheck();
    },
  },
  {
    name: "one-truth-save",
    description:
      "D2 save demotion: flag-ON writes ephemeral cache only; export + downgrade parity",
    async run() {
      const { runOneTruthSaveCheck } = await import("./lib/one-truth-save");
      return runOneTruthSaveCheck();
    },
  },
  {
    name: "connection-round-trip",
    description:
      "D4 connections: Kernel round-trip with zero runtime.db writes (QF_ONE_TRUTH=1); flag-OFF dual-write sanity",
    async run() {
      const { runConnectionRoundTripCheck } = await import(
        "./lib/connection-round-trip"
      );
      return runConnectionRoundTripCheck();
    },
  },
  {
    name: "canvas-cache-discipline",
    description:
      "D3 lint: shell src cache mutations only in documented allowlist (canvas-state reconcile paths)",
    async run() {
      const { runCanvasCacheDisciplineCheck } = await import(
        "./lib/canvas-cache-discipline"
      );
      return runCanvasCacheDisciplineCheck();
    },
  },
  {
    name: "divergence",
    description:
      "D5 capstone: Kernel snapshot == canvas projection == export mirror; events corroborate; receipt-free assembly",
    async run() {
      const { runDivergenceCheck } = await import("./lib/divergence");
      return runDivergenceCheck();
    },
  },
  {
    name: "one-event-path",
    description:
      "E1: single kernel:event projection path; emitKernelEvent allowlist; runtime kinds disjoint from taxonomy",
    async run() {
      const { runOneEventPathCheck } = await import("./lib/one-event-path");
      return runOneEventPathCheck();
    },
  },
  {
    name: "secrets-accessor",
    description:
      "F1: all secret env reads route through src/vault/credentials; no secret literals in source",
    async run() {
      const { runSecretsAccessorCheck } = await import("./lib/secrets-accessor");
      return runSecretsAccessorCheck();
    },
  },
  {
    name: "runtime-fence",
    description:
      "F2: no Kernel-canonical fact originates outside Kernel command handlers",
    async run() {
      const { runRuntimeFenceCheck } = await import("./lib/runtime-fence");
      return runRuntimeFenceCheck();
    },
  },
  {
    name: "kill-switch",
    description:
      "F2: app core runs with Eve and AgentOS unreachable — golden + one-truth + graceful Eve degradation",
    async run() {
      const { runKillSwitchCheck } = await import("./lib/kill-switch");
      return runKillSwitchCheck();
    },
  },
];

const checkByName = new Map(checks.map((c) => [c.name, c]));

function listChecks(): void {
  for (const { name, description } of checks) {
    console.log(`${name}\t${description}`);
  }
}

function usage(): void {
  console.error(`Unknown check: ${nameArg}`);
  console.error(`Valid checks: ${checks.map((c) => c.name).join(", ")}`);
}

const args = process.argv.slice(2);
const nameArg = args[0];

if (args.length === 0 || nameArg === "--help" || nameArg === "-h") {
  console.error("Usage: bun qa/run.ts --list | bun qa/run.ts <check-name>");
  process.exit(args.length === 0 ? 1 : 0);
}

if (nameArg === "--list") {
  listChecks();
  process.exit(0);
}

const check = checkByName.get(nameArg!);
if (!check) {
  usage();
  process.exit(1);
}

const ok = await check.run();
process.exit(ok ? 0 : 1);
