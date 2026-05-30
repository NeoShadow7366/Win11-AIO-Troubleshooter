import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Cpu,
  Settings,
  FileText,
  Search,
  Wrench,
  Skull,
  Zap,
  HelpCircle,
  Thermometer,
  Power,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  History,
  CircuitBoard,
  CalendarClock,
  Package,
  PieChart,
  ShieldCheck,
  CloudDownload,
  Users,
  BarChart3,
} from "lucide-react";
import type { ReactNode } from "react";
import FeatureGuide from "./FeatureGuide";
import { useTheme } from "./Layout";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

interface NavEntry {
  id: string;
  label: string;
  icon: ReactNode;
}

interface NavSection {
  title: string;
  items: NavEntry[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { id: "dashboard",   label: "Dashboard",       icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
    ],
  },
  {
    title: "Monitor",
    items: [
      { id: "processes",   label: "Processes",        icon: <Cpu className="w-[18px] h-[18px]" /> },
      { id: "services",    label: "Services",         icon: <Settings className="w-[18px] h-[18px]" /> },
      { id: "hardware",    label: "Hardware Health",   icon: <Thermometer className="w-[18px] h-[18px]" /> },
      { id: "network",     label: "Network Diag.",     icon: <Network className="w-[18px] h-[18px]" /> },
      { id: "drivers",     label: "Driver Manager",    icon: <CircuitBoard className="w-[18px] h-[18px]" /> },
      { id: "diskanalyzer", label: "Disk Analyzer",     icon: <PieChart className="w-[18px] h-[18px]" /> },
      { id: "firewall",     label: "Firewall Rules",    icon: <ShieldCheck className="w-[18px] h-[18px]" /> },
      { id: "users",        label: "Users",             icon: <Users className="w-[18px] h-[18px]" /> },
    ],
  },
  {
    title: "Tools",
    items: [
      { id: "quicktools",     label: "Quick Tools",      icon: <Wrench className="w-[18px] h-[18px]" /> },
      { id: "startup",        label: "Startup Manager",  icon: <Power className="w-[18px] h-[18px]" /> },
      { id: "restorepoints",  label: "Restore Points",   icon: <History className="w-[18px] h-[18px]" /> },
      { id: "taskscheduler",   label: "Task Scheduler",   icon: <CalendarClock className="w-[18px] h-[18px]" /> },
      { id: "programs",         label: "Programs",         icon: <Package className="w-[18px] h-[18px]" /> },
      { id: "windowsupdate",     label: "Windows Update",   icon: <CloudDownload className="w-[18px] h-[18px]" /> },
    ],
  },
  {
    title: "Insights",
    items: [
      { id: "eventviewer",      label: "Event Viewer",     icon: <FileText className="w-[18px] h-[18px]" /> },
      { id: "appinsights",      label: "App Insights",     icon: <Search className="w-[18px] h-[18px]" /> },
      { id: "serviceinsights",  label: "Service Insights", icon: <Zap className="w-[18px] h-[18px]" /> },
      { id: "bsod",             label: "BSOD Analyzer",    icon: <Skull className="w-[18px] h-[18px]" /> },
      { id: "apphistory",        label: "App History",       icon: <BarChart3 className="w-[18px] h-[18px]" /> },
    ],
  },
];

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Keyboard shortcut labels (matching SHORTCUT_PAGES in Layout)
  const SHORTCUT_MAP: Record<string, string> = {
    dashboard: "Ctrl+1", processes: "Ctrl+2", services: "Ctrl+3",
    hardware: "Ctrl+4", network: "Ctrl+5", quicktools: "Ctrl+6",
    startup: "Ctrl+7", eventviewer: "Ctrl+8", appinsights: "Ctrl+9",
  };

  // Auto-collapse on narrow windows
  useEffect(() => {
    const checkWidth = () => {
      if (window.innerWidth < 900) {
        setCollapsed(true);
      }
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  const sidebarWidth = collapsed ? "w-[56px] min-w-[56px]" : "w-[220px] min-w-[220px]";

  return (
    <>
      <aside
        id="sidebar"
        className={`sidebar-nav flex flex-col ${sidebarWidth} h-full
                   bg-white/[0.02] backdrop-blur-xl border-r border-white/[0.06]
                   py-3 select-none transition-all duration-300 ease-out`}
      >
        {/* Collapse toggle */}
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-end"} px-2 mb-1`}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-7 h-7 rounded-md
                       text-white/20 hover:text-white/50 hover:bg-white/[0.05]
                       transition-all duration-200"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2.5 overflow-y-auto overflow-x-hidden">
          {NAV_SECTIONS.map((section, si) => (
            <div key={section.title}>
              {/* Section divider (not before first section) */}
              {si > 0 && (
                <div className={`${collapsed ? "my-2 mx-1 border-t border-white/[0.04]" : "mt-3 mb-1.5"}`}>
                  {!collapsed && (
                    <span className="text-[9px] font-bold text-white/15 uppercase tracking-[0.14em] px-3">
                      {section.title}
                    </span>
                  )}
                </div>
              )}

              {section.items.map((item) => {
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? `${item.label}${SHORTCUT_MAP[item.id] ? ` (${SHORTCUT_MAP[item.id]})` : ""}` : (SHORTCUT_MAP[item.id] || undefined)}
                    className={`
                      group relative flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full h-[36px] ${collapsed ? "px-0" : "px-3"}
                      rounded-lg text-[13px] font-medium transition-all duration-200
                      ${active
                        ? "bg-white/[0.06] text-accent"
                        : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"
                      }
                    `}
                  >
                    {/* Accent bar */}
                    <div
                      className={`
                        absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full
                        transition-all duration-300 ease-out
                        ${active ? "h-4 bg-accent" : "h-0 bg-transparent"}
                      `}
                    />

                    {/* Icon */}
                    <span className={`transition-colors duration-200 shrink-0 ${active ? "text-accent" : ""}`}>
                      {item.icon}
                    </span>

                    {/* Label */}
                    {!collapsed && <span className="truncate">{item.label}</span>}

                    {/* Hover glow */}
                    {active && (
                      <div className="absolute inset-0 rounded-lg bg-accent/[0.04] pointer-events-none" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"} px-3 pt-3 border-t border-white/[0.04]`}>
          {!collapsed && <span className="text-[11px] text-white/20 font-mono tracking-wider">v2.2.0</span>}
          <div className={`flex items-center ${collapsed ? "flex-col" : ""} gap-1`}>
            <button
              id="settings-btn"
              onClick={() => onNavigate("settings")}
              className={`flex items-center justify-center w-7 h-7 rounded-md
                         transition-all duration-200
                         ${activePage === "settings"
                           ? "text-accent bg-accent/10"
                           : "text-white/25 hover:text-accent hover:bg-accent/10"
                         }`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="flex items-center justify-center w-7 h-7 rounded-md
                         text-white/25 hover:text-accent hover:bg-accent/10
                         transition-all duration-200"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              id="feature-guide-btn"
              onClick={() => setGuideOpen(true)}
              className="flex items-center justify-center w-7 h-7 rounded-md
                         text-white/25 hover:text-accent hover:bg-accent/10
                         transition-all duration-200"
              title="Feature Guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Feature Guide Panel */}
      <FeatureGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
