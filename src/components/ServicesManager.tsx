import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useAdmin } from "./Layout";
import {
  Search,
  Play,
  Square,
  RefreshCw,
  RotateCw,
  CheckCircle2,
  XCircle,
  X,
  ChevronRight,
  FileText,
  Info,
  Cog,
  Activity,
  Hash,
  Star,
  ExternalLink,
} from "lucide-react";
import type { ServiceInfo, ServiceInsightResult, FavoriteItem } from "../types";

type FilterTab = "all" | "running" | "stopped";

/* ─── Toast ─── */
interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

let toastId = 0;

export default function ServicesManager() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  /* ─── Service Insight state ─── */
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [insightData, setInsightData] = useState<ServiceInsightResult | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  /* ─── Favorites state ─── */
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  const fetchFavorites = useCallback(async () => {
    try {
      const favs = await invoke<FavoriteItem[]>("get_favorites");
      setFavorites(favs.filter((f) => f.item_type === "service"));
    } catch (err) {
      console.error("Favorites fetch error:", err);
    }
  }, []);

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
      await fetchFavorites();
    } catch (err) {
      console.error("Favorite toggle error:", err);
    }
  };

  const handleWhatIsThis = async () => {
    if (!selectedSvc) return;
    const parts = [selectedSvc.display_name || selectedSvc.name];
    if (insightData?.description) parts.push(insightData.description.substring(0, 80));
    const query = encodeURIComponent(`What is ${parts.join(" ")} Windows service`);
    try {
      await open(`https://www.google.com/search?q=${query}`);
    } catch (err) {
      console.error("Open URL error:", err);
    }
  };

  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timerRefs.current.delete(id);
    }, 4000);
    timerRefs.current.set(id, timer);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timerRefs.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timerRefs.current.delete(id);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const data = await invoke<ServiceInfo[]>("get_services");
      setServices(data);
    } catch (err) {
      console.error("Service fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    fetchFavorites();
  }, [fetchServices, fetchFavorites]);

  /* ─── Fetch insight when service is selected ─── */
  const fetchInsight = useCallback(async (serviceName: string) => {
    setInsightLoading(true);
    setInsightError(null);
    setInsightData(null);
    try {
      const data = await invoke<ServiceInsightResult>("get_service_insights", {
        serviceId: serviceName,
      });
      setInsightData(data);
    } catch (err) {
      setInsightError(String(err));
    } finally {
      setInsightLoading(false);
    }
  }, []);

  const handleRowClick = (svc: ServiceInfo) => {
    if (selectedService === svc.name) {
      // Toggle off
      setSelectedService(null);
      setInsightData(null);
      setInsightError(null);
    } else {
      setSelectedService(svc.name);
      fetchInsight(svc.name);
    }
  };

  const { isAdmin, promptAdmin } = useAdmin();

  const handleAction = async (service: ServiceInfo, action: "start" | "stop" | "restart") => {
    if (!isAdmin) {
      promptAdmin();
      return;
    }
    setActionLoading(service.name);
    try {
      const cmd = action === "start" ? "start_service" : action === "stop" ? "stop_service" : "restart_service";
      const result = await invoke<string>(cmd, { name: service.name });
      addToast("success", result);
      await fetchServices();
      // Refresh insight if the actioned service is currently selected
      if (selectedService === service.name) {
        fetchInsight(service.name);
      }
    } catch (err) {
      addToast("error", `Failed to ${action} ${service.display_name}: ${err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = services
    .filter((s) => {
      if (filter === "running") return s.status.toLowerCase().includes("running");
      if (filter === "stopped") return s.status.toLowerCase().includes("stopped");
      return true;
    })
    .filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.display_name.toLowerCase().includes(search.toLowerCase())
    );

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",     label: "All",     count: services.length },
    { key: "running", label: "Running", count: services.filter((s) => s.status.toLowerCase().includes("running")).length },
    { key: "stopped", label: "Stopped", count: services.filter((s) => s.status.toLowerCase().includes("stopped")).length },
  ];

  /* ─── Selected service object ─── */
  const selectedSvc = selectedService ? services.find((s) => s.name === selectedService) : null;

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="service-search"
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-9 pl-9 pr-3 text-[13px]"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              id={`service-filter-${tab.key}`}
              onClick={() => setFilter(tab.key)}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all duration-200
                ${filter === tab.key
                  ? "bg-white/[0.08] text-white/90"
                  : "text-white/40 hover:text-white/60"
                }`}
            >
              {tab.label}
              <span className="ml-1.5 text-[10px] text-white/30 font-mono">{tab.count}</span>
            </button>
          ))}
        </div>

        <button
          id="service-refresh"
          onClick={fetchServices}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     bg-white/[0.04] border border-white/10 text-white/50
                     hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Main content area: table + insight panel */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Table */}
        <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
          selectedService ? "flex-1 min-w-0" : "w-full"
        }`}>
          {/* Header */}
          <div className="flex items-center px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0
                          text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            <span className="w-[200px]">Name</span>
            <span className="flex-1">Display Name</span>
            <span className="w-[90px]">Status</span>
            <span className="w-[120px]">Startup</span>
            <span className="w-[130px] text-right">Actions</span>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center px-4 h-[40px] gap-3">
                  <div className="w-[180px] h-3 shimmer" />
                  <div className="flex-1 h-3 shimmer" />
                  <div className="w-[80px] h-5 shimmer rounded-full" />
                  <div className="w-[100px] h-3 shimmer" />
                  <div className="w-[60px] h-7 shimmer rounded-md" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
                No services found
              </div>
            ) : (
              filtered.map((svc, idx) => {
                const isRunning = svc.status.toLowerCase().includes("running");
                const isActioning = actionLoading === svc.name;
                const isSelected = selectedService === svc.name;
                return (
                  <div
                    key={svc.name}
                    id={`service-row-${svc.name}`}
                    onClick={() => handleRowClick(svc)}
                    className={`flex items-center px-4 h-[40px] text-[13px] cursor-pointer
                               transition-all duration-200 border-b border-white/[0.03]
                               ${isSelected
                                 ? "bg-accent/[0.08] border-l-2 border-l-accent"
                                 : idx % 2 === 0
                                   ? "bg-transparent hover:bg-white/[0.04]"
                                   : "bg-white/[0.015] hover:bg-white/[0.04]"
                               }`}
                  >
                    <span className="w-[200px] text-white/60 truncate font-mono text-[12px]">
                      {svc.name}
                    </span>
                    <span className="flex-1 text-white/85 truncate pr-2 flex items-center gap-1.5">
                      {isFavorite(svc.name) && <Star className="w-3 h-3 text-warning fill-warning shrink-0" />}
                      {svc.display_name}
                    </span>
                    <span className="w-[100px]">
                      <span
                        className={`inline-flex items-center h-5 px-2.5 rounded-full text-[10px] font-semibold
                          ${isRunning
                            ? "bg-success/15 text-success"
                            : "bg-danger/15 text-danger"
                          }`}
                      >
                        {svc.status}
                      </span>
                    </span>
                    <span className="w-[120px] text-white/40 text-[12px] truncate">
                      {svc.start_type}
                    </span>
                    <div className="w-[130px] flex justify-end gap-1">
                      {isRunning ? (
                        <>
                          <button
                            id={`restart-${svc.name}`}
                            onClick={(e) => { e.stopPropagation(); handleAction(svc, "restart"); }}
                            disabled={isActioning}
                            className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium
                                       bg-accent/10 text-accent/80 hover:bg-accent/20 hover:text-accent
                                       disabled:opacity-40 transition-all duration-200 border border-accent/20"
                            title="Restart service"
                          >
                            {isActioning ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCw className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            id={`stop-${svc.name}`}
                            onClick={(e) => { e.stopPropagation(); handleAction(svc, "stop"); }}
                            disabled={isActioning}
                            className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium
                                       bg-danger/10 text-danger/80 hover:bg-danger/20 hover:text-danger
                                       disabled:opacity-40 transition-all duration-200 border border-danger/20"
                            title="Stop service"
                          >
                            {isActioning ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Square className="w-3 h-3" />
                            )}
                          </button>
                        </>
                      ) : (
                        <button
                          id={`start-${svc.name}`}
                          onClick={(e) => { e.stopPropagation(); handleAction(svc, "start"); }}
                          disabled={isActioning}
                          className="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium
                                     bg-success/10 text-success/80 hover:bg-success/20 hover:text-success
                                     disabled:opacity-40 transition-all duration-200 border border-success/20"
                          title="Start service"
                        >
                          {isActioning ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          Start
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ─── Service Insight Panel ─── */}
        {selectedService && (
          <div
            id="service-insight-panel"
            className="w-[340px] min-w-[340px] glass-panel-strong flex flex-col overflow-hidden animate-slide-in"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-accent" />
                <span className="text-[13px] font-semibold text-white/90">Service Insight</span>
              </div>
              <button
                id="close-insight-panel"
                onClick={() => {
                  setSelectedService(null);
                  setInsightData(null);
                  setInsightError(null);
                }}
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
              {/* Service Identity */}
              {selectedSvc && (
                <div className="mb-4">
                  <h3 className="text-[14px] font-semibold text-white/90 mb-1 leading-tight">
                    {selectedSvc.display_name}
                  </h3>
                  <span className="inline-block text-[11px] font-mono text-accent/70 bg-accent/10 px-2 py-0.5 rounded mb-3">
                    {selectedSvc.name}
                  </span>
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
                      onClick={() => handleToggleFavorite(selectedSvc)}
                      className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-medium
                                 transition-all duration-200 border
                                 ${isFavorite(selectedSvc.name)
                                   ? "bg-warning/10 text-warning border-warning/20"
                                   : "bg-white/[0.04] text-white/50 border-white/10 hover:text-warning hover:border-warning/20"
                                 }`}
                    >
                      <Star className={`w-3 h-3 ${isFavorite(selectedSvc.name) ? "fill-warning" : ""}`} />
                      {isFavorite(selectedSvc.name) ? "Favorited" : "Favorite"}
                    </button>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {insightLoading && (
                <div className="flex flex-col gap-3 mt-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="w-20 h-2.5 shimmer" />
                      <div className="w-full h-4 shimmer" />
                    </div>
                  ))}
                </div>
              )}

              {/* Error State */}
              {insightError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 mt-2">
                  <XCircle className="w-4 h-4 text-danger shrink-0" />
                  <span className="text-[12px] text-danger/80">{insightError}</span>
                </div>
              )}

              {/* Insight Data */}
              {insightData && !insightLoading && (
                <div className="flex flex-col gap-4 mt-1">
                  {/* Description */}
                  {insightData.description && (
                    <InsightField
                      icon={<FileText className="w-3.5 h-3.5" />}
                      label="Description"
                      value={insightData.description}
                      multiline
                    />
                  )}

                  {/* Executable Path */}
                  {insightData.executable_path && (
                    <InsightField
                      icon={<ChevronRight className="w-3.5 h-3.5" />}
                      label="Executable Path"
                      value={insightData.executable_path}
                      mono
                    />
                  )}

                  {/* Start Mode */}
                  {insightData.start_mode && (
                    <InsightField
                      icon={<Cog className="w-3.5 h-3.5" />}
                      label="Start Mode"
                      value={insightData.start_mode}
                    />
                  )}

                  {/* State */}
                  {insightData.state && (
                    <InsightField
                      icon={<Activity className="w-3.5 h-3.5" />}
                      label="State"
                      value={insightData.state}
                      badge={
                        insightData.state.toLowerCase() === "running"
                          ? "success"
                          : insightData.state.toLowerCase() === "stopped"
                            ? "danger"
                            : "neutral"
                      }
                    />
                  )}

                  {/* Process ID */}
                  {insightData.process_id != null && insightData.process_id > 0 && (
                    <InsightField
                      icon={<Hash className="w-3.5 h-3.5" />}
                      label="Process ID"
                      value={String(insightData.process_id)}
                      mono
                    />
                  )}

                  {/* No data placeholder */}
                  {!insightData.description &&
                    !insightData.executable_path &&
                    !insightData.start_mode &&
                    !insightData.state &&
                    insightData.process_id == null && (
                      <div className="text-center text-[12px] text-white/30 py-6">
                        No insight data available for this service.
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[100] pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto toast-enter flex items-center gap-3
                       glass-panel-strong px-4 py-3 min-w-[280px] max-w-[400px]
                       ${toast.type === "success" ? "border-success/30" : "border-danger/30"}`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-danger shrink-0" />
            )}
            <span className="text-[12.5px] text-white/80 flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/30 hover:text-white/60 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Insight Field Component ─── */
interface InsightFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
  badge?: "success" | "danger" | "neutral";
}

function InsightField({ icon, label, value, mono, multiline, badge }: InsightFieldProps) {
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
