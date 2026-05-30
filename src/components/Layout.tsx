import React, { useEffect, useState, useCallback, useMemo, createContext, useContext, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { ShieldAlert, ShieldCheck, X, Info, ArrowUpCircle } from "lucide-react";
import { useToast } from "./ToastProvider";
import { checkForUpdates, type UpdateInfo } from "../utils/updateChecker";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import Dashboard from "./Dashboard";
import ExportButton from "./ExportButton";

/* ─── Lazy-loaded page components ─── */
const ProcessManager = React.lazy(() => import("./ProcessManager"));
const ServicesManager = React.lazy(() => import("./ServicesManager"));
const EventViewer = React.lazy(() => import("./EventViewer"));
const AppInsights = React.lazy(() => import("./AppInsights"));
const ServiceInsights = React.lazy(() => import("./ServiceInsights"));
const QuickTools = React.lazy(() => import("./QuickTools"));
const BsodAnalyzer = React.lazy(() => import("./BsodAnalyzer"));
const HardwareHealth = React.lazy(() => import("./HardwareHealth"));
const StartupManager = React.lazy(() => import("./StartupManager"));
const NetworkDiagnostics = React.lazy(() => import("./NetworkDiagnostics"));
const SettingsPage = React.lazy(() => import("./SettingsPage"));
const RestorePoints = React.lazy(() => import("./RestorePoints"));
const DriverManager = React.lazy(() => import("./DriverManager"));
const TaskScheduler = React.lazy(() => import("./TaskScheduler"));
const InstalledPrograms = React.lazy(() => import("./InstalledPrograms"));
const DiskAnalyzer = React.lazy(() => import("./DiskAnalyzer"));
const FirewallViewer = React.lazy(() => import("./FirewallViewer"));
const WindowsUpdate = React.lazy(() => import("./WindowsUpdate"));
const UsersPage = React.lazy(() => import("./UsersPage"));
const AppHistory = React.lazy(() => import("./AppHistory"));

/* ─── Admin Context ─── */
interface AdminContextType {
  isAdmin: boolean;
  promptAdmin: () => void;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  promptAdmin: () => {},
});

export function useAdmin() {
  return useContext(AdminContext);
}

/* ─── Navigation Context ─── */
const NavigateContext = createContext<(page: string) => void>(() => {});

export function useNavigate() {
  return useContext(NavigateContext);
}

/* ─── Page Visibility Context ─── */
const PageVisibilityContext = createContext<string>("dashboard");

export function usePageVisible(pageId: string): boolean {
  const activePage = useContext(PageVisibilityContext);
  return activePage === pageId;
}

/* ─── Theme Context ─── */
export type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "aio-theme";

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return "dark";
}

function AdminPrompt({ onClose }: { onClose: () => void }) {
  const [relaunching, setRelaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRelaunch = async () => {
    setRelaunching(true);
    setError(null);
    try {
      await invoke("relaunch_as_admin");
      setLaunched(true);
    } catch (err: any) {
      console.error("Relaunch error:", err);
      const msg = typeof err === "string" ? err : err?.message || "Failed to relaunch";
      if (msg.includes("canceled") || msg.includes("cancelled")) {
        setError("UAC prompt was cancelled. You can try again.");
      } else {
        setError(msg);
      }
      setRelaunching(false);
    }
  };

  if (launched) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
        <div className="glass-panel-strong w-[420px] p-6 flex flex-col gap-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-success/15">
              <ShieldCheck className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-white/90">Admin Instance Launched</h3>
              <p className="text-[12px] text-white/50">A new window with admin privileges is opening</p>
            </div>
          </div>
          <p className="text-[13px] text-white/60 leading-relaxed">
            Switch to the new admin window for full access to all features.
            You can keep this window open or close it from the taskbar.
          </p>
          <div className="flex justify-end pt-1">
            <button onClick={onClose}
              className="h-8 px-4 rounded-lg text-[12.5px] font-medium bg-accent/90 text-black hover:bg-accent transition-colors duration-200 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Got It
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel-strong w-[420px] p-6 flex flex-col gap-4 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-warning/15">
            <ShieldAlert className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-white/90">Administrator Required</h3>
            <p className="text-[12px] text-white/50">This action needs elevated privileges</p>
          </div>
        </div>
        <p className="text-[13px] text-white/70 leading-relaxed">
          Some features require administrator privileges to function properly, including:
        </p>
        <ul className="text-[12.5px] text-white/60 list-disc list-inside space-y-1 ml-1">
          <li>Quick Tools (SFC, DISM, Check Disk, etc.)</li>
          <li>Starting/stopping/restarting services</li>
          <li>Killing protected processes</li>
          <li>Accessing Security event logs</li>
        </ul>
        <p className="text-[13px] text-white/70 leading-relaxed">
          Would you like to relaunch the application as Administrator?
        </p>
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
            <span className="text-[12px] text-danger/80">{error}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose}
            className="h-8 px-4 rounded-lg text-[12.5px] font-medium bg-white/[0.06] text-white/70 hover:bg-white/[0.1] transition-colors duration-200 border border-white/10">
            Not Now
          </button>
          <button onClick={handleRelaunch} disabled={relaunching}
            className="h-8 px-4 rounded-lg text-[12.5px] font-medium bg-accent/90 text-black hover:bg-accent disabled:opacity-50 transition-colors duration-200 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            {relaunching ? "Launching..." : "Relaunch as Admin"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Page Router ─── */

interface LayoutProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard:       "Dashboard",
  processes:       "Process Manager",
  services:        "Services",
  eventviewer:     "Event Viewer",
  appinsights:     "App Insights",
  serviceinsights: "Service Insights",
  quicktools:      "Quick Tools",
  bsod:            "BSOD Analyzer",
  hardware:        "Hardware Health",
  startup:         "Startup Manager",
  network:         "Network Diagnostics",
  settings:        "Settings",
  restorepoints:   "Restore Points",
  drivers:         "Driver Manager",
  taskscheduler:   "Task Scheduler",
  programs:        "Installed Programs",
  diskanalyzer:    "Disk Analyzer",
  firewall:        "Firewall Rules",
  windowsupdate:   "Windows Update",
  users:           "Users",
  apphistory:      "App History",
};

