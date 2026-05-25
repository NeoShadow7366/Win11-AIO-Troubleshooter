import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Loader2, Inbox, FolderOpen, Star, X, ExternalLink } from "lucide-react";
import type { AppInsightResult, FavoriteItem } from "../types";

const openPath = async (path: string) => {
  try {
    await invoke("open_path_in_explorer", { path });
  } catch (err) {
    console.error("Open path error:", err);
  }
};

export default function AppInsights() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AppInsightResult | null>(null);
  const [searched, setSearched] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  // Info panel
  const [selectedFav, setSelectedFav] = useState<FavoriteItem | null>(null);
  const [favResult, setFavResult] = useState<AppInsightResult | null>(null);
  const [favLoading, setFavLoading] = useState(false);

  const fetchFavorites = useCallback(async () => {
    try {
      const favs = await invoke<FavoriteItem[]>("get_favorites");
      setFavorites(favs.filter((f) => f.item_type === "process"));
    } catch (err) {
      console.error("Favorites fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setSearched(true);
    setSelectedFav(null);
    setFavResult(null);
    try {
      const data = await invoke<AppInsightResult>("get_app_insights", { name: trimmed });
      setResult(data);
    } catch (err) {
      console.error("App insights error:", err);
      setResult({ processes: [], event_logs: [], exe_path: null, install_directory: null, appdata_directory: null });
    } finally {
      setLoading(false);
    }
  };

  const handleFavSelect = async (fav: FavoriteItem) => {
    if (selectedFav?.name === fav.name) {
      setSelectedFav(null);
      setFavResult(null);
      return;
    }
    setSelectedFav(fav);
    setFavLoading(true);
    setFavResult(null);
    try {
      const data = await invoke<AppInsightResult>("get_app_insights", { name: fav.name });
      setFavResult(data);
    } catch (err) {
      console.error("Fav insight error:", err);
    } finally {
      setFavLoading(false);
    }
  };

  const removeFavorite = async (name: string) => {
    try {
      await invoke("remove_favorite", { itemType: "process", name });
      await fetchFavorites();
      if (selectedFav?.name === name) {
        setSelectedFav(null);
        setFavResult(null);
      }
    } catch (err) {
      console.error("Remove favorite error:", err);
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

  // Show either search result or favorite insight result
  const activeResult = selectedFav ? favResult : result;
  const activeLoading = selectedFav ? favLoading : loading;

  return (
    <div className="flex flex-col gap-5 h-full animate-fade-in">
      {/* Favorited Processes Section */}
      {favorites.length > 0 && (
        <section>
          <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-warning fill-warning" />
            Favorited Processes
          </h2>
          <div className="flex flex-wrap gap-2">
            {favorites.map((fav) => (
              <button
                key={fav.name}
                onClick={() => handleFavSelect(fav)}
                className={`flex items-center gap-2 h-9 px-3.5 rounded-lg text-[12.5px] font-medium
                           transition-all duration-200 border group
                           ${selectedFav?.name === fav.name
                             ? "border-accent/30 bg-accent/10 text-accent"
                             : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                           }`}
              >
                <Star className="w-3 h-3 text-warning fill-warning shrink-0" />
                {fav.display_name || fav.name}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFavorite(fav.name); }}
                  className="w-4 h-4 flex items-center justify-center rounded text-white/20
                             hover:text-danger hover:bg-danger/10 transition-all ml-1 opacity-0
                             group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>
        </section>
      )}

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
      {!searched && !selectedFav ? (
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
              {favorites.length > 0 && " Or click a favorited process above."}
            </p>
          </div>
        </div>
      ) : activeLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : (
        /* Results Panels */
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
          {/* Directory Info Bar */}
          {(activeResult?.exe_path || activeResult?.install_directory || activeResult?.appdata_directory) && (
            <div className="glass-panel p-3 flex flex-wrap gap-x-6 gap-y-2 shrink-0">
              {activeResult.exe_path && (
                <button
                  onClick={() => openPath(activeResult.exe_path!)}
                  className="flex items-center gap-2 min-w-0 group/path cursor-pointer hover:bg-white/[0.04] rounded-lg px-2 py-1.5 -mx-2 transition-all duration-200"
                  title="Open in File Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-accent/60 shrink-0 group-hover/path:text-accent" />
                  <span className="text-[10px] text-white/30 uppercase font-semibold shrink-0">Exe Path</span>
                  <span className="text-[11.5px] text-white/60 font-mono truncate group-hover/path:text-white/80">{activeResult.exe_path}</span>
                  <ExternalLink className="w-3 h-3 text-white/0 group-hover/path:text-white/40 shrink-0 transition-colors" />
                </button>
              )}
              {activeResult.install_directory && (
                <button
                  onClick={() => openPath(activeResult.install_directory!)}
                  className="flex items-center gap-2 min-w-0 group/path cursor-pointer hover:bg-white/[0.04] rounded-lg px-2 py-1.5 -mx-2 transition-all duration-200"
                  title="Open in File Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-success/60 shrink-0 group-hover/path:text-success" />
                  <span className="text-[10px] text-white/30 uppercase font-semibold shrink-0">Install Dir</span>
                  <span className="text-[11.5px] text-white/60 font-mono truncate group-hover/path:text-white/80">{activeResult.install_directory}</span>
                  <ExternalLink className="w-3 h-3 text-white/0 group-hover/path:text-white/40 shrink-0 transition-colors" />
                </button>
              )}
              {activeResult.appdata_directory && (
                <button
                  onClick={() => openPath(activeResult.appdata_directory!)}
                  className="flex items-center gap-2 min-w-0 group/path cursor-pointer hover:bg-white/[0.04] rounded-lg px-2 py-1.5 -mx-2 transition-all duration-200"
                  title="Open in File Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-warning/60 shrink-0 group-hover/path:text-warning" />
                  <span className="text-[10px] text-white/30 uppercase font-semibold shrink-0">AppData</span>
                  <span className="text-[11.5px] text-white/60 font-mono truncate group-hover/path:text-white/80">{activeResult.appdata_directory}</span>
                  <ExternalLink className="w-3 h-3 text-white/0 group-hover/path:text-white/40 shrink-0 transition-colors" />
                </button>
              )}
            </div>
          )}
          <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {/* Left: Processes */}
          <div className="glass-panel flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
              <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                Matching Processes
              </span>
              <span className="text-[11px] text-white/25 font-mono">
                {activeResult?.processes.length || 0}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!activeResult || activeResult.processes.length === 0 ? (
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
                    {activeResult.processes.map((p) => (
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
                {activeResult?.event_logs.length || 0}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!activeResult || activeResult.event_logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-white/25">
                  <Inbox className="w-6 h-6" />
                  <span className="text-[12px]">No related events</span>
                </div>
              ) : (
                <div className="flex flex-col">
                  {activeResult.event_logs.map((log, i) => (
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
        </div>
      )}
    </div>
  );
}
