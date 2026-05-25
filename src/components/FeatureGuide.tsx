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
  Thermometer,
  Power,
  Network,
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
    summary: "Real-time system health overview with sparkline graphs and health score.",
    description:
      "The Dashboard provides a comprehensive at-a-glance view of your system's health. It displays live CPU, memory, and disk usage with sparkline trend graphs, per-disk storage cards with drive types and filesystems, your internal and external IP addresses, and detailed hardware specifications. A health score (0–100) aggregates key metrics with per-category breakdowns.",
    howToUse: [
      "Open the app — the Dashboard is the default landing page.",
      "CPU, Memory, and Disk sparklines update automatically every few seconds showing recent trends.",
      "The health score at the top shows an overall 0–100 rating with category-level detail (disk, memory, uptime, etc.).",
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
      "The Process Manager lists all running processes with their CPU usage, memory consumption, and status. Click any process to open a detailed insight panel showing PID, path, command line, threads, company info, start time, and more. Processes display their application icons for easy identification.",
    howToUse: [
      "Click any process row to open its detail panel on the right side.",
      "Use the search bar to filter processes by name.",
      "Click column headers (PID, Name, CPU%, Memory, Status) to sort.",
      "Click 'What is this?' in the detail panel to search Google for information about a process.",
      "Click the ⭐ star button to favorite a process for quick access in App Insights.",
      "Click the 🗑️ trash button on a process row to terminate it (a confirmation dialog will appear).",
      "Toggle 'Auto' to enable/disable automatic 3-second refresh.",
    ],
    tips: [
      "Favorited processes are persisted across sessions and appear in App Insights.",
      "Process icons are cached after first load for faster display.",
      "Killing system processes may require admin privileges.",
    ],
  },
  {
    id: "services",
    label: "Services Manager",
    category: "Monitoring",
    icon: <Settings className="w-5 h-5" />,
    summary: "Browse, control, and inspect Windows services with start/stop/restart actions.",
    description:
      "The Services Manager displays all Windows services with their current status and start type. You can start, stop, and restart services directly. Change startup type between Automatic, Manual, and Disabled. The insight panel provides detailed WMI data including description, executable path, start mode, and process ID.",
    howToUse: [
      "Click any service row to view its insight panel.",
      "Use the Start/Stop/Restart buttons to control services (requires admin).",
      "Filter services by status using the All/Running/Stopped tabs.",
      "Search by service name or display name using the search bar.",
      "Change startup type using the dropdown in the detail panel.",
      "Click 'What is this?' to search Google for information about a service.",
      "Favorite services with the ⭐ button — they appear in Service Insights.",
    ],
    tips: [
      "Starting/stopping services requires admin privileges. You'll be prompted to relaunch if needed.",
      "Be cautious when stopping services — some are critical to system operation.",
    ],
  },
  {
    id: "hardware",
    label: "Hardware Health",
    category: "Monitoring",
    icon: <Thermometer className="w-5 h-5" />,
    summary: "Monitor CPU temperatures, GPU stats, disk S.M.A.R.T. data, and RAM modules.",
    description:
      "Hardware Health provides real-time monitoring of your system's physical components. View CPU thermal zone temperatures with color-coded warnings, NVIDIA GPU temperature and utilization, physical disk S.M.A.R.T. data including health status, wear level, power-on hours, and read/write errors, plus detailed RAM module information.",
    howToUse: [
      "Data loads automatically and refreshes every 5 seconds.",
      "CPU temperatures are color-coded: green (<60°C), amber (60–80°C), red (>80°C).",
      "GPU monitoring is available for NVIDIA GPUs with nvidia-smi installed.",
      "Disk health cards show status badges (Healthy/Warning/Unhealthy) and S.M.A.R.T. metrics.",
      "SSD wear level is displayed as a progress bar (red when approaching 100%).",
      "RAM section shows per-module details: manufacturer, speed, and capacity.",
    ],
    tips: [
      "CPU temperature data may require administrator privileges or may be unavailable on some hardware.",
      "If no GPU data appears, your system may not have an NVIDIA GPU or nvidia-smi may not be installed.",
      "Power-on hours gives you an idea of drive age — typical SSDs last 30,000–50,000+ hours.",
    ],
  },
  {
    id: "network",
    label: "Network Diagnostics",
    category: "Monitoring",
    icon: <Network className="w-5 h-5" />,
    summary: "TCP connections, ping, traceroute, DNS lookup, and WiFi diagnostics.",
    description:
      "Network Diagnostics provides five diagnostic tools in a tabbed interface. View all active TCP connections with process names, run ping tests to any host, trace network routes with traceroute, perform DNS record lookups, and check WiFi signal strength and connection details.",
    howToUse: [
      "Use the tabs at the top to switch between tools: Connections, Ping, Traceroute, DNS, WiFi.",
      "Connections: View all active TCP connections with local/remote addresses, state, and owning process.",
      "Ping: Enter a hostname or IP, set the count, and click Run to stream ping results.",
      "Traceroute: Enter a destination to trace the network path with hop-by-hop results.",
      "DNS: Enter a domain name to view all DNS records (A, AAAA, MX, CNAME, etc.).",
      "WiFi: View current connection details including SSID, signal strength, channel, and speeds.",
    ],
    tips: [
      "Ping and traceroute stream results in real-time — you'll see each line as it arrives.",
      "Use DNS lookup to diagnose domain resolution issues or check MX records for email.",
      "WiFi tab shows 'Not connected' if no wireless adapter is active.",
    ],
  },
  {
    id: "eventviewer",
    label: "Event Viewer",
    category: "Analysis",
    icon: <FileText className="w-5 h-5" />,
    summary: "Browse and search Windows event logs with preset date ranges and advanced filters.",
    description:
      "The Event Viewer provides a unified interface for browsing Windows Event Logs across System, Application, and Security sources. Use preset date ranges (Today, 7 Days, 30 Days) for quick searches or define custom time windows. Filter by severity level and source name, with full pagination support.",
    howToUse: [
      "Click a preset button (Today, Last 7 Days, Last 30 Days) to set the date range.",
      "Or select 'Custom' to specify your own date range with the datetime pickers.",
      "Toggle log sources (System, Application, Security) to include/exclude specific logs.",
      "Use the level dropdown to filter by Critical, Error, Warning, or All.",
      "Type in the source filter to narrow results by provider name.",
      "Click the Search button to execute the query.",
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
    summary: "Browse all running apps with process details, event logs, and file paths.",
    description:
      "App Insights shows all running applications grouped by name on load. Click any app to open a detail panel showing all matching processes with PID, CPU, and memory stats, related event log entries, and file paths (exe path, install directory, AppData folder). Favorited processes appear at the top for quick access.",
    howToUse: [
      "All running applications load automatically, grouped by name with process counts.",
      "Use the search bar at the top to filter the app list by name.",
      "Click any app card to open its detail panel on the right.",
      "Click file paths (Exe Path, Install Dir, AppData) to open them in File Explorer.",
      "Click 'What is this?' to search Google for information about the app.",
      "Click 'View in Processes' to navigate to the Process Manager for detailed inspection.",
      "Star apps as favorites — they appear in a pinned section at the top.",
    ],
    tips: [
      "Apps are grouped by base name — multiple instances (e.g., 5 chrome processes) show as one card with total resource usage.",
      "Favorites persist across sessions.",
    ],
  },
  {
    id: "serviceinsights",
    label: "Service Insights",
    category: "Analysis",
    icon: <Zap className="w-5 h-5" />,
    summary: "Detailed service analysis with favorites, WMI data, and related event logs.",
    description:
      "Service Insights provides a dedicated view for analyzing Windows services. Favorited services appear prominently at the top. Selecting any service shows its WMI-sourced details (description, executable path, start mode, state, dependencies, PID) alongside related System event log entries filtered by that service's source name.",
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
      "Quick Tools provides a curated collection of Windows troubleshooting and maintenance commands. Tools are organized into categories: System Repair (DISM, SFC, Check Disk), Network (DNS flush, IP reset, Winsock), Performance (temp cleanup, disk cleanup, Empty Recycle Bin, defrag), Security (Defender scan, GP Update), and Diagnostics (systeminfo, DxDiag, battery report). PC Health Check runs a full automated repair sequence.",
    howToUse: [
      "Browse tools by clicking category tabs at the top, or view all tools at once.",
      "Select a tool card to see its description and the Run button.",
      "Click 'Run' to execute the tool — output streams in real-time to the terminal.",
      "Use the Copy button to copy terminal output to your clipboard.",
      "Select 'PC Health' to run a full automated check (creates restore point, runs DISM, SFC, etc.).",
      "Most tools require admin privileges — you'll be prompted to relaunch if needed.",
    ],
    tips: [
      "Run SFC Scan after DISM Repair for best results — DISM fixes the source files SFC uses.",
      "Always restart your computer after running Reset Winsock or Reset IP.",
      "Disk Cleanup, Clear Temp Files, and Empty Recycle Bin are safe to run regularly.",
    ],
  },
  {
    id: "startup",
    label: "Startup Manager",
    category: "Tools",
    icon: <Power className="w-5 h-5" />,
    summary: "Control auto-starting programs with impact ratings and toggle switches.",
    description:
      "The Startup Manager lists all programs that run automatically when Windows starts. Items are collected from the Registry (HKLM and HKCU Run keys), Startup Folders, and Scheduled Tasks with logon triggers. Each item shows a color-coded startup impact rating (High, Medium, Low) to help identify programs that slow down boot time.",
    howToUse: [
      "Toggle the switch next to any item to enable or disable it at startup.",
      "Use the source filter tabs (Registry, Folders, Tasks) to filter by startup source.",
      "Filter by Enabled/Disabled status using the toggle buttons.",
      "Search by name, publisher, or command using the search bar.",
      "Impact badges show estimated boot impact: High (red), Medium (amber), Low (green).",
      "Click the 🔗 link icon on any item to search Google for 'What is this?'.",
      "Click Refresh to rescan all startup sources.",
    ],
    tips: [
      "HKLM registry and scheduled task changes require admin privileges. HKCU items can be toggled without admin.",
      "Disabling high-impact startup items can significantly improve boot time.",
      "When in doubt, use 'What is this?' to research an item before disabling it.",
    ],
  },
  {
    id: "bsod",
    label: "BSOD Analyzer",
    category: "Analysis",
    icon: <Skull className="w-5 h-5" />,
    summary: "Analyze crash dumps and BSOD history with web search for solutions.",
    description:
      "The BSOD Analyzer scans your system for minidump crash files and BSOD history records from the Windows Event Log. Selecting a dump file provides a structured analysis showing the bug check code, faulting module, crash-time process, and parameters. BSOD history entries are clickable — opening a detail panel with full error info and a 'Search Web for Fix' button. Requires admin privileges to access crash data.",
    howToUse: [
      "The page automatically scans for minidump files in C:\\Windows\\Minidump.",
      "Click any dump file in the left panel to analyze it.",
      "The analysis panel shows the bug check code, faulting module, and parameters.",
      "Click 'Search Web' to find solutions for the specific bug check code.",
      "Click 'Open File' to open the dump in a debugger, or 'Open Folder' to browse to it.",
      "Click any BSOD history entry to open its detail panel with full error information.",
      "Click 'Search Web for Fix' in the BSOD detail panel to find troubleshooting guides.",
    ],
    tips: [
      "This feature requires admin privileges — without admin, you'll see a prompt to relaunch.",
      "Common bug check codes: IRQL_NOT_LESS_OR_EQUAL (driver issues), PAGE_FAULT_IN_NONPAGED_AREA (memory issues).",
      "Running SFC and DISM from Quick Tools can help resolve system file corruption that causes BSODs.",
    ],
  },
  {
    id: "admin",
    label: "Admin Mode",
    category: "Tools",
    icon: <ShieldCheck className="w-5 h-5" />,
    summary: "Understand admin privileges and how to relaunch with elevation.",
    description:
      "Many troubleshooting features require administrator privileges to function properly. The app detects whether it's running as admin and displays a banner when it's not. You can relaunch the app with admin elevation at any time via UAC. Features that need admin include: Quick Tools, service control, BSOD analysis, security event logs, startup manager (HKLM/tasks), and some hardware sensors.",
    howToUse: [
      "Check the badge in the page header — it shows 'Admin' (green) or 'Not Admin' (amber).",
      "If you see the amber warning banner at the top, click 'Relaunch as Admin' to elevate.",
      "When attempting an admin-only action, you'll be prompted automatically.",
      "The app relaunches through UAC — you'll see a Windows permission dialog.",
      "After admin launch, click 'Got It' and switch to the new admin window.",
    ],
    tips: [
      "Features that need admin: Quick Tools, service start/stop, BSOD Analyzer, Security event logs, HKLM startup items, CPU temperature sensors.",
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
