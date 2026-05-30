import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./ToastProvider";
import { usePageVisible } from "./Layout";
import {
  Monitor, Cpu, HardDrive, Server, Clock, Globe, Wifi, Copy, Check,
  Heart, Shield, AlertTriangle, RefreshCw, MemoryStick, Rocket, ChevronRight,
  ChevronDown, ChevronUp, Maximize2, X,
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
function Sparkline({ data, color, max, label, unit, formatValue, onExpand }: {
  data: number[];
  color: string;
  max: number;
  label: string;
  unit: string;
  formatValue?: (v: number) => string;
  onExpand?: () => void;
}) {
  const width = 280;
  const height = 48;
  const latest = data.length > 0 ? data[data.length - 1] : 0;
  const effectiveMax = max > 0 ? max : 100;
  const displayValue = formatValue ? formatValue(latest) : `${latest.toFixed(1)}${unit}`;

  const points = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (Math.min(v / effectiveMax, 1) * (height - 4)) - 2;
    return `${x},${y}`;
  }).join(" ");

  const fillPoints = data.length > 0
    ? `0,${height} ${points} ${width},${height}`
    : "";

  return (
    <div
      className="glass-panel p-3 hover:bg-white/[0.05] transition-all duration-300 group cursor-pointer"
      onClick={onExpand}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-white/40 font-medium flex items-center gap-1.5">
          {label}
          {onExpand && <Maximize2 className="w-3 h-3 text-white/15 group-hover:text-white/40 transition-colors" />}
        </span>
        <span className="text-[13px] font-bold tabular-nums" style={{ color }}>
          {displayValue}
        </span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {fillPoints && (
          <polygon points={fillPoints} fill={`${color}15`} />
        )}
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

/* ─── Expanded Sparkline Modal ─── */
function ExpandedSparkline({ data, color, max, label, unit, formatValue, onClose }: {
  data: number[];
  color: string;
  max: number;
  label: string;
  unit: string;
  formatValue?: (v: number) => string;
  onClose: () => void;
}) {
  const width = 800;
  const height = 200;
  const effectiveMax = max > 0 ? max : 100;
  const latest = data.length > 0 ? data[data.length - 1] : 0;
  const avg = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
  const peak = data.length > 0 ? Math.max(...data) : 0;
  const displayValue = formatValue ? formatValue(latest) : `${latest.toFixed(1)}${unit}`;
  const displayAvg = formatValue ? formatValue(avg) : `${avg.toFixed(1)}${unit}`;
  const displayPeak = formatValue ? formatValue(peak) : `${peak.toFixed(1)}${unit}`;

  const points = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (Math.min(v / effectiveMax, 1) * (height - 8)) - 4;
    return `${x},${y}`;
  }).join(" ");

  const fillPoints = data.length > 0
    ? `0,${height} ${points} ${width},${height}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
         onClick={onClose}>
      <div className="glass-panel-strong w-[880px] p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-semibold text-white/85">{label}</span>
            <span className="text-[18px] font-bold tabular-nums" style={{ color }}>{displayValue}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-[11px] text-white/40">
              <span>Avg: <span className="font-bold text-white/60">{displayAvg}</span></span>
              <span>Peak: <span className="font-bold text-white/60">{displayPeak}</span></span>
              <span>Points: <span className="font-bold text-white/60">{data.length}</span></span>
            </div>
            <button onClick={onClose}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
             className="rounded-lg overflow-hidden bg-white/[0.02]">
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct) => (
            <line key={pct} x1="0" y1={height * (1 - pct)} x2={width} y2={height * (1 - pct)}
                  stroke="rgba(255,255,255,0.04)" strokeDasharray="4" />
          ))}
          {fillPoints && (
            <polygon points={fillPoints} fill={`${color}12`} />
          )}
          {data.length > 1 && (
            <polyline
              points={points} fill="none" stroke={color} strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${color}50)` }}
            />
          )}
          {/* Average line */}
          {data.length > 1 && (
            <line x1="0" y1={height - (Math.min(avg / effectiveMax, 1) * (height - 8)) - 4}
                  x2={width} y2={height - (Math.min(avg / effectiveMax, 1) * (height - 8)) - 4}
                  stroke={color} strokeWidth="1" strokeDasharray="6 4" opacity="0.3" />
          )}
        </svg>
      </div>
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

