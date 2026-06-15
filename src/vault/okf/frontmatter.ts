/**
 * OKF frontmatter + shared formatting helpers — v3 Goal 8.
 *
 * Pure, deterministic helpers for the vault exporters. No DB, no fs, no clock:
 * every value passed in comes from Kernel rows, so the same Kernel state always
 * produces byte-identical Markdown (idempotent, diff-stable exports).
 *
 * The vault is a knowledge MIRROR, never a source of truth — see
 * src/vault/AGENTS.md and KERNEL_CONSTITUTION.md.
 */

export type FrontmatterValue = string | number | boolean | null | undefined;

/** Deterministic ISO-8601 UTC timestamp from Kernel ms; null/invalid → "". */
export function toIso(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
}

/** Quote a YAML scalar only when needed; keep simple values bare for readability. */
function yamlScalar(value: string): string {
  if (value === '') return '""';
  // Quote when the value could be misparsed as YAML structure/number/bool.
  if (/[:#\n"']/.test(value) || /^[\s&*!|>%@`-]/.test(value) || /^(true|false|null|~|\d)/i.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
  }
  return value;
}

/**
 * Build a YAML frontmatter block from ordered [key, value] pairs. Pairs with
 * null/undefined values are skipped (so `task_id`/`receipt_count` only appear
 * when applicable, per the vault frontmatter contract). Order is preserved
 * exactly as given — never sorted — for stable diffs.
 */
export function frontmatter(fields: Array<[string, FrontmatterValue]>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of fields) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') lines.push(`${key}: ${yamlScalar(value)}`);
    else lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return lines.join('\n');
}

/** Escape a value for use inside a Markdown table cell. */
export function mdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** A short single-line summary, trimmed and newline-collapsed for list rows. */
export function oneLine(value: unknown, max = 200): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Join body sections with a single blank line, trimming trailing whitespace. */
export function joinSections(sections: string[]): string {
  return `${sections.map((s) => s.replace(/\s+$/g, '')).filter(Boolean).join('\n\n')}\n`;
}
