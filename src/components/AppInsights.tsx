import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Loader2, Inbox } from "lucide-react";
import type { AppInsightResult } from "../types";

export default function AppInsights() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AppInsightResult | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await invoke<AppInsightResult>("get_app_insights", { name: trimmed });
      setResult(data);
    } catch (err) {
      console.error("App insights error:", err);
      setResult({ processes: [], event_logs: [], exe_path: null });
    } finally {
      setLoading(false);
    }
  };

  const levelBadge = (lvl: string) => {
    const lower = lvl.toLowerCase();
    if (lower.includes("error") || lower.includes("critical"))
      return "bg-danger/15 text-danger";
    if (lower.includes("warning"))
      return "bg-warning/15 text-warning";
    return "bg-white/10 text-white/50";
  };

  return (
    <div className="flex flex-col gap-5 h-full animate-fade-in">
      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="insights-search"
            type="text"
            placeholder="Enter application or service name (e.g. svchost, chrome)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="glass-input w-full h-10 pl-9 pr-3 text-[13px]"
          />
        </div>
        <button
          id="insights-search-btn"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 h-10 px-5 rounded-lg text-[13px] font-medium
                     bg-accent/90 text-black hover:bg-accent disabled:opacity-40
                     transition-all duration-200"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Search
        </button>
      </div>

      {/* Results */}
      {!searched ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-accent/10 text-accent/60">
            <Search className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white/70 mb-1">
              Search for Application Insights
            </h3>
            <p className="text-[13px] text-white/35 max-w-md leading-relaxed">
              Enter an application or service name to find correlated processes
              and related event log entries. This helps diagnose issues by connecting
              runtime data with system events.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : (
        /* Results Panels */
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {/* Left: Processes */}
          <div className="glass-panel flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
              <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Matching Processes
              </span>
              <span className="text-[11px] text-white/25 font-mono">
                {result?.processes.length || 0}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!result || result.processes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-white/25">
                  <Inbox className="w-6 h-6" />
                  <span className="text-[12px]">No matching processes</span>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#0e0e1a]/90 backdrop-blur-sm">
                    <tr className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                      <th className="text-left px-3 py-2">PID</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-right px-3 py-2">CPU%</th>
                      <th className="text-right px-3 py-2">Mem MB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.processes.map((p) => (
                      <tr
                        key={p.pid}
                        className="text-[12.5px] border-b border-white/[0.03] hover:bg-white/[0.04]
                                   transition-colors"
                      >
                        <td className="px-3 py-2 text-white/50 font-mono">{p.pid}</td>
                        <td className="px-3 py-2 text-white/80 truncate max-w-[200px]">{p.name}</td>
                        <td className="px-3 py-2 text-right text-white/60 font-mono tabular-nums">
                          {p.cpu_usage.toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-right text-white/60 font-mono tabular-nums">
                          {p.memory_mb.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right: Event Logs */}
          <div className="glass-panel flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
              <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Related Event Logs
              </span>
              <span className="text-[11px] text-white/25 font-mono">
                {result?.event_logs.length || 0}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!result || result.event_logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-white/25">
                  <Inbox className="w-6 h-6" />
                  <span className="text-[12px]">No related events</span>
                </div>
              ) : (
                <div className="flex flex-col">
                  {result.event_logs.map((log, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-1 px-4 py-2.5 border-b border-white/[0.03]
                                 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold ${levelBadge(log.level)}`}>
                          {log.level}
                        </span>
                        <span className="text-[11px] text-white/35 font-mono">{log.time_created}</span>
                        <span className="text-[11px] text-white/25">·</span>
                        <span className="text-[11px] text-white/40">{log.source}</span>
                      </div>
                      <p className="text-[12px] text-white/65 leading-relaxed line-clamp-2">
                        {log.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
