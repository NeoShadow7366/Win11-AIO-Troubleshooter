import { useState, useRef, useEffect, useCallback } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useAdmin } from "./Layout";
import {
  ShieldCheck,
  Wrench,
  Wifi,
  RefreshCw,
  HardDrive,
  RefreshCcw,
  Trash2,
  Globe,
  Play,
  Loader2,
  Copy,
  Check,
  X,
  Info,
  Zap,
  Search,
  Shield,
  Battery,
  Monitor,
  MemoryStick,
  FolderOpen,
  HeartPulse,
  ChevronRight,
  SkipForward,
  CheckCircle2,
  Circle,
} from "lucide-react";
import type { CliOutput } from "../types";

type Category = "all" | "healthcare" | "repair" | "network" | "performance" | "security" | "diagnostics";

interface ToolDef {
  id: string;
  label: string;
  description: string;
  detailedInfo: string;
  icon: React.ReactNode;
  category: Exclude<Category, "all" | "healthcare">;
  needsAdmin: boolean;
  order: number; // Best-practice execution order within category
}

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: <Wrench className="w-3.5 h-3.5" /> },
  { key: "healthcare", label: "PC Healthcare", icon: <HeartPulse className="w-3.5 h-3.5" /> },
  { key: "repair", label: "System Repair", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { key: "network", label: "Network", icon: <Wifi className="w-3.5 h-3.5" /> },
  { key: "performance", label: "Performance", icon: <Zap className="w-3.5 h-3.5" /> },
  { key: "security", label: "Security & Policy", icon: <Shield className="w-3.5 h-3.5" /> },
  { key: "diagnostics", label: "Diagnostics", icon: <Search className="w-3.5 h-3.5" /> },
];

// Best-practice ordering:
// Repair: Restore Point → DISM → SFC → Check Disk → Component Cleanup
// Network: Flush DNS → Display DNS → Release/Renew → Reset IP → Reset Winsock → Restart Adapters
// Performance: Clear Temp → Disk Cleanup → Clear Update Cache → Defrag → Energy Report
// Security: Defender Scan → GP Update → View Credentials
// Diagnostics: System Info → DxDiag → Battery → WiFi → Memory Diag (restart!)

