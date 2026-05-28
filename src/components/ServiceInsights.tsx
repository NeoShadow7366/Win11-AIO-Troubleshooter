import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./ToastProvider";
import { open } from "@tauri-apps/plugin-shell";
import {
  Search,
  Loader2,
  Star,
  ExternalLink,
  X,
  Info,
  FileText,
  ChevronRight,
  Cog,
  Activity,
  Hash,
  Inbox,
} from "lucide-react";
import type { ServiceInfo, ServiceInsightResult, FavoriteItem, EventLogEntry } from "../types";

export default function ServiceInsights() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { showToast } = useToast();

  // Detail panel state
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [insightData, setInsightData] = useState<ServiceInsightResult | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [eventLogs, setEventLogs] = useState<EventLogEntry[]>([]);
  const [eventLogsLoading, setEventLogsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [svcs, favs] = await Promise.all([
        invoke<ServiceInfo[]>("get_services"),
        invoke<FavoriteItem[]>("get_favorites"),
      ]);
      setServices(svcs);
      setFavorites(favs.filter((f) => f.item_type === "service"));
    } catch (err) {
      showToast("Failed to load services", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isFavorite = (name: string) => favorites.some((f) => f.name === name);

  const handleToggleFavorite = async (svc: ServiceInfo) => {
    try {
      if (isFavorite(svc.name)) {
        await invoke("remove_favorite", { itemType: "service", name: svc.name });
      } else {
        await invoke("add_favorite", {
          itemType: "service",
          name: svc.name,
          displayName: svc.display_name,
          path: null,
        });
      }
      const favs = await invoke<FavoriteItem[]>("get_favorites");
      setFavorites(favs.filter((f) => f.item_type === "service"));
    } catch (err) {
      showToast("Failed to update favorite", "error");
    }
  };

  const handleSelect = async (serviceName: string) => {
    if (selectedService === serviceName) {
      setSelectedService(null);
      setInsightData(null);
      setEventLogs([]);
      return;
    }
    setSelectedService(serviceName);
    setInsightLoading(true);
    setInsightData(null);
    setEventLogs([]);

    try {
      const data = await invoke<ServiceInsightResult>("get_service_insights", { serviceId: serviceName });
      setInsightData(data);
    } catch (err) {
      showToast("Failed to load service details", "error");
    } finally {
      setInsightLoading(false);
    }

    // Fetch related event logs
    setEventLogsLoading(true);
    try {
      const logs = await invoke<EventLogEntry[]>("get_event_logs", {
        logName: "System",
        level: "All",
        limit: 50,
      });
      // Filter by service name
      const filtered = logs.filter(
        (l) => l.source.toLowerCase().includes(serviceName.toLowerCase())
      );
      setEventLogs(filtered.slice(0, 20));
    } catch {
      setEventLogs([]);
    } finally {
      setEventLogsLoading(false);
    }
  };

  const handleWhatIsThis = async (svc: ServiceInfo) => {
    const parts = [svc.display_name || svc.name];
    if (insightData?.description) parts.push(insightData.description.substring(0, 80));
    const query = encodeURIComponent(`What is ${parts.join(" ")} Windows service`);
    try {
      await open(`https://www.google.com/search?q=${query}`);
    } catch (err) {
      showToast("Failed to open browser", "error");
    }
  };

  const selectedSvc = selectedService ? services.find((s) => s.name === selectedService) : null;

  // Favorited services first
  const favoritedServices = services.filter((s) => isFavorite(s.name));
  const allFiltered = services.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.display_name.toLowerCase().includes(search.toLowerCase())
  );

  const levelBadge = (lvl: string) => {
    const lower = lvl.toLowerCase();
    if (lower.includes("error") || lower.includes("critical")) return "bg-danger/15 text-danger";
    if (lower.includes("warning")) return "bg-warning/15 text-warning";
    return "bg-white/10 text-white/50";
  };

  return (
    <div className="flex flex-col gap-5 h-full animate-fade-in">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="svc-insights-search"
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-10 pl-9 pr-3 text-[13px]"
          />
        </div>
        <span className="text-[12px] text-white/30 font-mono">
          {allFiltered.length} services
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Service List */}
          <div className={`flex flex-col gap-4 overflow-y-auto transition-all duration-300 ${
            selectedService ? "flex-1 min-w-0" : "w-full"
          }`}>
            {/* Favorites Section */}
            {favoritedServices.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                  Favorited Services
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {favoritedServices.map((svc) => (
                    <ServiceCard
                      key={svc.name}
                      svc={svc}
                      isSelected={selectedService === svc.name}
                      isFav={true}
                      onSelect={() => handleSelect(svc.name)}
                      onToggleFav={() => handleToggleFavorite(svc)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* All Services */}
            <section>
              <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
                All Services
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {allFiltered.map((svc) => (
                  <ServiceCard
                    key={svc.name}
                    svc={svc}
                    isSelected={selectedService === svc.name}
                    isFav={isFavorite(svc.name)}
                    onSelect={() => handleSelect(svc.name)}
                    onToggleFav={() => handleToggleFavorite(svc)}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* Detail Panel */}
          {selectedService && selectedSvc && (
            <div className="w-[380px] min-w-[380px] glass-panel-strong flex flex-col overflow-hidden animate-slide-in">
              {/* Header */}
              <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-semibold text-white/90">Service Details</span>
                </div>
                <button
                  onClick={() => { setSelectedService(null); setInsightData(null); setEventLogs([]); }}
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             text-white/30 hover:text-white/70 hover:bg-white/[0.06]
                             transition-all duration-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Identity */}
                <div className="mb-4">
                  <h3 className="text-[14px] font-semibold text-white/90 mb-1">{selectedSvc.display_name}</h3>
                  <span className="inline-block text-[11px] font-mono text-accent/70 bg-accent/10 px-2 py-0.5 rounded mb-3">
                    {selectedSvc.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleWhatIsThis(selectedSvc)}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                 bg-accent/10 text-accent/80 hover:bg-accent/20 hover:text-accent
                                 transition-all duration-200 border border-accent/20"
                    >
                      <ExternalLink className="w-3 h-3" />
                      What is this?
                    </button>
                    <button
                      onClick={() => handleToggleFavorite(selectedSvc)}
                      className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                 transition-all duration-200 border
                                 ${isFavorite(selectedSvc.name)
                                   ? "bg-warning/10 text-warning border-warning/20"
                                   : "bg-white/[0.04] text-white/50 border-white/10 hover:text-warning"
                                 }`}
                    >
                      <Star className={`w-3 h-3 ${isFavorite(selectedSvc.name) ? "fill-warning" : ""}`} />
                      {isFavorite(selectedSvc.name) ? "Favorited" : "Favorite"}
                    </button>
                  </div>
                </div>

                {/* Insight Data */}
                {insightLoading ? (
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex flex-col gap-1.5">
                        <div className="w-20 h-2.5 shimmer" />
                        <div className="w-full h-4 shimmer" />
                      </div>
                    ))}
                  </div>
                ) : insightData ? (
                  <div className="flex flex-col gap-4 mb-4">
                    {insightData.description && (
                      <InsightField icon={<FileText className="w-3.5 h-3.5" />} label="Description" value={insightData.description} multiline />
                    )}
                    {insightData.executable_path && (
                      <InsightField icon={<ChevronRight className="w-3.5 h-3.5" />} label="Executable Path" value={insightData.executable_path} mono />
                    )}
                    {insightData.start_mode && (
                      <InsightField icon={<Cog className="w-3.5 h-3.5" />} label="Start Mode" value={insightData.start_mode} />
                    )}
                    {insightData.state && (
                      <InsightField
                        icon={<Activity className="w-3.5 h-3.5" />}
                        label="State"
                        value={insightData.state}
                        badge={insightData.state.toLowerCase() === "running" ? "success" : insightData.state.toLowerCase() === "stopped" ? "danger" : "neutral"}
                      />
                    )}
                    {insightData.process_id != null && insightData.process_id > 0 && (
                      <InsightField icon={<Hash className="w-3.5 h-3.5" />} label="Process ID" value={String(insightData.process_id)} mono />
                    )}
                  </div>
                ) : null}

                {/* Event Logs */}
                <div className="mt-2">
                  <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                    Related Event Logs
                  </h4>
                  {eventLogsLoading ? (
                    <div className="flex flex-col gap-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-12 shimmer rounded-lg" />
                      ))}
                    </div>
                  ) : eventLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-white/25">
                      <Inbox className="w-5 h-5" />
                      <span className="text-[12px]">No related events</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {eventLogs.map((log, i) => (
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
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Service Card ─── */
function ServiceCard({
  svc,
  isSelected,
  isFav,
  onSelect,
  onToggleFav,
}: {
  svc: ServiceInfo;
  isSelected: boolean;
  isFav: boolean;
  onSelect: () => void;
  onToggleFav: () => void;
}) {
  const isRunning = svc.status.toLowerCase().includes("running");
  return (
    <div
      onClick={onSelect}
      className={`glass-panel p-3.5 cursor-pointer transition-all duration-300 group
                 ${isSelected ? "border-accent/30 bg-accent/[0.04]" : "hover:bg-white/[0.05]"}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold text-white/85 truncate">{svc.display_name}</span>
          <span className="text-[11px] text-white/35 font-mono truncate">{svc.name}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          className={`flex items-center justify-center w-6 h-6 rounded shrink-0 ml-2
                     transition-all duration-200
                     ${isFav ? "text-warning" : "text-white/15 hover:text-warning/60"}`}
        >
          <Star className={`w-3.5 h-3.5 ${isFav ? "fill-warning" : ""}`} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold
          ${isRunning ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
          {svc.status}
        </span>
        <span className="text-[10px] text-white/30">{svc.start_type}</span>
      </div>
    </div>
  );
}

/* ─── Insight Field ─── */
function InsightField({
  icon,
  label,
  value,
  mono,
  multiline,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
  badge?: "success" | "danger" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-white/35">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      {badge ? (
        <span
          className={`inline-flex items-center self-start h-5 px-2.5 rounded-full text-[11px] font-semibold
            ${badge === "success" ? "bg-success/15 text-success"
              : badge === "danger" ? "bg-danger/15 text-danger"
              : "bg-white/[0.06] text-white/60"}`}
        >
          {value}
        </span>
      ) : (
        <span
          className={`text-[12.5px] leading-relaxed break-all
            ${mono ? "font-mono text-[11.5px] text-accent/70 bg-white/[0.03] px-2.5 py-1.5 rounded-md border border-white/[0.05]" : "text-white/75"}
            ${multiline ? "whitespace-pre-wrap" : ""}
          `}
        >
          {value}
        </span>
      )}
    </div>
  );
}
