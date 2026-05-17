import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  GearSix,
  Keyboard,
  Palette,
  Play,
  PuzzlePiece,
  Pulse,
  Sun,
  Moon,
  Monitor,
  Terminal,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import {
  HEALTH_GROUPS,
  aggregateHealthLevel,
  assertControllerHealth,
  assertHealthResult,
  groupHealthProbes,
  replaceHealthProbe,
  summarizeHealth,
  type ControllerHealth,
  type HealthLevel,
  type HealthResult,
} from "./health-model";
import {
  assertCrashReports,
  assertLaunchTraces,
  assertTailLogs,
  formatDuration,
  type CrashReportSummary,
  type LaunchTraceSummary,
  type TailLogsResult,
} from "./diagnostics-panels-model";

type ThemeMode = "light" | "dark" | "system" | "high-contrast";
type DensityMode = "comfortable" | "compact";

interface SettingsApi {
  getPlatform: () => string;
  getPref: (key: string) => Promise<unknown>;
  setPref: (key: string, value: unknown) => Promise<void>;
  listTerminalTargets: () => Promise<Array<{
    id: string;
    label: string;
    isDefault?: boolean;
  }>>;
  setTheme: (mode: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  diagnosticsHealth: () => Promise<unknown>;
  diagnosticsRunProbe: (name: string) => Promise<unknown>;
  diagnosticsTailLogs: (request?: unknown) => Promise<unknown>;
  diagnosticsListCrashes: () => Promise<unknown>;
  diagnosticsListLaunchTraces: () => Promise<unknown>;
  getAgents: () => Promise<AgentStatus[]>;
  installSkill: (agentId: string) => Promise<{ ok: boolean }>;
  uninstallSkill: (agentId: string) => Promise<{ ok: boolean }>;
  close: () => void;
}

const api = (window as unknown as { api: SettingsApi }).api;

const THEME_MODES: ThemeMode[] = ["light", "dark", "system", "high-contrast"];

const THEME_ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
  "high-contrast": WarningCircle,
};

const DENSITY_MODES: {
  value: DensityMode;
  label: string;
}[] = [
    { value: "comfortable", label: "Comfortable" },
    { value: "compact", label: "Compact" },
  ];

function normalizeThemeMode(value: unknown): ThemeMode {
  if (
    value === "light" ||
    value === "dark" ||
    value === "system" ||
    value === "high-contrast"
  ) {
    return value;
  }
  return "system";
}

function normalizeDensity(value: unknown): DensityMode {
  return value === "compact" ? "compact" : "comfortable";
}

function applySettingsTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark =
    mode === "dark" ||
    mode === "high-contrast" ||
    (mode === "system" && systemDark);
  root.classList.toggle("dark", dark);
  root.classList.toggle("theme-light", mode === "light");
  root.classList.toggle("theme-high-contrast", mode === "high-contrast");
  root.dataset.theme = mode;
}

function applySettingsDensity(density: DensityMode) {
  document.documentElement.dataset.density = density;
}

function Slider({
  value,
  min = 0,
  max = 100,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  const commit = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChange(Math.round(min + ratio * (max - min)));
    },
    [min, max, onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      commit(e.clientX);
    },
    [commit],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      commit(e.clientX);
    },
    [commit],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="relative h-5 w-full cursor-pointer select-none flex items-center"
    >
      <div
        className="absolute h-[3px] w-full rounded-full"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--foreground) 12%, transparent)",
        }}
      />
      <div
        className="absolute h-[3px] rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: "var(--foreground)",
          opacity: 0.45,
        }}
      />
      <div
        className="absolute h-3.5 w-3.5 rounded-full border-2 shadow-sm"
        style={{
          left: `calc(${pct}% - 7px)`,
          backgroundColor: "var(--background)",
          borderColor: "var(--foreground)",
          opacity: 1,
        }}
      />
    </div>
  );
}

function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const idx = THEME_MODES.indexOf(value);

  return (
    <div
      className="relative inline-flex h-8 rounded-full p-0.5"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 10%, transparent)",
      }}
    >
      {/* sliding pill */}
      <div
        className="absolute top-0.5 h-7 w-9 rounded-full transition-transform duration-150"
        style={{
          backgroundColor: "var(--accent)",
          transform: `translateX(${idx * 36}px)`,
        }}
      />
      {THEME_MODES.map((mode) => {
        const Icon = THEME_ICONS[mode];
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            aria-label={mode}
            onClick={() => onChange(mode)}
            className="relative z-10 flex h-7 w-9 items-center justify-center rounded-full cursor-pointer"
          >
            <Icon
              className="h-4 w-4 transition-colors duration-150"
              style={{
                color: active
                  ? "var(--foreground)"
                  : "var(--muted-foreground)",
              }}
              weight={active ? "fill" : "regular"}
            />
          </button>
        );
      })}
    </div>
  );
}

