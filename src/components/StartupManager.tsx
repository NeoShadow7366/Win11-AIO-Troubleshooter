import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./ToastProvider";
import { open } from "@tauri-apps/plugin-shell";
import { useAdmin } from "./Layout";
import {
  Search,
  RefreshCw,
  ExternalLink,
  Shield,
  FolderOpen,
  Calendar,
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  Gauge,
} from "lucide-react";

// ─── Types ───

interface StartupItem {
  name: string;
  command: string | null;
  location: string;
  source: string;
  enabled: boolean;
  publisher: string | null;
}

type FilterSource = "all" | "Registry" | "StartupFolder" | "ScheduledTask";
type FilterEnabled = "all" | "enabled" | "disabled";

// ─── Impact Estimation ───

/** Estimate startup impact based on heuristics (publisher, command, source) */
function estimateImpact(item: StartupItem): "high" | "medium" | "low" | "unknown" {
  const cmd = (item.command || "").toLowerCase();
  const name = item.name.toLowerCase();

  // Known high-impact patterns
  const highImpact = [
    "onedrive", "teams", "discord", "spotify", "steam", "epic",
    "adobe", "creative cloud", "java", "update", "updater",
    "itunes", "icloud", "googledrivesync", "dropbox",
    "skype", "cortana", "gamebar",
  ];
  if (highImpact.some((h) => name.includes(h) || cmd.includes(h))) return "high";

  // Known low-impact patterns
  const lowImpact = [
    "securityhealth", "windows defender", "windowssecurity",
    "ctfmon", "igfx", "realtek", "synaptics",
    "nvidia", "amd", "intel",
  ];
  if (lowImpact.some((l) => name.includes(l) || cmd.includes(l))) return "low";

  // Scheduled tasks tend to be medium impact
  if (item.source === "ScheduledTask") return "medium";

  // Registry run keys with known system publishers
  const publisher = (item.publisher || "").toLowerCase();
  if (publisher.includes("microsoft")) return "low";

  // Default for unknown items
  if (item.enabled) return "medium";
  return "unknown";
}

function ImpactBadge({ impact }: { impact: "high" | "medium" | "low" | "unknown" }) {
  const config = {
    high: { color: "bg-danger/15 text-danger border-danger/20", label: "High" },
    medium: { color: "bg-warning/15 text-warning border-warning/20", label: "Medium" },
    low: { color: "bg-success/15 text-success border-success/20", label: "Low" },
    unknown: { color: "bg-white/[0.06] text-white/35 border-white/10", label: "—" },
  };
  const c = config[impact];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]
                       font-bold border ${c.color}`}>
      <Gauge className="w-2.5 h-2.5" />
      {c.label}
    </span>
  );
}

// ─── Source Badge ───

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    Registry: {
      color: "border-accent/30 bg-accent/10 text-accent",
      icon: <Database className="w-3 h-3" />,
      label: "Registry",
    },
    StartupFolder: {
      color: "border-success/30 bg-success/10 text-success",
      icon: <FolderOpen className="w-3 h-3" />,
      label: "Folder",
    },
    ScheduledTask: {
      color: "border-warning/30 bg-warning/10 text-warning",
      icon: <Calendar className="w-3 h-3" />,
      label: "Task",
    },
  };

  const c = config[source] || config.Registry;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px]
                       font-semibold border ${c.color}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

// ─── Toggle Switch ───

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300
                   border shrink-0
                   ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                   ${checked
                     ? "bg-success/25 border-success/40"
                     : "bg-white/[0.06] border-white/10 hover:bg-white/[0.1]"
                   }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full transition-all duration-300 shadow-sm
                     ${checked
                       ? "translate-x-[17px] bg-success"
                       : "translate-x-[3px] bg-white/40"
                     }`}
      />
    </button>
  );
}

// ─── Skeleton ───

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-5 shimmer rounded-full" />
      <div className="h-3.5 w-28 shimmer" />
      <div className="h-3 w-16 shimmer ml-auto" />
      <div className="h-3 w-40 shimmer" />
    </div>
  );
}

// ─── Component ───

