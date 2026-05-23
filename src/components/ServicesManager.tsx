import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";
import type { ServiceInfo } from "../types";

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
  }, [fetchServices]);

  const handleAction = async (service: ServiceInfo, action: "start" | "stop") => {
    setActionLoading(service.name);
    try {
      const cmd = action === "start" ? "start_service" : "stop_service";
      const result = await invoke<string>(cmd, { name: service.name });
      addToast("success", result);
      await fetchServices();
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

      {/* Table */}
      <div className="glass-panel flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0
                        text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          <span className="w-[200px]">Name</span>
          <span className="flex-1">Display Name</span>
          <span className="w-[100px]">Status</span>
          <span className="w-[120px]">Startup</span>
          <span className="w-[90px] text-right">Actions</span>
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
              return (
                <div
                  key={svc.name}
                  className={`flex items-center px-4 h-[40px] text-[13px]
                             transition-colors duration-150 border-b border-white/[0.03]
                             hover:bg-white/[0.04]
                             ${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}`}
                >
                  <span className="w-[200px] text-white/60 truncate font-mono text-[12px]">
                    {svc.name}
                  </span>
                  <span className="flex-1 text-white/85 truncate pr-2">{svc.display_name}</span>
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
                  <div className="w-[90px] flex justify-end">
                    {isRunning ? (
                      <button
                        id={`stop-${svc.name}`}
                        onClick={() => handleAction(svc, "stop")}
                        disabled={isActioning}
                        className="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-medium
                                   bg-danger/10 text-danger/80 hover:bg-danger/20 hover:text-danger
                                   disabled:opacity-40 transition-all duration-200 border border-danger/20"
                        title="Stop service"
                      >
                        {isActioning ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Square className="w-3 h-3" />
                        )}
                        Stop
                      </button>
                    ) : (
                      <button
                        id={`start-${svc.name}`}
                        onClick={() => handleAction(svc, "start")}
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
