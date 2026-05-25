import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  Filter,
  Clock,
  FileText,
} from "lucide-react";
import type { CrashLogResult } from "../types";

type LevelFilter = "All" | "Critical" | "Error" | "Warning";
type DatePreset = "today" | "7days" | "30days" | "custom";

function getPresetDates(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm
  const startDate = new Date(now);

  switch (preset) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      break;
    case "7days":
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "30days":
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      return { start: "", end: "" };
  }

  const start = startDate.toISOString().slice(0, 16);
  return { start, end };
}

export default function EventViewer() {
  const [result, setResult] = useState<CrashLogResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Preset
  const [activePreset, setActivePreset] = useState<DatePreset | null>("7days");

  // Filters
  const [startDate, setStartDate] = useState(() => getPresetDates("7days").start);
  const [endDate, setEndDate] = useState(() => getPresetDates("7days").end);
  const [sourceFilter, setSourceFilter] = useState("");
  const [level, setLevel] = useState<LevelFilter>("All");

  // Log source toggles
  const [showSystem, setShowSystem] = useState(true);
  const [showApplication, setShowApplication] = useState(true);
  const [showSecurity, setShowSecurity] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Expanded row
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const fetchLogs = useCallback(
    async (
      targetPage = 0,
      overrideStart?: string,
      overrideEnd?: string,
      overrideSources?: { system: boolean; application: boolean; security: boolean },
      overrideLevel?: LevelFilter,
      overrideSourceFilter?: string,
      overridePageSize?: number,
    ) => {
      setLoading(true);
      setSearched(true);
      setExpandedRow(null);

      const sources = overrideSources ?? { system: showSystem, application: showApplication, security: showSecurity };
      const logSources: string[] = [];
      if (sources.system) logSources.push("System");
      if (sources.application) logSources.push("Application");
      if (sources.security) logSources.push("Security");
      if (logSources.length === 0) logSources.push("System", "Application");

      const finalStart = overrideStart ?? startDate;
      const finalEnd = overrideEnd ?? endDate;
      const finalLevel = overrideLevel ?? level;
      const finalSourceFilter = overrideSourceFilter ?? sourceFilter;
      const finalPageSize = overridePageSize ?? pageSize;

      try {
        const data = await invoke<CrashLogResult>("get_crash_logs", {
          startDate: finalStart || null,
          endDate: finalEnd || null,
          sourceFilter: finalSourceFilter || null,
          level: finalLevel === "All" ? null : finalLevel,
          logSources,
          page: targetPage,
          pageSize: finalPageSize,
        });
        setResult(data);
        setPage(targetPage);
      } catch (err) {
        console.error("Event viewer error:", err);
        setResult({ entries: [], total_count: 0 });
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, sourceFilter, level, showSystem, showApplication, showSecurity, pageSize]
  );

  // Auto-load on mount
  useEffect(() => {
    const { start, end } = getPresetDates("7days");
    fetchLogs(0, start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreset = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset === "custom") return;

    const { start, end } = getPresetDates(preset);
    setStartDate(start);
    setEndDate(end);
    // Pass overrides since setState is async
    fetchLogs(0, start, end);
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total_count / pageSize)) : 0;

  const levelBadge = (lvl: string) => {
    const lower = lvl.toLowerCase();
    if (lower.includes("critical")) return "bg-danger/20 text-danger";
    if (lower.includes("error")) return "bg-danger/15 text-danger";
    if (lower.includes("warning")) return "bg-warning/15 text-warning";
    return "bg-white/10 text-white/50";
  };

  const pageSizeOptions = [25, 50, 100, 200];

  const presets: { key: DatePreset; label: string; icon: React.ReactNode }[] = [
    { key: "today", label: "Today", icon: <Clock className="w-3.5 h-3.5" /> },
    { key: "7days", label: "Last 7 Days", icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: "30days", label: "Last 30 Days", icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: "custom", label: "Custom Range", icon: <Filter className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Preset Buttons */}
      <div className="flex items-center gap-2">
        {presets.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => handlePreset(key)}
            className={`flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                       transition-all duration-200 border
                       ${activePreset === key
                         ? "border-accent/30 bg-accent/15 text-accent"
                         : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                       }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Range (visible when custom or always for clarity) */}
          {activePreset === "custom" && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-white/30" />
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-input h-8 px-3 text-[12px] w-[180px]"
              />
              <span className="text-[12px] text-white/25">to</span>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-input h-8 px-3 text-[12px] w-[180px]"
              />
            </div>
          )}

          {/* Source Filter */}
          <div className="relative flex-1 max-w-[200px]">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Filter by source..."
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="glass-input w-full h-8 pl-8 pr-3 text-[12px]"
            />
          </div>

          {/* Level */}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LevelFilter)}
            className="glass-input h-8 px-3 text-[12px] cursor-pointer appearance-auto bg-white/[0.04] border-white/10"
          >
            <option value="All" className="bg-[#1a1a2e]">All Levels</option>
            <option value="Critical" className="bg-[#1a1a2e]">Critical</option>
            <option value="Error" className="bg-[#1a1a2e]">Error</option>
            <option value="Warning" className="bg-[#1a1a2e]">Warning</option>
          </select>

          {/* Search Button */}
          <button
            onClick={() => fetchLogs(0)}
            disabled={loading}
            className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-medium
                       bg-accent/90 text-black hover:bg-accent disabled:opacity-40
                       transition-all duration-200"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Search
          </button>
        </div>

        {/* Log Source Toggles */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[11px] text-white/30 uppercase font-semibold tracking-wider">Sources:</span>
          {[
            { key: "system", label: "System", state: showSystem, setter: setShowSystem },
            { key: "application", label: "Application", state: showApplication, setter: setShowApplication },
            { key: "security", label: "Security", state: showSecurity, setter: setShowSecurity },
          ].map(({ key, label, state, setter }) => (
            <button
              key={key}
              onClick={() => setter(!state)}
              className={`flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium
                         transition-all duration-200 border
                         ${state
                           ? "border-accent/30 bg-accent/10 text-accent"
                           : "border-white/10 bg-white/[0.02] text-white/35 hover:text-white/60"
                         }`}
            >
              {label}
            </button>
          ))}

          {/* Active date range indicator */}
          {activePreset && activePreset !== "custom" && startDate && (
            <span className="text-[11px] text-white/25 ml-auto font-mono">
              {new Date(startDate).toLocaleDateString()} — {new Date(endDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {!searched ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10">
            <FileText className="w-8 h-8 text-accent/60" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white/70 mb-1">Event Viewer</h3>
            <p className="text-[13px] text-white/35 max-w-md leading-relaxed">
              Browse Windows event logs from System, Application, and Security sources.
              Click a preset above for quick results, or use Custom Range for precise filtering.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass-panel flex flex-col flex-1 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0
                          text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <span className="w-[160px]">Time</span>
            <span className="w-[80px]">Level</span>
            <span className="w-[180px]">Source</span>
            <span className="w-[80px]">Event ID</span>
            <span className="flex-1">Message</span>
            <span className="w-[32px]" />
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center px-4 h-[40px] gap-3">
                  <div className="w-[140px] h-3 shimmer" />
                  <div className="w-[60px] h-5 shimmer rounded-full" />
                  <div className="w-[160px] h-3 shimmer" />
                  <div className="w-[60px] h-3 shimmer" />
                  <div className="flex-1 h-3 shimmer" />
                </div>
              ))
            ) : !result || result.entries.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
                No events found matching your criteria
              </div>
            ) : (
              result.entries.map((log, idx) => {
                const expanded = expandedRow === idx;
                return (
                  <div key={idx} className="border-b border-white/[0.03]">
                    <div
                      className={`flex items-center px-4 h-[40px] text-[13px]
                                 cursor-pointer transition-colors duration-150
                                 hover:bg-white/[0.04]
                                 ${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}
                                 ${expanded ? "bg-white/[0.04]" : ""}`}
                      onClick={() => setExpandedRow(expanded ? null : idx)}
                    >
                      <span className="w-[160px] text-white/50 text-[12px] font-mono tabular-nums truncate">
                        {log.time_created}
                      </span>
                      <span className="w-[80px]">
                        <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold ${levelBadge(log.level)}`}>
                          {log.level}
                        </span>
                      </span>
                      <span className="w-[180px] text-white/60 truncate text-[12px]">
                        {log.source}
                      </span>
                      <span className="w-[80px] text-white/40 font-mono text-[12px] tabular-nums">
                        {log.event_id}
                      </span>
                      <span className="flex-1 text-white/70 truncate pr-2 text-[12.5px]">
                        {log.message}
                      </span>
                      <span className="w-[32px] flex justify-center text-white/25">
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </span>
                    </div>

                    {expanded && (
                      <div className="px-6 py-3 bg-white/[0.02] border-t border-white/[0.04] animate-fade-in">
                        <p className="text-[12.5px] text-white/70 leading-relaxed whitespace-pre-wrap font-mono break-all">
                          {log.message}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          {result && result.total_count > 0 && (
            <div className="flex items-center justify-between px-4 h-11 border-t border-white/[0.06] bg-white/[0.02] shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-white/40">
                  {result.total_count} total entries
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    fetchLogs(0);
                  }}
                  className="glass-input h-7 px-2 text-[11px] cursor-pointer appearance-auto bg-white/[0.04] border-white/10"
                >
                  {pageSizeOptions.map((n) => (
                    <option key={n} value={n} className="bg-[#1a1a2e]">
                      {n} per page
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLogs(page - 1)}
                  disabled={page === 0 || loading}
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             bg-white/[0.04] border border-white/10 text-white/50
                             hover:bg-white/[0.07] disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[12px] text-white/50 font-mono tabular-nums">
                  {page + 1} / {totalPages || 1}
                </span>
                <button
                  onClick={() => fetchLogs(page + 1)}
                  disabled={page >= totalPages - 1 || loading}
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             bg-white/[0.04] border border-white/10 text-white/50
                             hover:bg-white/[0.07] disabled:opacity-30 transition-all"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