const PAGE_DESCRIPTIONS: Record<string, string> = {
  dashboard:       "Overview of your system's health. Monitor real-time CPU, RAM, GPU, and disk usage with live sparkline graphs (click any to expand). GPU gauge and CPU clock speed display. Memory composition bar showing used, cached, paged pool, and available memory. Extended 120-point history. The health score aggregates key metrics into a 0–100 rating with per-category breakdowns.",
  processes:       "View all running processes with CPU, memory, and disk I/O. Click any process to open a detail panel with PID, path, threads, start time, CPU Affinity editor, loaded DLLs inspector, VirusTotal hash scanner, and network connections viewer. End process trees, suspend/resume processes, and set efficiency mode. Toggle tree view, group by app name, or customize visible columns. Export to CSV. Star processes as favorites.",
  services:        "Manage Windows services. Start, stop, or restart services. Change startup type between Automatic, Manual, and Disabled. Click a service row to see its details in a side panel. Some actions require administrator privileges.",
  eventviewer:     "Browse Windows event logs (System, Application, Security). Use preset date ranges (Today, 7 Days, 30 Days) or set a custom range. Filter by source name and severity level (Critical, Error, Warning). Click any row to expand its full message.",
  appinsights:     "Browse all running applications grouped by name. Click any app to open a detail panel showing its running processes, related event logs, executable path, and install directory. Use the search bar to filter. Star apps as favorites. Click 'View in Processes' to jump to the Process Manager.",
  serviceinsights: "Deep-dive into Windows services. Click any service to see its description, executable path, startup mode, dependencies, and related event logs in the side panel. Star services as favorites for quick access.",
  quicktools:      "Run system maintenance and diagnostic tools. Select a tool from the categorized list (Repair, Network, Performance, Security, Diagnostics), read its description, then click Run. Output streams in real-time to the terminal below. Use PC Health Check to run a full automated routine.",
  bsod:            "Analyze Blue Screen of Death (BSOD) crash dumps. Click a minidump file to see its analysis: bug check code, faulting module, and parameters. Click BSOD history entries to open a detail panel with error info and a 'Search Web for Fix' button for troubleshooting. Requires admin to access crash data.",
  hardware:        "Monitor hardware health: CPU temperatures, GPU stats (NVIDIA), memory modules, and disk S.M.A.R.T. data including wear level and power-on hours. Data auto-refreshes every 5 seconds. Some sensors require administrator privileges.",
  startup:         "Manage programs that start automatically with Windows. Toggle items on/off from Registry, Startup Folder, and Scheduled Tasks. View color-coded startup impact ratings (High, Medium, Low). Last BIOS time displayed in the header. Use 'What is this?' to look up unknown entries. HKLM and scheduled task changes require admin.",
  network:         "Network diagnostic tools: view active TCP connections with process names, run ping and traceroute tests, perform DNS lookups, and check WiFi signal info. Use the tabs to switch between tools.",
  settings:        "Configure application preferences including refresh intervals, theme, process auto-refresh, system tray behavior (minimize to tray on close), notification alert thresholds for CPU/RAM, and network defaults.",
  restorepoints:   "View and manage Windows System Restore points. See existing restore points with creation dates and types. Create new restore points or restore your system to a previous state. Requires administrator privileges.",
  drivers:         "View all installed device drivers. Filter by device class or status. See driver version, signing status, and identify problem devices. Click any driver for detailed information.",
  taskscheduler:   "Browse and manage all Windows scheduled tasks. Filter by state and trigger type. Enable/disable tasks, run them on demand, and view last run results. Requires administrator for modifications.",
  programs:        "View all installed programs with version, publisher, and size. Search and filter the list. Uninstall programs with confirmation. Toggle system component visibility.",
  diskanalyzer:    "Analyze disk space usage across your drives. Visual treemap shows space distribution. Drill down into folders to find large files. Navigate with breadcrumbs.",
  firewall:        "View Windows Firewall inbound and outbound rules. Filter by direction, action, and enabled state. See port, protocol, and program details for each rule.",
  windowsupdate:   "View Windows Update history and check for pending updates. See installation status, KB articles, and support links. Filter by status.",
  users:           "View all logged-in user sessions with their CPU, memory, and process usage. See session status, logon times, and sign out users. Auto-refreshes every 5 seconds.",
  apphistory:      "View per-application resource usage aggregated from all running processes. Summary stat cards for total apps, CPU, memory, and disk I/O. Sortable table with search filter and auto-refresh every 10 seconds.",
};