function AppearancePane() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [canvasOpacity, setCanvasOpacity] = useState(0);

  useEffect(() => {
    api.getPref("theme")
      .then((v) => {
        setTheme(normalizeThemeMode(v));
      })
      .catch(() => { });
    api.getPref("density")
      .then((v) => {
        setDensity(normalizeDensity(v));
      })
      .catch(() => { });
    api.getPref("canvasOpacity")
      .then((v) => {
        if (typeof v === "number") setCanvasOpacity(v);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    applySettingsTheme(theme);
    if (theme !== "system") return undefined;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applySettingsTheme("system");
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [theme]);

  useEffect(() => {
    applySettingsDensity(density);
  }, [density]);

  async function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    await api.setTheme(mode);
  }

  async function handleDensityChange(value: DensityMode) {
    setDensity(value);
    await api.setPref("density", value);
  }

  async function handleOpacityChange(value: number) {
    setCanvasOpacity(value);
    await api.setPref("canvasOpacity", value);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Customize how QuantFlow looks.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Theme</p>
        <ThemeToggle
          value={theme}
          onChange={(m) => { void handleThemeChange(m); }}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">Density</p>
        <div
          className="inline-flex rounded-md p-0.5"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
          {DENSITY_MODES.map(({ value, label }) => {
            const active = density === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => { void handleDensityChange(value); }}
                className="rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150"
                style={{
                  backgroundColor: active ? "var(--accent)" : "transparent",
                  color: active
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Canvas opacity</p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {canvasOpacity}%
          </span>
        </div>
        <Slider
          value={canvasOpacity}
          onChange={(v) => { void handleOpacityChange(v); }}
        />
      </div>
    </div>
  );
}

const IS_MAC = api.getPlatform() === "darwin";

const MOD = IS_MAC ? "\u2318" : "Ctrl+";
const SHIFT = IS_MAC ? "\u21E7" : "Shift+";
const CTRL = IS_MAC ? "\u2303" : "Ctrl+";
const ALT = IS_MAC ? "\u2325" : "Alt+";

const SHORTCUTS: { label: string; keys: string }[] = [
  { label: "Settings", keys: `${MOD} ,` },
  { label: "Find", keys: `${MOD} K` },
  { label: "Toggle Navigator", keys: `${MOD} \\` },
  { label: "Toggle Terminal List", keys: `${MOD} \`` },
  { label: "Open Workspace", keys: `${SHIFT} ${MOD} O` },
  { label: "Zoom In", keys: `${MOD} =` },
  { label: "Zoom Out", keys: `${MOD} -` },
  { label: "Actual Size", keys: `${MOD} 0` },
  {
    label: "Toggle Full Screen",
    keys: IS_MAC ? "\u2303 \u2318 F" : "F11",
  },
  { label: "Focus Tile Left", keys: `${ALT} ←` },
  { label: "Focus Tile Right", keys: `${ALT} →` },
  { label: "Focus Tile Up", keys: `${ALT} ↑` },
  { label: "Focus Tile Down", keys: `${ALT} ↓` },
];

const MOUSE_INPUTS: { label: string; keys: string }[] = [
  { label: "Pan Canvas", keys: "Two-Finger Swipe" },
  { label: "Pan Canvas", keys: "Middle Click + Drag" },
  { label: "Pan Canvas", keys: "Space + Drag" },
  { label: "Scroll Canvas Vertically", keys: "Scroll" },
  { label: "Scroll Canvas Horizontally", keys: `${SHIFT} Scroll` },
  { label: "Zoom", keys: `${CTRL} Scroll` },
  ...(IS_MAC
    ? [{ label: "Zoom", keys: `${MOD} Scroll` }]
    : []),
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 8%, transparent)",
        color: "var(--foreground)",
      }}
    >
      {children}
    </kbd>
  );
}

function ShortcutList({ items }: { items: { label: string; keys: string }[] }) {
  return (
    <div className="space-y-0">
      {items.map(({ label, keys }, i) => (
        <div
          key={`${label}-${i}`}
          className="flex items-center justify-between py-2"
          style={{
            borderBottom:
              "1px solid color-mix(in srgb, var(--foreground) 6%, transparent)",
          }}
        >
          <span className="text-sm">{label}</span>
          <Kbd>{keys}</Kbd>
        </div>
      ))}
    </div>
  );
}

type TerminalMode = "tmux" | "sidecar";

const TERMINAL_MODES: {
  value: TerminalMode;
  label: string;
  description: string;
  deprecated?: boolean;
}[] = [
  {
    value: "sidecar",
    label: "node-pty",
    description: "Clean scrollback rendering.",
  },
  {
    value: "tmux",
    label: "tmux",
    description: "May cause scrollback artifacts.",
    deprecated: true,
  },
];

type TerminalTarget = string;

type TerminalTargetOption = {
  id: string;
  label: string;
  isDefault?: boolean;
};

function RadioOption({
  selected,
  onClick,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left cursor-pointer"
      style={{
        border: `1px solid ${selected
          ? "var(--foreground)"
          : "color-mix(in srgb, var(--foreground) 15%, transparent)"}`,
        backgroundColor: selected
          ? "color-mix(in srgb, var(--foreground) 6%, transparent)"
          : "transparent",
      }}
    >
      <div
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: selected
            ? "var(--foreground)"
            : "var(--muted-foreground)",
        }}
      >
        {selected && (
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--foreground)" }}
          />
        )}
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

