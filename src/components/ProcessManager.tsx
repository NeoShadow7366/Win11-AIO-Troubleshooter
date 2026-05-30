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
  Pause,
  Play,
  GitBranch,
  ListTree,
  List,
  FileDown,
  Leaf,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Layers,
  Library,
  Shield,
  Globe,
  Copy,
} from "lucide-react";
import type { ProcessInfo, ProcessDetails, FavoriteItem, AffinityInfo, ProcessDll, ProcessConnection } from "../types";
import { useToast } from "./ToastProvider";
import { usePageVisible } from "./Layout";

type SortKey = "pid" | "name" | "cpu_usage" | "memory_mb" | "status" | "disk_io";
type SortDir = "asc" | "desc";

const ALL_COLUMNS: { key: SortKey; label: string; width: string; align?: string; required?: boolean }[] = [
  { key: "pid",       label: "PID",         width: "w-[70px]",  required: true },
  { key: "name",      label: "Name",        width: "flex-1",    required: true },
  { key: "cpu_usage", label: "CPU %",       width: "w-[80px]",  align: "text-right" },
  { key: "memory_mb", label: "Memory (MB)", width: "w-[100px]", align: "text-right" },
  { key: "disk_io",   label: "Disk I/O",    width: "w-[100px]", align: "text-right" },
  { key: "status",    label: "Status",      width: "w-[80px]" },
];