const TOOLS: ToolDef[] = [
  // ─── System Repair (ordered: safety → fix source → fix files → disk → cleanup) ───
  {
    id: "restore_point", label: "Create Restore Point", category: "repair", needsAdmin: true, order: 1,
    description: "Create a system restore point for safety",
    detailedInfo: "Always create a restore point before making major changes. Creates a snapshot you can revert to if something goes wrong. Run this FIRST before any repair operations. Requires System Protection to be enabled.",
    icon: <RefreshCcw className="w-5 h-5" />,
  },
  {
    id: "dism", label: "DISM Repair", category: "repair", needsAdmin: true, order: 2,
    description: "Repair the Windows component store",
    detailedInfo: "DISM repairs the component store that SFC uses as its source for replacement files. Run this BEFORE SFC — if the source files are corrupt, SFC can't fix anything. Requires internet. Takes 15-30 minutes.",
    icon: <Wrench className="w-5 h-5" />,
  },
  {
    id: "sfc", label: "SFC Scan", category: "repair", needsAdmin: true, order: 3,
    description: "Scan and repair protected system files",
    detailedInfo: "System File Checker scans and replaces corrupted system files. Run AFTER DISM Repair so SFC has clean source files to work with. Takes 10-15 minutes. Check results for 'found corrupt files' messages.",
    icon: <ShieldCheck className="w-5 h-5" />,
  },
  {
    id: "chkdsk", label: "Check Disk", category: "repair", needsAdmin: true, order: 4,
    description: "Verify disk integrity and fix file system errors",
    detailedInfo: "Examines the file system for logical and physical errors. Run after SFC if you still have issues. For system drive (C:), may be scheduled at next restart. Duration varies by disk size.",
    icon: <HardDrive className="w-5 h-5" />,
  },
  {
    id: "component_cleanup", label: "Component Cleanup", category: "repair", needsAdmin: true, order: 5,
    description: "Clean up superseded Windows components",
    detailedInfo: "Removes previous versions of updated components to free space. Run LAST in repair sequence — after DISM and SFC have finished their work. Safe but cannot be undone.",
    icon: <Trash2 className="w-5 h-5" />,
  },

  // ─── Network (ordered: least disruptive → most disruptive) ───
  {
    id: "flush_dns", label: "Flush DNS", category: "network", needsAdmin: true, order: 1,
    description: "Clear DNS resolver cache",
    detailedInfo: "Start here for DNS issues. Clears cached DNS entries, forcing fresh lookups. Instant and safe. Use when websites aren't loading or after changing DNS servers. May need browser restart.",
    icon: <Wifi className="w-5 h-5" />,
  },
  {
    id: "display_dns", label: "Display DNS Cache", category: "network", needsAdmin: false, order: 2,
    description: "Show contents of the DNS resolver cache",
    detailedInfo: "Read-only diagnostic. Shows all cached DNS entries with hostnames, IPs, and TTL values. Use to verify DNS is resolving correctly or to check if a domain is cached. Safe to run anytime.",
    icon: <Search className="w-5 h-5" />,
  },
  {
    id: "release_renew", label: "Release/Renew IP", category: "network", needsAdmin: false, order: 3,
    description: "Release and renew your IP address from DHCP",
    detailedInfo: "Try this if Flush DNS didn't help. Releases your DHCP lease and requests a new IP. Brief network interruption. Only works with DHCP (not static IPs). Useful for IP conflicts.",
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    id: "reset_ip", label: "Reset IP Stack", category: "network", needsAdmin: true, order: 4,
    description: "Reset TCP/IP stack to default",
    detailedInfo: "Escalate to this if Release/Renew didn't work. Resets TCP/IP by rewriting registry keys. Requires restart. You may need to reconfigure static IPs afterward.",
    icon: <Globe className="w-5 h-5" />,
  },
  {
    id: "reset_network", label: "Reset Winsock", category: "network", needsAdmin: true, order: 5,
    description: "Reset Winsock catalog to fix socket issues",
    detailedInfo: "Heavy-duty fix. Restores the Winsock catalog to default. Use as last resort for persistent network issues from corrupted configs or malware. Requires system restart.",
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    id: "restart_adapters", label: "Restart Adapters", category: "network", needsAdmin: true, order: 6,
    description: "Restart all network adapters",
    detailedInfo: "Nuclear option — disables and re-enables all network adapters. Equivalent to unplugging everything. Try all other options first. Brief full network interruption.",
    icon: <RefreshCcw className="w-5 h-5" />,
  },

  // ─── Performance (ordered: quick wins → deeper cleanup → analysis) ───
  {
    id: "clear_temp", label: "Clear Temp Files", category: "performance", needsAdmin: false, order: 1,
    description: "Delete all files from the temp folder",
    detailedInfo: "Start here — fastest way to reclaim space. Removes all files from your TEMP folder. Shows how much space was freed. Files in use are skipped safely. Great for regular maintenance.",
    icon: <FolderOpen className="w-5 h-5" />,
  },
  {
    id: "disk_cleanup", label: "Disk Cleanup", category: "performance", needsAdmin: false, order: 2,
    description: "Remove temporary files to free disk space",
    detailedInfo: "Broader than Clear Temp — also removes system cache, thumbnails, and other junk. The cleanup window may appear for selection review. Safe to run regularly.",
    icon: <Trash2 className="w-5 h-5" />,
  },
  {
    id: "clear_wucache", label: "Clear Update Cache", category: "performance", needsAdmin: true, order: 3,
    description: "Clear Windows Update download cache",
    detailedInfo: "Stops Windows Update services, deletes downloaded update files, and restarts services. Fixes stuck updates and frees space. Updates re-download as needed.",
    icon: <RefreshCw className="w-5 h-5" />,
  },
  {
    id: "defrag", label: "Defragment Drive", category: "performance", needsAdmin: true, order: 4,
    description: "Optimize and defragment the C: drive",
    detailedInfo: "Run after cleanup tools to optimize remaining data. For SSDs, performs TRIM instead of defrag. Duration varies by drive size and fragmentation level.",
    icon: <HardDrive className="w-5 h-5" />,
  },
  {
    id: "power_report", label: "Energy Report", category: "performance", needsAdmin: true, order: 5,
    description: "Generate a detailed power efficiency report",
    detailedInfo: "Diagnostic tool — analyzes your system for 60 seconds and generates an HTML report identifying power issues. Great for laptops with battery drain. Report saved to Desktop.",
    icon: <Zap className="w-5 h-5" />,
  },

  // ─── Security & Policy (ordered: scan → update → review) ───
  {
    id: "defender_scan", label: "Defender Quick Scan", category: "security", needsAdmin: false, order: 1,
    description: "Run a Windows Defender quick scan",
    detailedInfo: "Start with this. Quick malware scan of common threat locations. Takes a few minutes. Check Windows Security app for detailed results afterward.",
    icon: <Shield className="w-5 h-5" />,
  },
  {
    id: "gpupdate", label: "GP Update", category: "security", needsAdmin: true, order: 2,
    description: "Force Group Policy refresh",
    detailedInfo: "Forces immediate refresh of Group Policy settings. Normally refreshes every 90 minutes. Run after GP changes or when troubleshooting policy issues. Completes in seconds.",
    icon: <RefreshCcw className="w-5 h-5" />,
  },
  {
    id: "clear_creds", label: "View Credentials", category: "security", needsAdmin: false, order: 3,
    description: "List cached Windows credentials",
    detailedInfo: "Review stored credentials in Windows Credential Manager. Shows saved passwords for network shares and services. Provides instructions for removing specific entries.",
    icon: <Search className="w-5 h-5" />,
  },

  // ─── Diagnostics (ordered: general → specific → destructive) ───
  {
    id: "systeminfo", label: "System Information", category: "diagnostics", needsAdmin: false, order: 1,
    description: "Display detailed system configuration",
    detailedInfo: "Comprehensive system overview including OS version, hardware, hotfixes, network config. Takes 10-30 seconds. Great starting point for any troubleshooting.",
    icon: <Monitor className="w-5 h-5" />,
  },
  {
    id: "dxdiag", label: "DirectX Diagnostics", category: "diagnostics", needsAdmin: false, order: 2,
    description: "Run DirectX diagnostic tool and save report",
    detailedInfo: "Generates a report of DirectX capabilities, display adapters, sound, and input devices. Useful for gaming and graphics issues. Report saved to Desktop.",
    icon: <Monitor className="w-5 h-5" />,
  },
  {
    id: "battery_report", label: "Battery Report", category: "diagnostics", needsAdmin: false, order: 3,
    description: "Generate a detailed battery health report",
    detailedInfo: "HTML report showing battery health, capacity history, and usage patterns. Essential for diagnosing battery drain on laptops. Only works on battery-powered devices.",
    icon: <Battery className="w-5 h-5" />,
  },
  {
    id: "wifi_report", label: "WiFi Report", category: "diagnostics", needsAdmin: true, order: 4,
    description: "Generate a wireless network report",
    detailedInfo: "Detailed HTML report of WiFi history, disconnections, adapter info, and stats. Great for diagnosing intermittent WiFi issues. Report opens automatically.",
    icon: <Wifi className="w-5 h-5" />,
  },
  {
    id: "mem_diag", label: "Memory Diagnostic", category: "diagnostics", needsAdmin: true, order: 5,
    description: "Schedule Windows Memory Diagnostic test",
    detailedInfo: "⚠️ Run LAST — your computer will RESTART. Comprehensive RAM test for hardware errors causing crashes/BSODs. Save all work before proceeding!",
    icon: <MemoryStick className="w-5 h-5" />,
  },
];