function MacTerminalPane() {
  const [mode, setMode] = useState<TerminalMode>("sidecar");

  useEffect(() => {
    api.getPref("terminalMode")
      .then((v) => {
        if (v === "tmux" || v === "sidecar") setMode(v);
      })
      .catch(() => { });
  }, []);

  async function handleModeChange(value: TerminalMode) {
    setMode(value);
    await api.setPref("terminalMode", value);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Terminal</h2>
        <p className="text-sm text-muted-foreground">
          Changes take effect for new terminals.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Terminal backend</p>
        <div className="space-y-1.5">
          {TERMINAL_MODES.map(({ value, label, description, deprecated }) => (
            <RadioOption
              key={value}
              selected={mode === value}
              onClick={() => { void handleModeChange(value); }}
              label={label}
              description={
                deprecated
                  ? `${description} Deprecated — will be removed in a future release.`
                  : description
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WindowsTerminalPane() {
  const [target, setTarget] = useState<TerminalTarget>("auto");
  const [options, setOptions] = useState<TerminalTargetOption[]>([]);

  useEffect(() => {
    api.getPref("terminalTarget")
      .then((v) => {
        if (typeof v === "string") setTarget(v);
      })
      .catch(() => { });
    api.listTerminalTargets()
      .then((items) => setOptions(items))
      .catch(() => { });
  }, []);

  async function handleTargetChange(value: TerminalTarget) {
    setTarget(value);
    await api.setPref("terminalTarget", value);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Terminal</h2>
        <p className="text-sm text-muted-foreground">
          Changes take effect for new terminals.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Terminal target</p>
        <div className="space-y-1.5">
          {options.map(({ id, label, isDefault }) => (
            <RadioOption
              key={id}
              selected={target === id}
              onClick={() => { void handleTargetChange(id); }}
              label={label}
              description={isDefault
                ? "Recommended default for this platform."
                : "Available for new terminals."}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TerminalPane() {
  return IS_MAC ? <MacTerminalPane /> : <WindowsTerminalPane />;
}

function ControlsPane() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Keyboard Shortcuts</h2>
      </div>
      <ShortcutList items={SHORTCUTS} />

      <div className="space-y-1 pt-2">
        <h2 className="text-base font-semibold">Mouse Controls</h2>
      </div>
      <ShortcutList items={MOUSE_INPUTS} />
    </div>
  );
}

interface AgentStatus {
  id: string;
  name: string;
  detected: boolean;
  installed: boolean;
}

function IntegrationsPane() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAgents()
      .then((a) => setAgents(a))
      .catch(() => {});
  }, []);

  async function toggle(agent: AgentStatus) {
    setBusy((s) => new Set(s).add(agent.id));
    setError(null);
    try {
      const result = agent.installed
        ? await api.uninstallSkill(agent.id)
        : await api.installSkill(agent.id);
      if (result && !result.ok) {
        setError(`${agent.name}: ${(result as { error?: string }).error ?? "Unknown error"}`);
      }
    } catch (err) {
      setError(`${agent.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const updated = await api.getAgents();
    setAgents(updated);
    setBusy((s) => {
      const next = new Set(s);
      next.delete(agent.id);
      return next;
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Install the Canvas Skill so AI agents can control
          the canvas from the terminal.
        </p>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>
      )}

      <div className="space-y-1.5">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between rounded-md px-3 py-2.5"
            style={{
              border:
                "1px solid color-mix(in srgb, var(--foreground) 15%, transparent)",
            }}
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{agent.name}</p>
              <p className="text-xs text-muted-foreground">
                {agent.detected ? "Detected" : "Not found"}
              </p>
            </div>
            <button
              type="button"
              disabled={busy.has(agent.id)}
              onClick={() => { void toggle(agent); }}
              className="rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: agent.installed
                  ? "color-mix(in srgb, var(--foreground) 8%, transparent)"
                  : "var(--foreground)",
                color: agent.installed
                  ? "var(--foreground)"
                  : "var(--background)",
              }}
            >
              {agent.installed ? "Uninstall" : "Install"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function levelLabel(level: HealthLevel): string {
  if (level === "healthy") return "Healthy";
  if (level === "degraded") return "Degraded";
  return "Down";
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function HealthLevelBadge({ level }: { level: HealthLevel }) {
  const Icon = level === "healthy"
    ? CheckCircle
    : level === "degraded"
      ? WarningCircle
      : XCircle;

  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium"
      style={{
        border:
          "1px solid color-mix(in srgb, var(--foreground) 14%, transparent)",
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 6%, transparent)",
      }}
    >
      <Icon
        className="h-3.5 w-3.5"
        weight={level === "healthy" ? "fill" : "regular"}
      />
      {levelLabel(level)}
    </span>
  );
}

function SummaryChip({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div
      className="flex min-w-20 items-center justify-between gap-3 rounded-md px-3 py-2"
      style={{
        border:
          "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
      }}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function HealthSummary({ health }: { health: ControllerHealth }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <HealthLevelBadge level={health.level} />
      <SummaryChip label="Total" value={health.summary.total} />
      <SummaryChip label="Healthy" value={health.summary.healthy} />
      <SummaryChip label="Degraded" value={health.summary.degraded} />
      <SummaryChip label="Down" value={health.summary.down} />
    </div>
  );
}

function ProbeRow({
  probe,
  running,
  onRun,
}: {
  probe: HealthResult;
  running: boolean;
  onRun: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{probe.name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {probe.durationMs}ms
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {probe.message}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {probe.description}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <HealthLevelBadge level={probe.level} />
        <span className="hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
          {formatCheckedAt(probe.checkedAt)}
        </span>
      </div>

      <button
        type="button"
        aria-label={`Run ${probe.name}`}
        title={`Run ${probe.name}`}
        disabled={running}
        onClick={() => onRun(probe.name)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 text-foreground/70 transition-colors duration-150 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? (
          <CircleNotch className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" weight="fill" />
        )}
      </button>
    </div>
  );
}

function HealthPane() {
  const [health, setHealth] = useState<ControllerHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [runningProbes, setRunningProbes] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const result = assertControllerHealth(await api.diagnosticsHealth());
      setHealth(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = window.setInterval(() => {
      void loadHealth({ silent: true });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadHealth]);

  async function handleRunAll() {
    setRunningAll(true);
    await loadHealth();
    setRunningAll(false);
  }

  async function handleRunProbe(name: string) {
    setRunningProbes((current) => new Set(current).add(name));
    try {
      const result = assertHealthResult(await api.diagnosticsRunProbe(name));
      setHealth((current) => {
        if (current) return replaceHealthProbe(current, result);
        const probes = [result];
        const level = aggregateHealthLevel(probes);
        return {
          ok: level === "healthy",
          level,
          checkedAt: result.checkedAt,
          durationMs: result.durationMs,
          summary: summarizeHealth(probes),
          probes,
        };
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningProbes((current) => {
        const next = new Set(current);
        next.delete(name);
        return next;
      });
    }
  }

  const grouped = groupHealthProbes(health);
  const lastChecked = health ? formatCheckedAt(health.checkedAt) : null;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Health</h2>
          <p className="text-sm text-muted-foreground">
            Real local checks for relay, storage, runtime, and integrations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex h-8 items-center gap-2 rounded-md border border-border/70 px-3 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.currentTarget.checked)}
              className="h-3.5 w-3.5"
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={() => { void handleRunAll(); }}
            disabled={loading || runningAll}
            className="flex h-8 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading || runningAll ? (
              <CircleNotch className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowClockwise className="h-4 w-4" />
            )}
            Run all
          </button>
        </div>
      </div>

      {health ? (
        <div className="space-y-2">
          <HealthSummary health={health} />
          {lastChecked && (
            <p className="text-[11px] text-muted-foreground">
              Last checked {lastChecked}
            </p>
          )}
        </div>
      ) : (
        <div
          className="rounded-md px-3 py-2 text-sm text-muted-foreground"
          style={{
            border:
              "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
          {loading ? "Loading health checks." : "No health check has run."}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-md px-3 py-2 text-sm"
          style={{
            border:
              "1px solid color-mix(in srgb, var(--foreground) 18%, transparent)",
            backgroundColor:
              "color-mix(in srgb, var(--foreground) 5%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      <div className="space-y-4">
        {HEALTH_GROUPS.map((group) => {
          const probes = grouped[group.id];
          const groupLevel = probes.length > 0
            ? aggregateHealthLevel(probes)
            : null;
          return (
            <section key={group.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                {groupLevel ? (
                  <HealthLevelBadge level={groupLevel} />
                ) : (
                  <span className="text-xs text-muted-foreground">No probes</span>
                )}
              </div>
              <div
                className="divide-y divide-border/60 overflow-hidden rounded-md"
                style={{
                  border:
                    "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
                }}
              >
                {probes.length > 0 ? (
                  probes.map((probe) => (
                    <ProbeRow
                      key={probe.name}
                      probe={probe}
                      running={runningProbes.has(probe.name)}
                      onRun={(name) => { void handleRunProbe(name); }}
                    />
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No probes reported.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LogsPane() {
  const [file, setFile] = useState<"main" | "renderer">("main");
  const [minLevel, setMinLevel] = useState<"info" | "warn" | "error">("info");
  const [logs, setLogs] = useState<TailLogsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const result = assertTailLogs(await api.diagnosticsTailLogs({
        file,
        lines: 500,
        filter: { minLevel },
      }));
      setLogs(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [file, minLevel]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  async function copyLogs() {
    if (!logs?.text) return;
    await navigator.clipboard?.writeText(logs.text);
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Logs</h2>
          <p className="text-sm text-muted-foreground">
            Tail real QuantFlow log files.
          </p>
        </div>
        <button type="button" onClick={() => { void loadLogs(); }} className="flex h-8 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-medium text-background">
          <ArrowClockwise className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["main", "renderer"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setFile(value)} className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: file === value ? "var(--accent)" : "color-mix(in srgb, var(--foreground) 8%, transparent)" }}>
            {value}
          </button>
        ))}
        {(["info", "warn", "error"] as const).map((value) => (
          <button key={value} type="button" onClick={() => setMinLevel(value)} className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ color: minLevel === value ? "var(--foreground)" : "var(--muted-foreground)" }}>
            {value}
          </button>
        ))}
        <button type="button" onClick={() => { void copyLogs(); }} className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground">
          Copy
        </button>
      </div>

      {error && <div role="alert" className="text-sm text-muted-foreground">{error}</div>}
      {logs && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{logs.message}</p>
          <pre className="max-h-[520px] overflow-auto rounded-md border border-border/70 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">{logs.text || "No log lines."}</pre>
        </div>
      )}
    </div>
  );
}

function CrashesPane() {
  const [reports, setReports] = useState<CrashReportSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setReports(assertCrashReports(await api.diagnosticsListCrashes()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Crashes</h2>
          <p className="text-sm text-muted-foreground">Local crash reports from app error handlers.</p>
        </div>
        <button type="button" onClick={() => { void loadReports(); }} className="flex h-8 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-medium text-background">
          <ArrowClockwise className="h-4 w-4" />
          Refresh
        </button>
      </div>
      {error && <div role="alert" className="text-sm text-muted-foreground">{error}</div>}
      <div className="space-y-2">
        {reports.length === 0 ? (
          <div className="rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground">No crash reports found.</div>
        ) : reports.map((report) => (
          <details key={report.id} className="rounded-md border border-border/70 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">{report.type}: {report.message}</summary>
            <pre className="mt-2 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">{JSON.stringify(report, null, 2)}</pre>
          </details>
        ))}
      </div>
    </div>
  );
}

function LaunchTracesPane() {
  const [traces, setTraces] = useState<LaunchTraceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadTraces = useCallback(async () => {
    try {
      setTraces(assertLaunchTraces(await api.diagnosticsListLaunchTraces()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Launch Traces</h2>
          <p className="text-sm text-muted-foreground">Startup phase timings from local trace files.</p>
        </div>
        <button type="button" onClick={() => { void loadTraces(); }} className="flex h-8 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-medium text-background">
          <ArrowClockwise className="h-4 w-4" />
          Refresh
        </button>
      </div>
      {error && <div role="alert" className="text-sm text-muted-foreground">{error}</div>}
      <div className="space-y-3">
        {traces.length === 0 ? (
          <div className="rounded-md border border-border/70 px-3 py-2 text-sm text-muted-foreground">No launch traces found.</div>
        ) : traces.map((trace) => (
          <div key={trace.id} className="rounded-md border border-border/70 p-3">
            <div className="flex items-center justify-between gap-3 text-sm font-medium">
              <span>{new Date(trace.startedAt).toLocaleString()}</span>
              <span className="font-mono text-xs text-muted-foreground">{formatDuration(trace.durationMs)}</span>
            </div>
            <div className="mt-3 space-y-2">
              {trace.phases.map((phase) => (
                <div key={`${trace.id}-${phase.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{phase.name}</span>
                  <span className="font-mono">{formatDuration(phase.durationMs)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Pane = "appearance" | "health" | "logs" | "crashes" | "launches" | "terminal" | "integrations" | "controls";

const NAV_ITEMS: {
  id: Pane;
  label: string;
  icon: typeof Palette;
}[] = [
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "health", label: "Health", icon: Pulse },
    { id: "logs", label: "Logs", icon: Terminal },
    { id: "crashes", label: "Crashes", icon: WarningCircle },
    { id: "launches", label: "Launches", icon: CircleNotch },
    { id: "terminal", label: "Terminal", icon: Terminal },
    { id: "integrations", label: "Integrations", icon: PuzzlePiece },
    { id: "controls", label: "Controls", icon: Keyboard },
  ];

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        aria-label="Close"
        className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-foreground/25 bg-transparent p-0 text-foreground/25 transition-opacity duration-150 hover:text-foreground/60 hover:border-foreground/60 cursor-pointer"
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 3L9 9M9 3L3 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className="text-[11px] tracking-[0.05em] text-foreground/25 select-none pointer-events-none font-mono">
        esc
      </span>
    </div>
  );
}

export default function App() {
  const [activePane, setActivePane] =
    useState<Pane>("appearance");
  const [appVersion, setAppVersion] = useState("");
  const paneRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focusInitialControl = () => {
      paneRef.current?.focus();
    };
    focusInitialControl();
    window.addEventListener("focus", focusInitialControl);
    return () =>
      window.removeEventListener("focus", focusInitialControl);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        api.close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () =>
      window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    api.getAppVersion()
      .then((v) => setAppVersion(v))
      .catch(() => { });
  }, []);

  return (
    <div
      ref={paneRef}
      tabIndex={-1}
      className="flex h-full w-full bg-background text-foreground focus:outline-none"
    >
      {/* Sidebar */}
      <div className="flex w-48 flex-col border-r border-border/50 bg-background p-3 pt-4">
        <div className="flex items-start gap-2 px-2">
          <CloseButton onClick={() => api.close()} />
        </div>

        <div className="px-2 mt-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <GearSix className="h-5 w-5" />
            Settings
          </h1>
        </div>

        <nav className="mt-3 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePane(id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${activePane === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-left">
                {label}
              </span>
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {appVersion && (
          <div className="px-2">
            <span className="text-[11px] font-mono text-muted-foreground">
              v{appVersion}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activePane === "appearance" && <AppearancePane />}
        {activePane === "health" && <HealthPane />}
        {activePane === "logs" && <LogsPane />}
        {activePane === "crashes" && <CrashesPane />}
        {activePane === "launches" && <LaunchTracesPane />}
        {activePane === "terminal" && <TerminalPane />}
        {activePane === "integrations" && <IntegrationsPane />}
        {activePane === "controls" && <ControlsPane />}
      </div>
    </div>
  );
}
