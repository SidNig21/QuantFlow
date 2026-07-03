import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KernelDB } from '../database';
import type { ArtifactRow, TaskRow } from '../schema/types';
import { traceSync } from '../perf/trace';

export interface ArtifactVerifyFs {
  existsSync?(path: string): boolean;
  readFileSync(path: string): Uint8Array | string;
}

export interface StructuralArtifactFailure {
  artifactId: string;
  reason: string;
}

export interface OpenedArtifact {
  artifactId: string;
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface StructuralArtifactPass {
  ok: true;
  artifactIds: string[];
  openedArtifacts: OpenedArtifact[];
  artifactRoot: string;
}

export interface StructuralArtifactFail {
  ok: false;
  artifactIds: string[];
  failures: StructuralArtifactFailure[];
  openedArtifacts: OpenedArtifact[];
  artifactRoot: string;
}

export type StructuralArtifactResult = StructuralArtifactPass | StructuralArtifactFail;

export interface VerifyTaskArtifactsOptions {
  taskId: string;
  artifactRefs: string[];
  artifactRoot?: string | null;
  fs?: ArtifactVerifyFs;
}

const defaultFs: ArtifactVerifyFs = {
  existsSync,
  readFileSync,
};

export function resolveArtifactRoot(
  db: KernelDB,
  workflowId?: string | null,
  explicitRoot?: string | null,
): string {
  if (explicitRoot && explicitRoot.trim()) return resolve(explicitRoot);
  if (workflowId) {
    const row = db
      .prepare('SELECT vault_path FROM workflows WHERE id = ?')
      .get(workflowId) as { vault_path: string | null } | undefined;
    if (row?.vault_path?.trim()) return resolve(row.vault_path);
  }
  const qfDir = process.env.QUANTFLOW_DIR?.trim() || process.cwd();
  return resolve(qfDir, 'artifacts');
}

export function verifyTaskArtifacts(
  db: KernelDB,
  options: VerifyTaskArtifactsOptions,
): StructuralArtifactResult {
  return traceSync(
    {
      layer: 'artifact',
      name: 'artifact.verify',
      task_id: options.taskId,
      payload_size_bytes: options.artifactRefs.length,
    },
    () => verifyTaskArtifactsInner(db, options),
  );
}

function verifyTaskArtifactsInner(
  db: KernelDB,
  options: VerifyTaskArtifactsOptions,
): StructuralArtifactResult {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(options.taskId) as TaskRow | undefined;
  const artifactRoot = resolveArtifactRoot(db, task?.workflow_id ?? null, options.artifactRoot);
  const artifactIds = [...new Set(options.artifactRefs.filter((id) => id.trim().length > 0))];
  const io = options.fs ?? defaultFs;
  const failures: StructuralArtifactFailure[] = [];
  const openedArtifacts: OpenedArtifact[] = [];

  if (!task) {
    return {
      ok: false,
      artifactIds,
      failures: [{ artifactId: options.taskId, reason: `task not found: ${options.taskId}` }],
      openedArtifacts,
      artifactRoot,
    };
  }

  if (artifactIds.length === 0) {
    return {
      ok: false,
      artifactIds,
      failures: [{ artifactId: '', reason: 'at least one artifact ref is required' }],
      openedArtifacts,
      artifactRoot,
    };
  }

  for (const artifactId of artifactIds) {
    const artifact = db
      .prepare('SELECT * FROM artifacts WHERE id = ?')
      .get(artifactId) as ArtifactRow | undefined;
    if (!artifact) {
      failures.push({ artifactId, reason: 'artifact record not found' });
      continue;
    }
    const linkFailure = validateArtifactLink(task, artifact);
    if (linkFailure) {
      failures.push({ artifactId, reason: linkFailure });
      continue;
    }
    if (!artifact.uri) {
      failures.push({ artifactId, reason: 'artifact uri is required' });
      continue;
    }

    const path = resolveArtifactPath(artifactRoot, artifact.uri);
    if (!path || !isUnderRoot(path, artifactRoot)) {
      failures.push({ artifactId, reason: `artifact uri resolves outside artifact_root: ${artifact.uri}` });
      continue;
    }

    try {
      if (io.existsSync && !io.existsSync(path)) {
        failures.push({ artifactId, reason: `artifact file missing: ${path}` });
        continue;
      }
      const raw = io.readFileSync(path);
      const bytes = typeof raw === 'string' ? Buffer.from(raw) : Buffer.from(raw);
      if (bytes.length === 0) {
        failures.push({ artifactId, reason: `artifact file empty: ${path}` });
        continue;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (artifact.content_hash && artifact.content_hash !== sha256) {
        failures.push({ artifactId, reason: 'artifact sha256 mismatch' });
        continue;
      }
      openedArtifacts.push({ artifactId, path, sizeBytes: bytes.length, sha256 });
    } catch (err) {
      failures.push({
        artifactId,
        reason: err instanceof Error ? `artifact file unreadable: ${err.message}` : String(err),
      });
    }
  }

  if (failures.length > 0) {
    return { ok: false, artifactIds, failures, openedArtifacts, artifactRoot };
  }
  return { ok: true, artifactIds, openedArtifacts, artifactRoot };
}

function validateArtifactLink(task: TaskRow, artifact: ArtifactRow): string | null {
  if (artifact.workflow_id !== task.workflow_id) return 'artifact workflow_id is not linked to task';
  if (artifact.task_id !== task.id) return 'artifact task_id is not linked to task';
  if (!task.owner_worker_id) return 'task has no owner_worker_id';
  if (artifact.worker_id !== task.owner_worker_id) return 'artifact worker_id is not linked to task owner';
  return null;
}

function resolveArtifactPath(root: string, uri: string): string | null {
  let normalizedUri = uri;
  try {
    if (uri.startsWith('file:')) normalizedUri = fileURLToPath(uri);
  } catch {
    return null;
  }
  return isAbsolute(normalizedUri) ? resolve(normalizedUri) : resolve(root, normalizedUri);
}

function isUnderRoot(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
