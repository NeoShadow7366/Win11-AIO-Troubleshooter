import { useState, useEffect } from "react";
import {
  RefreshCw,
  Monitor,
  Globe,
  Palette,
  Clock,
  Info,
  ExternalLink,
  Heart,
} from "lucide-react";
import { useTheme } from "./Layout";
import { useToast } from "./ToastProvider";

/* ─── Settings Types ─── */
interface AppSettings {
  dashboardRefreshMs: number;
  hardwareRefreshMs: number;
  defaultPingCount: number;
  defaultTracerouteHops: number;
  processAutoRefresh: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  dashboardRefreshMs: 2000,
  hardwareRefreshMs: 5000,
  defaultPingCount: 4,
  defaultTracerouteHops: 30,
  processAutoRefresh: false,
};

const STORAGE_KEY = "aio-settings";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/* ─── Component ─── */
export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetDefaults = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    showToast("Settings reset to defaults", "success");
  };

  const appVersion = "2.1.0";

  return (
    <div className="flex flex-col gap-6 h-full animate-fade-in overflow-y-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-text-primary/90">Settings</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">Configure application behavior and preferences</p>
        </div>
        <button
          onClick={resetDefaults}
          className="flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                     border border-border bg-surface text-text-secondary
                     hover:bg-surface-hover transition-all duration-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reset Defaults
        </button>
      </div>

      {/* Appearance */}
      <SettingsSection title="Appearance" icon={<Palette className="w-4 h-4" />}>
        <SettingsRow
          label="Theme"
          description="Switch between dark and light mode"
        >
          <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
            <button
              onClick={() => { if (theme === "light") toggleTheme(); }}
              className={`h-7 px-3.5 rounded-md text-[12px] font-medium transition-all duration-200
                ${theme === "dark"
                  ? "bg-accent/15 text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
                }`}
            >
              Dark
            </button>
            <button
              onClick={() => { if (theme === "dark") toggleTheme(); }}
              className={`h-7 px-3.5 rounded-md text-[12px] font-medium transition-all duration-200
                ${theme === "light"
                  ? "bg-accent/15 text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
                }`}
            >
              Light
            </button>
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* Performance */}
      <SettingsSection title="Performance" icon={<Monitor className="w-4 h-4" />}>
        <SettingsRow
          label="Dashboard Refresh Interval"
          description="How often the dashboard fetches new system stats"
        >
          <IntervalSelect
            value={settings.dashboardRefreshMs}
            onChange={(v) => update("dashboardRefreshMs", v)}
            options={[
              { value: 1000, label: "1s" },
              { value: 2000, label: "2s" },
              { value: 3000, label: "3s" },
              { value: 5000, label: "5s" },
              { value: 10000, label: "10s" },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          label="Hardware Health Refresh"
          description="Auto-refresh interval for hardware monitoring"
        >
          <IntervalSelect
            value={settings.hardwareRefreshMs}
            onChange={(v) => update("hardwareRefreshMs", v)}
            options={[
              { value: 3000, label: "3s" },
              { value: 5000, label: "5s" },
              { value: 10000, label: "10s" },
              { value: 15000, label: "15s" },
              { value: 30000, label: "30s" },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          label="Auto-Refresh Process List"
          description="Automatically refresh the process manager view"
        >
          <ToggleSwitch
            checked={settings.processAutoRefresh}
            onChange={(v) => update("processAutoRefresh", v)}
          />
        </SettingsRow>
      </SettingsSection>

      {/* Network */}
      <SettingsSection title="Network Defaults" icon={<Globe className="w-4 h-4" />}>
        <SettingsRow
          label="Default Ping Count"
          description="Number of ping requests to send"
        >
          <NumberInput
            value={settings.defaultPingCount}
            onChange={(v) => update("defaultPingCount", v)}
            min={1}
            max={50}
          />
        </SettingsRow>

        <SettingsRow
          label="Default Traceroute Hops"
          description="Maximum hop count for traceroute"
        >
          <NumberInput
            value={settings.defaultTracerouteHops}
            onChange={(v) => update("defaultTracerouteHops", v)}
            min={5}
            max={64}
          />
        </SettingsRow>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About" icon={<Info className="w-4 h-4" />}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10">
              <Heart className="w-5 h-5 text-accent" />
            </div>
            <div>
              <span className="text-[13px] font-semibold text-text-primary/90 block">AIO Troubleshooter</span>
              <span className="text-[11px] text-text-tertiary font-mono">v{appVersion}</span>
            </div>
          </div>
          <a
            href="https://github.com/NeoShadow7366/Win11-AIO-Troubleshooter"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                       bg-surface text-text-secondary hover:bg-surface-hover
                       border border-border transition-all duration-200"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            GitHub
          </a>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-text-tertiary" />
            <span className="text-[11px] text-text-tertiary">
              Built with Tauri v2, React, and Rust
            </span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

/* ─── Settings Section ─── */
function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-text-tertiary">{icon}</span>
        <h2 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-[0.12em]">
          {title}
        </h2>
      </div>
      <div className="glass-panel overflow-hidden divide-y divide-border">
        {children}
      </div>
    </section>
  );
}

/* ─── Settings Row ─── */
function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex flex-col gap-0.5 mr-8">
        <span className="text-[13px] font-medium text-text-primary/85">{label}</span>
        <span className="text-[11.5px] text-text-tertiary">{description}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ─── Interval Select ─── */
function IntervalSelect({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (value: number) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all duration-200
            ${value === opt.value
              ? "bg-accent/15 text-accent"
              : "text-text-tertiary hover:text-text-secondary"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Number Input ─── */
function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex items-center justify-center w-7 h-7 rounded-md
                   bg-surface border border-border text-text-tertiary
                   hover:bg-surface-hover hover:text-text-secondary
                   transition-all duration-200 text-[14px] font-bold"
      >
        −
      </button>
      <span className="w-10 text-center text-[13px] font-mono text-text-primary/80 tabular-nums">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex items-center justify-center w-7 h-7 rounded-md
                   bg-surface border border-border text-text-tertiary
                   hover:bg-surface-hover hover:text-text-secondary
                   transition-all duration-200 text-[14px] font-bold"
      >
        +
      </button>
    </div>
  );
}

/* ─── Toggle Switch ─── */
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300
                   border shrink-0 cursor-pointer
                   ${checked
                     ? "bg-success/25 border-success/40"
                     : "bg-surface border-border hover:bg-surface-hover"
                   }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full transition-all duration-300 shadow-sm
                     ${checked
                       ? "translate-x-[17px] bg-success"
                       : "translate-x-[3px] bg-text-tertiary"
                     }`}
      />
    </button>
  );
}