const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  processes: ProcessManager,
  services: ServicesManager,
  eventviewer: EventViewer,
  appinsights: AppInsights,
  serviceinsights: ServiceInsights,
  quicktools: QuickTools,
  bsod: BsodAnalyzer,
  hardware: HardwareHealth,
  startup: StartupManager,
  network: NetworkDiagnostics,
  settings: SettingsPage,
  restorepoints: RestorePoints,
  drivers: DriverManager,
  taskscheduler: TaskScheduler,
  programs: InstalledPrograms,
  diskanalyzer: DiskAnalyzer,
  firewall: FirewallViewer,
  windowsupdate: WindowsUpdate,
  users: UsersPage,
  apphistory: AppHistory,
};

/* ─── Page Loading Fallback ─── */
function PageFallback() {
  return (
    <div className="flex flex-col gap-4 p-2 animate-fade-in">
      <div className="h-8 w-48 shimmer" />
      <div className="grid grid-cols-3 gap-4">
        <div className="h-32 shimmer" />
        <div className="h-32 shimmer" />
        <div className="h-32 shimmer" />
      </div>
      <div className="h-64 shimmer" />
    </div>
  );
}

/**
 * Keep-alive page container. Pages are mounted on first visit and kept alive
 * (hidden via display:none) so that running processes, terminal output,
 * and scroll positions are preserved across tab switches.
 */
function KeepAlivePages({ activePage }: { activePage: string }) {
  const [visitedPages, setVisitedPages] = useState<Set<string>>(new Set(["dashboard"]));

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(activePage)) return prev;
      const next = new Set(prev);
      next.add(activePage);
      return next;
    });
  }, [activePage]);

  return (
    <>
      {Array.from(visitedPages).map((pageId) => {
        const Component = PAGE_COMPONENTS[pageId] || Dashboard;
        const isActive = pageId === activePage;
        return (
          <div
            key={pageId}
            className={isActive ? "flex flex-col flex-1 min-h-0 animate-fade-in" : "hidden"}
          >
            <Suspense fallback={<PageFallback />}>
              <Component />
            </Suspense>
          </div>
        );
      })}
    </>
  );
}

/* ─── Keyboard shortcut page map ─── */
const SHORTCUT_PAGES = [
  "dashboard", "processes", "services", "hardware", "network",
  "quicktools", "startup", "eventviewer", "appinsights",
];

