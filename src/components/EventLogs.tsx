import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import type { EventLogEntry } from "../types";

type LogName = "System" | "Application";
type LevelFilter = "All" | "Error" | "Warning";

export default function EventLogs() {
  const [logs, setLogs] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logName, setLogName] = useState<LogName>("System");
  const [level, setLevel] = useState<LevelFilter>("All");
  const [limit, setLimit] = useState<number>(100);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setExpandedRow(null);
    try {
      const data = await invoke<EventLogEntry[]>("get_event_logs", {
        logName: logName,
        level: level,
        limit: limit,
      });
      setLogs(data);
    } catch (err) {
      console.error("Event log error:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [logName, level, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const levelBadge = (lvl: string) => {
    const lower = lvl.toLowerCase();
    if (lower.includes("error") || lower.includes("critical"))
      return "bg-danger/15 text-danger";
    if (lower.includes("warning"))
      return "bg-warning/15 text-warning";
    return "bg-white/10 text-white/50";
  };

  const tabItems: LogName[] = ["System", "Application"];
  const limitOptions = [50, 100, 200, 500];

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Log type tabs */}
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
          {tabItems.map((tab) => (
            <button
              key={tab}
              id={`log-tab-${tab.toLowerCase()}`}
              onClick={() => setLogName(tab)}
              className={`h-7 px-3.5 rounded-md text-[12px] font-medium transition-all duration-200
                ${logName === tab
                  ? "bg-white/[0.08] text-white/90"
                  : "text-white/40 hover:text-white/60"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Level filter */}
        <select
          id="log-level-filter"
          value={level}
          onChange={(e) => setLevel(e.target.value as LevelFilter)}
          className="glass-input h-8 px-3 text-[12px] cursor-pointer appearance-auto
                     bg-white/[0.04] border-white/10"
        >
          <option value="All" className="bg-[#1a1a2e]">All Levels</option>
          <option value="Error" className="bg-[#1a1a2e]">Error</option>
          <option value="Warning" className="bg-[#1a1a2e]">Warning</option>
        </select>

        {/* Limit */}
        <select
          id="log-limit"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="glass-input h-8 px-3 text-[12px] cursor-pointer appearance-auto
                     bg-white/[0.04] border-white/10"
        >
          {limitOptions.map((n) => (
            <option key={n} value={n} className="bg-[#1a1a2e]">
              {n} entries
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <span className="text-[12px] text-white/30 font-mono tabular-nums">
          {logs.length} entries
        </span>

        <button
          id="log-refresh"
          onClick={fetchLogs}
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
        <div className="flex items-center px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0
                        text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          <span className="w-[160px]">Time</span>
          <span className="w-[80px]">Level</span>
          <span className="w-[150px]">Source</span>
          <span className="w-[80px]">Event ID</span>
          <span className="flex-1">Message</span>
          <span className="w-[32px]" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center px-4 h-[40px] gap-3">
                <div className="w-[140px] h-3 shimmer" />
                <div className="w-[60px] h-5 shimmer rounded-full" />
                <div className="w-[130px] h-3 shimmer" />
                <div className="w-[60px] h-3 shimmer" />
                <div className="flex-1 h-3 shimmer" />
              </div>
            ))
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
              No event logs found
            </div>
          ) : (
            logs.map((log, idx) => {
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
                    <span className="w-[150px] text-white/60 truncate text-[12px]">
                      {log.source}
                    </span>
                    <span className="w-[80px] text-white/40 font-mono text-[12px] tabular-nums">
                      {log.event_id}
                    </span>
                    <span className="flex-1 text-white/70 truncate pr-2 text-[12.5px]">
                      {log.message}
                    </span>
                    <span className="w-[32px] flex justify-center text-white/25">
                      {expanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </div>

                  {/* Expanded message */}
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
      </div>
    </div>
  );
}
