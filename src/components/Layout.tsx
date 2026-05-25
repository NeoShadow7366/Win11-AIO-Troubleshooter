import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ShieldAlert, ShieldCheck, X } from "lucide-react";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import Dashboard from "./Dashboard";
import ProcessManager from "./ProcessManager";
import ServicesManager from "./ServicesManager";
import EventViewer from "./EventViewer";
import AppInsights from "./AppInsights";
import ServiceInsights from "./ServiceInsights";
import QuickTools from "./QuickTools";
import BsodAnalyzer from "./BsodAnalyzer";

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

/* ─── Admin Prompt Modal ─── */
function AdminPrompt({ onClose }: { onClose: () => void }) {
  const [relaunching, setRelaunching] = useState(false);

  const handleRelaunch = async () => {
    setRelaunching(true);
    try {
      await invoke("relaunch_as_admin");
      // The new instance will start; close this one after a brief delay
      setTimeout(() => {
        window.close();
      }, 1000);
    } catch (err) {
      console.error("Relaunch error:", err);
      setRelaunching(false);
    }
  };

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

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                       bg-white/[0.06] text-white/70 hover:bg-white/[0.1]
                       transition-colors duration-200 border border-white/10"
          >
            Not Now
          </button>
          <button
            onClick={handleRelaunch}
            disabled={relaunching}
            className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                       bg-accent/90 text-black hover:bg-accent
                       disabled:opacity-50 transition-colors duration-200
                       flex items-center gap-2"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {relaunching ? "Relaunching..." : "Relaunch as Admin"}
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
};

function PageContent({ page }: { page: string }) {
  switch (page) {
    case "dashboard":       return <Dashboard />;
    case "processes":       return <ProcessManager />;
    case "services":        return <ServicesManager />;
    case "eventviewer":     return <EventViewer />;
    case "appinsights":     return <AppInsights />;
    case "serviceinsights": return <ServiceInsights />;
    case "quicktools":      return <QuickTools />;
    case "bsod":            return <BsodAnalyzer />;
    default:                return <Dashboard />;
  }
}

export default function Layout({ activePage, onNavigate }: LayoutProps) {
  const [isAdmin, setIsAdmin] = useState(true); // Assume admin until checked
  const [adminChecked, setAdminChecked] = useState(false);
  const [showAdminPrompt, setShowAdminPrompt] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

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

  const promptAdmin = useCallback(() => {
    if (!isAdmin) {
      setShowAdminPrompt(true);
    }
  }, [isAdmin]);

  return (
    <AdminContext.Provider value={{ isAdmin, promptAdmin }}>
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
              <h1 className="text-[16px] font-semibold text-white/90 tracking-[-0.01em]">
                {PAGE_TITLES[activePage] || "Dashboard"}
              </h1>
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

        {/* Admin Prompt Modal */}
        {showAdminPrompt && (
          <AdminPrompt
            onClose={() => setShowAdminPrompt(false)}
          />
        )}
      </div>
    </AdminContext.Provider>
  );
}