export default function Layout({ activePage, onNavigate }: LayoutProps) {
  const [isAdmin, setIsAdmin] = useState(true); // Assume admin until checked
  const [adminChecked, setAdminChecked] = useState(false);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showPageInfo, setShowPageInfo] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const { showToast } = useToast();

  // Theme state
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    invoke<boolean>("is_admin")
      .then((result) => {
        setIsAdmin(result);
        setAdminChecked(true);
      })
      .catch(() => {
        setIsAdmin(false);
        setAdminChecked(true);
      });
  }, []);

  // Auto-update check
  useEffect(() => {
    checkForUpdates().then((info) => {
      if (info?.isNewer) {
        setUpdateInfo(info);
        showToast(`Update available: v${info.latestVersion}`, "info");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const promptAdmin = useCallback(() => {
    if (!isAdmin) {
      setShowAdminPrompt(true);
    }
  }, [isAdmin]);

  // Close info popover when navigating
  useEffect(() => {
    setShowPageInfo(false);
  }, [activePage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Ctrl+1 through Ctrl+9 → navigate to pages
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9 && SHORTCUT_PAGES[num - 1]) {
          e.preventDefault();
          onNavigate(SHORTCUT_PAGES[num - 1]);
          return;
        }
        // Ctrl+/ → toggle page info
        if (e.key === "/") {
          e.preventDefault();
          setShowPageInfo((prev) => !prev);
          return;
        }
      }

      // Escape → close modals/panels/popovers
      if (e.key === "Escape") {
        if (showPageInfo) { setShowPageInfo(false); return; }
        if (showAdminPrompt) { setShowAdminPrompt(false); return; }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNavigate, showPageInfo, showAdminPrompt]);

  const adminValue = useMemo(() => ({ isAdmin, promptAdmin }), [isAdmin, promptAdmin]);
  const themeValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={themeValue}>
    <PageVisibilityContext.Provider value={activePage}>
    <NavigateContext.Provider value={onNavigate}>
      <AdminContext.Provider value={adminValue}>
      <div className="flex flex-col h-screen w-screen bg-bg-base overflow-hidden">
        {/* Title Bar */}
        <TitleBar />

        {/* Admin Banner */}
        {adminChecked && !isAdmin && !bannerDismissed && (
          <div className="flex items-center justify-between px-4 h-9 bg-warning/10 border-b border-warning/20 shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-warning" />
              <span className="text-[12px] text-warning/90 font-medium">
                Running without administrator privileges — some features may be limited.
              </span>
              <button
                onClick={() => setShowAdminPrompt(true)}
                className="text-[12px] text-accent font-semibold hover:underline ml-1"
              >
                Relaunch as Admin
              </button>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              className="flex items-center justify-center w-6 h-6 rounded text-warning/50 hover:text-warning hover:bg-warning/10 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Area */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <Sidebar activePage={activePage} onNavigate={onNavigate} />

          {/* Content */}
          <main className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Page Header */}
            <header className="flex items-center justify-between px-6 h-12 shrink-0 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <h1 className="text-[16px] font-semibold text-white/90 tracking-[-0.01em]">
                  {PAGE_TITLES[activePage] || "Dashboard"}
                </h1>
                {PAGE_DESCRIPTIONS[activePage] && (
                  <div className="relative">
                    <button
                      id="page-info-btn"
                      onClick={() => setShowPageInfo(!showPageInfo)}
                      className={`flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200
                        ${showPageInfo
                          ? "bg-accent/15 text-accent"
                          : "text-white/25 hover:text-accent/70 hover:bg-white/[0.05]"}`}
                      title="How to use this page"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    {showPageInfo && (
                      <div className="absolute left-0 top-full mt-2 w-[380px] z-50 animate-fade-in">
                        <div className="glass-panel-strong p-4 rounded-xl shadow-2xl border border-white/10">
                          <div className="flex items-start gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 shrink-0 mt-0.5">
                              <Info className="w-4 h-4 text-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[12px] font-semibold text-white/80 mb-1.5">
                                How to use {PAGE_TITLES[activePage]}
                              </h4>
                              <p className="text-[12px] text-white/55 leading-relaxed">
                                {PAGE_DESCRIPTIONS[activePage]}
                              </p>
                            </div>
                            <button
                              onClick={() => setShowPageInfo(false)}
                              className="flex items-center justify-center w-5 h-5 rounded text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Update badge */}
                {updateInfo && (
                  <button
                    onClick={() => open(updateInfo.downloadUrl).catch(() => {})}
                    className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-medium
                               bg-accent/10 text-accent border border-accent/20
                               hover:bg-accent/15 transition-all duration-200 animate-fade-in"
                    title={`Update to v${updateInfo.latestVersion}`}
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    v{updateInfo.latestVersion} Available
                  </button>
                )}
                {activePage === "dashboard" && <ExportButton />}
                {adminChecked && (
                  <div className="flex items-center gap-1.5">
                    {isAdmin ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-success/60" />
                        <span className="text-[11px] text-success/50 font-medium">Admin</span>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowAdminPrompt(true)}
                        className="flex items-center gap-1.5 text-warning/50 hover:text-warning transition-colors"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-medium">Not Admin</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
              <KeepAlivePages activePage={activePage} />
            </div>
          </main>
        </div>

        {/* Admin Prompt Modal */}
        {showAdminPrompt && (
          <AdminPrompt
            onClose={() => setShowAdminPrompt(false)}
          />
        )}
      </div>
      </AdminContext.Provider>
    </NavigateContext.Provider>
    </PageVisibilityContext.Provider>
    </ThemeContext.Provider>
  );
}
