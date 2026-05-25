import { useState } from "react";
import {
  X,
  LayoutDashboard,
  Cpu,
  Settings,
  FileText,
  Search,
  Zap,
  Wrench,
  Skull,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

interface FeatureDef {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  summary: string;
  description: string;
  howToUse: string[];
  tips?: string[];
}

const FEATURES: FeatureDef[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    category: "Monitoring",
    icon: <LayoutDashboard className="w-5 h-5" />,
    summary: "Real-time system health overview with resource gauges and hardware info.",
    description:
      "The Dashboard provides a comprehensive at-a-glance view of your system's health. It displays live CPU, memory, and disk usage gauges, per-disk storage cards with drive types and filesystems, your internal and external IP addresses, and detailed hardware specifications.",
    howToUse: [
      "Open the app — the Dashboard is the default landing page.",
      "CPU, Memory, and Disk gauges update automatically every few seconds.",
      "Each disk drive appears as a separate card showing name, type, filesystem, and a usage bar.",
      "Click the copy icon next to any IP address to copy it to your clipboard.",
      "System specs (OS, CPU, GPU, hostname, uptime) are shown at the bottom.",
    ],
    tips: [
      "High CPU or memory usage doesn't always indicate a problem — check the Process Manager for which processes are consuming resources.",
      "If your external IP shows as 'Unavailable', check your internet connection.",
    ],
  },
  {
    id: "processes",
    label: "Process Manager",
    category: "Monitoring",
    icon: <Cpu className="w-5 h-5" />,
    summary: "View, inspect, and manage running processes with detailed insights.",
    description:
      "The Process Manager lists all running processes with their CPU usage, memory consumption, and status. Click any process to open a detailed insight panel showing command line, threads, company info, file path, and more.",
    howToUse: [
      "Click any process row to open its detail panel on the right side.",
      "Use the search bar to filter processes by name.",
      "Click 'What is this?' to search Google for information about a process.",
      "Click the ⭐ star button to favorite a process — it will appear in App Insights.",
      "Toggle 'Show System Processes' to include/exclude system-level processes.",
      "Click the ✕ kill button on a process row to terminate it (requires admin).",
    ],
    tips: [
      "Favorited processes are persisted across sessions and appear in App Insights for quick monitoring.",
      "Process icons are cached after first load for faster display.",
    ],
  },
  {
    id: "services",
    label: "Services Manager",
    category: "Monitoring",
    icon: <Settings className="w-5 h-5" />,
    summary: "Browse, control, and inspect Windows services with start/stop/restart actions.",
    description:
      "The Services Manager displays all Windows services with their current status and start type. You can start, stop, and restart services directly from the interface. The insight panel provides detailed WMI data including description, executable path, start mode, and process ID.",
    howToUse: [
      "Click any service row to view its insight panel.",
      "Use the Start/Stop/Restart buttons to control services (requires admin privileges).",
      "Filter services by status using the All/Running/Stopped tabs.",
      "Click 'What is this?' to search Google for information about a service.",
      "Favorite services with the ⭐ button — they appear in Service Insights.",
    ],
    tips: [
      "Starting/stopping services requires admin privileges. If not running as admin, you'll be prompted to relaunch.",
      "Be cautious when stopping services — some are critical to system operation.",
    ],
  },
  {
    id: "eventviewer",
    label: "Event Viewer",
    category: "Analysis",
    icon: <FileText className="w-5 h-5" />,
    summary: "Browse and search Windows event logs with preset date ranges and advanced filters.",
    description:
      "The Event Viewer provides a unified interface for browsing Windows Event Logs across System, Application, and Security sources. Use preset date ranges for quick searches or define custom time windows. Filter by severity level and source name, with full pagination support.",
    howToUse: [
      "Click a preset button (Today, Last 7 Days, Last 30 Days) for instant results.",
      "Or select 'Custom' to specify your own date range with the datetime pickers.",
      "Toggle log sources (System, Application, Security) to include/exclude specific logs.",
      "Use the level dropdown to filter by Critical, Error, Warning, or All.",
      "Type in the source filter to narrow results by provider name.",
      "Click any row to expand and read the full event message.",
      "Use the pagination controls at the bottom to navigate through large result sets.",
    ],
    tips: [
      "Security logs may require admin privileges to read.",
      "'Last 7 Days' with 'Error' level is great for diagnosing recent issues.",
    ],
  },
  {
    id: "appinsights",
    label: "App Insights",
    category: "Analysis",
    icon: <Search className="w-5 h-5" />,
    summary: "Search for application processes and view correlated event logs and file paths.",
    description:
      "App Insights lets you search for any application or process by name and instantly see all matching running processes, related event log entries, and file system paths (exe path, install directory, AppData folder). Favorited processes from the Process Manager appear at the top for quick access.",
    howToUse: [
      "Type an application name (e.g., 'chrome', 'svchost') in the search bar and press Enter.",
      "View matching processes in the left panel with PID, CPU, and memory stats.",
      "Related event logs appear in the right panel.",
      "Click any file path (Exe Path, Install Dir, AppData) to open it in File Explorer.",
      "Click favorited processes at the top to load their insights instantly.",
    ],
  },
  {
    id: "serviceinsights",
    label: "Service Insights",
    category: "Analysis",
    icon: <Zap className="w-5 h-5" />,
    summary: "Detailed service analysis with favorites, WMI data, and related event logs.",
    description:
      "Service Insights provides a dedicated view for analyzing Windows services. Favorited services appear prominently at the top. Selecting any service shows its WMI-sourced details (description, executable path, start mode, state, PID) alongside related System event log entries filtered by that service's source name.",
    howToUse: [
      "Favorited services from the Services Manager appear at the top of the page.",
      "Use the search bar to find any service by name or display name.",
      "Click a service card to open its detail panel on the right.",
      "The detail panel shows WMI data and related event log entries.",
      "Use 'What is this?' to search Google for information about the service.",
    ],
  },
  {
    id: "quicktools",
    label: "Quick Tools",
    category: "Tools",
    icon: <Wrench className="w-5 h-5" />,
    summary: "One-click system repair and maintenance commands organized by category.",
    description:
      "Quick Tools provides a curated collection of Windows troubleshooting and maintenance commands that can be run with a single click. Tools are organized into categories: System Repair, Network, Performance, Security & Policy, and Diagnostics. Each tool includes a detailed description explaining what it does and when to use it.",
    howToUse: [
      "Browse tools by clicking category tabs at the top, or view all tools at once.",
      "Click the ℹ️ icon on any tool card to read its detailed description.",
      "Click 'Run' to execute the tool — output appears in the terminal below.",
      "Use the Copy button to copy terminal output to clipboard.",
      "Most tools require admin privileges — you'll be prompted to relaunch if needed.",
    ],
    tips: [
      "Run SFC Scan after DISM Repair for best results — DISM fixes the source files SFC uses.",
      "Always restart your computer after running Reset Winsock or Reset IP.",
      "Disk Cleanup and Clear Temp Files are safe to run regularly.",
    ],
  },
  {
    id: "bsod",
    label: "BSOD Analyzer",
    category: "Analysis",
    icon: <Skull className="w-5 h-5" />,
    summary: "Analyze Windows minidump files and blue screen crash history.",
    description:
      "The BSOD Analyzer scans your system for minidump crash files and BSOD history records. Selecting a dump file provides a structured analysis showing the bug check code, faulting module, crash-time process, OS version, and bug check parameters. You can search the web for solutions or open the dump file directly.",
    howToUse: [
      "The page automatically scans for minidump files in C:\\Windows\\Minidump.",
      "Click any dump file in the left panel to analyze it.",
      "The analysis panel shows the bug check code, faulting module, and parameters.",
      "Click 'Search Web' to find solutions for the specific bug check code.",
      "Click 'Open File' to open the dump in a debugger, or 'Open Folder' to browse to it.",
      "BSOD history cards below show past blue screen events with descriptions.",
    ],
    tips: [
      "No dump files? That's good — your system hasn't had any blue screen crashes!",
      "Common bug check codes: IRQL_NOT_LESS_OR_EQUAL (driver issues), PAGE_FAULT_IN_NONPAGED_AREA (memory issues).",
    ],
  },
  {
    id: "admin",
    label: "Admin Mode",
    category: "Tools",
    icon: <ShieldCheck className="w-5 h-5" />,
    summary: "Understand admin privileges and how to relaunch with elevation.",
    description:
      "Many troubleshooting features require administrator privileges to function properly. The app detects whether it's running as admin and displays a banner and badge when it's not. You can relaunch the app with admin elevation at any time via UAC.",
    howToUse: [
      "Check the badge in the page header — it shows 'Admin' (green) or 'Not Admin' (amber).",
      "If you see the amber warning banner, click 'Relaunch as Admin' to elevate.",
      "When attempting an admin-only action (Quick Tools, service control), you'll be prompted automatically.",
      "The app relaunches through UAC — you'll see a Windows permission dialog.",
    ],
    tips: [
      "Features that need admin: Quick Tools, service start/stop/restart, Security event logs, killing protected processes.",
      "You can dismiss the warning banner if you don't need admin features right now.",
    ],
  },
];

