import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
} from "lucide-react";
import type { ProcessInfo } from "../types";

type SortKey = "pid" | "name" | "cpu_usage" | "memory_mb" | "status";
type SortDir = "asc" | "desc";

export default function ProcessManager() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpu_usage");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [killTarget, setKillTarget] = useState<ProcessInfo | null>(null);
  const [killing, setKilling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProcesses = useCallback(async () => {
    try {
      const data = await invoke<ProcessInfo[]>("get_processes");
      setProcesses(data);
    } catch (err) {
      console.error("Process fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchProcesses, 3000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchProcesses]);

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
    } catch (err) {
      console.error("Kill error:", err);
    } finally {
      setKilling(false);
      setKillTarget(null);
    }
  };

  const filtered = processes
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = typeof aVal === "string"
        ? (aVal as string).localeCompare(bVal as string)
        : (aVal as number) - (bVal as number);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-white/20" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-accent" />
      : <ArrowDown className="w-3 h-3 text-accent" />;
  };

  const columns: { key: SortKey; label: string; width: string; align?: string }[] = [
    { key: "pid",       label: "PID",         width: "w-[80px]" },
    { key: "name",      label: "Name",        width: "flex-1" },
    { key: "cpu_usage", label: "CPU %",       width: "w-[90px]",  align: "text-right" },
    { key: "memory_mb", label: "Memory (MB)", width: "w-[110px]", align: "text-right" },
    { key: "status",    label: "Status",      width: "w-[90px]" },
  ];

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

      {/* Table */}
      <div className="glass-panel flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
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
          <div className="w-[60px]" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-0">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center px-4 h-[38px] gap-4">
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
            filtered.map((proc, idx) => (
              <div
                key={proc.pid}
                className={`flex items-center px-4 h-[38px] text-[13px]
                           transition-colors duration-150 border-b border-white/[0.03]
                           hover:bg-white/[0.04]
                           ${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}`}
              >
                <span className="w-[80px] text-white/50 font-mono text-[12px] tabular-nums">
                  {proc.pid}
                </span>
                <span className="flex-1 text-white/85 truncate pr-2">{proc.name}</span>
                <span className={`w-[90px] text-right font-mono text-[12px] tabular-nums
                  ${proc.cpu_usage > 50 ? "text-danger" : proc.cpu_usage > 20 ? "text-warning" : "text-white/60"}`}>
                  {proc.cpu_usage.toFixed(1)}
                </span>
                <span className="w-[110px] text-right font-mono text-[12px] tabular-nums text-white/60">
                  {proc.memory_mb.toFixed(1)}
                </span>
                <span className="w-[90px]">
                  <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold
                    ${proc.status === "Running"
                      ? "bg-success/15 text-success"
                      : "bg-white/10 text-white/40"
                    }`}>
                    {proc.status}
                  </span>
                </span>
                <div className="w-[60px] flex justify-end">
                  <button
                    id={`kill-${proc.pid}`}
                    onClick={() => setKillTarget(proc)}
                    className="flex items-center justify-center w-7 h-7 rounded-md
                               text-white/20 hover:text-danger hover:bg-danger/10
                               transition-all duration-200"
                    title={`Kill ${proc.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
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
    </div>
  );
}