export default function StartupManager() {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [filterEnabled, setFilterEnabled] = useState<FilterEnabled>("all");
  const [search, setSearch] = useState("");
  const { isAdmin, promptAdmin } = useAdmin();
  const { showToast } = useToast();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<StartupItem[]>("get_startup_items");
      setItems(result);
    } catch (err) {
      showToast("Failed to load startup items", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleToggle = async (item: StartupItem) => {
    // HKLM and scheduled tasks require admin
    if (
      !isAdmin &&
      (item.location.startsWith("HKLM") || item.source === "ScheduledTask")
    ) {
      promptAdmin();
      return;
    }

    const key = `${item.source}:${item.name}`;
    setToggling(key);

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.name === item.name && i.source === item.source
          ? { ...i, enabled: !i.enabled }
          : i
      )
    );

    try {
      await invoke("toggle_startup_item", {
        name: item.name,
        source: item.source,
        location: item.location,
        enabled: !item.enabled,
      });
      showToast(`${item.name} ${!item.enabled ? "enabled" : "disabled"} successfully`, "success");
    } catch (err) {
      showToast(`Failed to toggle ${item.name}`, "error");
      // Revert on failure
      setItems((prev) =>
        prev.map((i) =>
          i.name === item.name && i.source === item.source
            ? { ...i, enabled: item.enabled }
            : i
        )
      );
    } finally {
      setToggling(null);
    }
  };

  const handleWhatIsThis = async (name: string) => {
    const query = encodeURIComponent(`what is ${name} windows startup`);
    try {
      await open(`https://www.google.com/search?q=${query}`);
    } catch (err) {
      showToast("Failed to open browser", "error");
    }
  };

  const searchTerm = search.toLowerCase();
  const filtered = items.filter((item) => {
    if (filterSource !== "all" && item.source !== filterSource) return false;
    if (filterEnabled === "enabled" && !item.enabled) return false;
    if (filterEnabled === "disabled" && item.enabled) return false;
    if (searchTerm && !item.name.toLowerCase().includes(searchTerm)
        && !(item.publisher?.toLowerCase().includes(searchTerm))
        && !(item.command?.toLowerCase().includes(searchTerm))) return false;
    return true;
  });

  const enabledCount = items.filter((i) => i.enabled).length;
  const disabledCount = items.filter((i) => !i.enabled).length;
  const sourceCount = (s: string) => items.filter((i) => i.source === s).length;

  const SOURCES: { key: FilterSource; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "Registry", label: "Registry", count: sourceCount("Registry") },
    { key: "StartupFolder", label: "Folders", count: sourceCount("StartupFolder") },
    { key: "ScheduledTask", label: "Tasks", count: sourceCount("ScheduledTask") },
  ];

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Header stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-success/60" />
          <span className="text-[12px] text-white/50 font-medium">{enabledCount} enabled</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-white/25" />
          <span className="text-[12px] text-white/50 font-medium">{disabledCount} disabled</span>
        </div>
        <span className="text-[12px] text-white/20">•</span>
        <span className="text-[12px] text-white/30">{items.length} total</span>

        <div className="flex-1" />

        {/* Admin note */}
        {!isAdmin && (
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-warning/50" />
            <span className="text-[10px] text-warning/40">Some items need admin to toggle</span>
          </div>
        )}
      </div>

      {/* Source filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SOURCES.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilterSource(key)}
            className={`flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                        transition-all duration-200 border
                        ${filterSource === key
                          ? "border-accent/30 bg-accent/15 text-accent"
                          : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/75 hover:bg-white/[0.05]"
                        }`}
          >
            {label}
            {count !== undefined && (
              <span className="text-[10px] opacity-50">{count}</span>
            )}
          </button>
        ))}

        <div className="w-px h-6 bg-white/[0.06] mx-1" />

        {/* Enabled filter */}
        {(["all", "enabled", "disabled"] as FilterEnabled[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilterEnabled(key)}
            className={`h-8 px-3 rounded-lg text-[12px] font-medium
                        transition-all duration-200 border
                        ${filterEnabled === key
                          ? "border-accent/30 bg-accent/15 text-accent"
                          : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/75 hover:bg-white/[0.05]"
                        }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search startup items..."
            className="glass-input h-8 pl-8 pr-3 text-[12px] w-52"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={fetchItems}
          disabled={loading}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/50
                     hover:text-white/75 hover:bg-white/[0.05] transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Item list */}
      <div className="glass-panel flex-1 overflow-hidden flex flex-col min-h-0">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 h-9 border-b border-white/[0.06]
                         bg-white/[0.02] text-[10px] font-semibold text-white/30 uppercase tracking-wider shrink-0">
          <div className="w-10">On</div>
          <div className="flex-1 min-w-0">Name</div>
          <div className="w-16">Source</div>
          <div className="w-14 text-center">Impact</div>
          <div className="w-36">Publisher</div>
          <div className="flex-1 min-w-0">Command</div>
          <div className="w-10" />
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-[13px] text-white/20">
                {items.length === 0 ? "No startup items found" : "No items match your filters"}
              </span>
            </div>
          ) : (
            filtered.map((item) => {
              const key = `${item.source}:${item.name}`;
              const isToggling = toggling === key;
              const needsAdmin = !isAdmin && (item.location.startsWith("HKLM") || item.source === "ScheduledTask");
              const impact = estimateImpact(item);

              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.03]
                              hover:bg-white/[0.03] transition-all duration-150
                              ${!item.enabled ? "opacity-50" : ""}`}
                >
                  {/* Toggle */}
                  <div className="w-10 shrink-0">
                    {isToggling ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    ) : (
                      <ToggleSwitch
                        checked={item.enabled}
                        onChange={() => handleToggle(item)}
                        disabled={needsAdmin}
                      />
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[12.5px] font-medium text-white/85 truncate block">
                      {item.name}
                    </span>
                  </div>

                  {/* Source */}
                  <div className="w-16 shrink-0">
                    <SourceBadge source={item.source} />
                  </div>

                  {/* Impact */}
                  <div className="w-14 shrink-0 flex justify-center">
                    <ImpactBadge impact={impact} />
                  </div>

                  {/* Publisher */}
                  <div className="w-36 shrink-0">
                    <span className="text-[11px] text-white/40 truncate block">
                      {item.publisher || "—"}
                    </span>
                  </div>

                  {/* Command */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[10.5px] text-white/25 font-mono truncate block" title={item.command || ""}>
                      {item.command || "—"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="w-10 shrink-0 flex justify-end">
                    <button
                      onClick={() => handleWhatIsThis(item.name)}
                      className="flex items-center justify-center w-7 h-7 rounded-md
                                 text-white/20 hover:text-accent hover:bg-accent/10
                                 transition-all duration-200"
                      title="What is this?"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
