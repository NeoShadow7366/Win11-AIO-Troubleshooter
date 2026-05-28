import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  Search,
  Trash2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  X,
  Info,
  Star,
  ExternalLink,
  Cpu,
  HardDrive,
  Clock,
  Hash,
  FileText,
  ChevronRight,
  ChevronDown,
  FolderOpen,
} from "lucide-react";
import type { ProcessInfo, ProcessDetails, FavoriteItem } from "../types";
import { useToast } from "./ToastProvider";
import { usePageVisible } from "./Layout";

type SortKey = "pid" | "name" | "cpu_usage" | "memory_mb" | "status" | "disk_io";
type SortDir = "asc" | "desc";

const PRIORITY_LEVELS = ["Idle", "BelowNormal", "Normal", "AboveNormal", "High", "Realtime"] as const;

const PRIORITY_COLORS: Record<string, string> = {
  Idle: "text-white/40 bg-white/[0.04]",
  BelowNormal: "text-accent/70 bg-accent/10",
  Normal: "text-success/80 bg-success/10",
  AboveNormal: "text-warning/80 bg-warning/10",
  High: "text-danger/80 bg-danger/10",
  Realtime: "text-danger bg-danger/15",
  RealTime: "text-danger bg-danger/15",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProcessManager() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpu_usage");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [killTarget, setKillTarget] = useState<ProcessInfo | null>(null);
  const [killing, setKilling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Info panel state
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [details, setDetails] = useState<ProcessDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Favorites state
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  // Icon cache
  const [iconCache, setIconCache] = useState<Record<string, string>>({});
  const { showToast } = useToast();
  const [priorityDropdown, setPriorityDropdown] = useState(false);
  const isVisible = usePageVisible('processes');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(timer);
  }, [search]);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; proc: ProcessInfo;
  } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const fetchProcesses = useCallback(async () => {
    try {
      const data = await invoke<ProcessInfo[]>("get_processes");
      setProcesses(data);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to fetch processes";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFavorites = useCallback(async () => {
    try {
      const favs = await invoke<FavoriteItem[]>("get_favorites");
      setFavorites(favs.filter((f) => f.item_type === "process"));
    } catch (err) {
      console.error("Favorites fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchProcesses();
    fetchFavorites();
  }, [fetchProcesses, fetchFavorites]);

  useEffect(() => {
    if (autoRefresh && isVisible) {
      intervalRef.current = setInterval(fetchProcesses, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchProcesses, isVisible]);

  // Load icon for a process path
  const loadIcon = useCallback(async (path: string) => {
    if (iconCache[path] !== undefined) return;
    // Mark as loading
    setIconCache((prev) => ({ ...prev, [path]: "" }));
    try {
      const icon = await invoke<string | null>("get_process_icon", { exePath: path });
      if (icon) {
        setIconCache((prev) => ({ ...prev, [path]: icon }));
      }
    } catch {
      // Failed to load icon, leave as empty
    }
  }, [iconCache]);

  // Load details when process is selected
  const handleRowClick = useCallback(async (proc: ProcessInfo) => {
    if (selectedPid === proc.pid) {
      setSelectedPid(null);
      setDetails(null);
      return;
    }
    setSelectedPid(proc.pid);
    setDetailsLoading(true);
    setDetails(null);
    try {
      const d = await invoke<ProcessDetails>("get_process_details", { pid: proc.pid });
      setDetails(d);
    } catch (err) {
      console.error("Process details error:", err);
    } finally {
      setDetailsLoading(false);
    }
  }, [selectedPid]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const handleKill = async () => {
    if (!killTarget) return;
    setKilling(true);
    try {
      await invoke("kill_process", { pid: killTarget.pid });
      setProcesses((prev) => prev.filter((p) => p.pid !== killTarget.pid));
      if (selectedPid === killTarget.pid) {
        setSelectedPid(null);
        setDetails(null);
      }
      showToast(`Killed ${killTarget.name} (PID ${killTarget.pid})`, "success");
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to kill process";
      showToast(msg, "error");
    } finally {
      setKilling(false);
      setKillTarget(null);
    }
  };

  const handleToggleFavorite = async (proc: ProcessInfo | ProcessDetails) => {
    const isFav = favorites.some((f) => f.name === proc.name);
    try {
      if (isFav) {
        await invoke("remove_favorite", { itemType: "process", name: proc.name });
      } else {
        await invoke("add_favorite", {
          itemType: "process",
          name: proc.name,
          displayName: proc.name,
          path: proc.path || null,
        });
      }
      await fetchFavorites();
    } catch (err) {
      console.error("Favorite toggle error:", err);
    }
  };

  const handleWhatIsThis = async () => {
    if (!details) return;
    const parts = [details.name.replace(/\.exe$/i, "")];
    if (details.description) parts.push(details.description);
    if (details.company) parts.push(details.company);
    const query = encodeURIComponent(`What is ${parts.join(" ")} Windows process`);
    try {
      await open(`https://www.google.com/search?q=${query}`);
    } catch (err) {
      console.error("Open URL error:", err);
    }
  };

  const handleOpenFileLocation = async (proc: ProcessInfo) => {
    if (!proc.path) {
      showToast("No file path available for this process", "info");
      return;
    }
    try {
      await invoke("open_dump_folder", { path: proc.path });
    } catch (err) {
      showToast("Failed to open file location", "error");
    }
  };

  const filtered = useMemo(() => processes
    .filter((p) => p.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === "disk_io") {
        const aVal = a.disk_read_bytes + a.disk_write_bytes;
        const bVal = b.disk_read_bytes + b.disk_write_bytes;
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = typeof aVal === "string"
        ? (aVal as string).localeCompare(bVal as string)
        : (aVal as number) - (bVal as number);
      return sortDir === "asc" ? cmp : -cmp;
    }), [processes, debouncedSearch, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-white/20" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-accent" />
      : <ArrowDown className="w-3 h-3 text-accent" />;
  };

  const columns: { key: SortKey; label: string; width: string; align?: string }[] = [
    { key: "pid",       label: "PID",         width: "w-[70px]" },
    { key: "name",      label: "Name",        width: "flex-1" },
    { key: "cpu_usage", label: "CPU %",       width: "w-[80px]",  align: "text-right" },
    { key: "memory_mb", label: "Memory (MB)", width: "w-[100px]", align: "text-right" },
    { key: "disk_io",   label: "Disk I/O",    width: "w-[100px]", align: "text-right" },
    { key: "status",    label: "Status",      width: "w-[80px]" },
  ];

  const isFavorite = (name: string) => favorites.some((f) => f.name === name);

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="process-search"
            type="text"
            placeholder="Search processes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-9 pl-9 pr-3 text-[13px]"
          />
        </div>

        {/* Process Count */}
        <span className="text-[12px] text-white/40 font-mono tabular-nums">
          {filtered.length} process{filtered.length !== 1 ? "es" : ""}
        </span>

        {/* Auto Refresh Toggle */}
        <button
          id="process-auto-refresh"
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium
                     transition-all duration-200 border
                     ${autoRefresh
                       ? "border-accent/30 bg-accent/10 text-accent"
                       : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70"
                     }`}
          title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
        >
          {autoRefresh
            ? <ToggleRight className="w-4 h-4" />
            : <ToggleLeft className="w-4 h-4" />}
          Auto
        </button>

        {/* Refresh */}
        <button
          id="process-refresh"
          onClick={fetchProcesses}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     bg-white/[0.04] border border-white/10 text-white/50
                     hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200"
          title="Refresh now"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Main content: table + detail panel */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Table */}
        <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
          selectedPid ? "flex-1 min-w-0" : "w-full"
        }`}>
          {/* Header */}
          <div className="flex items-center px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
            <div className="w-[28px]" /> {/* Icon column */}
            {columns.map((col) => (
              <button
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`flex items-center gap-1.5 ${col.width} ${col.align || ""}
                           text-[11px] font-semibold text-white/40 uppercase tracking-wider
                           hover:text-white/70 transition-colors select-none`}
              >
                {col.label}
                <SortIcon col={col.key} />
              </button>
            ))}
            <div className="w-[70px]" /> {/* Actions */}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col gap-0">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex items-center px-4 h-[38px] gap-4">
                    <div className="w-[20px] h-5 shimmer rounded" />
                    <div className="w-[60px] h-3 shimmer" />
                    <div className="flex-1 h-3 shimmer" />
                    <div className="w-[70px] h-3 shimmer" />
                    <div className="w-[90px] h-3 shimmer" />
                    <div className="w-[70px] h-3 shimmer" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
                No processes found
              </div>
            ) : (
              filtered.map((proc, idx) => {
                const hasIcon = proc.path && iconCache[proc.path];
                // Trigger lazy icon loading
                if (proc.path && iconCache[proc.path] === undefined && idx < 50) {
                  loadIcon(proc.path);
                }

                return (
                  <div
                    key={proc.pid}
                    onClick={() => handleRowClick(proc)}
                    className={`flex items-center px-4 h-[38px] text-[13px] cursor-pointer
                               transition-colors duration-150 border-b border-white/[0.03]
                               ${selectedPid === proc.pid
                                 ? "bg-accent/[0.08] border-l-2 border-l-accent"
                                 : idx % 2 === 0
                                   ? "bg-transparent hover:bg-white/[0.04]"
                                   : "bg-white/[0.015] hover:bg-white/[0.04]"
                               }`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, proc });
                    }}
                  >
                    {/* Icon */}
                    <div className="w-[28px] flex items-center justify-center shrink-0">
                      {hasIcon ? (
                        <img
                          src={`data:image/png;base64,${iconCache[proc.path!]}`}
                          alt=""
                          className="w-4 h-4 object-contain"
                        />
                      ) : (
                        <Cpu className="w-3.5 h-3.5 text-white/15" />
                      )}
                    </div>

                    <span className="w-[70px] text-white/50 font-mono text-[12px] tabular-nums">
                      {proc.pid}
                    </span>
                    <span className="flex-1 text-white/85 truncate pr-2 flex items-center gap-1.5">
                      {isFavorite(proc.name) && <Star className="w-3 h-3 text-warning fill-warning shrink-0" />}
                      {proc.name}
                    </span>
                    <span className={`w-[80px] text-right font-mono text-[12px] tabular-nums
                      ${proc.cpu_usage > 50 ? "text-danger" : proc.cpu_usage > 20 ? "text-warning" : "text-white/60"}`}>
                      {proc.cpu_usage.toFixed(1)}
                    </span>
                    <span className="w-[100px] text-right font-mono text-[12px] tabular-nums text-white/60">
                      {proc.memory_mb.toFixed(1)}
                    </span>
                    <span className="w-[100px] text-right font-mono text-[10px] tabular-nums text-white/40" title={`R: ${formatBytes(proc.disk_read_bytes)} / W: ${formatBytes(proc.disk_write_bytes)}`}>
                      {formatBytes(proc.disk_read_bytes + proc.disk_write_bytes)}
                    </span>
                    <span className="w-[80px]">
                      <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold
                        ${proc.status === "Running"
                          ? "bg-success/15 text-success"
                          : "bg-white/10 text-white/40"
                        }`}>
                        {proc.status}
                      </span>
                    </span>
                    <div className="w-[70px] flex justify-end gap-1">
                      <button
                        id={`fav-${proc.pid}`}
                        onClick={(e) => { e.stopPropagation(); handleToggleFavorite(proc); }}
                        className={`flex items-center justify-center w-7 h-7 rounded-md
                                   transition-all duration-200
                                   ${isFavorite(proc.name)
                                     ? "text-warning hover:text-warning/70"
                                     : "text-white/15 hover:text-warning/60"
                                   }`}
                        title={isFavorite(proc.name) ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFavorite(proc.name) ? "fill-warning" : ""}`} />
                      </button>
                      <button
                        id={`kill-${proc.pid}`}
                        onClick={(e) => { e.stopPropagation(); setKillTarget(proc); }}
                        className="flex items-center justify-center w-7 h-7 rounded-md
                                   text-white/20 hover:text-danger hover:bg-danger/10
                                   transition-all duration-200"
                        title={`Kill ${proc.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── Process Detail Panel ─── */}
        {selectedPid && (
          <div
            id="process-detail-panel"
            className="w-[340px] min-w-[340px] glass-panel-strong flex flex-col overflow-hidden animate-slide-in"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-accent" />
                <span className="text-[13px] font-semibold text-white/90">Process Details</span>
              </div>
              <button
                id="close-process-panel"
                onClick={() => { setSelectedPid(null); setDetails(null); }}
                className="flex items-center justify-center w-7 h-7 rounded-md
                           text-white/30 hover:text-white/70 hover:bg-white/[0.06]
                           transition-all duration-200"
                title="Close panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {detailsLoading ? (
                <div className="flex flex-col gap-3 mt-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="w-20 h-2.5 shimmer" />
                      <div className="w-full h-4 shimmer" />
                    </div>
                  ))}
                </div>
              ) : details ? (
                <div className="flex flex-col gap-4">
                  {/* Process Name & Actions */}
                  <div className="mb-1">
                    <div className="flex items-center gap-2 mb-2">
                      {details.path && iconCache[details.path] && (
                        <img
                          src={`data:image/png;base64,${iconCache[details.path]}`}
                          alt=""
                          className="w-6 h-6 object-contain"
                        />
                      )}
                      <h3 className="text-[14px] font-semibold text-white/90 leading-tight">
                        {details.name}
                      </h3>
                    </div>
                    {details.description && (
                      <p className="text-[12px] text-white/50 leading-relaxed mb-2">{details.description}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleWhatIsThis}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                   bg-accent/10 text-accent/80 hover:bg-accent/20 hover:text-accent
                                   transition-all duration-200 border border-accent/20"
                      >
                        <ExternalLink className="w-3 h-3" />
                        What is this?
                      </button>
                      <button
                        onClick={() => handleToggleFavorite(details)}
                        className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                   transition-all duration-200 border
                                   ${isFavorite(details.name)
                                     ? "bg-warning/10 text-warning border-warning/20"
                                     : "bg-white/[0.04] text-white/50 border-white/10 hover:text-warning hover:border-warning/20"
                                   }`}
                      >
                        <Star className={`w-3 h-3 ${isFavorite(details.name) ? "fill-warning" : ""}`} />
                        {isFavorite(details.name) ? "Favorited" : "Favorite"}
                      </button>
                    </div>
                  </div>

                  {/* Detail Fields */}
                  <DetailField icon={<Hash className="w-3.5 h-3.5" />} label="PID" value={String(details.pid)} mono />
                  <DetailField icon={<Cpu className="w-3.5 h-3.5" />} label="CPU Usage" value={`${details.cpu_usage.toFixed(1)}%`}
                    badge={details.cpu_usage > 50 ? "danger" : details.cpu_usage > 20 ? "warning" : "success"} />
                  <DetailField icon={<HardDrive className="w-3.5 h-3.5" />} label="Memory" value={`${details.memory_mb.toFixed(1)} MB`} />
                  <DetailField icon={<ChevronRight className="w-3.5 h-3.5" />} label="Status" value={details.status}
                    badge={details.status === "Running" ? "success" : "neutral"} />

                  {details.path && (
                    <DetailField icon={<FileText className="w-3.5 h-3.5" />} label="Path" value={details.path} mono />
                  )}
                  {details.command_line && (
                    <DetailField icon={<ChevronRight className="w-3.5 h-3.5" />} label="Command Line" value={details.command_line} mono multiline />
                  )}
                  {details.company && (
                    <DetailField icon={<ChevronRight className="w-3.5 h-3.5" />} label="Company" value={details.company} />
                  )}
                  {details.parent_pid != null && details.parent_pid > 0 && (
                    <DetailField icon={<Hash className="w-3.5 h-3.5" />} label="Parent PID" value={String(details.parent_pid)} mono />
                  )}
                  {details.thread_count != null && details.thread_count > 0 && (
                    <DetailField icon={<Cpu className="w-3.5 h-3.5" />} label="Threads" value={String(details.thread_count)} />
                  )}
                  {details.start_time && (
                    <DetailField icon={<Clock className="w-3.5 h-3.5" />} label="Start Time" value={details.start_time} mono />
                  )}

                  {/* Priority Control */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-white/35">
                      <ChevronRight className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Priority</span>
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setPriorityDropdown(!priorityDropdown)}
                        className={`flex items-center justify-between w-full h-7 px-2.5 rounded-md text-[11px] font-medium
                                   transition-all duration-200 border
                                   ${PRIORITY_COLORS[details.priority || "Normal"] || "text-white/60 bg-white/[0.04]"}
                                   border-white/10 hover:border-white/20`}
                      >
                        <span>{details.priority || "Normal"}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${priorityDropdown ? "rotate-180" : ""}`} />
                      </button>
                      {priorityDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-20 glass-panel-strong rounded-lg overflow-hidden py-1 shadow-xl">
                          {PRIORITY_LEVELS.map((level) => (
                            <button
                              key={level}
                              onClick={async () => {
                                setPriorityDropdown(false);
                                try {
                                  await invoke("set_process_priority", { pid: details.pid, priority: level });
                                  setDetails({ ...details, priority: level });
                                  showToast(`Priority set to ${level}`, "success");
                                } catch (err: any) {
                                  const msg = typeof err === "string" ? err : err?.message || "Failed to set priority";
                                  showToast(msg, "error");
                                }
                              }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] font-medium
                                         transition-colors duration-150 hover:bg-white/[0.06]
                                         ${(details.priority || "Normal") === level ? "text-accent" : "text-white/60"}`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-[12px] text-white/30 py-6">
                  No details available
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Kill Confirmation Modal */}
      {killTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel-strong w-[380px] p-6 flex flex-col gap-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-danger/15">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white/90">Kill Process</h3>
                <p className="text-[12px] text-white/50">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-[13px] text-white/70 leading-relaxed">
              Are you sure you want to terminate{" "}
              <span className="font-semibold text-white/90">{killTarget.name}</span>{" "}
              <span className="text-white/40 font-mono">(PID {killTarget.pid})</span>?
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                id="kill-cancel"
                onClick={() => setKillTarget(null)}
                className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                           bg-white/[0.06] text-white/70 hover:bg-white/[0.1]
                           transition-colors duration-200 border border-white/10"
              >
                Cancel
              </button>
              <button
                id="kill-confirm"
                onClick={handleKill}
                disabled={killing}
                className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                           bg-danger/90 text-white hover:bg-danger
                           disabled:opacity-50 transition-colors duration-200"
              >
                {killing ? "Killing..." : "Kill Process"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50 glass-panel-strong rounded-lg overflow-hidden py-1 shadow-2xl min-w-[180px]
                     animate-fade-in border border-white/10"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 260),
          }}
        >
          <button
            onClick={() => { handleRowClick(contextMenu.proc); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70
                       hover:bg-white/[0.06] transition-colors"
          >
            <Info className="w-3.5 h-3.5" /> View Details
          </button>
          <button
            onClick={() => { handleToggleFavorite(contextMenu.proc); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70
                       hover:bg-white/[0.06] transition-colors"
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite(contextMenu.proc.name) ? "fill-warning text-warning" : ""}`} />
            {isFavorite(contextMenu.proc.name) ? "Remove Favorite" : "Add Favorite"}
          </button>
          <div className="h-px bg-white/[0.06] my-1" />
          {contextMenu.proc.path && (
            <button
              onClick={() => { handleOpenFileLocation(contextMenu.proc); setContextMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70
                         hover:bg-white/[0.06] transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" /> Open File Location
            </button>
          )}
          <button
            onClick={async () => {
              const name = contextMenu.proc.name.replace(/\.exe$/i, "");
              const q = encodeURIComponent(`What is ${name} Windows process`);
              await open(`https://www.google.com/search?q=${q}`);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70
                       hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> What is This?
          </button>
          <div className="h-px bg-white/[0.06] my-1" />
          <button
            onClick={() => { setKillTarget(contextMenu.proc); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-danger/80
                       hover:bg-danger/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Kill Process
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Detail Field Component ─── */
interface DetailFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
  badge?: "success" | "danger" | "warning" | "neutral";
}

function DetailField({ icon, label, value, mono, multiline, badge }: DetailFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-white/35">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      {badge ? (
        <span
          className={`inline-flex items-center self-start h-5 px-2.5 rounded-full text-[11px] font-semibold
            ${badge === "success"
              ? "bg-success/15 text-success"
              : badge === "danger"
                ? "bg-danger/15 text-danger"
                : badge === "warning"
                  ? "bg-warning/15 text-warning"
                  : "bg-white/[0.06] text-white/60"
            }`}
        >
          {value}
        </span>
      ) : (
        <span
          className={`text-[12.5px] leading-relaxed break-all
            ${mono
              ? "font-mono text-[11.5px] text-accent/70 bg-white/[0.03] px-2.5 py-1.5 rounded-md border border-white/[0.05]"
              : "text-white/75"
            }
            ${multiline ? "whitespace-pre-wrap" : ""}
          `}
        >
          {value}
        </span>
      )}
    </div>
  );
}
