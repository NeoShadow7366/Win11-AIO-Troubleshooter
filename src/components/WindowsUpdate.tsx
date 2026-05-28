import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  ExternalLink,
  X,
  Shield,
} from "lucide-react";
import type { WindowsUpdateInfo, PendingUpdate } from "../types";
import { useToast } from "./ToastProvider";

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "Succeeded":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-success/10 text-success border border-success/20">
          <CheckCircle2 className="w-3 h-3" /> Succeeded
        </span>
      );
    case "Failed":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-danger/10 text-danger border border-danger/20">
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
    case "In Progress":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-accent/10 text-accent border border-accent/20">
          <Download className="w-3 h-3" /> In Progress
        </span>
      );
    default:
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-surface text-text-tertiary border border-border">
          {status}
        </span>
      );
  }
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ─── Component ─── */
export default function WindowsUpdate() {
  const [history, setHistory] = useState<WindowsUpdateInfo[]>([]);
  const [pending, setPending] = useState<PendingUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"history" | "pending">("history");
  const [selectedUpdate, setSelectedUpdate] = useState<WindowsUpdateInfo | null>(null);
  const { showToast } = useToast();

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<WindowsUpdateInfo[]>("get_update_history");
      setHistory(data);
    } catch (err) {
      showToast(`Failed to load update history: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchPending = useCallback(async () => {
    setChecking(true);
    try {
      const data = await invoke<PendingUpdate[]>("check_pending_updates");
      setPending(data);
      if (data.length === 0) {
        showToast("Your system is up to date!", "success");
      } else {
        showToast(`${data.length} update${data.length !== 1 ? "s" : ""} available`, "info");
      }
    } catch (err) {
      showToast(`Failed to check for updates: ${err}`, "error");
    } finally {
      setChecking(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filtered = useMemo(() => {
    return history.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !u.title.toLowerCase().includes(q) &&
          !u.kb_article.toLowerCase().includes(q) &&
          !u.description.toLowerCase().includes(q)
        ) return false;
      }
      if (filterStatus !== "all" && u.status.toLowerCase() !== filterStatus.toLowerCase()) return false;
      return true;
    });
  }, [history, search, filterStatus]);

  const succeededCount = history.filter((u) => u.status === "Succeeded").length;
  const failedCount = history.filter((u) => u.status === "Failed").length;

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Tabs + Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
          <button
            onClick={() => setActiveTab("history")}
            className={`h-8 px-4 rounded-md text-[12px] font-medium transition-all
              ${activeTab === "history" ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
          >
            Update History ({history.length})
          </button>
          <button
            onClick={() => { setActiveTab("pending"); if (pending.length === 0 && !checking) fetchPending(); }}
            className={`h-8 px-4 rounded-md text-[12px] font-medium transition-all
              ${activeTab === "pending" ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
          >
            Available Updates {pending.length > 0 ? `(${pending.length})` : ""}
          </button>
        </div>

        {activeTab === "history" && (
          <>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search updates, KB articles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-input w-full h-9 pl-9 pr-3 text-[13px]"
              />
            </div>

            <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
              {[
                { key: "all", label: "All" },
                { key: "Succeeded", label: `OK (${succeededCount})` },
                { key: "Failed", label: `Failed (${failedCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterStatus(tab.key)}
                  className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all
                    ${filterStatus === tab.key ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          onClick={activeTab === "history" ? fetchHistory : fetchPending}
          disabled={loading || checking}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     border border-border bg-surface text-text-tertiary
                     hover:bg-surface-hover disabled:opacity-50 transition-all ml-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading || checking ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content */}
      {activeTab === "history" ? (
        <div className="flex flex-1 gap-4 min-h-0">
          <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
            selectedUpdate ? "flex-1 min-w-0" : "w-full"
          }`}>
            <div className="grid grid-cols-[1fr_80px_90px_100px] gap-2 px-4 py-2.5 text-[11px]
                            font-semibold text-text-tertiary uppercase tracking-wider border-b border-border">
              <span>Update</span>
              <span>KB</span>
              <span>Status</span>
              <span>Date</span>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[13px] text-text-tertiary">
                {search ? "No updates match" : "No update history"}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {filtered.map((update, i) => {
                  const isSelected = selectedUpdate?.title === update.title && selectedUpdate?.date === update.date;
                  return (
                    <button
                      key={`${update.kb_article}-${update.date}-${i}`}
                      onClick={() => setSelectedUpdate(isSelected ? null : update)}
                      className={`w-full grid grid-cols-[1fr_80px_90px_100px] gap-2 px-4 py-2.5
                                 text-left text-[12.5px] border-b border-border transition-all duration-150
                                 ${isSelected ? "bg-accent/[0.06]" : "hover:bg-surface-hover"}`}
                    >
                      <span className="truncate text-text-primary/85 font-medium">{update.title}</span>
                      <span className="text-[11px] text-accent/70 font-mono self-center">{update.kb_article || "—"}</span>
                      <span className="self-center"><StatusBadge status={update.status} /></span>
                      <span className="text-[11px] text-text-tertiary self-center">{formatDate(update.date)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedUpdate && (
            <div className="w-[340px] shrink-0 glass-panel flex flex-col overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-text-primary/90 truncate">{selectedUpdate.title}</h3>
                  {selectedUpdate.kb_article && (
                    <span className="text-[11px] font-mono text-accent/70">{selectedUpdate.kb_article}</span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedUpdate(null)}
                  className="flex items-center justify-center w-6 h-6 rounded
                             text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
                {selectedUpdate.description && (
                  <p className="text-[12px] text-text-secondary leading-relaxed pb-2 border-b border-border">
                    {selectedUpdate.description}
                  </p>
                )}
                <DetailRow label="Status" value={selectedUpdate.status} />
                <DetailRow label="Date" value={formatDate(selectedUpdate.date)} />
                <DetailRow label="Type" value={selectedUpdate.update_type} />
                {selectedUpdate.support_url && (
                  <button
                    onClick={() => open(selectedUpdate.support_url)}
                    className="flex items-center gap-2 text-[12px] text-accent hover:text-accent/80 transition-colors mt-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View Support Article
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Pending Updates Tab */
        <div className="glass-panel flex flex-col flex-1 overflow-hidden">
          {checking ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 text-text-tertiary animate-spin" />
              <span className="text-[13px] text-text-tertiary">Checking for updates...</span>
            </div>
          ) : pending.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-success/10">
                <Shield className="w-7 h-7 text-success" />
              </div>
              <div className="text-center">
                <h3 className="text-[14px] font-semibold text-text-primary/80 mb-1">Up to Date</h3>
                <p className="text-[12px] text-text-tertiary">No pending updates found</p>
              </div>
              <button
                onClick={fetchPending}
                className="flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                           bg-accent/10 text-accent border border-accent/20
                           hover:bg-accent/15 transition-all mt-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Check Again
              </button>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border">
                <span className="text-[12px] text-text-secondary font-medium">
                  {pending.length} update{pending.length !== 1 ? "s" : ""} available
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {pending.map((update, i) => (
                  <div
                    key={`${update.kb_article}-${i}`}
                    className="px-4 py-3 border-b border-border hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[13px] font-medium text-text-primary/85 mb-1">{update.title}</h4>
                        {update.description && (
                          <p className="text-[11px] text-text-tertiary leading-relaxed mb-1.5">{update.description}</p>
                        )}
                        <div className="flex items-center gap-3">
                          {update.kb_article && (
                            <span className="text-[10px] font-mono text-accent/70">{update.kb_article}</span>
                          )}
                          {update.size_mb > 0 && (
                            <span className="text-[10px] text-text-tertiary">{update.size_mb} MB</span>
                          )}
                          {update.is_mandatory && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">
                              Required
                            </span>
                          )}
                          {update.is_downloaded && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">
                              Downloaded
                            </span>
                          )}
                        </div>
                      </div>
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11.5px] text-text-tertiary shrink-0">{label}</span>
      <span className="text-[12px] text-text-primary/80 font-medium text-right">{value}</span>
    </div>
  );
}
