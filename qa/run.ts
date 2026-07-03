import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

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
