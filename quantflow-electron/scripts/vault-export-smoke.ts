/**
 * Vault OKF export smoke (Goal 8).
 *
 * Drives a small workflow through the real Kernel (full pass lifecycle + an
 * artifact, a blocked task, an open task, and a Conductor planning receipt),
 * then exports it to OKF Markdown and asserts the acceptance criteria:
 *
 *   - workflow summary carries goal, status, receipts, artifacts, blockers,
 *     verification results, and open follow-ups
 *   - task summary preserves task id / workflow id / status + receipt chain
 *   - receipt_chain is chronological and append-only in meaning
 *   - state_card_snapshot reflects Kernel State Cards, not logs
 *   - exporter does not read from / depend on the legacy Envoy mirror
 *   - re-running the export is deterministic (byte-identical)
 *
 * Uses bun:sqlite; the vault layer imports the Kernel only as db-injected
 * queries (no Electron, no ?raw).
 *
 * Run: bun scripts/vault-export-smoke.ts   (from quantflow-electron/)
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleTileCommand } from '../../src/kernel/commands/tile-commands';
import { handleTaskCommand } from '../../src/kernel/tasks/index';
import { handleArtifactCommand } from '../../src/kernel/receipts/index';
import { handleConductorCommand } from '../../src/kernel/conductor/index';
import { startStateCardWatcher } from '../../src/kernel/watchers/index';
import { seedHarnessRegistry } from '../../src/kernel/worker-instances/index';
import {
  collectVaultExport,
  renderVaultExport,
  writeVaultExports,
} from '../../src/vault/index';

let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures += 1; console.error(`  FAIL  ${label}`); }
}

const schemaPath = join(import.meta.dir, '..', '..', 'src', 'kernel', 'migrations', '001-v3-baseline.sql');
const db = new Database(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(schemaPath, 'utf-8'));
const t0 = Date.now();
const artifactRoot = mkdtempSync(join(tmpdir(), 'qf-vault-export-'));
db.prepare(
  `INSERT INTO workflows (id, name, objective, status, created_at, updated_at)
   VALUES ('wf1','Build Replay Loader','Load and verify replays end to end','active',?,?)`,
).run(t0, t0);
// deno-lint-ignore no-explicit-any
const kdb = db as any;
seedHarnessRegistry(kdb);
startStateCardWatcher(kdb);

// Tiles (via command → tile.created event → watcher seeds State Cards).
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_w', workflowId: 'wf1', displayName: 'Coder', tileKind: 'worker' });
handleTileCommand(kdb, 'kernel.tile.create', { id: 'tile_v', workflowId: 'wf1', displayName: 'Verifier', tileKind: 'worker' });
db.prepare(`INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at) VALUES ('w_owner','tile_w','wf1','active',?,?)`).run(t0, t0);
db.prepare(`INSERT INTO worker_instances (id, tile_id, workflow_id, status, created_at, updated_at) VALUES ('w_verifier','tile_v','wf1','active',?,?)`).run(t0, t0);

// Conductor decision (planning receipt) — a key decision in the log.
handleConductorCommand(kdb, 'kernel.conductor.plan', {
  workflowId: 'wf1', summary: 'Plan: build then verify the loader', phase: 'executed', proposedAction: 'create_task',
});

// task1: full pass lifecycle + artifact.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task1', workflowId: 'wf1', title: 'Implement loader', objective: 'Implement and prove the loader' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task1', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task1' });
mkdirSync(join(artifactRoot, 'src'), { recursive: true });
writeFileSync(join(artifactRoot, 'src', 'loader.ts'), 'export function load() { return true; }', 'utf-8');
const artifact = handleArtifactCommand(kdb, 'kernel.artifact.create', { workflowId: 'wf1', taskId: 'task1', workerId: 'w_owner', kind: 'code', uri: 'src/loader.ts', summary: 'replay loader module' });
handleTaskCommand(kdb, 'kernel.task.submit', { taskId: 'task1', summary: 'loader implemented', artifactRefs: [artifact.id] });
handleTaskCommand(kdb, 'kernel.task.verify', { taskId: 'task1', verifierWorkerId: 'w_verifier', verdict: 'pass', artifactRoot });

// task2: blocked.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task2', workflowId: 'wf1', title: 'Wire UI', objective: 'Wire the loader UI' });
handleTaskCommand(kdb, 'kernel.task.claim', { taskId: 'task2', ownerWorkerId: 'w_owner' });
handleTaskCommand(kdb, 'kernel.task.start', { taskId: 'task2' });
handleTaskCommand(kdb, 'kernel.task.block', { taskId: 'task2', reason: 'waiting on loader API' });

// task_open: never claimed.
handleTaskCommand(kdb, 'kernel.task.create', { id: 'task_open', workflowId: 'wf1', title: 'Docs', objective: 'Document the loader' });

console.log('— collect + render —');
const bundle = collectVaultExport(kdb, 'wf1')!;
check('bundle collected', !!bundle);
check('missing workflow → null', collectVaultExport(kdb, 'nope') === null);
const files = renderVaultExport(bundle);
const byPath = new Map(files.map((f) => [f.path, f.content]));
check('renders the six export kinds + per-task', files.some((f) => f.type === 'workflow_summary') && files.filter((f) => f.type === 'task_summary').length === 3);

const summary = byPath.get('wf1/workflow_summary.md')!;
console.log('\n— workflow_summary acceptance —');
check('frontmatter type + workflow_id', summary.includes('type: workflow_summary') && summary.includes('workflow_id: wf1'));
check('goal/objective present', summary.includes('Load and verify replays end to end'));
check('status present', /## Status\n.*active/.test(summary));
check('receipts section', summary.includes('## Receipts'));
check('artifacts section references index', summary.includes('## Artifacts') && summary.includes('artifact_index.md'));
check('blockers names blocked task2', /## Blockers[\s\S]*task2/.test(summary) && summary.includes('waiting on loader API'));
check('verification results show passed', /## Verification results[\s\S]*verification_passed/.test(summary));
check('open follow-ups list non-terminal tasks', /## Open follow-ups[\s\S]*task_open/.test(summary) && /## Open follow-ups[\s\S]*task2/.test(summary));
check('completed task1 NOT an open follow-up', !/## Open follow-ups[\s\S]*task1/.test(summary));

console.log('\n— task_summary preserves ids + chain —');
const task1Doc = byPath.get('wf1/tasks/task1.md')!;
check('task frontmatter ids + status', task1Doc.includes('task_id: task1') && task1Doc.includes('workflow_id: wf1') && task1Doc.includes('status: complete'));
check('task receipt chain present', /## Receipt chain[\s\S]*task_submitted/.test(task1Doc) && /verification_passed/.test(task1Doc));
check('task artifacts listed', /## Artifacts[\s\S]*replay loader module/.test(task1Doc));

console.log('\n— receipt_chain is chronological + append-only in meaning —');
const chain = byPath.get('wf1/receipt_chain.md')!;
check('chain frontmatter', chain.includes('type: receipt_chain'));
check('append-only note', /append-only/i.test(chain));
// Timestamps in render order must be non-decreasing.
const isoMatches = [...chain.matchAll(/`(\d{4}-\d{2}-\d{2}T[^`]+Z)`/g)].map((m) => Date.parse(m[1]));
let nonDecreasing = true;
for (let i = 1; i < isoMatches.length; i += 1) if (isoMatches[i] < isoMatches[i - 1]) nonDecreasing = false;
check('chain timestamps non-decreasing', isoMatches.length > 0 && nonDecreasing);
check('planning + lifecycle receipts present', chain.includes('planning') && chain.includes('task_completed'));

console.log('\n— state_card_snapshot reflects Kernel cards, not logs —');
const cards = byPath.get('wf1/state_card_snapshot.md')!;
check('snapshot frontmatter', cards.includes('type: state_card_snapshot'));
check('references tile state cards', cards.includes('tile_w') && cards.includes('Reflects Kernel State Cards'));
check('no raw-log dump markers', !/\x1b\[/.test(cards));

console.log('\n— artifact_index + decision_log —');
const artifacts = byPath.get('wf1/artifact_index.md')!;
check('artifact index lists the code artifact', artifacts.includes('type: artifact_index') && artifacts.includes('src/loader.ts'));
const decisions = byPath.get('wf1/decision_log.md')!;
check('decision log includes the planning decision', decisions.includes('type: decision_log') && decisions.includes('planning'));

console.log('\n— exporter does not depend on / reference the Envoy mirror —');
const allContent = files.map((f) => f.content).join('\n');
check('no "envoy" anywhere in exported output', !/envoy/i.test(allContent));
// And the vault source itself must not import or call into Envoy. We scan code
// lines only (comments may legitimately say "never touches Envoy").
const vaultFiles = ['index.ts', 'types.ts', 'okf/frontmatter.ts', 'exporters/index.ts', 'exporters/shared.ts',
  'exporters/workflow-summary.ts', 'exporters/task-summary.ts', 'exporters/artifact-index.ts',
  'exporters/decision-log.ts', 'exporters/receipt-chain.ts', 'exporters/state-card-snapshot.ts'];
const codeLines = vaultFiles
  .flatMap((p) => readFileSync(join(import.meta.dir, '..', '..', 'src', 'vault', p), 'utf-8').split('\n'))
  .map((line) => line.replace(/\/\/.*$/, '').replace(/\/\*.*$/, '').replace(/^\s*\*.*$/, ''));
const importsEnvoy = codeLines.some((line) => /\bimport\b/.test(line) && /envoy/i.test(line));
const callsEnvoy = codeLines.some((line) => /envoy/i.test(line));
check('vault source has no Envoy import or reference in code', !importsEnvoy && !callsEnvoy);

console.log('\n— determinism: re-render is byte-identical —');
const files2 = renderVaultExport(collectVaultExport(kdb, 'wf1')!);
const same = files.length === files2.length && files.every((f, i) => f.path === files2[i].path && f.content === files2[i].content);
check('two renders identical', same);

console.log('\n— thin write boundary writes expected paths (in-memory fs) —');
const written = new Map<string, string>();
const dirs = new Set<string>();
const ops = {
  mkdir: async (dir: string) => { dirs.add(dir); },
  writeFile: async (path: string, content: string) => { written.set(path, content); },
};
const paths = await writeVaultExports(files, '/vault', ops, (...parts) => parts.join('/'));
check('writes all files', paths.length === files.length && written.has('/vault/wf1/workflow_summary.md') && written.has('/vault/wf1/tasks/task1.md'));
check('made the tasks subdir', dirs.has('/vault/wf1/tasks'));
// Re-running writes identical bytes (idempotent).
const written2 = new Map<string, string>();
await writeVaultExports(renderVaultExport(collectVaultExport(kdb, 'wf1')!), '/vault',
  { mkdir: async () => {}, writeFile: async (p: string, c: string) => { written2.set(p, c); } },
  (...parts) => parts.join('/'));
check('re-write is idempotent', [...written.entries()].every(([p, c]) => written2.get(p) === c));

console.log(`\n${failures === 0 ? 'OK' : 'FAILED'} — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
