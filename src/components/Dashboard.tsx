import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Monitor, Cpu, HardDrive, Server, Clock, Globe, Wifi, Copy, Check,
  Heart, Shield, AlertTriangle, RefreshCw, MemoryStick, Rocket, ChevronRight,
} from "lucide-react";
import type { SystemStats, SystemSpecs, DiskInfo } from "../types";

/* ─── Health Score Types ─── */
interface HealthCategory {
  name: string;
  score: number;
  icon: string;
  status: string;
  detail: string;
  action: string | null;
}

interface SystemHealthScore {
  overall_score: number;
  overall_status: string;
  categories: HealthCategory[];
}

/* ─── Icon Mapper ─── */
const ICON_MAP: Record<string, React.ReactNode> = {
  HardDrive: <HardDrive className="w-3.5 h-3.5" />,
  MemoryStick: <MemoryStick className="w-3.5 h-3.5" />,
  RefreshCw: <RefreshCw className="w-3.5 h-3.5" />,
  Rocket: <Rocket className="w-3.5 h-3.5" />,
  Clock: <Clock className="w-3.5 h-3.5" />,
  AlertTriangle: <AlertTriangle className="w-3.5 h-3.5" />,
  Shield: <Shield className="w-3.5 h-3.5" />,
};

function getIcon(name: string) {
  return ICON_MAP[name] || <Heart className="w-3.5 h-3.5" />;
}

/* ─── Sparkline Component ─── */
function Sparkline({ data, color, max, label, unit }: {
  data: number[];
  color: string;
  max: number;
  label: string;
  unit: string;
}) {
  const width = 280;
  const height = 48;
  const latest = data.length > 0 ? data[data.length - 1] : 0;
  const effectiveMax = max > 0 ? max : 100;

  const points = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (Math.min(v / effectiveMax, 1) * (height - 4)) - 2;
    return `${x},${y}`;
  }).join(" ");

  const fillPoints = data.length > 0
    ? `0,${height} ${points} ${width},${height}`
    : "";

  return (
    <div className="glass-panel p-3 hover:bg-white/[0.05] transition-all duration-300 group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-white/40 font-medium">{label}</span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
          {latest.toFixed(1)}{unit}
        </span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Fill area */}
        {fillPoints && (
          <polygon
            points={fillPoints}
            fill={`${color}15`}
          />
        )}
        {/* Line */}
        {data.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
          />
        )}
      </svg>
    </div>
  );
}