const DEFAULT_VISIBLE_COLS = new Set<SortKey>(["pid", "name", "cpu_usage", "memory_mb", "disk_io", "status"]);

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
  const [killTreeTarget, setKillTreeTarget] = useState<ProcessInfo | null>(null);
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

  // Tree view state
  const [treeView, setTreeView] = useState(false);
  const [expandedPids, setExpandedPids] = useState<Set<number>>(new Set());

  // Group view state
  const [groupView, setGroupView] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Affinity state
  const [affinity, setAffinity] = useState<AffinityInfo | null>(null);
  const [affinityLoading, setAffinityLoading] = useState(false);
  const [affinityExpanded, setAffinityExpanded] = useState(false);
  const [pendingAffinity, setPendingAffinity] = useState<number | null>(null);

  // DLL inspector state
  const [dlls, setDlls] = useState<ProcessDll[]>([]);
  const [dllsLoading, setDllsLoading] = useState(false);
  const [dllsExpanded, setDllsExpanded] = useState(false);
  const [dllSearch, setDllSearch] = useState("");

  // VirusTotal state
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [hashLoading, setHashLoading] = useState(false);
  const [vtExpanded, setVtExpanded] = useState(false);

  // Network connections state
  const [connections, setConnections] = useState<ProcessConnection[]>([]);
  const [connsLoading, setConnsLoading] = useState(false);
  const [connsExpanded, setConnsExpanded] = useState(false);

  // Column customization
  const [visibleCols, setVisibleCols] = useState<Set<SortKey>>(() => {
    try {
      const saved = localStorage.getItem("process-visible-cols");
      if (saved) return new Set(JSON.parse(saved) as SortKey[]);
    } catch {}
    return new Set(DEFAULT_VISIBLE_COLS);
  });
  const [colDropdownOpen, setColDropdownOpen] = useState(false);

  const toggleColumn = (key: SortKey) => {
    const col = ALL_COLUMNS.find((c) => c.key === key);
    if (col?.required) return;
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem("process-visible-cols", JSON.stringify([...next]));
      return next;
    });
  };

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

  // Close context menu and dropdowns on click outside
  useEffect(() => {
    const handler = () => { setContextMenu(null); setColDropdownOpen(false); };
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
    setDlls([]); setDllsExpanded(false); setDllSearch("");
    setFileHash(null); setVtExpanded(false);
    setConnections([]); setConnsExpanded(false);
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
      await invoke("open_path_in_explorer", { path: proc.path });
    } catch (err) {
      showToast("Failed to open file location", "error");
    }
  };

  // ─── Kill Process Tree ───
  const handleKillTree = async () => {
    if (!killTreeTarget) return;
    setKilling(true);
    try {
      const result = await invoke<string>("kill_process_tree", { pid: killTreeTarget.pid });
      showToast(result, "success");
      fetchProcesses();
      if (selectedPid === killTreeTarget.pid) {
        setSelectedPid(null);
        setDetails(null);
      }
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to kill process tree";
      showToast(msg, "error");
    } finally {
      setKilling(false);
      setKillTreeTarget(null);
    }
  };

  // ─── Suspend / Resume ───
  const handleSuspend = async (pid: number) => {
    try {
      await invoke<string>("suspend_process", { pid });
      showToast(`Process ${pid} suspended`, "success");
      fetchProcesses();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to suspend";
      showToast(msg, "error");
    }
  };

  const handleResume = async (pid: number) => {
    try {
      await invoke<string>("resume_process", { pid });
      showToast(`Process ${pid} resumed`, "success");
      fetchProcesses();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to resume";
      showToast(msg, "error");
    }
  };

  // ─── CPU Affinity ───
  const loadAffinity = async (pid: number) => {
    setAffinityLoading(true);
    try {
      const info = await invoke<AffinityInfo>("get_process_affinity", { pid });
      setAffinity(info);
      setPendingAffinity(info.process_mask);
    } catch (err: any) {
      setAffinity(null);
      showToast("Failed to load CPU affinity", "error");
    } finally {
      setAffinityLoading(false);
    }
  };

  const handleApplyAffinity = async () => {
    if (!details || pendingAffinity === null) return;
    try {
      await invoke<string>("set_process_affinity", { pid: details.pid, mask: pendingAffinity });
      showToast("CPU affinity updated", "success");
      if (affinity) setAffinity({ ...affinity, process_mask: pendingAffinity });
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to set affinity";
      showToast(msg, "error");
    }
  };

  const toggleAffinityCore = (core: number) => {
    if (pendingAffinity === null) return;
    const bit = 1 << core;
    const newMask = pendingAffinity ^ bit;
    // Don't allow setting mask to 0
    if (newMask === 0) return;
    setPendingAffinity(newMask);
  };

  // ─── CSV Export ───
  const handleExportCsv = () => {
    const rows = treeView && treeFiltered
      ? treeFiltered.map((t) => t.proc)
      : filtered;

    const headers = ["PID", "Name", "CPU %", "Memory (MB)", "Status", "Disk Read (B)", "Disk Write (B)", "Path"];
    const csvLines = [
      headers.join(","),
      ...rows.map((p) => [
        p.pid,
        `"${p.name.replace(/"/g, '""')}"`,
        p.cpu_usage.toFixed(1),
        p.memory_mb.toFixed(1),
        p.status,
        p.disk_read_bytes,
        p.disk_write_bytes,
        `"${(p.path || "").replace(/"/g, '""')}"`,
      ].join(",")),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `processes-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${rows.length} processes to CSV`, "success");
  };

  // Reset affinity state when process selection changes
  useEffect(() => {
    setAffinityExpanded(false);
    setAffinity(null);
    setPendingAffinity(null);
  }, [selectedPid]);

  // ─── Tree View Helpers ───
  const toggleExpand = (pid: number) => {
    setExpandedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  // Count children for a process (for tree view)
  const childCount = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of processes) {
      if (p.parent_pid != null) {
        map.set(p.parent_pid, (map.get(p.parent_pid) || 0) + 1);
      }
    }
    return map;
  }, [processes]);

  // Build flat list with depth for tree rendering
  const treeFiltered = useMemo(() => {
    if (!treeView) return null;

    const searchLower = debouncedSearch.toLowerCase();
    const matchesSearch = (p: ProcessInfo) => p.name.toLowerCase().includes(searchLower);

    // Build parent→children map
    const childrenMap = new Map<number, ProcessInfo[]>();
    const roots: ProcessInfo[] = [];
    const pidSet = new Set(processes.map((p) => p.pid));

    for (const p of processes) {
      if (p.parent_pid == null || !pidSet.has(p.parent_pid)) {
        roots.push(p);
      } else {
        const siblings = childrenMap.get(p.parent_pid) || [];
        siblings.push(p);
        childrenMap.set(p.parent_pid, siblings);
      }
    }

    // Sort roots by current sort
    const sortFn = (a: ProcessInfo, b: ProcessInfo) => {
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
    };

    roots.sort(sortFn);

    // Flatten tree with depth tracking
    const result: { proc: ProcessInfo; depth: number; hasChildren: boolean }[] = [];

    const walk = (items: ProcessInfo[], depth: number) => {
      for (const p of items) {
        const kids = childrenMap.get(p.pid) || [];
        const passesSearch = !debouncedSearch || matchesSearch(p) || kids.some(matchesSearch);
        if (!passesSearch) continue;

        result.push({ proc: p, depth, hasChildren: kids.length > 0 });

        if (kids.length > 0 && expandedPids.has(p.pid)) {
          kids.sort(sortFn);
          walk(kids, depth + 1);
        }
      }
    };

    walk(roots, 0);
    return result;
  }, [treeView, processes, debouncedSearch, sortKey, sortDir, expandedPids]);

  // Grouped view: aggregate processes by name
  const groupedData = useMemo(() => {
    if (!groupView) return null;
    const searchLower = debouncedSearch.toLowerCase();
    const matchingProcesses = processes.filter((p) =>
      p.name.toLowerCase().includes(searchLower)
    );

    // Group by name
    const groups = new Map<string, ProcessInfo[]>();
    for (const p of matchingProcesses) {
      const key = p.name.toLowerCase();
      const arr = groups.get(key) || [];
      arr.push(p);
      groups.set(key, arr);
    }

    // Build result with aggregate stats
    const result: { name: string; procs: ProcessInfo[]; totalCpu: number; totalMem: number; count: number }[] = [];
    for (const [, procs] of groups) {
      const totalCpu = procs.reduce((s, p) => s + p.cpu_usage, 0);
      const totalMem = procs.reduce((s, p) => s + p.memory_mb, 0);
      result.push({ name: procs[0].name, procs, totalCpu, totalMem, count: procs.length });
    }

    // Sort groups
    result.sort((a, b) => {
      if (sortKey === "cpu_usage") return sortDir === "asc" ? a.totalCpu - b.totalCpu : b.totalCpu - a.totalCpu;
      if (sortKey === "memory_mb") return sortDir === "asc" ? a.totalMem - b.totalMem : b.totalMem - a.totalMem;
      if (sortKey === "name") return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      return sortDir === "asc" ? a.count - b.count : b.count - a.count;
    });

    return result;
  }, [groupView, processes, debouncedSearch, sortKey, sortDir]);

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

  const columns = ALL_COLUMNS.filter((c) => visibleCols.has(c.key));

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
          {groupView && groupedData
            ? `${groupedData.length} group${groupedData.length !== 1 ? "s" : ""}`
            : `${treeView && treeFiltered ? treeFiltered.length : filtered.length} process${(treeView && treeFiltered ? treeFiltered.length : filtered.length) !== 1 ? "es" : ""}`}
        </span>

        {/* Tree View Toggle */}
        <button
          id="process-tree-toggle"
          onClick={() => { setTreeView(!treeView); if (groupView) setGroupView(false); }}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium
                     transition-all duration-200 border
                     ${treeView
                       ? "border-accent/30 bg-accent/10 text-accent"
                       : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70"
                     }`}
          title={treeView ? "Switch to list view" : "Switch to tree view"}
        >
          {treeView ? <ListTree className="w-4 h-4" /> : <List className="w-4 h-4" />}
          {treeView ? "Tree" : "List"}
        </button>

        {/* Group View Toggle */}
        <button
          id="process-group-toggle"
          onClick={() => { setGroupView(!groupView); if (treeView) setTreeView(false); }}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium
                     transition-all duration-200 border
                     ${groupView
                       ? "border-[#a855f7]/30 bg-[#a855f7]/10 text-[#a855f7]"
                       : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70"
                     }`}
          title={groupView ? "Disable grouping" : "Group by app name"}
        >
          <Layers className="w-4 h-4" />
          Group
        </button>

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

        {/* CSV Export */}
        <button
          id="process-csv-export"
          onClick={handleExportCsv}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70
                     transition-all duration-200"
          title="Export process list as CSV"
        >
          <FileDown className="w-4 h-4" />
          CSV
        </button>

        {/* Column Visibility */}
        <div className="relative">
          <button
            id="process-col-toggle"
            onClick={() => setColDropdownOpen(!colDropdownOpen)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium
                       transition-all duration-200 border
                       ${colDropdownOpen
                         ? "border-accent/30 bg-accent/10 text-accent"
                         : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70"
                       }`}
            title="Customize columns"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Cols
          </button>
          {colDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 glass-panel-strong rounded-lg w-[180px] py-1 shadow-xl animate-fade-in">
              <div className="px-3 py-1.5 text-[10px] text-white/30 font-semibold uppercase tracking-wider">
                Show Columns
              </div>
              {ALL_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  disabled={col.required}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px]
                             transition-colors duration-150
                             ${col.required ? "text-white/25 cursor-not-allowed" : "text-white/60 hover:bg-white/[0.06]"}`}
                >
                  {visibleCols.has(col.key)
                    ? <Eye className="w-3.5 h-3.5 text-accent" />
                    : <EyeOff className="w-3.5 h-3.5 text-white/20" />}
                  {col.label}
                  {col.required && <span className="text-[9px] text-white/15 ml-auto">required</span>}
                </button>
              ))}
            </div>
          )}
        </div>

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
            ) : groupView && groupedData ? (
              groupedData.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
                  No processes found
                </div>
              ) : (
                groupedData.map((group, gIdx) => {
                  const isExpanded = expandedGroups.has(group.name.toLowerCase());
                  return (
                    <div key={group.name}>
                      {/* Group Header */}
                      <div
                        className={`flex items-center px-4 h-[40px] cursor-pointer transition-colors duration-150
                                   border-b border-white/[0.04]
                                   ${gIdx % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.01]"}
                                   hover:bg-white/[0.06]`}
                        onClick={() => {
                          setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            const key = group.name.toLowerCase();
                            if (next.has(key)) next.delete(key); else next.add(key);
                            return next;
                          });
                        }}
                      >
                        <div className="w-[28px] flex items-center justify-center shrink-0 text-white/25">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </div>
                        {columns.map((col) => (
                          <span key={col.key} className={`${col.width} ${col.align || ""} text-[13px] truncate`}>
                            {col.key === "name" ? (
                              <span className="font-semibold text-white/80 flex items-center gap-2">
                                {group.name}
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#a855f7]/15 text-[#a855f7] font-bold tabular-nums">
                                  {group.count}
                                </span>
                              </span>
                            ) : col.key === "cpu_usage" ? (
                              <span className={`font-mono text-[12px] tabular-nums ${group.totalCpu > 50 ? "text-danger" : group.totalCpu > 10 ? "text-warning" : "text-white/50"}`}>
                                {group.totalCpu.toFixed(1)}
                              </span>
                            ) : col.key === "memory_mb" ? (
                              <span className="font-mono text-[12px] tabular-nums text-white/50">
                                {group.totalMem.toFixed(0)}
                              </span>
                            ) : col.key === "pid" ? (
                              <span className="text-[12px] text-white/20">—</span>
                            ) : null}
                          </span>
                        ))}
                        <div className="w-[70px]" />
                      </div>
                      {/* Expanded children */}
                      {isExpanded && group.procs.map((proc) => {
                        const hasIcon = proc.path && iconCache[proc.path];
                        return (
                          <div
                            key={proc.pid}
                            className={`flex items-center px-4 h-[36px] text-[13px] cursor-pointer
                                       transition-colors duration-150 border-b border-white/[0.02]
                                       bg-white/[0.01] hover:bg-white/[0.04]
                                       ${selectedPid === proc.pid ? "!bg-accent/10 border-l-2 border-l-accent" : ""}`}
                            onClick={() => setSelectedPid(selectedPid === proc.pid ? null : proc.pid)}
                          >
                            <div className="w-[28px] flex items-center justify-center shrink-0 pl-3">
                              {hasIcon ? (
                                <img src={`data:image/png;base64,${iconCache[proc.path!]}`} className="w-4 h-4" />
                              ) : (
                                <div className="w-4 h-4 rounded bg-white/[0.04]" />
                              )}
                            </div>
                            {columns.map((col) => (
                              <span key={col.key} className={`${col.width} ${col.align || ""} truncate text-[12px] text-white/55`}>
                                {col.key === "name" ? <span className="pl-2">{proc.name}</span>
                                  : col.key === "pid" ? <span className="font-mono text-white/30 tabular-nums">{proc.pid}</span>
                                  : col.key === "cpu_usage" ? <span className={`font-mono tabular-nums ${proc.cpu_usage > 50 ? "text-danger" : proc.cpu_usage > 10 ? "text-warning" : ""}`}>{proc.cpu_usage.toFixed(1)}</span>
                                  : col.key === "memory_mb" ? <span className="font-mono tabular-nums">{proc.memory_mb.toFixed(0)}</span>
                                  : col.key === "status" ? <span className="text-[10px] text-white/30">{proc.status}</span>
                                  : col.key === "disk_io" ? <span className="font-mono tabular-nums">{formatBytes(proc.disk_read_bytes + proc.disk_write_bytes)}</span>
                                  : null}
                              </span>
                            ))}
                            <div className="w-[70px]" />
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )
            ) : (treeView && treeFiltered ? treeFiltered.length === 0 : filtered.length === 0) ? (
              <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
                No processes found
              </div>
            ) : (
              (treeView && treeFiltered ? treeFiltered : filtered.map((proc) => ({ proc, depth: 0, hasChildren: false }))).map(({ proc, depth, hasChildren }, idx) => {
                const hasIcon = proc.path && iconCache[proc.path];
                // Trigger lazy icon loading
                if (proc.path && iconCache[proc.path] === undefined && idx < 50) {
                  loadIcon(proc.path);
                }

                const isSuspended = proc.status === "Stopped" || proc.status === "Suspended";

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
                    {/* Tree indent + expand/collapse */}
                    <div className="w-[28px] flex items-center justify-center shrink-0"
                         style={treeView ? { marginLeft: `${depth * 16}px` } : undefined}>
                      {treeView && hasChildren ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(proc.pid); }}
                          className="flex items-center justify-center w-5 h-5 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                        >
                          {expandedPids.has(proc.pid)
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      ) : hasIcon ? (
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
                      {treeView && hasChildren && (
                        <span className="text-[10px] text-white/20 font-mono">({childCount.get(proc.pid) || 0})</span>
                      )}
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
                          : isSuspended
                            ? "bg-warning/15 text-warning"
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

                  {/* Suspend / Resume Button */}
                  <div className="flex items-center gap-2">
                    {details.status === "Stopped" || details.status === "Suspended" ? (
                      <button
                        onClick={() => handleResume(details.pid)}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                   bg-success/10 text-success/80 hover:bg-success/20 hover:text-success
                                   transition-all duration-200 border border-success/20"
                      >
                        <Play className="w-3 h-3" /> Resume
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSuspend(details.pid)}
                        className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                   bg-warning/10 text-warning/80 hover:bg-warning/20 hover:text-warning
                                   transition-all duration-200 border border-warning/20"
                      >
                        <Pause className="w-3 h-3" /> Suspend
                      </button>
                    )}
                  </div>

                  {/* CPU Affinity */}
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => {
                        const next = !affinityExpanded;
                        setAffinityExpanded(next);
                        if (next && !affinity) loadAffinity(details.pid);
                      }}
                      className="flex items-center gap-1.5 text-white/35 hover:text-white/60 transition-colors"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${affinityExpanded ? "rotate-90" : ""}`} />
                      <Cpu className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">CPU Affinity</span>
                    </button>

                    {affinityExpanded && (
                      <div className="flex flex-col gap-2 animate-fade-in">
                        {affinityLoading ? (
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div key={i} className="w-9 h-7 shimmer rounded-md" />
                            ))}
                          </div>
                        ) : affinity && pendingAffinity !== null ? (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: affinity.core_count }).map((_, i) => {
                                const isSet = (pendingAffinity & (1 << i)) !== 0;
                                return (
                                  <button
                                    key={i}
                                    onClick={() => toggleAffinityCore(i)}
                                    className={`flex items-center justify-center w-9 h-7 rounded-md text-[10px] font-bold
                                               transition-all duration-200 border
                                               ${isSet
                                                 ? "bg-accent/15 text-accent border-accent/30"
                                                 : "bg-white/[0.03] text-white/25 border-white/[0.06] hover:text-white/50"
                                               }`}
                                    title={`Core ${i}`}
                                  >
                                    {i}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleApplyAffinity}
                                disabled={pendingAffinity === affinity.process_mask}
                                className="h-6 px-3 rounded-md text-[10px] font-semibold
                                           bg-accent/90 text-black hover:bg-accent
                                           disabled:opacity-30 disabled:cursor-not-allowed
                                           transition-all duration-200"
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => setPendingAffinity(affinity.system_mask)}
                                className="h-6 px-3 rounded-md text-[10px] font-medium
                                           bg-white/[0.04] text-white/50 border border-white/10
                                           hover:text-white/70 transition-all"
                              >
                                All Cores
                              </button>
                              <button
                                onClick={() => setPendingAffinity(affinity.process_mask)}
                                disabled={pendingAffinity === affinity.process_mask}
                                className="h-6 px-3 rounded-md text-[10px] font-medium
                                           bg-white/[0.04] text-white/50 border border-white/10
                                           hover:text-white/70 disabled:opacity-30
                                           transition-all"
                              >
                                Reset
                              </button>
                            </div>
                          </>
                        ) : (
                          <span className="text-[11px] text-white/25">Unable to load affinity data</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* DLL Inspector */}
                  <div className="border-t border-white/[0.04] pt-2 mt-2">
                    <button
                      onClick={() => {
                        if (!dllsExpanded && dlls.length === 0) {
                          setDllsLoading(true);
                          invoke<ProcessDll[]>("get_process_dlls", { pid: details.pid })
                            .then(setDlls)
                            .catch(() => setDlls([]))
                            .finally(() => setDllsLoading(false));
                        }
                        setDllsExpanded(!dllsExpanded);
                      }}
                      className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors w-full"
                    >
                      <Library className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Loaded DLLs</span>
                      {dlls.length > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent/70 font-bold tabular-nums">
                          {dlls.length}
                        </span>
                      )}
                      <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${dllsExpanded ? "rotate-90" : ""}`} />
                    </button>
                    {dllsExpanded && (
                      <div className="mt-2 space-y-1">
                        {dllsLoading ? (
                          <div className="flex items-center gap-2 py-4 justify-center">
                            <RefreshCw className="w-3.5 h-3.5 text-accent animate-spin" />
                            <span className="text-[11px] text-white/30">Loading modules...</span>
                          </div>
                        ) : dlls.length === 0 ? (
                          <span className="text-[11px] text-white/25">No modules found (may need admin)</span>
                        ) : (
                          <>
                            <input
                              type="text"
                              placeholder="Filter DLLs..."
                              value={dllSearch}
                              onChange={(e) => setDllSearch(e.target.value)}
                              className="glass-input w-full h-7 px-2.5 text-[11px] mb-1"
                            />
                            <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                              {dlls
                                .filter((d) => d.name.toLowerCase().includes(dllSearch.toLowerCase()) || d.path.toLowerCase().includes(dllSearch.toLowerCase()))
                                .map((dll, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-2 px-2 py-1 rounded text-[11px] hover:bg-white/[0.04] transition-colors"
                                    title={dll.path}
                                  >
                                    <Library className="w-3 h-3 text-accent/40 shrink-0" />
                                    <span className="text-white/60 truncate flex-1">{dll.name}</span>
                                    <span className="text-white/20 text-[10px] font-mono tabular-nums shrink-0">
                                      {dll.size_bytes > 1024 * 1024
                                        ? `${(dll.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                                        : `${(dll.size_bytes / 1024).toFixed(0)} KB`}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* VirusTotal Hash Scanner */}
                  {details.path && (
                    <div className="border-t border-white/[0.04] pt-2 mt-2">
                      <button
                        onClick={() => {
                          if (!vtExpanded && !fileHash) {
                            setHashLoading(true);
                            invoke<string>("get_file_hash", { path: details.path })
                              .then(setFileHash)
                              .catch(() => setFileHash(null))
                              .finally(() => setHashLoading(false));
                          }
                          setVtExpanded(!vtExpanded);
                        }}
                        className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors w-full"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">VirusTotal</span>
                        {fileHash && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/10 text-success/70 font-bold">
                            SHA256
                          </span>
                        )}
                        <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${vtExpanded ? "rotate-90" : ""}`} />
                      </button>
                      {vtExpanded && (
                        <div className="mt-2 space-y-2">
                          {hashLoading ? (
                            <div className="flex items-center gap-2 py-3 justify-center">
                              <RefreshCw className="w-3.5 h-3.5 text-accent animate-spin" />
                              <span className="text-[11px] text-white/30">Computing SHA256 hash...</span>
                            </div>
                          ) : fileHash ? (
                            <>
                              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.06]">
                                <span className="text-[10px] font-mono text-white/40 truncate flex-1">{fileHash}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(fileHash);
                                    showToast("Hash copied to clipboard", "success");
                                  }}
                                  className="shrink-0 text-white/30 hover:text-white/60 transition-colors"
                                  title="Copy hash"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                              <a
                                href={`https://www.virustotal.com/gui/file/${fileHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium
                                           bg-accent/10 border border-accent/20 text-accent
                                           hover:bg-accent/15 transition-all cursor-pointer"
                              >
                                <Globe className="w-3.5 h-3.5" />
                                Check on VirusTotal
                                <ExternalLink className="w-3 h-3 ml-auto" />
                              </a>
                            </>
                          ) : (
                            <span className="text-[11px] text-white/25">Unable to compute file hash</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Network Connections */}
                  <div className="border-t border-white/[0.04] pt-2 mt-2">
                    <button
                      onClick={() => {
                        if (!connsExpanded && connections.length === 0) {
                          setConnsLoading(true);
                          invoke<ProcessConnection[]>("get_process_connections", { pid: details.pid })
                            .then(setConnections)
                            .catch(() => setConnections([]))
                            .finally(() => setConnsLoading(false));
                        }
                        setConnsExpanded(!connsExpanded);
                      }}
                      className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors w-full"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Network</span>
                      {connections.length > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#38bdf8]/10 text-[#38bdf8]/70 font-bold tabular-nums">
                          {connections.length}
                        </span>
                      )}
                      <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${connsExpanded ? "rotate-90" : ""}`} />
                    </button>
                    {connsExpanded && (
                      <div className="mt-2 space-y-1">
                        {connsLoading ? (
                          <div className="flex items-center gap-2 py-3 justify-center">
                            <RefreshCw className="w-3.5 h-3.5 text-accent animate-spin" />
                            <span className="text-[11px] text-white/30">Loading connections...</span>
                          </div>
                        ) : connections.length === 0 ? (
                          <span className="text-[11px] text-white/25">No active connections</span>
                        ) : (
                          <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                            {connections.map((conn, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 px-2 py-1.5 rounded text-[10px] hover:bg-white/[0.04] transition-colors"
                              >
                                <span className={`shrink-0 px-1 py-0.5 rounded text-[8px] font-bold uppercase ${
                                  conn.protocol === "TCP" ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning"
                                }`}>
                                  {conn.protocol}
                                </span>
                                <span className="font-mono text-white/50 truncate flex-1" title={conn.local_addr}>
                                  {conn.local_addr}
                                </span>
                                <span className="text-white/15">→</span>
                                <span className="font-mono text-white/40 truncate flex-1" title={conn.remote_addr}>
                                  {conn.remote_addr}
                                </span>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-semibold ${
                                  conn.state === "Established" ? "bg-success/10 text-success"
                                  : conn.state === "Listen" ? "bg-[#38bdf8]/10 text-[#38bdf8]"
                                  : conn.state === "TimeWait" ? "bg-warning/10 text-warning"
                                  : "bg-white/[0.04] text-white/30"
                                }`}>
                                  {conn.state}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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

      {/* Kill Process Tree Confirmation Modal */}
      {killTreeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel-strong w-[400px] p-6 flex flex-col gap-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-danger/15">
                <GitBranch className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white/90">End Process Tree</h3>
                <p className="text-[12px] text-white/50">Kill process and all child processes</p>
              </div>
            </div>

            <p className="text-[13px] text-white/70 leading-relaxed">
              This will terminate{" "}
              <span className="font-semibold text-white/90">{killTreeTarget.name}</span>{" "}
              <span className="text-white/40 font-mono">(PID {killTreeTarget.pid})</span>{" "}
              and <span className="font-semibold text-warning">all of its child processes</span>.
            </p>
            {childCount.get(killTreeTarget.pid) && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                <span className="text-[11px] text-warning/80">
                  {childCount.get(killTreeTarget.pid)} child process{(childCount.get(killTreeTarget.pid) || 0) > 1 ? "es" : ""} will also be terminated
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setKillTreeTarget(null)}
                className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                           bg-white/[0.06] text-white/70 hover:bg-white/[0.1]
                           transition-colors duration-200 border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleKillTree}
                disabled={killing}
                className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                           bg-danger/90 text-white hover:bg-danger
                           disabled:opacity-50 transition-colors duration-200 flex items-center gap-1.5"
              >
                <GitBranch className="w-3.5 h-3.5" />
                {killing ? "Killing..." : "End Process Tree"}
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
          {/* Suspend / Resume */}
          {contextMenu.proc.status === "Stopped" || contextMenu.proc.status === "Suspended" ? (
            <button
              onClick={() => { handleResume(contextMenu.proc.pid); setContextMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-success/80
                         hover:bg-success/10 transition-colors"
            >
              <Play className="w-3.5 h-3.5" /> Resume Process
            </button>
          ) : (
            <button
              onClick={() => { handleSuspend(contextMenu.proc.pid); setContextMenu(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-warning/80
                         hover:bg-warning/10 transition-colors"
            >
              <Pause className="w-3.5 h-3.5" /> Suspend Process
            </button>
          )}
          <div className="h-px bg-white/[0.06] my-1" />
          <button
            onClick={() => { setKillTarget(contextMenu.proc); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-danger/80
                       hover:bg-danger/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Kill Process
          </button>
          <button
            onClick={() => { setKillTreeTarget(contextMenu.proc); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-danger/80
                       hover:bg-danger/10 transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" /> End Process Tree
          </button>
          <div className="h-px bg-white/[0.06] my-1" />
          {/* Efficiency Mode */}
          <button
            onClick={async () => {
              const proc = contextMenu.proc;
              setContextMenu(null);
              try {
                await invoke<string>("set_efficiency_mode", { pid: proc.pid, enabled: true });
                showToast(`Efficiency mode enabled for ${proc.name}`, "success");
                fetchProcesses();
              } catch (err: any) {
                const msg = typeof err === "string" ? err : err?.message || "Failed to set efficiency mode";
                showToast(msg, "error");
              }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#2ed573]/80
                       hover:bg-[#2ed573]/10 transition-colors"
          >
            <Leaf className="w-3.5 h-3.5" /> Efficiency Mode
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