/* ─── PC Healthcare Routine ─── */
interface HealthcareStep {
  toolId: string;
  reason: string;
}

const HEALTHCARE_ROUTINE: HealthcareStep[] = [
  { toolId: "restore_point", reason: "Create a safety checkpoint before making changes" },
  { toolId: "defender_scan", reason: "Scan for malware that could be causing issues" },
  { toolId: "clear_temp", reason: "Free up disk space by removing temporary files" },
  { toolId: "disk_cleanup", reason: "Deep clean system caches and unnecessary files" },
  { toolId: "dism", reason: "Repair the Windows component store (source for system files)" },
  { toolId: "sfc", reason: "Scan and repair protected system files using repaired store" },
  { toolId: "flush_dns", reason: "Clear stale DNS entries for better connectivity" },
  { toolId: "clear_wucache", reason: "Reset Windows Update to fix stuck updates" },
  { toolId: "chkdsk", reason: "Verify disk integrity (may schedule for next restart)" },
];

interface OutputLine {
  type: "stdout" | "stderr" | "info";
  text: string;
}

export default function QuickTools() {
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [copied, setCopied] = useState(false);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const terminalRef = useRef<HTMLDivElement>(null);
  const { isAdmin, promptAdmin } = useAdmin();

  // Healthcare routine state
  const [healthcareActive, setHealthcareActive] = useState(false);
  const [healthcareStep, setHealthcareStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [skippedSteps, setSkippedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const runTool = useCallback(async (toolId: string, onComplete?: () => void) => {
    if (runningTool) return;

    const tool = TOOLS.find((t) => t.id === toolId);
    if (tool?.needsAdmin && !isAdmin) {
      promptAdmin();
      return;
    }

    setRunningTool(toolId);
    setOutput((prev) => [...prev, { type: "info", text: `\n▸ Running ${tool?.label || toolId}...` }]);

    try {
      const onOutput = new Channel<CliOutput>();
      onOutput.onmessage = (msg: CliOutput) => {
        switch (msg.type) {
          case "Stdout":
            setOutput((prev) => [...prev, { type: "stdout", text: msg.line }]);
            break;
          case "Stderr":
            setOutput((prev) => [...prev, { type: "stderr", text: msg.line }]);
            break;
          case "Complete":
            setOutput((prev) => [...prev, { type: "info", text: `✓ Process exited with code ${msg.exit_code}` }]);
            setRunningTool(null);
            onComplete?.();
            break;
          case "Error":
            setOutput((prev) => [...prev, { type: "stderr", text: `Error: ${msg.message}` }]);
            setRunningTool(null);
            onComplete?.();
            break;
        }
      };
      await invoke("run_cli_tool", { toolId, onOutput });
    } catch (err) {
      setOutput((prev) => [...prev, { type: "stderr", text: `Failed to start: ${err}` }]);
      setRunningTool(null);
      onComplete?.();
    }
  }, [runningTool, isAdmin, promptAdmin]);

  const startHealthcare = () => {
    setHealthcareActive(true);
    setHealthcareStep(0);
    setCompletedSteps(new Set());
    setSkippedSteps(new Set());
    setActiveCategory("healthcare");
    setOutput([{ type: "info", text: "━━━ PC Healthcare Routine Started ━━━" },
               { type: "info", text: `${HEALTHCARE_ROUTINE.length} steps to complete. Run each step in order for best results.\n` }]);
  };

  const runHealthcareStep = () => {
    const step = HEALTHCARE_ROUTINE[healthcareStep];
    if (!step) return;
    runTool(step.toolId, () => {
      setCompletedSteps((prev) => new Set(prev).add(healthcareStep));
      if (healthcareStep < HEALTHCARE_ROUTINE.length - 1) {
        setHealthcareStep(healthcareStep + 1);
      } else {
        setOutput((prev) => [...prev, { type: "info", text: "\n━━━ PC Healthcare Routine Complete! ━━━" },
                                      { type: "info", text: "✓ All steps finished. Your system should be in better shape." }]);
        setHealthcareActive(false);
      }
    });
  };

  const skipHealthcareStep = () => {
    const step = HEALTHCARE_ROUTINE[healthcareStep];
    const tool = TOOLS.find((t) => t.id === step.toolId);
    setSkippedSteps((prev) => new Set(prev).add(healthcareStep));
    setOutput((prev) => [...prev, { type: "info", text: `⏭ Skipped: ${tool?.label}` }]);
    if (healthcareStep < HEALTHCARE_ROUTINE.length - 1) {
      setHealthcareStep(healthcareStep + 1);
    } else {
      setOutput((prev) => [...prev, { type: "info", text: "\n━━━ PC Healthcare Routine Complete! ━━━" }]);
      setHealthcareActive(false);
    }
  };

  const clearTerminal = () => setOutput([]);

  const copyOutput = async () => {
    const text = output.map((l) => l.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may fail */ }
  };

  const toggleInfo = (toolId: string) => {
    setExpandedInfo((prev) => (prev === toolId ? null : toolId));
  };

  const filteredTools =
    activeCategory === "all" || activeCategory === "healthcare"
      ? TOOLS
      : TOOLS.filter((t) => t.category === activeCategory);

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CATEGORIES.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => {
              setActiveCategory(key);
              if (key !== "healthcare") setHealthcareActive(false);
            }}
            className={`flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                       transition-all duration-200 border
                       ${key === "healthcare"
                         ? activeCategory === key
                           ? "border-success/40 bg-success/15 text-success"
                           : "border-success/20 bg-success/[0.05] text-success/60 hover:text-success hover:bg-success/10"
                         : activeCategory === key
                           ? "border-accent/30 bg-accent/15 text-accent"
                           : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/75 hover:bg-white/[0.05]"
                       }`}
          >
            {icon}
            {label}
            {key !== "all" && key !== "healthcare" && (
              <span className="text-[10px] opacity-50 ml-0.5">
                {TOOLS.filter((t) => t.category === key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Healthcare Routine Panel */}
      {activeCategory === "healthcare" && (
        <div className="glass-panel p-4 border-success/20 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-success/15">
                <HeartPulse className="w-4 h-4 text-success" />
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-white/90">PC Healthcare Routine</h3>
                <p className="text-[11px] text-white/40">
                  {healthcareActive
                    ? `Step ${healthcareStep + 1} of ${HEALTHCARE_ROUTINE.length}`
                    : "A guided 9-step system health checkup in best-practice order"
                  }
                </p>
              </div>
            </div>
            {!healthcareActive && (
              <button
                onClick={startHealthcare}
                disabled={runningTool !== null}
                className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-semibold
                           bg-success/90 text-black hover:bg-success disabled:opacity-40
                           transition-all duration-200"
              >
                <HeartPulse className="w-3.5 h-3.5" />
                Start Routine
              </button>
            )}
          </div>

          {/* Step List */}
          <div className="flex flex-col gap-1">
            {HEALTHCARE_ROUTINE.map((step, i) => {
              const tool = TOOLS.find((t) => t.id === step.toolId);
              const isComplete = completedSteps.has(i);
              const isSkipped = skippedSteps.has(i);
              const isCurrent = healthcareActive && i === healthcareStep;
              const isRunning = runningTool === step.toolId;
              const isPending = healthcareActive && i > healthcareStep;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200
                             ${isCurrent ? "bg-white/[0.06] border border-accent/20" : ""}
                             ${isComplete ? "opacity-60" : ""}
                             ${isSkipped ? "opacity-30" : ""}
                             ${isPending ? "opacity-40" : ""}`}
                >
                  {/* Step indicator */}
                  <div className="w-5 flex justify-center shrink-0">
                    {isComplete ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : isSkipped ? (
                      <SkipForward className="w-4 h-4 text-white/30" />
                    ) : isRunning ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    ) : isCurrent ? (
                      <ChevronRight className="w-4 h-4 text-accent" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-white/15" />
                    )}
                  </div>

                  {/* Step info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[12px] font-medium ${isCurrent ? "text-white/90" : "text-white/60"}`}>
                        {i + 1}. {tool?.label}
                      </span>
                      {tool?.needsAdmin && (
                        <span className="text-[9px] text-warning/50 font-semibold uppercase">Admin</span>
                      )}
                    </div>
                    <span className="text-[11px] text-white/30 truncate block">{step.reason}</span>
                  </div>

                  {/* Action buttons for current step */}
                  {isCurrent && !isRunning && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={skipHealthcareStep}
                        className="flex items-center gap-1 h-6 px-2.5 rounded text-[10px] font-medium
                                   text-white/30 hover:text-white/60 border border-white/10
                                   hover:bg-white/[0.05] transition-all"
                      >
                        <SkipForward className="w-3 h-3" />
                        Skip
                      </button>
                      <button
                        onClick={runHealthcareStep}
                        className="flex items-center gap-1 h-6 px-3 rounded text-[10px] font-semibold
                                   bg-accent/90 text-black hover:bg-accent transition-all"
                      >
                        <Play className="w-3 h-3" />
                        Run
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tool Grid */}
      {activeCategory !== "healthcare" && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 overflow-y-auto max-h-[320px]">
          {filteredTools.map((tool) => {
            const isRunning = runningTool === tool.id;
            const disabled = runningTool !== null && !isRunning;
            const isInfoExpanded = expandedInfo === tool.id;
            return (
              <div
                key={tool.id}
                className={`glass-panel flex flex-col gap-2.5 p-3.5
                           transition-all duration-300 group
                           ${isRunning ? "border-accent/30 bg-accent/[0.04]" : ""}
                           ${disabled ? "opacity-50" : "hover:bg-white/[0.05]"}`}
              >
                <div className="flex items-center justify-between">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-lg
                                  transition-colors duration-300
                                  ${isRunning
                                    ? "bg-accent/20 text-accent"
                                    : "bg-white/[0.06] text-white/50 group-hover:text-white/70"
                                  }`}>
                    {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : tool.icon}
                  </div>
                  <div className="flex items-center gap-1">
                    {tool.needsAdmin && (
                      <span className="text-[9px] text-warning/50 font-semibold uppercase" title="Requires admin">
                        Admin
                      </span>
                    )}
                    <button
                      onClick={() => toggleInfo(tool.id)}
                      className={`flex items-center justify-center w-6 h-6 rounded-md
                                 transition-all duration-200
                                 ${isInfoExpanded
                                   ? "text-accent bg-accent/10"
                                   : "text-white/20 hover:text-white/50 hover:bg-white/[0.05]"
                                 }`}
                      title="Show details"
                    >
                      <Info className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-[12.5px] font-semibold text-white/85 mb-0.5">{tool.label}</h3>
                  <p className="text-[11px] text-white/35 leading-relaxed line-clamp-2">{tool.description}</p>
                </div>

                {isInfoExpanded && (
                  <div className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.05] animate-fade-in">
                    <p className="text-[11px] text-white/55 leading-relaxed">{tool.detailedInfo}</p>
                  </div>
                )}

                <button
                  id={`run-${tool.id}`}
                  onClick={() => runTool(tool.id)}
                  disabled={disabled || isRunning}
                  className={`flex items-center justify-center gap-1.5 h-7 w-full rounded-lg
                             text-[11px] font-semibold transition-all duration-200
                             ${isRunning
                               ? "bg-accent/20 text-accent cursor-wait"
                               : "bg-white/[0.06] text-white/60 hover:bg-accent/15 hover:text-accent border border-white/[0.06] hover:border-accent/30"
                             }
                             disabled:cursor-not-allowed`}
                >
                  {isRunning ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Running...</>
                  ) : (
                    <><Play className="w-3 h-3" /> Run</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal Output */}
      <div className="flex flex-col flex-1 glass-panel overflow-hidden min-h-[180px]">
        <div className="flex items-center justify-between px-4 h-9 border-b border-white/[0.06]
                        bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
            </div>
            <span className="text-[11px] text-white/30 font-mono ml-2">Terminal Output</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={copyOutput}
              className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium
                         text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all duration-200">
              {copied ? <><Check className="w-3 h-3 text-success" /><span className="text-success">Copied</span></> : <><Copy className="w-3 h-3" />Copy</>}
            </button>
            <button onClick={clearTerminal}
              className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium
                         text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all duration-200">
              <X className="w-3 h-3" />Clear
            </button>
          </div>
        </div>

        <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 bg-[#07070f]">
          {output.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[12px] text-white/15 font-mono">
                Select a tool and click Run to begin...
              </span>
            </div>
          ) : (
            <pre className="terminal-output whitespace-pre-wrap break-words">
              {output.map((line, i) => (
                <div key={i} className={line.type === "stderr" ? "stderr" : line.type === "info" ? "info" : "stdout"}>
                  {line.text}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