/* ─── Health Score Card ─── */
function HealthScoreCard({ score }: { score: SystemHealthScore | null }) {
  if (!score) {
    return (
      <div className="glass-panel p-5 flex items-center gap-4">
        <div className="w-[72px] h-[72px] rounded-full shimmer" />
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-4 w-40 shimmer" />
          <div className="h-3 w-56 shimmer" />
        </div>
      </div>
    );
  }

  const scoreColor =
    score.overall_score >= 80 ? "#2ed573" :
    score.overall_score >= 60 ? "#ffa502" : "#ff4757";

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score.overall_score / 100) * circumference;

  return (
    <div className="glass-panel p-5 hover:bg-white/[0.05] transition-all duration-300">
      <div className="flex items-center gap-5">
        {/* Score ring */}
        <div className="relative w-[72px] h-[72px] shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
            <circle
              cx="36" cy="36" r={radius}
              fill="none" stroke={scoreColor} strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{
                transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease",
                filter: `drop-shadow(0 0 6px ${scoreColor}40)`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[18px] font-bold tabular-nums" style={{ color: scoreColor }}>
              {score.overall_score}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4" style={{ color: scoreColor }} />
            <span className="text-[14px] font-semibold text-white/85">System Health</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{ backgroundColor: `${scoreColor}15`, color: scoreColor }}>
              {score.overall_status}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {score.categories.map((cat) => {
              const catColor = cat.status === "good" ? "#2ed573" :
                               cat.status === "warning" ? "#ffa502" : "#ff4757";
              return (
                <div key={cat.name} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
                  <span className="text-[10.5px] text-white/40">{cat.name}</span>
                  <span className="text-[10.5px] font-bold tabular-nums" style={{ color: catColor }}>
                    {cat.score}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category details (warnings/critical only) */}
      {score.categories.filter(c => c.status !== "good").length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/[0.05] flex flex-col gap-1.5">
          {score.categories.filter(c => c.status !== "good").map((cat) => (
            <div key={cat.name} className="flex items-center gap-2 text-[11px]">
              <span className="text-white/25">{getIcon(cat.icon)}</span>
              <span className="text-white/50">{cat.detail}</span>
              {cat.action && (
                <>
                  <ChevronRight className="w-3 h-3 text-white/15" />
                  <span className="text-accent/60">{cat.action}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Circular Gauge ─── */
interface GaugeProps {
  value: number;
  max: number;
  label: string;
  unit?: string;
  icon: React.ReactNode;
}

function CircularGauge({ value, max, label, unit = "%", icon }: GaugeProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color =
    pct > 80 ? "text-danger" : pct > 50 ? "text-warning" : "text-success";
  const strokeColor =
    pct > 80 ? "#ff4757" : pct > 50 ? "#ffa502" : "#2ed573";
  const glowColor =
    pct > 80
      ? "rgba(255,71,87,0.25)"
      : pct > 50
      ? "rgba(255,165,2,0.2)"
      : "rgba(46,213,115,0.2)";

  return (
    <div className="glass-panel flex flex-col items-center justify-center gap-3 p-6
                    hover:bg-white/[0.05] transition-all duration-300 group">
      <div className="relative w-[130px] h-[130px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Track */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
          />
          {/* Value arc */}
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease",
              filter: `drop-shadow(0 0 8px ${glowColor})`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold tabular-nums tracking-tight ${color}`}>
            {pct.toFixed(0)}
          </span>
          <span className="text-[11px] text-white/40 font-medium">{unit}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-white/40 group-hover:text-white/60 transition-colors">{icon}</span>
        <span className="text-[13px] font-medium text-white/70 group-hover:text-white/90 transition-colors">
          {label}
        </span>
      </div>

      {/* Usage detail */}
      {max > 1 && (
        <span className="text-[11px] text-white/30 font-mono">
          {value.toFixed(1)} / {max.toFixed(1)} GB
        </span>
      )}
    </div>
  );
}

/* ─── Spec Card ─── */
interface SpecCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub?: string;
}

function SpecCard({ icon, title, value, sub }: SpecCardProps) {
  return (
    <div className="glass-panel flex items-start gap-3.5 p-4
                    hover:bg-white/[0.05] transition-all duration-300 group">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg
                      bg-accent/10 text-accent shrink-0 group-hover:bg-accent/15
                      transition-colors duration-300">
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-0.5">
          {title}
        </span>
        <span className="text-[13.5px] font-semibold text-white/90 truncate leading-snug">
          {value}
        </span>
        {sub && (
          <span className="text-[11px] text-white/30 mt-0.5 truncate">{sub}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Disk Card ─── */
function DiskCard({ disk }: { disk: DiskInfo }) {
  const total = disk.total;
  const used = disk.used;
  const free = total - used;
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct > 90 ? "#ff4757" : pct > 70 ? "#ffa502" : "#2ed573";

  return (
    <div className="glass-panel p-4 hover:bg-white/[0.05] transition-all duration-300 group">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
            <HardDrive className="w-4 h-4 text-accent" />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-white/85 leading-tight">{disk.name}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 font-medium">
                {disk.disk_type}
              </span>
              <span className="text-[10px] text-white/25 font-mono">{disk.file_system}</span>
            </div>
          </div>
        </div>
        <span className="text-[12px] font-mono tabular-nums text-white/40">
          {pct.toFixed(0)}%
        </span>
      </div>

      {/* Usage bar */}
      <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 8px ${color}40`,
          }}
        />
      </div>

      {/* Stats */}
      <div className="flex justify-between text-[11px] text-white/35 font-mono tabular-nums">
        <span>Used: {bytesToGB(used).toFixed(1)} GB</span>
        <span>Free: {bytesToGB(free).toFixed(1)} GB</span>
        <span>Total: {bytesToGB(total).toFixed(1)} GB</span>
      </div>
    </div>
  );
}

/* ─── IP Card ─── */
function IPCard({ internalIp, externalIp }: { internalIp: string; externalIp: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard may fail */ }
  };

  return (
    <div className="glass-panel p-4 hover:bg-white/[0.05] transition-all duration-300 col-span-full">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
          <Globe className="w-4 h-4 text-accent" />
        </div>
        <span className="text-[13px] font-semibold text-white/85">Network</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between gap-2 bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/[0.05]">
          <div className="flex items-center gap-2 min-w-0">
            <Wifi className="w-3.5 h-3.5 text-success/60 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-white/30 uppercase font-semibold">Internal IP</span>
              <span className="text-[12.5px] text-white/70 font-mono truncate">{internalIp}</span>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(internalIp, "internal")}
            className="flex items-center justify-center w-6 h-6 rounded text-white/25 hover:text-white/60
                       hover:bg-white/[0.05] transition-all duration-200 shrink-0"
            title="Copy to clipboard"
          >
            {copied === "internal" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/[0.05]">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="w-3.5 h-3.5 text-accent/60 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-white/30 uppercase font-semibold">External IP</span>
              <span className="text-[12.5px] text-white/70 font-mono truncate">{externalIp}</span>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(externalIp, "external")}
            className="flex items-center justify-center w-6 h-6 rounded text-white/25 hover:text-white/60
                       hover:bg-white/[0.05] transition-all duration-200 shrink-0"
            title="Copy to clipboard"
          >
            {copied === "external" ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ─── */
function SkeletonGauge() {
  return (
    <div className="glass-panel flex flex-col items-center justify-center gap-3 p-6">
      <div className="w-[130px] h-[130px] rounded-full shimmer" />
      <div className="h-4 w-16 shimmer" />
    </div>
  );
}

function SkeletonSpec() {
  return (
    <div className="glass-panel flex items-start gap-3.5 p-4">
      <div className="w-9 h-9 rounded-lg shimmer shrink-0" />
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="h-3 w-16 shimmer" />
        <div className="h-4 w-32 shimmer" />
      </div>
    </div>
  );
}

/* ─── Helper: format bytes to GB ─── */
function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/* ─── Dashboard ─── */
export default function Dashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState<SystemHealthScore | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Performance history (60-second rolling window)
  const MAX_POINTS = 30;
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [s, sp] = await Promise.all([
        invoke<SystemStats>("get_system_stats"),
        invoke<SystemSpecs>("get_system_specs"),
      ]);
      setStats(s);
      setSpecs(sp);

      // Update history
      setCpuHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), s.cpu_usage]);
      setRamHistory((prev) => {
        const pct = s.ram_total > 0 ? (s.ram_used / s.ram_total) * 100 : 0;
        return [...prev.slice(-(MAX_POINTS - 1)), pct];
      });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch health score once on mount (it's expensive)
  useEffect(() => {
    invoke<SystemHealthScore>("get_health_score")
      .then(setHealthScore)
      .catch((err) => console.error("Health score error:", err));
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Health Score */}
      <section>
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
          System Health
        </h2>
        <HealthScoreCard score={healthScore} />
      </section>

      {/* System Gauges */}
      <section>
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
          System Resources
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {loading || !stats ? (
            <>
              <SkeletonGauge />
              <SkeletonGauge />
              <SkeletonGauge />
            </>
          ) : (
            <>
              <CircularGauge
                value={stats.cpu_usage}
                max={100}
                label="CPU"
                icon={<Cpu className="w-4 h-4" />}
              />
              <CircularGauge
                value={bytesToGB(stats.ram_used)}
                max={bytesToGB(stats.ram_total)}
                label="Memory"
                icon={<Server className="w-4 h-4" />}
              />
              <CircularGauge
                value={bytesToGB(stats.disk_used)}
                max={bytesToGB(stats.disk_total)}
                label="Total Disk"
                icon={<HardDrive className="w-4 h-4" />}
              />
            </>
          )}
      </div>
      </section>

      {/* Performance Sparklines */}
      {cpuHistory.length > 2 && (
        <section>
          <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
            Performance History
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Sparkline data={cpuHistory} color="#60CDFF" max={100} label="CPU Usage" unit="%" />
            <Sparkline data={ramHistory} color="#2ed573" max={100} label="Memory Usage" unit="%" />
          </div>
        </section>
      )}

      {/* Network IPs */}
      {stats && (
        <section>
          <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
            Network
          </h2>
          <IPCard internalIp={stats.internal_ip} externalIp={stats.external_ip} />
        </section>
      )}

      {/* Per-Disk Storage */}
      {stats && stats.disks && stats.disks.length > 0 && (
        <section>
          <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
            Disk Drives
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {stats.disks.map((disk, i) => (
              <DiskCard key={`${disk.mount_point}-${i}`} disk={disk} />
            ))}
          </div>
        </section>
      )}

      {/* System Specs */}
      <section>
        <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
          System Information
        </h2>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {loading || !specs ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonSpec key={i} />)
          ) : (
            <>
              <SpecCard
                icon={<Monitor className="w-4 h-4" />}
                title="Operating System"
                value={specs.os_version}
              />
              <SpecCard
                icon={<Cpu className="w-4 h-4" />}
                title="Processor"
                value={specs.cpu_name}
              />
              <SpecCard
                icon={<Monitor className="w-4 h-4" />}
                title="Graphics"
                value={specs.gpu_name}
              />
              <SpecCard
                icon={<Globe className="w-4 h-4" />}
                title="Hostname"
                value={specs.hostname}
              />
              <SpecCard
                icon={<Clock className="w-4 h-4" />}
                title="Uptime"
                value={specs.uptime}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