function CircularGauge({ value, max, label, unit = "%", icon, subLabel }: GaugeProps & { subLabel?: string }) {
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

      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-white/40 group-hover:text-white/60 transition-colors">{icon}</span>
          <span className="text-[13px] font-medium text-white/70 group-hover:text-white/90 transition-colors">
            {label}
          </span>
        </div>
        {subLabel && (
          <span className="text-[10px] text-white/25 font-mono tabular-nums">{subLabel}</span>
        )}
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

/* ─── Helper: format network speed ─── */
function formatNetSpeed(kbps: number): string {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
  return `${kbps.toFixed(0)} KB/s`;
}

/* ─── Helper: format disk I/O speed ─── */
function formatDiskSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

/* ─── Dashboard ─── */
export default function Dashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState<SystemHealthScore | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { showToast } = useToast();
  const errorShownRef = useRef(false);
  const isVisible = usePageVisible('dashboard');

  // Performance history (120-second rolling window — extended)
  const MAX_POINTS = 60;
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);
  const [netDownHistory, setNetDownHistory] = useState<number[]>([]);
  const [netUpHistory, setNetUpHistory] = useState<number[]>([]);
  const prevNetRef = useRef<{ rx: number; tx: number; time: number } | null>(null);

  // GPU history
  const [gpuHistory, setGpuHistory] = useState<number[]>([]);
  const [gpuMemUsed, setGpuMemUsed] = useState<number | null>(null);
  const [gpuMemTotal, setGpuMemTotal] = useState<number | null>(null);

  // Disk I/O history
  const [diskReadHistory, setDiskReadHistory] = useState<number[]>([]);
  const [diskWriteHistory, setDiskWriteHistory] = useState<number[]>([]);

  // CPU speed
  const [cpuSpeedMhz, setCpuSpeedMhz] = useState<number | null>(null);

  // Per-core CPU
  const [perCoreUsage, setPerCoreUsage] = useState<number[]>([]);
  const [showPerCore, setShowPerCore] = useState(false);

  // Expanded sparkline view
  const [expandedGraph, setExpandedGraph] = useState<{
    data: number[]; color: string; max: number; label: string; unit: string;
    formatValue?: (v: number) => string;
  } | null>(null);

  // Fetch only stats (called every 2s)
  const fetchStats = useCallback(async () => {
    try {
      const s = await invoke<SystemStats>("get_system_stats");
      setStats(s);

      // Update history
      setCpuHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), s.cpu_usage]);
      setRamHistory((prev) => {
        const pct = s.ram_total > 0 ? (s.ram_used / s.ram_total) * 100 : 0;
        return [...prev.slice(-(MAX_POINTS - 1)), pct];
      });

      // Network speed calculation (bytes/sec -> KB/s)
      const now = Date.now();
      if (prevNetRef.current) {
        const dtSec = (now - prevNetRef.current.time) / 1000;
        if (dtSec > 0) {
          const downSpeed = (s.net_rx_bytes - prevNetRef.current.rx) / dtSec / 1024; // KB/s
          const upSpeed = (s.net_tx_bytes - prevNetRef.current.tx) / dtSec / 1024;
          setNetDownHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), Math.max(0, downSpeed)]);
          setNetUpHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), Math.max(0, upSpeed)]);
        }
      }
      prevNetRef.current = { rx: s.net_rx_bytes, tx: s.net_tx_bytes, time: now };

      // Per-core CPU
      if (s.per_core_usage) setPerCoreUsage(s.per_core_usage);

      // GPU
      if (s.gpu_usage != null) {
        setGpuHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), s.gpu_usage!]);
      }
      if (s.gpu_memory_used != null) setGpuMemUsed(s.gpu_memory_used);
      if (s.gpu_memory_total != null) setGpuMemTotal(s.gpu_memory_total);

      // Disk I/O
      setDiskReadHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), s.disk_read_bytes || 0]);
      setDiskWriteHistory((prev) => [...prev.slice(-(MAX_POINTS - 1)), s.disk_write_bytes || 0]);

      // CPU speed
      if (s.cpu_speed_mhz != null) setCpuSpeedMhz(s.cpu_speed_mhz);
    } catch (err) {
      if (!errorShownRef.current) {
        showToast("Failed to fetch system stats", "error");
        errorShownRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch specs once on mount (expensive, rarely changes)
  useEffect(() => {
    invoke<SystemSpecs>("get_system_specs")
      .then(setSpecs)
      .catch(() => {});
  }, []);

  // Fetch health score once on mount (it's expensive)
  useEffect(() => {
    invoke<SystemHealthScore>("get_health_score")
      .then(setHealthScore)
      .catch(() => showToast("Failed to load health score", "error"));
  }, []);

  useEffect(() => {
    fetchStats();
    if (isVisible) {
      intervalRef.current = setInterval(fetchStats, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats, isVisible]);

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
        <div className={`grid gap-4 ${stats?.gpu_usage != null ? 'grid-cols-4' : 'grid-cols-3'}`}>
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
                subLabel={cpuSpeedMhz ? `${(cpuSpeedMhz / 1000).toFixed(2)} GHz` : undefined}
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
              {stats.gpu_usage != null && (
                <CircularGauge
                  value={stats.gpu_usage}
                  max={100}
                  label="GPU"
                  icon={<Monitor className="w-4 h-4" />}
                  subLabel={gpuMemUsed != null && gpuMemTotal != null
                    ? `${gpuMemUsed} / ${gpuMemTotal} MB`
                    : undefined
                  }
                />
              )}
            </>
          )}
      </div>
      </section>

      {/* Memory Composition */}
      {stats && stats.ram_cached != null && (
        <section>
          <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
            Memory Composition
          </h2>
          <div className="glass-panel p-4">
            {(() => {
              const totalBytes = stats.ram_total;
              const usedBytes = stats.ram_used;
              const cachedBytes = stats.ram_cached || 0;
              const pagedPool = stats.ram_paged_pool || 0;
              const availableBytes = stats.ram_available;
              const otherUsed = Math.max(0, usedBytes - cachedBytes - pagedPool);

              const toGB = (b: number) => (b / (1024 * 1024 * 1024)).toFixed(1);
              const pct = (b: number) => totalBytes > 0 ? ((b / totalBytes) * 100) : 0;

              const segments = [
                { label: "In Use", bytes: otherUsed, color: "#60CDFF" },
                { label: "Cached", bytes: cachedBytes, color: "#2ed573" },
                { label: "Paged Pool", bytes: pagedPool, color: "#a855f7" },
                { label: "Available", bytes: availableBytes, color: "rgba(255,255,255,0.08)" },
              ];

              return (
                <>
                  {/* Stacked bar */}
                  <div className="flex w-full h-5 rounded-full overflow-hidden bg-white/[0.03] mb-3">
                    {segments.map((seg) => (
                      seg.bytes > 0 && (
                        <div
                          key={seg.label}
                          className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                          style={{
                            width: `${pct(seg.bytes)}%`,
                            backgroundColor: seg.color,
                            opacity: seg.label === "Available" ? 1 : 0.8,
                          }}
                          title={`${seg.label}: ${toGB(seg.bytes)} GB (${pct(seg.bytes).toFixed(0)}%)`}
                        />
                      )
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-5 flex-wrap">
                    {segments.filter(s => s.bytes > 0).map((seg) => (
                      <div key={seg.label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color, opacity: seg.label === "Available" ? 0.3 : 0.8 }} />
                        <span className="text-[11px] text-white/40">{seg.label}</span>
                        <span className="text-[11px] text-white/60 font-mono tabular-nums">{toGB(seg.bytes)} GB</span>
                      </div>
                    ))}
                  </div>

                  {/* Secondary stats */}
                  <div className="flex items-center gap-6 mt-3 pt-3 border-t border-white/[0.04]">
                    {stats.ram_committed != null && stats.ram_commit_limit != null && (
                      <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                        <span>Committed:</span>
                        <span className="text-white/55 font-mono tabular-nums">{toGB(stats.ram_committed)} / {toGB(stats.ram_commit_limit)} GB</span>
                      </div>
                    )}
                    {stats.swap_total > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                        <span>Swap:</span>
                        <span className="text-white/55 font-mono tabular-nums">{toGB(stats.swap_used)} / {toGB(stats.swap_total)} GB</span>
                      </div>
                    )}
                    {stats.ram_non_paged_pool != null && (
                      <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                        <span>Non-Paged Pool:</span>
                        <span className="text-white/55 font-mono tabular-nums">{toGB(stats.ram_non_paged_pool)} GB</span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {/* Performance Sparklines */}
      {cpuHistory.length > 2 && (
        <section>
          <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1">
            Performance History
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Sparkline data={cpuHistory} color="#60CDFF" max={100} label="CPU Usage" unit="%"
              onExpand={() => setExpandedGraph({ data: cpuHistory, color: "#60CDFF", max: 100, label: "CPU Usage", unit: "%" })} />
            <Sparkline data={ramHistory} color="#2ed573" max={100} label="Memory Usage" unit="%"
              onExpand={() => setExpandedGraph({ data: ramHistory, color: "#2ed573", max: 100, label: "Memory Usage", unit: "%" })} />
            {gpuHistory.length > 2 && (
              <Sparkline data={gpuHistory} color="#a855f7" max={100} label="GPU Usage" unit="%"
                onExpand={() => setExpandedGraph({ data: gpuHistory, color: "#a855f7", max: 100, label: "GPU Usage", unit: "%" })} />
            )}
            {netDownHistory.length > 2 && (
              <Sparkline
                data={netDownHistory} color="#2ed573"
                max={Math.max(...netDownHistory, 100)}
                label="↓ Download" unit=" KB/s" formatValue={formatNetSpeed}
                onExpand={() => setExpandedGraph({ data: netDownHistory, color: "#2ed573", max: Math.max(...netDownHistory, 100), label: "↓ Download", unit: " KB/s", formatValue: formatNetSpeed })}
              />
            )}
            {netUpHistory.length > 2 && (
              <Sparkline
                data={netUpHistory} color="#ffa502"
                max={Math.max(...netUpHistory, 100)}
                label="↑ Upload" unit=" KB/s" formatValue={formatNetSpeed}
                onExpand={() => setExpandedGraph({ data: netUpHistory, color: "#ffa502", max: Math.max(...netUpHistory, 100), label: "↑ Upload", unit: " KB/s", formatValue: formatNetSpeed })}
              />
            )}
            {diskReadHistory.length > 2 && (
              <Sparkline
                data={diskReadHistory} color="#38bdf8"
                max={Math.max(...diskReadHistory, 1024)}
                label="Disk Read" unit=" B/s" formatValue={formatDiskSpeed}
                onExpand={() => setExpandedGraph({ data: diskReadHistory, color: "#38bdf8", max: Math.max(...diskReadHistory, 1024), label: "Disk Read", unit: " B/s", formatValue: formatDiskSpeed })}
              />
            )}
            {diskWriteHistory.length > 2 && (
              <Sparkline
                data={diskWriteHistory} color="#fb923c"
                max={Math.max(...diskWriteHistory, 1024)}
                label="Disk Write" unit=" B/s" formatValue={formatDiskSpeed}
                onExpand={() => setExpandedGraph({ data: diskWriteHistory, color: "#fb923c", max: Math.max(...diskWriteHistory, 1024), label: "Disk Write", unit: " B/s", formatValue: formatDiskSpeed })}
              />
            )}
          </div>
        </section>
      )}

      {/* Per-Core CPU */}
      {perCoreUsage.length > 0 && (
        <section>
          <button
            onClick={() => setShowPerCore(!showPerCore)}
            className="flex items-center gap-2 mb-3 px-1 group cursor-pointer"
          >
            <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em]
                           group-hover:text-white/50 transition-colors">
              Per-Core CPU ({perCoreUsage.length} cores)
            </h2>
            {showPerCore
              ? <ChevronUp className="w-3 h-3 text-white/25" />
              : <ChevronDown className="w-3 h-3 text-white/25" />
            }
          </button>
          {showPerCore && (
            <div className="glass-panel p-4 animate-fade-in">
              <div className={`grid gap-1.5 ${
                perCoreUsage.length <= 8 ? "grid-cols-1" :
                perCoreUsage.length <= 16 ? "grid-cols-2" : "grid-cols-3"
              }`}>
                {perCoreUsage.map((usage, i) => {
                  const barColor =
                    usage > 80 ? "bg-danger" : usage > 50 ? "bg-warning" : "bg-success";
                  const glowColor =
                    usage > 80 ? "shadow-danger/20" : usage > 50 ? "shadow-warning/20" : "shadow-success/20";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-white/30 w-6 text-right shrink-0">
                        {i}
                      </span>
                      <div className="flex-1 h-3 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 shadow-sm ${barColor} ${glowColor}`}
                          style={{ width: `${Math.min(usage, 100)}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-mono tabular-nums w-10 text-right ${
                        usage > 80 ? "text-danger" : usage > 50 ? "text-warning" : "text-white/40"
                      }`}>
                        {usage.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

      {/* Expanded Sparkline Modal */}
      {expandedGraph && (
        <ExpandedSparkline
          data={expandedGraph.data}
          color={expandedGraph.color}
          max={expandedGraph.max}
          label={expandedGraph.label}
          unit={expandedGraph.unit}
          formatValue={expandedGraph.formatValue}
          onClose={() => setExpandedGraph(null)}
        />
      )}
    </div>
  );
}
