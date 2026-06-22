/**
 * Vault OKF export — v3 Goal 8 entry point.
 *
 * Three layers, deliberately separated so the formatting stays pure and testable:
 *  1. collectVaultExport(db, workflowId) — reads Kernel truth into a bundle.
 *  2. renderVaultExport(bundle)          — pure: bundle → deterministic files.
 *  3. writeVaultExports(files, dir, ops) — thin file-write boundary (injectable fs).
 *
 * Authority: the Kernel/SQLite is live truth; the vault is a durable knowledge
 * MIRROR. This module only reads the Kernel and writes Markdown. It never reads
 * vault files as truth and never touches the legacy Envoy Obsidian mirror.
 * See src/vault/AGENTS.md, docs/v3/VAULT_OKF_SPEC.md, KERNEL_CONSTITUTION.md.
 */

import type { KernelDB } from '../kernel/database';
import { queryWorkflowSnapshot } from '../kernel/conductor/index';
import { queryWorkflowRegion } from '../kernel/workflows/index';
import { queryTaskList } from '../kernel/tasks/index';
import { queryReceiptList, queryArtifactList } from '../kernel/receipts/index';
import { queryStateCardList } from '../kernel/state-cards/index';

import {
  formatWorkflowSummary,
  formatTaskSummary,
  formatArtifactIndex,
  formatDecisionLog,
  formatReceiptChain,
  formatStateCardSnapshot,
} from './exporters/index';
import { chronological } from './exporters/shared';
import type { VaultExportBundle, VaultExportFile } from './types';

export * from './types';
export * from './exporters/index';
export { frontmatter, toIso } from './okf/frontmatter';

/**
 * Read one workflow's complete export bundle from the Kernel. Returns null when
 * the workflow does not exist. All lists are sorted deterministically here so
 * the renderers stay order-agnostic.
 */
export function collectVaultExport(db: KernelDB, workflowId: string): VaultExportBundle | null {
  const workflow = queryWorkflowSnapshot(db, workflowId);
  const region = queryWorkflowRegion(db, workflowId);
  if (!workflow || !region) return null;

  const row = db
    .prepare('SELECT created_at, updated_at FROM workflows WHERE id = ?')
    .get(workflowId) as { created_at: number; updated_at: number } | undefined;

  const tasks = [...queryTaskList(db, { workflowId })].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  // queryReceiptList is newest-first when workflow-scoped; the chain is oldest-first.
  const receipts = chronological(queryReceiptList(db, { workflowId, limit: 100000 }));
  const artifacts = queryArtifactList(db, { workflowId });
  const stateCards = queryStateCardList(db, { workflowId });

  return {
    workflow,
    region,
    workflowCreatedAt: row?.created_at ?? 0,
    workflowUpdatedAt: row?.updated_at ?? 0,
    tasks,
    receipts,
    artifacts,
    stateCards,
  };
}

/**
 * Pure: render a bundle into the full set of vault files. Deterministic — the
 * same bundle always yields byte-identical files in a stable order. Paths are
 * POSIX-relative to the export root: `<workflowId>/<file>`.
 */
export function renderVaultExport(bundle: VaultExportBundle): VaultExportFile[] {
  const wf = bundle.workflow.id;
  const files: VaultExportFile[] = [
    { path: `${wf}/workflow_summary.md`, type: 'workflow_summary', content: formatWorkflowSummary(bundle) },
    { path: `${wf}/receipt_chain.md`, type: 'receipt_chain', content: formatReceiptChain(bundle) },
    { path: `${wf}/artifact_index.md`, type: 'artifact_index', content: formatArtifactIndex(bundle) },
    { path: `${wf}/decision_log.md`, type: 'decision_log', content: formatDecisionLog(bundle) },
    { path: `${wf}/state_card_snapshot.md`, type: 'state_card_snapshot', content: formatStateCardSnapshot(bundle) },
  ];

  // One task_summary per task, in deterministic task order.
  for (const task of bundle.tasks) {
    files.push({
      path: `${wf}/tasks/${task.id}.md`,
      type: 'task_summary',
      content: formatTaskSummary(task, bundle.receipts, bundle.artifacts),
    });
  }

  return files;
}

/** Minimal filesystem surface — injectable so the write path is testable. */
export interface VaultFsOps {
  mkdir(dir: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
}

/**
 * Write rendered files under `outDir`. Idempotent and re-runnable: files are
 * overwritten with identical bytes when the Kernel state is unchanged. Paths are
 * joined with the platform separator via the injected ops' own conventions; the
 * caller supplies `join`.
 */
export async function writeVaultExports(
  files: VaultExportFile[],
  outDir: string,
  ops: VaultFsOps,
  join: (...parts: string[]) => string,
): Promise<string[]> {
  const written: string[] = [];
  const madeDirs = new Set<string>();
  for (const file of files) {
    const segments = file.path.split('/');
    const fileName = segments.pop() as string;
    const dir = join(outDir, ...segments);
    if (!madeDirs.has(dir)) {
      await ops.mkdir(dir);
      madeDirs.add(dir);
    }
    const fullPath = join(dir, fileName);
    await ops.writeFile(fullPath, file.content);
    written.push(fullPath);
  }
  return written;
}

/**
 * Convenience: collect → render → write a workflow export in one call. Returns
 * the written paths, or null when the workflow does not exist.
 */
export async function exportWorkflowToVault(
  db: KernelDB,
  workflowId: string,
  outDir: string,
  ops: VaultFsOps,
  join: (...parts: string[]) => string,
): Promise<string[] | null> {
  const bundle = collectVaultExport(db, workflowId);
  if (!bundle) return null;
  return writeVaultExports(renderVaultExport(bundle), outDir, ops, join);
}

/**
 * R7 lesson mirror trigger. The lesson artifact remains Kernel truth; this
 * merely writes the workflow's OKF mirror after at least one lesson artifact
 * exists for the workflow.
 */
export async function mirrorLessonArtifactsToVault(
  db: KernelDB,
  workflowId: string,
  outDir: string,
  ops: VaultFsOps,
  join: (...parts: string[]) => string,
): Promise<string[] | null> {
  const lessons = queryArtifactList(db, { workflowId }).filter((artifact) => artifact.kind === 'lesson');
  if (lessons.length === 0) return null;
  return exportWorkflowToVault(db, workflowId, outDir, ops, join);
}
