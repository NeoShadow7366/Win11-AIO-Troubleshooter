import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Thermometer,
  Cpu,
  HardDrive,
  MemoryStick,
  MonitorCog,
  RefreshCw,
  AlertTriangle,
  Info,
  Fan,
} from "lucide-react";

// ─── Types ───

interface CpuTempInfo {
  zone: string;
  temperature_c: number;
}

interface GpuHealthInfo {
  name: string;
  temperature_c: number;
  utilization_pct: number;
  fan_speed_pct: number | null;
}

interface DiskHealthInfo {
  name: string;
  media_type: string;
  health_status: string;
  operational_status: string;
  size_bytes: number;
  temperature_c: number | null;
  power_on_hours: number | null;
  read_errors: number | null;
  write_errors: number | null;
  wear_percentage: number | null;
}

interface RamModule {
  manufacturer: string;
  speed_mhz: number;
  capacity_bytes: number;
}

interface RamHealthInfo {
  modules: RamModule[];
  total_capacity_bytes: number;
  speed_mhz: number;
}

interface HardwareHealth {
  cpu_temps: CpuTempInfo[];
  gpu_info: GpuHealthInfo | null;
  disk_health: DiskHealthInfo[];
  ram_info: RamHealthInfo;
}

// ─── Helpers ───

function tempColor(temp: number): string {
  if (temp >= 80) return "#ff4757";
  if (temp >= 60) return "#ffa502";
  return "#2ed573";
}

function tempStatus(temp: number): string {
  if (temp >= 80) return "text-danger";
  if (temp >= 60) return "text-warning";
  return "text-success";
}

function healthBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "healthy") return { color: "bg-success/15 text-success", label: "Healthy" };
  if (s === "warning") return { color: "bg-warning/15 text-warning", label: "Warning" };
  return { color: "bg-danger/15 text-danger", label: status };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(1)} TB`;
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  return `${(bytes / 1048576).toFixed(0)} MB`;
}

function formatHours(hours: number): string {
  if (hours >= 8760) return `${(hours / 8760).toFixed(1)} years`;
  if (hours >= 720) return `${(hours / 720).toFixed(0)} months`;
  if (hours >= 24) return `${(hours / 24).toFixed(0)} days`;
  return `${hours}h`;
}

// ─── Skeletons ───

function SkeletonCard() {
  return (
    <div className="glass-panel p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg shimmer" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-3 w-20 shimmer" />
          <div className="h-4 w-32 shimmer" />
        </div>
      </div>
      <div className="h-2 w-full shimmer rounded-full" />
    </div>
  );
}

// ─── Component ───

export default function HardwareHealth() {
  const [data, setData] = useState<HardwareHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await invoke<HardwareHealth>("get_hardware_health");
      setData(result);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Hardware health fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Refresh indicator */}
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/20 font-mono">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchData}
            className="flex items-center justify-center w-7 h-7 rounded-lg
                       text-white/30 hover:text-white/60 hover:bg-white/[0.05]
                       transition-all duration-200"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── CPU Temperature ── */}
      <section>
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
          CPU Temperature
        </h2>
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : data && data.cpu_temps.length > 0 ? (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {data.cpu_temps.map((temp, i) => (
              <div key={i} className="glass-panel p-4 hover:bg-white/[0.05] transition-all duration-300 group">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg"
                         style={{ backgroundColor: `${tempColor(temp.temperature_c)}15` }}>
                      <Thermometer className="w-4 h-4" style={{ color: tempColor(temp.temperature_c) }} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-white/40 font-medium uppercase tracking-wider">
                        {temp.zone.replace(/_/g, " ").replace(/ACPI\\\\/gi, "").substring(0, 20)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-bold tabular-nums ${tempStatus(temp.temperature_c)}`}>
                    {temp.temperature_c.toFixed(0)}
                  </span>
                  <span className="text-[12px] text-white/30">°C</span>
                </div>
                {/* Temperature bar */}
                <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.min((temp.temperature_c / 100) * 100, 100)}%`,
                      background: tempColor(temp.temperature_c),
                      boxShadow: `0 0 6px ${tempColor(temp.temperature_c)}40`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-panel p-4 flex items-center gap-3">
            <Info className="w-4 h-4 text-white/25 shrink-0" />
            <span className="text-[12px] text-white/40">
              Temperature data unavailable — may require administrator privileges or hardware support
            </span>
          </div>
        )}
      </section>

      {/* ── GPU ── */}
      <section>
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
          GPU
        </h2>
        {loading ? (
          <SkeletonCard />
        ) : data?.gpu_info ? (
          <div className="glass-panel p-4 hover:bg-white/[0.05] transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
                  <MonitorCog className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-white/85 block">{data.gpu_info.name}</span>
                  <span className="text-[11px] text-white/35">NVIDIA GPU</span>
                </div>
              </div>
              <div className={`text-xl font-bold tabular-nums ${tempStatus(data.gpu_info.temperature_c)}`}>
                {data.gpu_info.temperature_c.toFixed(0)}°C
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {/* Temperature */}
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Temperature</span>
                <span className={`text-[14px] font-bold ${tempStatus(data.gpu_info.temperature_c)}`}>
                  {data.gpu_info.temperature_c}°C
                </span>
              </div>
              {/* Utilization */}
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Load</span>
                <span className="text-[14px] font-bold text-accent">{data.gpu_info.utilization_pct}%</span>
                <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden mt-1.5">
                  <div className="h-full rounded-full bg-accent transition-all duration-700"
                       style={{ width: `${data.gpu_info.utilization_pct}%` }} />
                </div>
              </div>
              {/* Fan Speed */}
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Fan</span>
                <div className="flex items-center gap-1.5">
                  <Fan className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-[14px] font-bold text-white/70">
                    {data.gpu_info.fan_speed_pct !== null ? `${data.gpu_info.fan_speed_pct}%` : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel p-4 flex items-center gap-3">
            <Info className="w-4 h-4 text-white/25 shrink-0" />
            <span className="text-[12px] text-white/40">
              GPU monitoring available for NVIDIA GPUs with nvidia-smi installed
            </span>
          </div>
        )}
      </section>

      {/* ── RAM Information ── */}
      <section>
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
          Memory Modules
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            <SkeletonCard /><SkeletonCard />
          </div>
        ) : data ? (
          <>
            {/* Summary */}
            <div className="glass-panel p-4 mb-3 flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
                <MemoryStick className="w-5 h-5 text-accent" />
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[10px] text-white/30 uppercase font-semibold block">Total</span>
                  <span className="text-[15px] font-bold text-white/90">
                    {formatBytes(data.ram_info.total_capacity_bytes)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-white/30 uppercase font-semibold block">Speed</span>
                  <span className="text-[15px] font-bold text-white/90">{data.ram_info.speed_mhz} MHz</span>
                </div>
                <div>
                  <span className="text-[10px] text-white/30 uppercase font-semibold block">Modules</span>
                  <span className="text-[15px] font-bold text-white/90">{data.ram_info.modules.length}</span>
                </div>
              </div>
            </div>

            {/* Per-module cards */}
            {data.ram_info.modules.length > 0 && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {data.ram_info.modules.map((mod_, i) => (
                  <div key={i} className="glass-panel p-3.5 hover:bg-white/[0.05] transition-all duration-300">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-accent/10">
                        <Cpu className="w-3.5 h-3.5 text-accent" />
                      </div>
                      <span className="text-[11px] text-white/40 font-medium">DIMM {i + 1}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[12px] font-semibold text-white/80 truncate">{mod_.manufacturer}</span>
                      <span className="text-[11px] text-white/35 font-mono">
                        {formatBytes(mod_.capacity_bytes)} • {mod_.speed_mhz} MHz
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </section>

      {/* ── Disk Health ── */}
      <section>
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
          Disk Health
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            <SkeletonCard /><SkeletonCard />
          </div>
        ) : data && data.disk_health.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {data.disk_health.map((disk, i) => {
              const badge = healthBadge(disk.health_status);
              return (
                <div key={i} className="glass-panel p-4 hover:bg-white/[0.05] transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
                        <HardDrive className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-semibold text-white/85 leading-tight">{disk.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 font-medium">
                            {disk.media_type}
                          </span>
                          <span className="text-[10px] text-white/25 font-mono">{formatBytes(disk.size_bytes)}</span>
                        </div>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {disk.temperature_c !== null && (
                      <div className="bg-white/[0.03] rounded-lg px-2.5 py-2 border border-white/[0.05]">
                        <span className="text-[9px] text-white/25 uppercase font-semibold block">Temp</span>
                        <span className={`text-[13px] font-bold tabular-nums ${tempStatus(disk.temperature_c)}`}>
                          {disk.temperature_c}°C
                        </span>
                      </div>
                    )}
                    {disk.power_on_hours !== null && (
                      <div className="bg-white/[0.03] rounded-lg px-2.5 py-2 border border-white/[0.05]">
                        <span className="text-[9px] text-white/25 uppercase font-semibold block">Power-On</span>
                        <span className="text-[13px] font-bold text-white/70 tabular-nums">
                          {formatHours(disk.power_on_hours)}
                        </span>
                      </div>
                    )}
                    {(disk.read_errors !== null && disk.read_errors > 0) && (
                      <div className="bg-white/[0.03] rounded-lg px-2.5 py-2 border border-white/[0.05]">
                        <span className="text-[9px] text-white/25 uppercase font-semibold block">Read Errors</span>
                        <span className="text-[13px] font-bold text-danger tabular-nums">{disk.read_errors}</span>
                      </div>
                    )}
                    {(disk.write_errors !== null && disk.write_errors > 0) && (
                      <div className="bg-white/[0.03] rounded-lg px-2.5 py-2 border border-white/[0.05]">
                        <span className="text-[9px] text-white/25 uppercase font-semibold block">Write Errors</span>
                        <span className="text-[13px] font-bold text-danger tabular-nums">{disk.write_errors}</span>
                      </div>
                    )}
                  </div>

                  {/* Wear bar for SSDs */}
                  {disk.wear_percentage !== null && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-white/30 font-medium">SSD Wear Level</span>
                        <span className="text-[10px] text-white/40 font-mono tabular-nums">
                          {disk.wear_percentage.toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.min(disk.wear_percentage, 100)}%`,
                            background: disk.wear_percentage > 80 ? "#ff4757" : disk.wear_percentage > 50 ? "#ffa502" : "#2ed573",
                            boxShadow: `0 0 6px ${disk.wear_percentage > 80 ? "#ff475740" : "#2ed57340"}`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-warning/60 shrink-0" />
            <span className="text-[12px] text-white/40">Unable to retrieve disk health data</span>
          </div>
        )}
      </section>
    </div>
  );
}
