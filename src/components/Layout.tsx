import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import Dashboard from "./Dashboard";
import ProcessManager from "./ProcessManager";
import ServicesManager from "./ServicesManager";
import EventLogs from "./EventLogs";
import AppInsights from "./AppInsights";
import QuickTools from "./QuickTools";
import BsodAnalyzer from "./BsodAnalyzer";

interface LayoutProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard:   "Dashboard",
  processes:   "Process Manager",
  services:    "Services",
  eventlogs:   "Event Logs",
  appinsights: "App Insights",
  quicktools:  "Quick Tools",
  bsod:        "BSOD Analyzer",
};

function PageContent({ page }: { page: string }) {
  switch (page) {
    case "dashboard":   return <Dashboard />;
    case "processes":   return <ProcessManager />;
    case "services":    return <ServicesManager />;
    case "eventlogs":   return <EventLogs />;
    case "appinsights": return <AppInsights />;
    case "quicktools":  return <QuickTools />;
    case "bsod":        return <BsodAnalyzer />;
    default:            return <Dashboard />;
  }
}

export default function Layout({ activePage, onNavigate }: LayoutProps) {
  return (
    <div className="flex flex-col h-screen w-screen bg-bg-base overflow-hidden">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar activePage={activePage} onNavigate={onNavigate} />

        {/* Content */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Page Header */}
          <header className="flex items-center px-6 h-12 shrink-0 border-b border-white/[0.04]">
            <h1 className="text-[16px] font-semibold text-white/90 tracking-[-0.01em]">
              {PAGE_TITLES[activePage] || "Dashboard"}
            </h1>
          </header>

          {/* Scrollable Content */}
          <div
            key={activePage}
            className="flex-1 overflow-y-auto overflow-x-hidden p-6"
          >
            <PageContent page={activePage} />
          </div>
        </main>
      </div>
    </div>
  );
}
