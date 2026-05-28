import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  Cpu,
  Monitor,
  Wifi,
  Usb,
  X,
} from "lucide-react";
import type { DriverInfo } from "../types";
import { useToast } from "./ToastProvider";

/* ─── Device Class Icons ─── */
const CLASS_ICONS: Record<string, React.ReactNode> = {
  Display:    <Monitor className="w-4 h-4" />,
  Net:        <Wifi className="w-4 h-4" />,
  USB:        <Usb className="w-4 h-4" />,
  Processor:  <Cpu className="w-4 h-4" />,
  DiskDrive:  <HardDrive className="w-4 h-4" />,
};

function getClassIcon(cls: string): React.ReactNode {
  return CLASS_ICONS[cls] || <HardDrive className="w-4 h-4" />;
}

/* ─── Status Badge ─── */
function StatusBadge({ status, hasProblem }: { status: string; hasProblem: boolean }) {
  if (hasProblem) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                       bg-danger/10 text-danger border border-danger/20">
        <AlertTriangle className="w-3 h-3" /> Error
      </span>
    );
  }
  if (status === "OK") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                       bg-success/10 text-success border border-success/20">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md
                     bg-surface text-text-tertiary border border-border">
      {status}
    </span>
  );
}

/* ─── Component ─── */
export default function DriverManager() {
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedDriver, setSelectedDriver] = useState<DriverInfo | null>(null);
  const { showToast } = useToast();

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<DriverInfo[]>("get_drivers");
      setDrivers(data);
    } catch (err) {
      showToast(`Failed to load drivers: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  // Get unique device classes for filter
  const deviceClasses = useMemo(() => {
    const classes = new Set(drivers.map((d) => d.device_class).filter(Boolean));
    return Array.from(classes).sort();
  }, [drivers]);

  // Filter drivers
  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !d.name.toLowerCase().includes(q) &&
          !d.manufacturer.toLowerCase().includes(q) &&
          !d.device_class.toLowerCase().includes(q) &&
          !d.driver_version.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterClass !== "all" && d.device_class !== filterClass) return false;
      if (filterStatus === "problem" && !d.has_problem) return false;
      if (filterStatus === "ok" && d.has_problem) return false;
      return true;
    });
  }, [drivers, search, filterClass, filterStatus]);

  // Stats
  const problemCount = drivers.filter((d) => d.has_problem).length;
  const unsignedCount = drivers.filter((d) => !d.is_signed).length;

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search drivers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-9 pl-9 pr-3 text-[13px]"
          />
        </div>

        {/* Class filter */}
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="h-9 px-3 rounded-lg text-[12px] bg-surface border border-border
                     text-text-secondary cursor-pointer"
        >
          <option value="all">All Classes ({drivers.length})</option>
          {deviceClasses.map((cls) => (
            <option key={cls} value={cls}>
              {cls} ({drivers.filter((d) => d.device_class === cls).length})
            </option>
          ))}
        </select>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
          {(
            [
              { key: "all", label: "All" },
              { key: "problem", label: `Problems (${problemCount})` },
              { key: "ok", label: "OK" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all duration-200
                ${filterStatus === tab.key
                  ? "bg-accent/15 text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={fetchDrivers}
          disabled={loading}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     border border-border bg-surface text-text-tertiary
                     hover:bg-surface-hover disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary badges */}
      {!loading && drivers.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-tertiary">
            {filtered.length} of {drivers.length} drivers
          </span>
          {problemCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
              <AlertTriangle className="w-3 h-3" />
              {problemCount} with problems
            </span>
          )}
          {unsignedCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-warning">
              <ShieldAlert className="w-3 h-3" />
              {unsignedCount} unsigned
            </span>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Table */}
        <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
          selectedDriver ? "flex-1 min-w-0" : "w-full"
        }`}>
          {/* Header */}
          <div className="grid grid-cols-[1fr_150px_120px_100px_80px] gap-2 px-4 py-2.5 text-[11px]
                          font-semibold text-text-tertiary uppercase tracking-wider border-b border-border">
            <span>Device</span>
            <span>Manufacturer</span>
            <span>Version</span>
            <span>Class</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-text-tertiary">
              {search ? "No drivers match your search" : "No drivers found"}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {filtered.map((driver, i) => {
                const isSelected = selectedDriver?.name === driver.name &&
                  selectedDriver?.device_class === driver.device_class;
                return (
                  <button
                    key={`${driver.device_class}-${driver.name}-${i}`}
                    onClick={() => setSelectedDriver(isSelected ? null : driver)}
                    className={`w-full grid grid-cols-[1fr_150px_120px_100px_80px] gap-2 px-4 py-2.5
                               text-left text-[12.5px] border-b border-border
                               transition-all duration-150
                               ${isSelected
                                 ? "bg-accent/[0.06]"
                                 : "hover:bg-surface-hover"
                               }`}
                  >
                    <span className="truncate text-text-primary/85 font-medium flex items-center gap-2">
                      <span className="text-text-tertiary shrink-0">{getClassIcon(driver.device_class)}</span>
                      {driver.name || driver.device_name}
                    </span>
                    <span className="truncate text-text-secondary">{driver.manufacturer}</span>
                    <span className="truncate text-text-tertiary font-mono text-[11px]">
                      {driver.driver_version || "—"}
                    </span>
                    <span className="truncate text-text-tertiary">{driver.device_class}</span>
                    <span><StatusBadge status={driver.status} hasProblem={driver.has_problem} /></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedDriver && (
          <div className="w-[340px] shrink-0 glass-panel flex flex-col overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-text-tertiary shrink-0">
                  {getClassIcon(selectedDriver.device_class)}
                </span>
                <h3 className="text-[14px] font-semibold text-text-primary/90 truncate">
                  {selectedDriver.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                className="flex items-center justify-center w-6 h-6 rounded
                           text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <DetailRow label="Device Name" value={selectedDriver.device_name} />
              <DetailRow label="Manufacturer" value={selectedDriver.manufacturer} />
              <DetailRow label="Class" value={selectedDriver.device_class} />
              <DetailRow label="Driver Version" value={selectedDriver.driver_version || "N/A"} />
              <DetailRow label="Driver Date" value={selectedDriver.driver_date || "N/A"} />
              <DetailRow label="INF File" value={selectedDriver.inf_name || "N/A"} mono />
              <DetailRow label="Status" value={selectedDriver.status} />

              {/* Signing status */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-[11.5px] text-text-tertiary">Digital Signature</span>
                {selectedDriver.is_signed ? (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-success">
                    <ShieldCheck className="w-3.5 h-3.5" /> Signed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-warning">
                    <ShieldAlert className="w-3.5 h-3.5" /> Unsigned
                  </span>
                )}
              </div>

              {/* Problem indicator */}
              {selectedDriver.has_problem && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg
                               bg-danger/10 border border-danger/20 mt-1">
                  <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                  <span className="text-[12px] text-danger/80">
                    This device has reported a problem. It may not be functioning correctly.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Detail Row ─── */
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11.5px] text-text-tertiary shrink-0">{label}</span>
      <span className={`text-[12px] text-text-primary/80 font-medium text-right break-all
                        ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
