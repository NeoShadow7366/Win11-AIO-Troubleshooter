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
  Users,
  History,
  CircuitBoard,
  CalendarClock,
  Package,
  PieChart,
  CloudDownload,
  BarChart3,
  Bell,
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
    summary: "Real-time system health with GPU, sparklines, memory composition, and health score.",
    description:
      "The Dashboard provides a comprehensive at-a-glance view of your system's health. It displays live CPU, memory, GPU, and disk usage with sparkline trend graphs. Features include a GPU gauge with temperature and utilization, CPU clock speed display, disk I/O sparklines for read/write throughput, a memory composition bar (used, cached, paged pool, available), and extended 120-point history. Click any sparkline to expand it into a full modal view. A health score (0–100) aggregates key metrics with per-category breakdowns. Also shows per-disk storage cards, IP addresses, and hardware specs.",
    howToUse: [
      "Open the app — the Dashboard is the default landing page.",
      "CPU, Memory, GPU, and Disk sparklines update automatically every few seconds.",
      "Click any sparkline graph to expand it into a larger, detailed modal view.",
      "The GPU gauge shows real-time utilization and temperature (NVIDIA GPUs).",
      "CPU clock speed is displayed alongside usage percentage.",
      "The memory composition bar shows the breakdown of used, cached, paged pool, and available memory.",
      "The health score at the top shows an overall 0–100 rating with category-level detail.",
      "Each disk drive appears as a separate card showing name, type, filesystem, and usage.",
      "Click the copy icon next to any IP address to copy it to your clipboard.",
    ],
    tips: [
      "Extended history keeps 120 data points — scroll the sparkline to see past trends.",
      "High CPU or memory usage doesn't always indicate a problem — check the Process Manager for details.",
      "GPU monitoring requires an NVIDIA GPU with nvidia-smi installed.",
    ],
  },
  {
    id: "processes",
    label: "Process Manager",
    category: "Monitoring",
    icon: <Cpu className="w-5 h-5" />,
    summary: "Full-featured process manager with tree view, affinity, DLLs, VirusTotal, and more.",
    description:
      "The Process Manager lists all running processes with CPU, memory, and disk I/O usage. Features include: end process trees, suspend/resume processes, CPU affinity editor, efficiency mode, process tree view, group by app name, customizable columns, CSV export, loaded DLL inspector, VirusTotal hash scanner, per-process network connections viewer, and favorites. Click any process to open a rich detail panel with PID, path, command line, threads, company info, and five collapsible inspector sections.",
    howToUse: [
      "Click any process row to open its detail panel on the right side.",
      "Use the search bar to filter processes by name.",
      "Click column headers to sort. Use the eye icon to show/hide columns.",
      "Toggle tree view with the tree icon, or group by app name with the group icon.",
      "Right-click context menu: End Process Tree, Suspend/Resume, Set Priority, Efficiency Mode.",
      "In the detail panel, expand 'CPU Affinity' to assign specific cores.",
      "Expand 'Loaded DLLs' to inspect modules with a search filter.",
      "Expand 'VirusTotal' to compute SHA256 hash and check the file on VirusTotal.",
      "Expand 'Network' to see active TCP/UDP connections for that process.",
      "Click the CSV icon in the toolbar to export the process list.",
      "Click the ⭐ star to favorite a process, 🗑️ trash to terminate it.",
    ],
    tips: [
      "Suspend pauses a process without killing it — Resume brings it back.",
      "Efficiency Mode (EcoQoS) reduces a process's power consumption on supported CPUs.",
      "The VirusTotal section opens VT's web analysis — no API key needed.",
      "Column visibility persists across sessions via localStorage.",
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
    ],
  },
  {
    id: "drivers",
    label: "Driver Manager",
    category: "Monitoring",
    icon: <CircuitBoard className="w-5 h-5" />,
    summary: "View all installed device drivers with version, signing, and status info.",
    description:
      "The Driver Manager lists all installed device drivers. Filter by device class or status. Each driver entry shows version, provider, signing status (signed/unsigned), and current state. Click any driver for detailed information including INF name and driver date.",
    howToUse: [
      "The driver list loads automatically on page visit.",
      "Use the class filter dropdown to narrow by device category (Display, Network, etc.).",
      "Filter by status (OK, Error, Degraded) using the status tabs.",
      "Search by driver name using the search bar.",
      "Click any driver row to see full details in the panel.",
    ],
    tips: [
      "Unsigned drivers can sometimes cause stability issues or BSODs.",
      "If a driver shows 'Error' status, consider updating or reinstalling it.",
    ],
  },
  {
    id: "diskanalyzer",
    label: "Disk Analyzer",
    category: "Monitoring",
    icon: <PieChart className="w-5 h-5" />,
    summary: "Visual disk space analysis with treemap and folder drill-down.",
    description:
      "The Disk Analyzer scans your drives and presents a visual treemap showing space distribution. Drill down into any folder to find large files and directories consuming disk space. Navigate with breadcrumbs to move between levels.",
    howToUse: [
      "Select a drive from the dropdown to scan.",
      "Wait for the scan to complete — progress is shown.",
      "The treemap visualizes folder sizes — larger rectangles = more space used.",
      "Click any folder in the treemap or list to drill down into it.",
      "Use breadcrumbs at the top to navigate back up the folder tree.",
    ],
    tips: [
      "Scanning large drives may take a moment. System folders may require admin access.",
      "Look for unexpectedly large folders in AppData, Downloads, and Temp directories.",
    ],
  },
  {
    id: "firewall",
    label: "Firewall Rules",
    category: "Monitoring",
    icon: <ShieldCheck className="w-5 h-5" />,
    summary: "View Windows Firewall inbound/outbound rules with filtering.",
    description:
      "Browse all Windows Firewall rules for both inbound and outbound traffic. Filter by direction, action (Allow/Block), and enabled state. Each rule shows the program, port, protocol, and profile details.",
    howToUse: [
      "Rules load automatically. Use the direction tabs to switch between Inbound/Outbound.",
      "Filter by action (Allow/Block) and enabled/disabled state.",
      "Search by rule name or program path using the search bar.",
      "Click any rule to see its full details including port ranges and profiles.",
    ],
    tips: [
      "Blocked outbound rules may prevent apps from connecting to the internet.",
      "Modifying firewall rules requires admin privileges — use Windows Firewall settings directly.",
    ],
  },
  {
    id: "users",
    label: "Users",
    category: "Monitoring",
    icon: <Users className="w-5 h-5" />,
    summary: "View logged-in user sessions with resource usage and sign-out control.",
    description:
      "The Users page displays all currently logged-in user sessions including their session type (Console, RDP), logon time, and individual resource usage (CPU, memory, process count). You can sign out other users directly from this page.",
    howToUse: [
      "The page loads all active sessions automatically and refreshes every 5 seconds.",
      "Each session card shows user name, session ID, type, and logon time.",
      "CPU and memory usage are shown per-user session.",
      "Click 'Sign Out' to disconnect a user session (requires admin).",
    ],
    tips: [
      "Signing out a user will close all their running applications.",
      "RDP sessions may show as 'Disconnected' if the user disconnected without signing out.",
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
      "App Insights shows all running applications grouped by name. Click any app to open a detail panel showing all matching processes with PID, CPU, and memory stats, related event log entries, and file paths (exe path, install directory, AppData folder). Favorited processes appear at the top for quick access.",
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
      "Apps are grouped by base name — multiple instances show as one card with total resource usage.",
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
    id: "bsod",
    label: "BSOD Analyzer",
    category: "Analysis",
    icon: <Skull className="w-5 h-5" />,
    summary: "Analyze crash dumps and BSOD history with web search for solutions.",
    description:
      "The BSOD Analyzer scans your system for minidump crash files and BSOD history records from the Windows Event Log. Selecting a dump file provides a structured analysis showing the bug check code, faulting module, crash-time process, and parameters. BSOD history entries are clickable with full error info and a 'Search Web for Fix' button.",
    howToUse: [
      "The page automatically scans for minidump files in C:\\Windows\\Minidump.",
      "Click any dump file in the left panel to analyze it.",
      "The analysis panel shows the bug check code, faulting module, and parameters.",
      "Click 'Search Web' to find solutions for the specific bug check code.",
      "Click 'Open File' to open the dump in a debugger, or 'Open Folder' to browse to it.",
      "Click any BSOD history entry to open its detail panel with full error information.",
    ],
    tips: [
      "This feature requires admin privileges — without admin, you'll see a prompt to relaunch.",
      "Running SFC and DISM from Quick Tools can help resolve system file corruption that causes BSODs.",
    ],
  },
  {
    id: "apphistory",
    label: "App History",
    category: "Analysis",
    icon: <BarChart3 className="w-5 h-5" />,
    summary: "Per-application resource usage with sortable table and stat cards.",
    description:
      "App History aggregates resource usage across all running processes, grouped by application name. Summary stat cards show total apps, CPU usage, memory, and disk I/O. The sortable table displays each app's instance count, CPU percentage, current and peak memory, and disk read/write bytes. Auto-refreshes every 10 seconds.",
    howToUse: [
      "Navigate to Insights > App History in the sidebar.",
      "Summary cards at the top show aggregate stats for all running apps.",
      "Click any column header to sort (Name, Instances, CPU%, Memory, Disk R/W).",
      "Use the search bar to filter by application name.",
      "Click refresh to manually reload data, or let auto-refresh update every 10s.",
    ],
    tips: [
      "CPU values over 50% are highlighted in red, over 10% in yellow.",
      "Peak Memory shows the highest memory usage of any single instance in the group.",
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
    ],
  },
  {
    id: "startup",
    label: "Startup Manager",
    category: "Tools",
    icon: <Power className="w-5 h-5" />,
    summary: "Control auto-starting programs with impact ratings, Last BIOS Time, and toggle switches.",
    description:
      "The Startup Manager lists all programs that run automatically when Windows starts. Items are collected from the Registry (HKLM and HKCU Run keys), Startup Folders, and Scheduled Tasks with logon triggers. Each item shows a color-coded startup impact rating (High, Medium, Low). The header displays your Last BIOS Time — how long your firmware takes to initialize before Windows starts loading.",
    howToUse: [
      "Toggle the switch next to any item to enable or disable it at startup.",
      "Check the Last BIOS Time in the header to see your firmware initialization speed.",
      "Use the source filter tabs (Registry, Folders, Tasks) to filter by startup source.",
      "Filter by Enabled/Disabled status using the toggle buttons.",
      "Search by name, publisher, or command using the search bar.",
      "Impact badges show estimated boot impact: High (red), Medium (amber), Low (green).",
      "Click the 🔗 link icon on any item to search Google for 'What is this?'.",
    ],
    tips: [
      "HKLM registry and scheduled task changes require admin privileges.",
      "Disabling high-impact startup items can significantly improve boot time.",
      "A Last BIOS Time over 10 seconds may indicate BIOS settings that can be optimized.",
    ],
  },
  {
    id: "restorepoints",
    label: "Restore Points",
    category: "Tools",
    icon: <History className="w-5 h-5" />,
    summary: "View and manage Windows System Restore points.",
    description:
      "View existing System Restore points with creation dates and types. Create new restore points or restore your system to a previous state. Useful for rolling back after driver installs, Windows Updates, or software changes that cause issues.",
    howToUse: [
      "Existing restore points load automatically with date, description, and type.",
      "Click 'Create Restore Point' to make a new snapshot of your current system state.",
      "Select a restore point and click 'Restore' to roll back to that state.",
      "Requires administrator privileges for all operations.",
    ],
    tips: [
      "Always create a restore point before making major system changes.",
      "System Protection must be enabled on the drive for restore points to work.",
    ],
  },
  {
    id: "taskscheduler",
    label: "Task Scheduler",
    category: "Tools",
    icon: <CalendarClock className="w-5 h-5" />,
    summary: "Browse, enable/disable, and run scheduled tasks on demand.",
    description:
      "Browse all Windows scheduled tasks with their state, trigger type, last run result, and next run time. Enable or disable tasks, and run them on demand. Filter by state and trigger type to find specific tasks.",
    howToUse: [
      "Tasks load automatically from the Windows Task Scheduler.",
      "Use the state tabs to filter by Ready, Running, or Disabled tasks.",
      "Search by task name or path using the search bar.",
      "Click the toggle to enable/disable a task.",
      "Click 'Run Now' to execute a task immediately.",
      "Last run result codes help diagnose task failures (0 = success).",
    ],
    tips: [
      "Modifying scheduled tasks requires administrator privileges.",
      "Disabling system tasks may affect Windows Update, maintenance, and security scans.",
    ],
  },
  {
    id: "programs",
    label: "Installed Programs",
    category: "Tools",
    icon: <Package className="w-5 h-5" />,
    summary: "View all installed programs with version, publisher, and uninstall option.",
    description:
      "Lists all installed programs from the Windows registry with version, publisher, install date, and estimated size. Search and filter the list. Uninstall programs directly with a confirmation dialog. Toggle visibility of system components.",
    howToUse: [
      "Programs load automatically from the registry.",
      "Use the search bar to filter by name or publisher.",
      "Click 'Uninstall' on any program to remove it (launches the program's uninstaller).",
      "Toggle 'Show System Components' to include/exclude minor components.",
    ],
    tips: [
      "Some programs require admin privileges to uninstall.",
      "System components are hidden by default — toggle them if looking for a specific update or component.",
    ],
  },
  {
    id: "windowsupdate",
    label: "Windows Update",
    category: "Tools",
    icon: <CloudDownload className="w-5 h-5" />,
    summary: "View update history and check for pending Windows Updates.",
    description:
      "View your Windows Update installation history with status, KB article numbers, and support links. Check for pending updates that haven't been installed yet. Filter by installation status to find failed or successful updates.",
    howToUse: [
      "Update history loads automatically showing recent installations.",
      "Click 'Check for Updates' to scan for pending updates.",
      "Filter by status (Installed, Failed, Pending) using the tabs.",
      "Click any KB link to open the Microsoft support article.",
    ],
    tips: [
      "Failed updates may resolve by running 'DISM Repair' and 'SFC Scan' from Quick Tools first.",
      "Pending updates may require a system restart to complete installation.",
    ],
  },
  {
    id: "settings",
    label: "Settings",
    category: "Tools",
    icon: <Bell className="w-5 h-5" />,
    summary: "Configure app behavior, system tray, notification alerts, and network defaults.",
    description:
      "Settings lets you customize the application. Configure dashboard and hardware refresh intervals, toggle process auto-refresh, switch between dark and light themes, set up system tray behavior (minimize to tray on close instead of quitting), enable notification alerts with configurable CPU and RAM thresholds, and set network defaults for ping count and traceroute hops.",
    howToUse: [
      "Appearance: Switch between Dark and Light themes.",
      "Performance: Adjust dashboard and hardware refresh intervals, toggle process auto-refresh.",
      "System Tray: Enable 'Minimize to Tray on Close' to keep the app running in the background.",
      "Notification Alerts: Enable desktop notifications and set CPU/RAM threshold percentages (70-95%).",
      "Network Defaults: Set default ping count and traceroute max hops.",
      "Click 'Reset Defaults' to restore all settings to their original values.",
    ],
    tips: [
      "Notification alerts check every 10 seconds with a 1-minute cooldown between alerts.",
      "The system tray icon always shows live CPU and RAM stats in its tooltip.",
      "All settings are saved automatically and persist across sessions.",
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
