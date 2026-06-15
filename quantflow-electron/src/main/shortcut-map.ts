import type { Input } from "electron";

export interface ShellShortcut {
  action: string;
}

interface ShortcutEntry {
  modifier: (input: Input) => boolean;
  action: string;
}

const cmdOrCtrl = (input: Input): boolean =>
  (input.meta || input.control) && !input.shift && !input.alt;
const shiftCmdOrCtrl = (input: Input): boolean =>
  input.shift && (input.meta || input.control) && !input.alt;
const altCmdOrCtrl = (input: Input): boolean =>
  input.alt && (input.meta || input.control) && !input.shift;
const altOnly = (input: Input): boolean =>
  input.alt && !input.meta && !input.control && !input.shift;
const shiftOnly = (input: Input): boolean =>
  input.shift && !input.alt && !input.meta && !input.control;

const TOGGLE_SHORTCUTS: Record<string, ShortcutEntry[]> = {
  KeyB: [
    { modifier: altCmdOrCtrl, action: "toggle-agent" },
    { modifier: shiftCmdOrCtrl, action: "sidebar-tiles" },
    { modifier: cmdOrCtrl, action: "sidebar-files" },
  ],
  Backslash: [{ modifier: cmdOrCtrl, action: "sidebar-files" }],
  Comma: [{ modifier: cmdOrCtrl, action: "toggle-settings" }],
  KeyO: [{ modifier: shiftCmdOrCtrl, action: "add-workspace" }],
  KeyF: [
    { modifier: cmdOrCtrl, action: "focus-file-search" },
    { modifier: shiftOnly, action: "flip-state-card" },
  ],
  KeyN: [{ modifier: cmdOrCtrl, action: "new-tile" }],
  KeyW: [{ modifier: cmdOrCtrl, action: "close-tile" }],
  ArrowRight: [{ modifier: altOnly, action: "focus-tile-right" }],
  ArrowLeft: [{ modifier: altOnly, action: "focus-tile-left" }],
  ArrowUp: [{ modifier: altOnly, action: "focus-tile-up" }],
  ArrowDown: [{ modifier: altOnly, action: "focus-tile-down" }],
};

const TOGGLE_SHORTCUT_KEYS: Record<string, ShortcutEntry[]> = {
  ",": TOGGLE_SHORTCUTS.Comma!,
  "\\": TOGGLE_SHORTCUTS.Backslash!,
  o: TOGGLE_SHORTCUTS.KeyO!,
  f: TOGGLE_SHORTCUTS.KeyF!,
  b: TOGGLE_SHORTCUTS.KeyB!,
  n: TOGGLE_SHORTCUTS.KeyN!,
  w: TOGGLE_SHORTCUTS.KeyW!,
};

function normalizeShortcutKey(key: string | undefined): string | null {
  if (!key) return null;
  return key.length === 1 ? key.toLowerCase() : key;
}

export function resolveShellShortcut(input: Input): ShellShortcut | undefined {
  const normalizedKey = normalizeShortcutKey(input.key);
  const candidates = TOGGLE_SHORTCUTS[input.code]
    ?? (normalizedKey ? TOGGLE_SHORTCUT_KEYS[normalizedKey] : undefined);
  return candidates?.find((shortcut) => shortcut.modifier(input));
}
