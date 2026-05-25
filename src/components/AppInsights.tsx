import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  Search,
  Loader2,
  Inbox,
  FolderOpen,
  Star,
  X,
  ExternalLink,
  RefreshCw,
  ChevronRight,
  Info,
  FileText,
  Cpu,
  Hash,
} from "lucide-react";
import type { AppInsightResult, FavoriteItem, ProcessInfo } from "../types";
import { useNavigate } from "./Layout";

/* ─── Types ─── */
interface AppGroup {
  name: string;
  count: number;
  totalMemory: number;
  totalCpu: number;
  pids: number[];
}

/* ─── Helpers ─── */
const openPath = async (path: string) => {
  try {
    await invoke("open_path_in_explorer", { path });
  } catch (err) {
    console.error("Open path error:", err);
  }
};

function groupProcesses(processes: ProcessInfo[]): AppGroup[] {
  const map = new Map<string, AppGroup>();
  for (const p of processes) {
    // Strip .exe suffix for grouping
    const baseName = p.name.replace(/\.exe$/i, "");
    const existing = map.get(baseName);
    if (existing) {
      existing.count++;
      existing.totalMemory += p.memory_mb;
      existing.totalCpu += p.cpu_usage;
      existing.pids.push(p.pid);
    } else {
      map.set(baseName, {
        name: baseName,
        count: 1,
        totalMemory: p.memory_mb,
        totalCpu: p.cpu_usage,
        pids: [p.pid],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalMemory - a.totalMemory);
}

/* ─── Component ─── */
export default function AppInsights() {
  const [allProcesses, setAllProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Favorites
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  // Detail panel
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [insightData, setInsightData] = useState<AppInsightResult | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const navigate = useNavigate();

  const fetchProcesses = useCallback(async () => {
    setLoading(true);
    try {
      const [procs, favs] = await Promise.all([
        invoke<ProcessInfo[]>("get_processes"),
        invoke<FavoriteItem[]>("get_favorites"),
      ]);
      setAllProcesses(procs.filter((p) => p.memory_mb > 0));
      setFavorites(favs.filter((f) => f.item_type === "process"));
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  // Group and filter
  const groups = useMemo(() => groupProcesses(allProcesses), [allProcesses]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, search]);

  const isFavorite = (name: string) => favorites.some((f) => f.name.toLowerCase() === name.toLowerCase());
  const favGroups = useMemo(() => groups.filter((g) => isFavorite(g.name)), [groups, favorites]);

  const handleSelect = async (appName: string) => {
    if (selectedApp === appName) {
      setSelectedApp(null);
      setInsightData(null);
      return;
    }
    setSelectedApp(appName);
    setInsightLoading(true);
    setInsightData(null);
    try {
      const data = await invoke<AppInsightResult>("get_app_insights", { name: appName });
      setInsightData(data);
    } catch (err) {
      console.error("App insight error:", err);
    } finally {
      setInsightLoading(false);
    }
  };

  const handleToggleFavorite = async (name: string) => {
    try {
      if (isFavorite(name)) {
        await invoke("remove_favorite", { itemType: "process", name });
      } else {
        await invoke("add_favorite", { itemType: "process", name, displayName: name, path: null });
      }
      const favs = await invoke<FavoriteItem[]>("get_favorites");
      setFavorites(favs.filter((f) => f.item_type === "process"));
    } catch (err) {
      console.error("Favorite error:", err);
    }
  };

  const handleWhatIsThis = async (name: string) => {
    const query = encodeURIComponent(`What is ${name} process Windows`);
    try {
      await open(`https://www.google.com/search?q=${query}`);
    } catch (err) {
      console.error("Open URL error:", err);
    }
  };

  const levelBadge = (lvl: string) => {
    const lower = lvl.toLowerCase();
    if (lower.includes("error") || lower.includes("critical")) return "bg-danger/15 text-danger";
    if (lower.includes("warning")) return "bg-warning/15 text-warning";
    return "bg-white/10 text-white/50";
  };

  return (
    <div className="flex flex-col gap-5 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="app-insights-search"
            type="text"
            placeholder="Filter applications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-10 pl-9 pr-3 text-[13px]"
          />
        </div>
        <span className="text-[12px] text-white/30 font-mono">
          {filtered.length} apps
        </span>
        <button
          onClick={fetchProcesses}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     bg-white/[0.04] border border-white/10 text-white/50
                     hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* App List */}
          <div className={`flex flex-col gap-4 overflow-y-auto transition-all duration-300 ${
            selectedApp ? "flex-1 min-w-0" : "w-full"
          }`}>
            {/* Favorites Section */}
            {favGroups.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                  Favorited Apps
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {favGroups.map((group) => (
                    <AppCard
                      key={group.name}
                      group={group}
                      isSelected={selectedApp === group.name}
                      isFav={true}
                      onSelect={() => handleSelect(group.name)}
                      onToggleFav={() => handleToggleFavorite(group.name)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* All Apps */}
            <section>
              <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
                All Applications ({filtered.length})
              </h2>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-white/25">
                  <Inbox className="w-8 h-8" />
                  <span className="text-[13px]">No matching applications</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map((group) => (
                    <AppCard
                      key={group.name}
                      group={group}
                      isSelected={selectedApp === group.name}
                      isFav={isFavorite(group.name)}
                      onSelect={() => handleSelect(group.name)}
                      onToggleFav={() => handleToggleFavorite(group.name)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Detail Panel */}
          {selectedApp && (
            <div className="w-[400px] min-w-[400px] glass-panel-strong flex flex-col overflow-hidden animate-slide-in">
              {/* Header */}
              <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-semibold text-white/90">App Details</span>
                </div>
                <button
                  onClick={() => { setSelectedApp(null); setInsightData(null); }}
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             text-white/30 hover:text-white/70 hover:bg-white/[0.06]
                             transition-all duration-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* App Identity */}
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold text-white/90 mb-1">{selectedApp}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleWhatIsThis(selectedApp)}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                 bg-accent/10 text-accent/80 hover:bg-accent/20 hover:text-accent
                                 transition-all duration-200 border border-accent/20"
                    >
                      <ExternalLink className="w-3 h-3" />
                      What is this?
                    </button>
                    <button
                      onClick={() => handleToggleFavorite(selectedApp)}
                      className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                 transition-all duration-200 border
                                 ${isFavorite(selectedApp)
                                   ? "bg-warning/10 text-warning border-warning/20"
                                   : "bg-white/[0.04] text-white/50 border-white/10 hover:text-warning"
                                 }`}
                    >
                      <Star className={`w-3 h-3 ${isFavorite(selectedApp) ? "fill-warning" : ""}`} />
                      {isFavorite(selectedApp) ? "Favorited" : "Favorite"}
                    </button>
                    <button
                      onClick={() => navigate("processes")}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                 bg-white/[0.04] text-white/50 border border-white/10
                                 hover:bg-white/[0.08] hover:text-white/80 transition-all duration-200"
                    >
                      <Cpu className="w-3 h-3" />
                      View in Processes
                    </button>
                  </div>
                </div>

                {insightLoading ? (
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 shimmer rounded-lg" />
                    ))}
                  </div>
                ) : insightData ? (
                  <div className="flex flex-col gap-4">
                    {/* Paths */}
                    {(insightData.exe_path || insightData.install_directory || insightData.appdata_directory) && (
                      <div className="flex flex-col gap-2">
                        {insightData.exe_path && (
                          <button
                            onClick={() => openPath(insightData.exe_path!)}
                            className="flex items-center gap-2 group/p text-left px-2.5 py-2 rounded-lg
                                       bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] transition-all"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-accent/60 shrink-0 group-hover/p:text-accent" />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[9px] text-white/25 uppercase font-semibold">Exe Path</span>
                              <span className="text-[11px] text-white/60 font-mono truncate group-hover/p:text-white/80">
                                {insightData.exe_path}
                              </span>
                            </div>
                            <ExternalLink className="w-3 h-3 text-white/0 group-hover/p:text-white/30 shrink-0" />
                          </button>
                        )}
                        {insightData.install_directory && (
                          <button
                            onClick={() => openPath(insightData.install_directory!)}
                            className="flex items-center gap-2 group/p text-left px-2.5 py-2 rounded-lg
                                       bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] transition-all"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-success/60 shrink-0 group-hover/p:text-success" />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[9px] text-white/25 uppercase font-semibold">Install Dir</span>
                              <span className="text-[11px] text-white/60 font-mono truncate group-hover/p:text-white/80">
                                {insightData.install_directory}
                              </span>
                            </div>
                            <ExternalLink className="w-3 h-3 text-white/0 group-hover/p:text-white/30 shrink-0" />
                          </button>
                        )}
                        {insightData.appdata_directory && (
                          <button
                            onClick={() => openPath(insightData.appdata_directory!)}
                            className="flex items-center gap-2 group/p text-left px-2.5 py-2 rounded-lg
                                       bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] transition-all"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-warning/60 shrink-0 group-hover/p:text-warning" />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[9px] text-white/25 uppercase font-semibold">AppData</span>
                              <span className="text-[11px] text-white/60 font-mono truncate group-hover/p:text-white/80">
                                {insightData.appdata_directory}
                              </span>
                            </div>
                            <ExternalLink className="w-3 h-3 text-white/0 group-hover/p:text-white/30 shrink-0" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Processes */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5" />
                        Matching Processes ({insightData.processes.length})
                      </h4>
                      {insightData.processes.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {insightData.processes.map((p) => (
                            <div key={p.pid} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                              <div className="flex items-center gap-2 min-w-0">
                                <Hash className="w-3 h-3 text-white/20 shrink-0" />
                                <span className="text-[12px] text-white/50 font-mono">{p.pid}</span>
                                <span className="text-[12px] text-white/75 truncate">{p.name}</span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] font-mono text-white/40 shrink-0">
                                <span>{p.cpu_usage.toFixed(1)}%</span>
                                <span>{p.memory_mb.toFixed(1)} MB</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-4 text-white/25 text-[12px]">
                          No running processes
                        </div>
                      )}
                    </div>

                    {/* Event Logs */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" />
                        Related Events ({insightData.event_logs.length})
                      </h4>
                      {insightData.event_logs.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {insightData.event_logs.map((log, i) => (
                            <div key={i} className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold ${levelBadge(log.level)}`}>
                                  {log.level}
                                </span>
                                <span className="text-[11px] text-white/35 font-mono">{log.time_created}</span>
                              </div>
                              <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2">{log.message}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-4 text-white/25 text-[12px]">
                          No related events
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── App Card ─── */
function AppCard({
  group,
  isSelected,
  isFav,
  onSelect,
  onToggleFav,
}: {
  group: AppGroup;
  isSelected: boolean;
  isFav: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`glass-panel p-3.5 cursor-pointer transition-all duration-300 group
                 ${isSelected ? "border-accent/30 bg-accent/[0.04]" : "hover:bg-white/[0.05]"}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-white/85 truncate">{group.name}</span>
          <span className="text-[11px] text-white/35">
            {group.count} process{group.count !== 1 ? "es" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
            className={`flex items-center justify-center w-6 h-6 rounded
                       transition-all duration-200
                       ${isFav ? "text-warning" : "text-white/15 hover:text-warning/60"}`}
          >
            <Star className={`w-3.5 h-3.5 ${isFav ? "fill-warning" : ""}`} />
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-white/15" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-white/40 font-mono tabular-nums">
          {group.totalMemory.toFixed(0)} MB
        </span>
        <span className="text-[11px] text-white/30 font-mono tabular-nums">
          {group.totalCpu.toFixed(1)}% CPU
        </span>
      </div>
    </div>
  );
}
