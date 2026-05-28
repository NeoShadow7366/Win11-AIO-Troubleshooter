import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Folder,
  File,
  ChevronRight,
  HardDrive,
  ArrowLeft,
} from "lucide-react";
import type { DiskSpaceEntry, DiskInfo } from "../types";
import { useToast } from "./ToastProvider";

/* ─── Format Helpers ─── */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value.toFixed(exp > 1 ? 1 : 0)} ${units[exp]}`;
}

function sizePercent(bytes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min((bytes / total) * 100, 100);
}

/* ─── Bar Color ─── */
const BAR_COLORS = [
  "#60CDFF", "#2ed573", "#ffa502", "#ff4757", "#a29bfe",
  "#fd79a8", "#74b9ff", "#00cec9", "#e17055", "#636e72",
];

function getBarColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length];
}

/* ─── Component ─── */
export default function DiskAnalyzer() {
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>("");
  const [entries, setEntries] = useState<DiskSpaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([]);
  const { showToast } = useToast();

  // Load disks on mount
  const fetchDisks = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await invoke<{ disks: DiskInfo[] }>("get_system_stats");
      setDisks(stats.disks || []);
      if (stats.disks && stats.disks.length > 0) {
        const firstDrive = stats.disks[0].mount_point;
        setSelectedDrive(firstDrive);
        loadOverview(firstDrive);
      }
    } catch (err) {
      showToast(`Failed to load disk info: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDisks();
  }, [fetchDisks]);

  const loadOverview = async (drive: string) => {
    setScanning(true);
    setBreadcrumbs([{ name: drive, path: drive }]);
    try {
      const data = await invoke<DiskSpaceEntry[]>("get_disk_overview", { drive });
      setEntries(data);
    } catch (err) {
      showToast(`Scan failed: ${err}`, "error");
    } finally {
      setScanning(false);
    }
  };

  const drillDown = async (entry: DiskSpaceEntry) => {
    if (!entry.is_directory) return;
    setScanning(true);
    try {
      const data = await invoke<DiskSpaceEntry[]>("scan_directory_sizes", {
        path: entry.path,
        depth: 0,
      });
      setEntries(data);
      setBreadcrumbs((prev) => [...prev, { name: entry.name, path: entry.path }]);
    } catch (err) {
      showToast(`Cannot scan: ${err}`, "error");
    } finally {
      setScanning(false);
    }
  };

  const navigateTo = (index: number) => {
    const target = breadcrumbs[index];
    if (index === 0) {
      loadOverview(target.path);
    } else {
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      setScanning(true);
      invoke<DiskSpaceEntry[]>("scan_directory_sizes", { path: target.path, depth: 0 })
        .then(setEntries)
        .catch((err) => showToast(`Scan failed: ${err}`, "error"))
        .finally(() => setScanning(false));
    }
  };

  // Total size for percentage calculation
  const totalBytes = useMemo(
    () => entries.reduce((s, e) => s + e.size_bytes, 0),
    [entries]
  );

  // Find disk info for selected drive
  const currentDisk = disks.find((d) => d.mount_point === selectedDrive);

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Drive Selector + Breadcrumbs */}
      <div className="flex items-center gap-3">
        {/* Drive pills */}
        <div className="flex items-center gap-1.5">
          {disks.map((disk) => (
            <button
              key={disk.mount_point}
              onClick={() => {
                setSelectedDrive(disk.mount_point);
                loadOverview(disk.mount_point);
              }}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium
                         border transition-all duration-200
                         ${selectedDrive === disk.mount_point
                           ? "bg-accent/10 text-accent border-accent/20"
                           : "bg-surface text-text-tertiary border-border hover:bg-surface-hover"
                         }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              {disk.mount_point.replace("\\", "")}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-[12px] overflow-hidden flex-1 min-w-0">
          {breadcrumbs.map((bc, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-text-tertiary/30" />}
              <button
                onClick={() => navigateTo(i)}
                className={`hover:text-accent transition-colors truncate max-w-[120px]
                  ${i === breadcrumbs.length - 1 ? "text-text-primary/80 font-medium" : "text-text-tertiary"}`}
              >
                {bc.name}
              </button>
            </div>
          ))}
        </div>

        {/* Back button */}
        {breadcrumbs.length > 1 && (
          <button
            onClick={() => navigateTo(breadcrumbs.length - 2)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px]
                       bg-surface border border-border text-text-tertiary
                       hover:bg-surface-hover transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
      </div>

      {/* Disk info bar */}
      {currentDisk && (
        <div className="glass-panel p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-text-secondary font-medium">{currentDisk.name}</span>
            <span className="text-[11px] text-text-tertiary">
              {formatBytes(currentDisk.used)} used of {formatBytes(currentDisk.total)}
              {" · "}
              {formatBytes(currentDisk.total - currentDisk.used)} free
              {" · "}
              {currentDisk.disk_type} ({currentDisk.file_system})
            </span>
          </div>
          <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${sizePercent(currentDisk.used, currentDisk.total)}%`,
                background: sizePercent(currentDisk.used, currentDisk.total) > 90
                  ? "#ff4757"
                  : sizePercent(currentDisk.used, currentDisk.total) > 70
                  ? "#ffa502"
                  : "#60CDFF",
              }}
            />
          </div>
        </div>
      )}

      {/* Visual treemap bar */}
      {entries.length > 0 && totalBytes > 0 && !scanning && (
        <div className="glass-panel p-3">
          <div className="flex h-8 rounded-lg overflow-hidden gap-px">
            {entries.slice(0, 10).map((entry, i) => {
              const pct = sizePercent(entry.size_bytes, totalBytes);
              if (pct < 1) return null;
              return (
                <button
                  key={entry.path}
                  onClick={() => entry.is_directory && drillDown(entry)}
                  className="h-full transition-all duration-300 hover:opacity-80 relative group"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: getBarColor(i),
                    minWidth: pct > 2 ? undefined : "4px",
                  }}
                  title={`${entry.name}: ${formatBytes(entry.size_bytes)}`}
                >
                  {pct > 8 && (
                    <span className="absolute inset-0 flex items-center justify-center
                                     text-[10px] font-medium text-white/90 truncate px-1">
                      {entry.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* File/folder list */}
      <div className="glass-panel flex flex-col flex-1 overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_80px] gap-2 px-4 py-2.5 text-[11px]
                        font-semibold text-text-tertiary uppercase tracking-wider border-b border-border">
          <span>Name</span>
          <span className="text-right">Size</span>
          <span className="text-right">% of Total</span>
        </div>

        {loading || scanning ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" />
            <span className="text-[12px] text-text-tertiary">
              {scanning ? "Scanning directory..." : "Loading..."}
            </span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-text-tertiary">
            Empty directory
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {entries.map((entry, i) => {
              const pct = sizePercent(entry.size_bytes, totalBytes);
              return (
                <button
                  key={entry.path}
                  onClick={() => entry.is_directory && drillDown(entry)}
                  className={`w-full grid grid-cols-[1fr_100px_80px] gap-2 px-4 py-2.5
                             text-left text-[12.5px] border-b border-border transition-all duration-150
                             ${entry.is_directory ? "hover:bg-surface-hover cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.is_directory ? (
                      <Folder className="w-4 h-4 shrink-0" style={{ color: getBarColor(i) }} />
                    ) : (
                      <File className="w-4 h-4 text-text-tertiary shrink-0" />
                    )}
                    <span className="truncate text-text-primary/85 font-medium">{entry.name}</span>
                    {entry.is_directory && (
                      <ChevronRight className="w-3 h-3 text-text-tertiary/30 shrink-0" />
                    )}
                  </div>
                  <span className="text-text-secondary text-right font-mono text-[11px]">
                    {formatBytes(entry.size_bytes)}
                  </span>
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-12 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: getBarColor(i),
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-text-tertiary tabular-nums w-8 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
