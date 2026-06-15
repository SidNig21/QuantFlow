/**
 * artifact_index.md exporter (Goal 8).
 *
 * A table of the workflow's artifacts, each tracing back to its task id and the
 * receipt id that recorded it. Kernel ids are preserved verbatim.
 */

import { frontmatter, toIso, mdCell, oneLine } from '../okf/frontmatter';
import type { VaultExportBundle } from '../types';

export function formatArtifactIndex(bundle: VaultExportBundle): string {
  const { workflow, artifacts } = bundle;
  const head = frontmatter([
    ['type', 'artifact_index'],
    ['workflow_id', workflow.id],
    ['artifact_count', artifacts.length],
    ['created_at', toIso(bundle.workflowCreatedAt)],
  ]);

  const sections = [
    head,
    `# Artifact Index — ${workflow.name}`,
    `Workflow \`${workflow.id}\` · ${artifacts.length} artifacts.`,
  ];

  if (artifacts.length === 0) {
    sections.push('No artifacts recorded.');
  } else {
    const rows = artifacts.map(
      (a) =>
        `| \`${a.id}\` | ${mdCell(a.kind)} | ${mdCell(oneLine(a.summary, 80))} | ${
          a.taskId ? `\`${a.taskId}\`` : '—'
        } | ${a.receiptId ? `\`${a.receiptId}\`` : '—'} | ${mdCell(a.uri ?? '—')} |`,
    );
    sections.push(
      ['| Artifact ID | Kind | Summary | Task | Receipt | URI |', '| --- | --- | --- | --- | --- | --- |', ...rows].join(
        '\n',
      ),
    );
  }

  return `${sections.join('\n\n')}\n`;
}
