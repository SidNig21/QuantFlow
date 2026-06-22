import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { KernelDB } from '../../kernel/database';
import type { CommandResult } from '../../kernel/commands/types';
import { queryTaskGet } from '../../kernel/tasks/index';
import { queryArtifactList, queryReceiptList } from '../../kernel/receipts/index';
import { queryRun } from '../../kernel/workflows/index';
import { readSchedulableTasks } from './dag-scheduler';
import type { CheckpointCandidate, CheckpointRequest, ConductorLoop } from './conductor-loop';
import { taskIdForCheckpointCandidate } from './conductor-loop';

export type AttentionLevel = 'high' | 'medium' | 'low';

export interface RunTemplateTile {
  id: string;
  roleId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface RunTemplateConnection {
  id?: string;
  fromTileId: string;
  toTileId: string;
  semanticType?: string;
  label?: string;
}

export interface RunTemplateArtifactExpectation {
  phaseId: string;
  kind: string;
}

export interface RunTemplateTaskPhase {
  id: string;
  type: 'task';
  attention: AttentionLevel;
  taskId: string;
  title: string;
  objective: string;
  roleId: string;
  dependsOn?: string[];
}

export interface RunTemplateCheckpointPhase {
  id: string;
  type: 'checkpoint';
  attention: AttentionLevel;
  checkpointId: string;
  summary?: string;
  dependsOnTaskIds?: string[];
  candidates: CheckpointCandidate[];
}

export type RunTemplatePhase = RunTemplateTaskPhase | RunTemplateCheckpointPhase;

export interface RunTemplate {
  id: string;
  name: string;
  description?: string;
  budget?: Record<string, unknown>;
  stopConditions?: Record<string, unknown>;
  artifactExpectations?: RunTemplateArtifactExpectation[];
  tiles: RunTemplateTile[];
  connections?: RunTemplateConnection[];
  phases: RunTemplatePhase[];
}

export interface CompiledRunTemplate {
  template: RunTemplate;
  taskPhases: RunTemplateTaskPhase[];
  checkpointPhases: RunTemplateCheckpointPhase[];
  taskDependencies: Array<{ taskId: string; dependsOnTaskId: string; kind: 'blocks' }>;
  stockedRoleIds: string[];
}

export interface ExecuteTemplateTaskInput {
  workflowId: string;
  taskId: string;
  tileId: string;
  roleId: string;
  phaseId: string;
  attention: AttentionLevel;
  attemptId: string;
}

export interface RunTemplateSelection {
  checkpointId: string;
  selectedCandidateIds: string[];
}

export interface RunTemplateInvokeInput {
  templateId: string;
  workflowId?: string;
  objective?: string;
  selections?: RunTemplateSelection[];
}

export interface RunTemplateExecutionEvent {
  kind: 'task-batch' | 'task' | 'checkpoint';
  attention: AttentionLevel;
  taskIds?: string[];
  checkpointId?: string;
  proposalToken?: string;
}

export interface RunTemplateRunResult {
  ok: boolean;
  workflowId: string;
  templateId: string;
  taskIds: string[];
  artifactIds: string[];
  receiptIds: string[];
  executionLog: RunTemplateExecutionEvent[];
  schedulerCalls: number;
  error?: string;
}

export interface RunTemplateRunnerDeps {
  db: KernelDB;
  dispatchKernel(type: string, payload: Record<string, unknown>, requestedBy?: string): Promise<CommandResult> | CommandResult;
  executeTask(input: ExecuteTemplateTaskInput): Promise<CommandResult>;
  checkpointLoop: ConductorLoop;
  templateDir?: string;
  stockedRoleIds?: Iterable<string>;
  scheduler?(db: KernelDB, workflowId: string): string[];
  now?(): number;
}

const DEFAULT_STOCKED_ROLE_IDS = [
  'shell',
  'codex',
  'hermes',
  'claude-worker',
  'claude-reviewer',
  'opencode',
  'python',
  'puffer',
  'planner',
  'researcher',
  'reviewer',
  'writer',
];

function defaultTemplateDir(): string {
  const fromCwd = resolve(process.cwd(), 'run-templates');
  if (existsSync(fromCwd)) return fromCwd;
  return resolve(process.cwd(), '..', 'run-templates');
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requireString(obj: Record<string, unknown>, key: string, path: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeAttention(value: unknown, path: string): AttentionLevel {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  throw new Error(`${path}.attention must be high, medium, or low`);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCandidate(value: unknown, path: string): CheckpointCandidate {
  const obj = asObject(value);
  return {
    id: requireString(obj, 'id', path),
    title: requireString(obj, 'title', path),
    objective: requireString(obj, 'objective', path),
    dependsOnTaskId: typeof obj['dependsOnTaskId'] === 'string' ? obj['dependsOnTaskId'] : null,
    metadata: asObject(obj['metadata']),
  };
}

function normalizeTemplate(raw: unknown, source: string): RunTemplate {
  const obj = asObject(raw);
  const phasesRaw = obj['phases'];
  const tilesRaw = obj['tiles'];
  if (!Array.isArray(phasesRaw)) throw new Error(`${source}.phases must be an array`);
  if (!Array.isArray(tilesRaw)) throw new Error(`${source}.tiles must be an array`);

  const phases = phasesRaw.map((phaseRaw, i): RunTemplatePhase => {
    const path = `${source}.phases[${i}]`;
    const phase = asObject(phaseRaw);
    const type = phase['type'];
    if (type === 'task') {
      return {
        id: requireString(phase, 'id', path),
        type,
        attention: normalizeAttention(phase['attention'], path),
        taskId: requireString(phase, 'taskId', path),
        title: requireString(phase, 'title', path),
        objective: requireString(phase, 'objective', path),
        roleId: requireString(phase, 'roleId', path),
        dependsOn: Array.isArray(phase['dependsOn'])
          ? phase['dependsOn'].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          : [],
      };
    }
    if (type === 'checkpoint') {
      const candidatesRaw = phase['candidates'];
      if (!Array.isArray(candidatesRaw)) throw new Error(`${path}.candidates must be an array`);
      return {
        id: requireString(phase, 'id', path),
        type,
        attention: normalizeAttention(phase['attention'], path),
        checkpointId: requireString(phase, 'checkpointId', path),
        summary: typeof phase['summary'] === 'string' ? phase['summary'] : undefined,
        dependsOnTaskIds: Array.isArray(phase['dependsOnTaskIds'])
          ? phase['dependsOnTaskIds'].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          : [],
        candidates: candidatesRaw.map((candidate, j) => normalizeCandidate(candidate, `${path}.candidates[${j}]`)),
      };
    }
    throw new Error(`${path}.type must be task or checkpoint`);
  });

  return {
    id: requireString(obj, 'id', source),
    name: requireString(obj, 'name', source),
    description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
    budget: asObject(obj['budget']),
    stopConditions: asObject(obj['stopConditions']),
    artifactExpectations: Array.isArray(obj['artifactExpectations'])
      ? obj['artifactExpectations'].map((item, i) => {
          const expectation = asObject(item);
          return {
            phaseId: requireString(expectation, 'phaseId', `${source}.artifactExpectations[${i}]`),
            kind: requireString(expectation, 'kind', `${source}.artifactExpectations[${i}]`),
          };
        })
      : [],
    tiles: tilesRaw.map((tileRaw, i) => {
      const path = `${source}.tiles[${i}]`;
      const tile = asObject(tileRaw);
      const width = finiteNumber(tile['width'], NaN);
      const height = finiteNumber(tile['height'], NaN);
      return {
        id: requireString(tile, 'id', path),
        roleId: requireString(tile, 'roleId', path),
        x: finiteNumber(tile['x'], 0),
        y: finiteNumber(tile['y'], 0),
        ...(Number.isFinite(width) ? { width } : {}),
        ...(Number.isFinite(height) ? { height } : {}),
      };
    }),
    connections: Array.isArray(obj['connections'])
      ? obj['connections'].map((connRaw, i) => {
          const path = `${source}.connections[${i}]`;
          const conn = asObject(connRaw);
          return {
            id: typeof conn['id'] === 'string' ? conn['id'] : undefined,
            fromTileId: requireString(conn, 'fromTileId', path),
            toTileId: requireString(conn, 'toTileId', path),
            semanticType: typeof conn['semanticType'] === 'string' ? conn['semanticType'] : undefined,
            label: typeof conn['label'] === 'string' ? conn['label'] : undefined,
          };
        })
      : [],
    phases,
  };
}

export function listRunTemplates(templateDir = defaultTemplateDir()): string[] {
  return readdirSync(templateDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => basename(file, '.json'))
    .sort();
}

export function loadRunTemplate(templateId: string, templateDir = defaultTemplateDir()): RunTemplate {
  const file = join(templateDir, `${templateId}.json`);
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  const template = normalizeTemplate(parsed, file);
  if (template.id !== templateId) {
    throw new Error(`template id mismatch: requested ${templateId}, file has ${template.id}`);
  }
  return template;
}

export function compileRunTemplate(
  template: RunTemplate,
  stockedRoleIds: Iterable<string> = DEFAULT_STOCKED_ROLE_IDS,
): CompiledRunTemplate {
  const stocked = new Set(stockedRoleIds);
  const taskPhases = template.phases.filter((phase): phase is RunTemplateTaskPhase => phase.type === 'task');
  const checkpointPhases = template.phases.filter((phase): phase is RunTemplateCheckpointPhase => phase.type === 'checkpoint');
  const referencedRoles = new Set<string>();
  for (const tile of template.tiles) referencedRoles.add(tile.roleId);
  for (const phase of taskPhases) referencedRoles.add(phase.roleId);
  for (const checkpoint of checkpointPhases) {
    for (const candidate of checkpoint.candidates) {
      const roleId = candidate.metadata?.['roleId'];
      if (typeof roleId === 'string') referencedRoles.add(roleId);
    }
  }
  const missingRoles = [...referencedRoles].filter((roleId) => !stocked.has(roleId));
  if (missingRoles.length > 0) {
    throw new Error(`template ${template.id} references unstocked roleIds: ${missingRoles.join(', ')}`);
  }

  const taskIds = new Set(taskPhases.map((phase) => phase.taskId));
  const taskDependencies: CompiledRunTemplate['taskDependencies'] = [];
  for (const phase of taskPhases) {
    for (const upstream of phase.dependsOn ?? []) {
      if (!taskIds.has(upstream)) {
        throw new Error(`template ${template.id} task ${phase.taskId} depends on unknown task ${upstream}`);
      }
      taskDependencies.push({ taskId: phase.taskId, dependsOnTaskId: upstream, kind: 'blocks' });
    }
  }

  return {
    template,
    taskPhases,
    checkpointPhases,
    taskDependencies,
    stockedRoleIds: [...stocked],
  };
}

function tileIdForRole(template: RunTemplate, roleId: string): string {
  return template.tiles.find((tile) => tile.roleId === roleId)?.id ?? template.tiles[0]?.id ?? roleId;
}

function scopedId(workflowId: string, localId: string): string {
  return `${workflowId}-${localId}`;
}

function selectedForCheckpoint(input: RunTemplateInvokeInput, checkpointId: string): string[] {
  const explicit = input.selections?.find((selection) => selection.checkpointId === checkpointId)?.selectedCandidateIds;
  if (explicit && explicit.length > 0) return explicit;
  return [];
}

function taskCompleteAndVerified(db: KernelDB, taskId: string): boolean {
  const task = queryTaskGet(db, taskId);
  if (task?.status !== 'complete') return false;
  return queryReceiptList(db, { taskId, limit: 200 }).some((receipt) => receipt.type === 'verification_passed');
}

function checkpointReady(db: KernelDB, workflowId: string, phase: RunTemplateCheckpointPhase): boolean {
  return (phase.dependsOnTaskIds ?? []).every((taskId) => taskCompleteAndVerified(db, scopedId(workflowId, taskId)));
}

function attentionFromCandidate(candidate: CheckpointCandidate): AttentionLevel {
  const raw = candidate.metadata?.['attention'];
  return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'low';
}

function roleFromCandidate(template: RunTemplate, candidate: CheckpointCandidate): string {
  const raw = candidate.metadata?.['roleId'];
  return typeof raw === 'string' && raw.trim() ? raw : template.tiles[0]!.roleId;
}

function phaseIdFromCandidate(candidate: CheckpointCandidate, checkpointPhase: RunTemplateCheckpointPhase): string {
  const raw = candidate.metadata?.['phaseId'];
  return typeof raw === 'string' && raw.trim() ? raw : `${checkpointPhase.id}-deepen`;
}

function expectationKinds(template: RunTemplate): string[] {
  return (template.artifactExpectations ?? []).map((expectation) => expectation.kind);
}

function validateArtifactExpectations(db: KernelDB, workflowId: string, template: RunTemplate): CommandResult {
  const artifacts = queryArtifactList(db, { workflowId });
  const counts = new Map<string, number>();
  for (const artifact of artifacts) counts.set(artifact.kind, (counts.get(artifact.kind) ?? 0) + 1);
  for (const kind of expectationKinds(template)) {
    const n = counts.get(kind) ?? 0;
    if (n <= 0) return { ok: false, error: `template ${template.id} expected artifact kind ${kind}` };
    counts.set(kind, n - 1);
  }
  return { ok: true, id: workflowId };
}

async function asCommandResult(value: CommandResult | Promise<CommandResult>): Promise<CommandResult> {
  return value;
}

export function createRunTemplateRunner(deps: RunTemplateRunnerDeps) {
  const scheduler = deps.scheduler ?? readSchedulableTasks;
  const templateDir = deps.templateDir ?? defaultTemplateDir();
  const now = deps.now ?? (() => Date.now());

  async function dispatch(type: string, payload: Record<string, unknown>): Promise<CommandResult> {
    return asCommandResult(deps.dispatchKernel(type, payload, 'run-template'));
  }

  async function instantiateTemplate(input: RunTemplateInvokeInput, compiled: CompiledRunTemplate): Promise<CommandResult> {
    const template = compiled.template;
    const workflowId = input.workflowId ?? `wf-template-${template.id}-${now()}`;
    const created = await dispatch('kernel.workflow.create', {
      id: workflowId,
      name: template.name,
      objective: input.objective ?? template.description ?? template.name,
      status: 'active',
      mode: template.id,
      budget: template.budget ?? {},
    });
    if (!created.ok) return created;

    for (const tile of template.tiles) {
      const tileResult = await dispatch('kernel.tile.create', {
        id: `${workflowId}-${tile.id}`,
        workflowId,
        displayName: tile.roleId,
        tileKind: 'worker',
        x: tile.x,
        y: tile.y,
        width: tile.width,
        height: tile.height,
      });
      if (!tileResult.ok) return tileResult;
      const worker = await dispatch('kernel.worker.spawn', {
        tileId: `${workflowId}-${tile.id}`,
        workflowId,
        harnessKind: 'mock',
        roleName: tile.roleId,
      });
      if (!worker.ok) return worker;
      const active = await dispatch('kernel.worker.status_update', {
        tileId: `${workflowId}-${tile.id}`,
        status: 'active',
        lastSeen: now(),
      });
      if (!active.ok) return active;
    }

    for (const connection of template.connections ?? []) {
      const connected = await dispatch('kernel.connection.create', {
        id: connection.id ? `${workflowId}-${connection.id}` : undefined,
        workflowId,
        tileAId: `${workflowId}-${connection.fromTileId}`,
        tileBId: `${workflowId}-${connection.toTileId}`,
        fromTileId: `${workflowId}-${connection.fromTileId}`,
        toTileId: `${workflowId}-${connection.toTileId}`,
        semanticType: connection.semanticType,
        label: connection.label,
      });
      if (!connected.ok) return connected;
    }

    for (const phase of compiled.taskPhases) {
      const task = await dispatch('kernel.task.create', {
        id: scopedId(workflowId, phase.taskId),
        workflowId,
        correlationId: scopedId(workflowId, phase.taskId),
        title: phase.title,
        objective: phase.objective,
        metadata: {
          templateId: template.id,
          phaseId: phase.id,
          templateTaskId: phase.taskId,
          attention: phase.attention,
          roleId: phase.roleId,
        },
      });
      if (!task.ok) return task;
    }
    for (const dep of compiled.taskDependencies) {
      const linked = await dispatch('kernel.task.depend', {
        taskId: scopedId(workflowId, dep.taskId),
        dependsOnTaskId: scopedId(workflowId, dep.dependsOnTaskId),
        kind: dep.kind,
      });
      if (!linked.ok) return linked;
    }
    return { ok: true, id: workflowId };
  }

  async function invoke(input: RunTemplateInvokeInput): Promise<RunTemplateRunResult> {
    const template = loadRunTemplate(input.templateId, templateDir);
    const compiled = compileRunTemplate(template, deps.stockedRoleIds ?? DEFAULT_STOCKED_ROLE_IDS);
    const workflowId = input.workflowId ?? `wf-template-${template.id}-${now()}`;
    const instantiated = await instantiateTemplate({ ...input, workflowId }, compiled);
    if (!instantiated.ok) {
      return {
        ok: false,
        workflowId,
        templateId: template.id,
        taskIds: [],
        artifactIds: [],
        receiptIds: [],
        executionLog: [],
        schedulerCalls: 0,
        error: instantiated.error,
      };
    }

    const taskPhaseById = new Map<string, RunTemplateTaskPhase>(compiled.taskPhases.map((phase) => [
      scopedId(workflowId, phase.taskId),
      { ...phase, taskId: scopedId(workflowId, phase.taskId) },
    ]));
    const selectedCheckpoints = new Set<string>();
    const executionLog: RunTemplateExecutionEvent[] = [];
    let schedulerCalls = 0;

    async function executePhase(phase: RunTemplateTaskPhase): Promise<CommandResult> {
      const tileId = `${workflowId}-${tileIdForRole(template, phase.roleId)}`;
      executionLog.push({ kind: 'task', attention: phase.attention, taskIds: [phase.taskId] });
      return deps.executeTask({
        workflowId,
        taskId: phase.taskId,
        tileId,
        roleId: phase.roleId,
        phaseId: phase.id,
        attention: phase.attention,
        attemptId: `att-${phase.taskId}`,
      });
    }

    async function runCheckpoint(phase: RunTemplateCheckpointPhase): Promise<CommandResult> {
      const checkpoint: CheckpointRequest = {
        checkpointId: scopedId(workflowId, phase.checkpointId),
        summary: phase.summary,
        dependsOnTaskId: phase.dependsOnTaskIds?.[0] ? scopedId(workflowId, phase.dependsOnTaskIds[0]!) : null,
        candidates: phase.candidates.map((candidate) => ({
          ...candidate,
          dependsOnTaskId: candidate.dependsOnTaskId ? scopedId(workflowId, candidate.dependsOnTaskId) : null,
          metadata: {
            ...(candidate.metadata ?? {}),
            templateCheckpointId: phase.checkpointId,
          },
        })),
      };
      const reset = await dispatch('kernel.workflow.update', { id: workflowId, checkpointState: null });
      if (!reset.ok) return reset;
      const surfaced = await deps.checkpointLoop.step({ workflowId, checkpoint });
      if (surfaced.status !== 'awaiting-selection' || !surfaced.proposalToken) {
        return { ok: false, error: `checkpoint ${phase.checkpointId} did not enter awaiting-selection` };
      }
      executionLog.push({
        kind: 'checkpoint',
        attention: phase.attention,
        checkpointId: phase.checkpointId,
        proposalToken: surfaced.proposalToken,
      });
      const selectedCandidateIds = selectedForCheckpoint(input, phase.checkpointId);
      if (selectedCandidateIds.length === 0) {
        return { ok: false, error: `checkpoint ${phase.checkpointId} requires an explicit human selection` };
      }
      const selected = await deps.checkpointLoop.step({
        workflowId,
        checkpoint,
        selectedCandidateIds,
        proposalToken: surfaced.proposalToken,
      });
      if (selected.status !== 'selected') {
        return { ok: false, error: `checkpoint ${phase.checkpointId} selection failed: ${selected.status}` };
      }
      selectedCheckpoints.add(phase.checkpointId);
      for (const candidate of phase.candidates.filter((item) => selectedCandidateIds.includes(item.id))) {
        const runtimeCandidate = checkpoint.candidates.find((item) => item.id === candidate.id) ?? candidate;
        const taskId = taskIdForCheckpointCandidate(checkpoint, runtimeCandidate);
        taskPhaseById.set(taskId, {
          id: phaseIdFromCandidate(candidate, phase),
          type: 'task',
          attention: attentionFromCandidate(candidate),
          taskId,
          title: `Deepen: ${candidate.title}`,
          objective: candidate.objective,
          roleId: roleFromCandidate(template, candidate),
          dependsOn: [],
        });
      }
      return { ok: true, id: phase.checkpointId };
    }

    for (let guard = 0; guard < 100; guard += 1) {
      const readyCheckpoint = compiled.checkpointPhases.find((phase) =>
        !selectedCheckpoints.has(phase.checkpointId) && checkpointReady(deps.db, workflowId, phase));
      if (readyCheckpoint) {
        const result = await runCheckpoint(readyCheckpoint);
        if (!result.ok) {
          return {
            ok: false,
            workflowId,
            templateId: template.id,
            taskIds: queryRun(deps.db, workflowId)?.taskIds ?? [],
            artifactIds: queryRun(deps.db, workflowId)?.artifactIds ?? [],
            receiptIds: queryRun(deps.db, workflowId)?.receiptIds ?? [],
            executionLog,
            schedulerCalls,
            error: result.error,
          };
        }
        continue;
      }

      schedulerCalls += 1;
      const eligible = scheduler(deps.db, workflowId)
        .map((taskId) => taskPhaseById.get(taskId))
        .filter((phase): phase is RunTemplateTaskPhase => Boolean(phase));
      if (eligible.length === 0) break;

      const low = eligible.filter((phase) => phase.attention === 'low');
      if (low.length > 0) {
        executionLog.push({ kind: 'task-batch', attention: 'low', taskIds: low.map((phase) => phase.taskId) });
        const results = await Promise.all(low.map(executePhase));
        const failed = results.find((result) => !result.ok);
        if (failed) {
          return {
            ok: false,
            workflowId,
            templateId: template.id,
            taskIds: queryRun(deps.db, workflowId)?.taskIds ?? [],
            artifactIds: queryRun(deps.db, workflowId)?.artifactIds ?? [],
            receiptIds: queryRun(deps.db, workflowId)?.receiptIds ?? [],
            executionLog,
            schedulerCalls,
            error: failed.error,
          };
        }
        continue;
      }

      const serial = eligible[0]!;
      const result = await executePhase(serial);
      if (!result.ok) {
        return {
          ok: false,
          workflowId,
          templateId: template.id,
          taskIds: queryRun(deps.db, workflowId)?.taskIds ?? [],
          artifactIds: queryRun(deps.db, workflowId)?.artifactIds ?? [],
          receiptIds: queryRun(deps.db, workflowId)?.receiptIds ?? [],
          executionLog,
          schedulerCalls,
          error: result.error,
        };
      }
    }

    const expected = validateArtifactExpectations(deps.db, workflowId, template);
    if (!expected.ok) {
      return {
        ok: false,
        workflowId,
        templateId: template.id,
        taskIds: queryRun(deps.db, workflowId)?.taskIds ?? [],
        artifactIds: queryRun(deps.db, workflowId)?.artifactIds ?? [],
        receiptIds: queryRun(deps.db, workflowId)?.receiptIds ?? [],
        executionLog,
        schedulerCalls,
        error: expected.error,
      };
    }
    await dispatch('kernel.workflow.update', { id: workflowId, status: 'complete' });
    const run = queryRun(deps.db, workflowId);
    return {
      ok: true,
      workflowId,
      templateId: template.id,
      taskIds: run?.taskIds ?? [],
      artifactIds: run?.artifactIds ?? [],
      receiptIds: run?.receiptIds ?? [],
      executionLog,
      schedulerCalls,
    };
  }

  return { invoke };
}
