import { useState } from "react";
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
} from "lucide-react";
import type { ReactNode } from "react";
import FeatureGuide from "./FeatureGuide";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

interface NavEntry {
  id: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavEntry[] = [
  { id: "dashboard",        label: "Dashboard",         icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { id: "processes",        label: "Processes",          icon: <Cpu className="w-[18px] h-[18px]" /> },
  { id: "services",         label: "Services",           icon: <Settings className="w-[18px] h-[18px]" /> },
  { id: "eventviewer",      label: "Event Viewer",       icon: <FileText className="w-[18px] h-[18px]" /> },
  { id: "appinsights",      label: "App Insights",       icon: <Search className="w-[18px] h-[18px]" /> },
  { id: "serviceinsights",  label: "Service Insights",   icon: <Zap className="w-[18px] h-[18px]" /> },
  { id: "quicktools",       label: "Quick Tools",        icon: <Wrench className="w-[18px] h-[18px]" /> },
  { id: "bsod",             label: "BSOD Analyzer",      icon: <Skull className="w-[18px] h-[18px]" /> },
];

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <aside
        id="sidebar"
        className="flex flex-col w-[220px] min-w-[220px] h-full
                   bg-white/[0.02] backdrop-blur-xl border-r border-white/[0.06]
                   py-3 select-none"
      >
        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2.5">
          {NAV_ITEMS.map((item) => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                className={`
                  group relative flex items-center gap-3 w-full h-[38px] px-3
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
                <span className={`transition-colors duration-200 ${active ? "text-accent" : ""}`}>
                  {item.icon}
                </span>

                {/* Label */}
                <span className="truncate">{item.label}</span>

                {/* Hover glow */}
                {active && (
                  <div className="absolute inset-0 rounded-lg bg-accent/[0.04] pointer-events-none" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 pt-3 border-t border-white/[0.04]">
          <span className="text-[11px] text-white/20 font-mono tracking-wider">v1.0.0</span>
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
      </aside>

      {/* Feature Guide Panel */}
      <FeatureGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
