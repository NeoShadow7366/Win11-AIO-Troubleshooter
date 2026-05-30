import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Search,
  ArrowUpDown,
  Cpu,
  MemoryStick,
  HardDrive,
  Hash,
  TrendingUp,
} from "lucide-react";
import { useToast } from "./ToastProvider";
import { usePageVisible } from "./Layout";
import type { AppHistoryEntry } from "../types";

/* ─── Helpers ─── */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type SortKey = "name" | "cpu_time_secs" | "memory_current_mb" | "memory_peak_mb" | "disk_read_bytes" | "disk_write_bytes" | "instance_count";
type SortDir = "asc" | "desc";

/* ─── Component ─── */
export default function AppHistory() {
  const [data, setData] = useState<AppHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpu_time_secs");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { showToast } = useToast();
  const isVisible = usePageVisible("apphistory");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<AppHistoryEntry[]>("get_app_history");
      setData(result);
    } catch {
      showToast("Failed to load app history", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!isVisible) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [isVisible, fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = data
    .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = typeof aVal === "string"
        ? (aVal as string).localeCompare(bVal as string)
        : (aVal as number) - (bVal as number);
      return sortDir === "asc" ? cmp : -cmp;
    });

  // Summary stats
  const totalCpu = data.reduce((s, e) => s + e.cpu_time_secs, 0);
  const totalMem = data.reduce((s, e) => s + e.memory_current_mb, 0);
  const totalDiskR = data.reduce((s, e) => s + e.disk_read_bytes, 0);
  const totalDiskW = data.reduce((s, e) => s + e.disk_write_bytes, 0);
  const totalApps = new Set(data.map((e) => e.name)).size;

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return <ArrowUpDown className={`w-3 h-3 ${sortDir === "asc" ? "rotate-180" : ""}`} />;
  };

  const columns: { key: SortKey; label: string; width: string; align?: string }[] = [
    { key: "name", label: "Application", width: "flex-1 min-w-[180px]" },
    { key: "instance_count", label: "Instances", width: "w-[80px]", align: "text-right" },
    { key: "cpu_time_secs", label: "CPU %", width: "w-[80px]", align: "text-right" },
    { key: "memory_current_mb", label: "Memory", width: "w-[90px]", align: "text-right" },
    { key: "memory_peak_mb", label: "Peak Mem", width: "w-[90px]", align: "text-right" },
    { key: "disk_read_bytes", label: "Disk Read", width: "w-[90px]", align: "text-right" },
    { key: "disk_write_bytes", label: "Disk Write", width: "w-[90px]", align: "text-right" },
  ];

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Header Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { icon: <Hash className="w-4 h-4" />, label: "Apps", value: totalApps.toString(), color: "text-accent" },
          { icon: <Cpu className="w-4 h-4" />, label: "Total CPU", value: `${totalCpu.toFixed(1)}%`, color: "text-[#38bdf8]" },
          { icon: <MemoryStick className="w-4 h-4" />, label: "Total Memory", value: `${totalMem.toFixed(0)} MB`, color: "text-[#a78bfa]" },
          { icon: <HardDrive className="w-4 h-4" />, label: "Disk Read", value: formatBytes(totalDiskR), color: "text-success" },
          { icon: <TrendingUp className="w-4 h-4" />, label: "Disk Write", value: formatBytes(totalDiskW), color: "text-warning" },
        ].map((stat) => (
          <div key={stat.label} className="glass-panel px-4 py-3 flex items-center gap-3">
            <div className={`${stat.color}/50`}>{stat.icon}</div>
            <div>
              <div className={`text-[15px] font-bold tabular-nums ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-white/30 uppercase tracking-wider">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-9 pl-9 pr-4 text-[13px]"
          />
        </div>

        <span className="text-[12px] text-white/40 font-mono tabular-nums ml-auto">
          {filtered.length} app{filtered.length !== 1 ? "s" : ""}
        </span>

        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     bg-white/[0.04] border border-white/10 text-white/50
                     hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200"
          title="Refresh"
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-0">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center px-4 h-[38px] gap-4">
                  <div className="flex-1 h-3 shimmer" />
                  <div className="w-[70px] h-3 shimmer" />
                  <div className="w-[80px] h-3 shimmer" />
                  <div className="w-[90px] h-3 shimmer" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
              No apps found
            </div>
          ) : (
            filtered.map((entry, idx) => (
              <div
                key={entry.name}
                className={`flex items-center px-4 h-[38px] text-[13px] transition-colors duration-100
                           border-b border-white/[0.03]
                           ${idx % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent"}
                           hover:bg-white/[0.04]`}
              >
                {columns.map((col) => (
                  <span key={col.key} className={`${col.width} ${col.align || ""} truncate`}>
                    {col.key === "name" ? (
                      <span className="text-white/70 font-medium">{entry.name}</span>
                    ) : col.key === "instance_count" ? (
                      <span className="font-mono text-[12px] tabular-nums text-white/40">
                        {entry.instance_count}
                      </span>
                    ) : col.key === "cpu_time_secs" ? (
                      <span className={`font-mono text-[12px] tabular-nums ${
                        entry.cpu_time_secs > 50 ? "text-danger" : entry.cpu_time_secs > 10 ? "text-warning" : "text-white/50"
                      }`}>
                        {entry.cpu_time_secs.toFixed(1)}
                      </span>
                    ) : col.key === "memory_current_mb" ? (
                      <span className="font-mono text-[12px] tabular-nums text-white/50">
                        {entry.memory_current_mb.toFixed(0)} MB
                      </span>
                    ) : col.key === "memory_peak_mb" ? (
                      <span className="font-mono text-[12px] tabular-nums text-white/30">
                        {entry.memory_peak_mb.toFixed(0)} MB
                      </span>
                    ) : col.key === "disk_read_bytes" ? (
                      <span className="font-mono text-[12px] tabular-nums text-success/60">
                        {formatBytes(entry.disk_read_bytes)}
                      </span>
                    ) : col.key === "disk_write_bytes" ? (
                      <span className="font-mono text-[12px] tabular-nums text-warning/60">
                        {formatBytes(entry.disk_write_bytes)}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