const CATEGORIES = ["All", "Monitoring", "Analysis", "Tools"];

interface FeatureGuideProps {
  open: boolean;
  onClose: () => void;
}

export default function FeatureGuide({ open, onClose }: FeatureGuideProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("All");

  if (!open) return null;

  const selected = FEATURES.find((f) => f.id === selectedId);
  const filtered =
    categoryFilter === "All"
      ? FEATURES
      : FEATURES.filter((f) => f.category === categoryFilter);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-[66vw] max-w-[1200px]
                      glass-panel-strong border-l border-white/[0.08]
                      flex flex-col animate-slide-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[14px] font-semibold text-white/90">Feature Guide</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md
                       text-white/30 hover:text-white/70 hover:bg-white/[0.06]
                       transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-white/[0.04] shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategoryFilter(cat); setSelectedId(null); }}
              className={`h-7 px-3 rounded-md text-[11px] font-medium transition-all duration-200
                         ${categoryFilter === cat
                           ? "bg-accent/15 text-accent border border-accent/25"
                           : "text-white/40 hover:text-white/70 hover:bg-white/[0.04] border border-transparent"
                         }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {/* Feature List */}
          <div className={`flex flex-col overflow-y-auto border-r border-white/[0.04] transition-all duration-300
                          ${selected ? "w-[280px] min-w-[280px]" : "w-full"}`}>
            {filtered.map((feature) => (
              <button
                key={feature.id}
                onClick={() => setSelectedId(feature.id)}
                className={`flex items-center gap-3 px-4 py-3 text-left transition-all duration-200
                           border-b border-white/[0.03]
                           ${selectedId === feature.id
                             ? "bg-accent/[0.06] border-l-2 border-l-accent"
                             : "hover:bg-white/[0.04] border-l-2 border-l-transparent"
                           }`}
              >
                <span className={`shrink-0 ${selectedId === feature.id ? "text-accent" : "text-white/40"}`}>
                  {feature.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <span className={`text-[13px] font-medium block truncate
                    ${selectedId === feature.id ? "text-white/90" : "text-white/70"}`}>
                    {feature.label}
                  </span>
                  {!selected && (
                    <span className="text-[11px] text-white/35 block truncate mt-0.5">
                      {feature.summary}
                    </span>
                  )}
                </div>
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-colors
                  ${selectedId === feature.id ? "text-accent/50" : "text-white/15"}`} />
              </button>
            ))}
          </div>

          {/* Detail Card */}
          {selected && (
            <div className="flex-1 overflow-y-auto p-5 animate-fade-in">
              {/* Title */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/15 text-accent">
                  {selected.icon}
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-white/90">{selected.label}</h3>
                  <span className="text-[11px] text-accent/60 font-medium uppercase tracking-wider">
                    {selected.category}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-[13px] text-white/65 leading-relaxed mb-5">
                {selected.description}
              </p>

              {/* How to Use */}
              <div className="mb-5">
                <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2.5">
                  How to Use
                </h4>
                <ol className="flex flex-col gap-2">
                  {selected.howToUse.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-[12.5px] text-white/60 leading-relaxed">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full
                                       bg-accent/10 text-accent text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tips */}
              {selected.tips && selected.tips.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2.5">
                    Tips
                  </h4>
                  <div className="flex flex-col gap-2">
                    {selected.tips.map((tip, i) => (
                      <div
                        key={i}
                        className="flex gap-2 text-[12px] text-white/50 leading-relaxed
                                   bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.05]"
                      >
                        <span className="text-warning shrink-0">💡</span>
                        {tip}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
