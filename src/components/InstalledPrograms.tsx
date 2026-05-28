import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  RefreshCw,
  Package,
  Trash2,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import type { InstalledProgram } from "../types";
import { useToast } from "./ToastProvider";
import ConfirmDialog from "./ConfirmDialog";

/* ─── Format Helpers ─── */
function formatSize(kb: number): string {
  if (kb === 0) return "—";
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatInstallDate(raw: string): string {
  if (!raw || raw.length !== 8) return raw || "—";
  // Format: YYYYMMDD
  const y = raw.substring(0, 4);
  const m = raw.substring(4, 6);
  const d = raw.substring(6, 8);
  try {
    return new Date(`${y}-${m}-${d}`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return raw;
  }
}

/* ─── Component ─── */
export default function InstalledPrograms() {
  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<InstalledProgram | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<InstalledProgram | null>(null);
  const { showToast } = useToast();

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<InstalledProgram[]>("get_installed_programs");
      setPrograms(data);
    } catch (err) {
      showToast(`Failed to load programs: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Filter
  const filtered = useMemo(() => {
    return programs.filter((p) => {
      if (!showSystem && p.is_system_component) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !p.publisher.toLowerCase().includes(q) &&
          !p.version.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [programs, search, showSystem]);

  // Stats
  const totalSize = programs
    .filter((p) => !p.is_system_component)
    .reduce((sum, p) => sum + p.estimated_size_kb, 0);
  const userCount = programs.filter((p) => !p.is_system_component).length;
  const systemCount = programs.filter((p) => p.is_system_component).length;

  const handleUninstall = async (program: InstalledProgram) => {
    try {
      await invoke("uninstall_program", { uninstallString: program.uninstall_string });
      showToast(`Uninstaller launched for ${program.name}`, "info");
      // Refresh after a delay
      setTimeout(() => fetchPrograms(), 5000);
    } catch (err) {
      showToast(`Uninstall failed: ${err}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search programs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-9 pl-9 pr-3 text-[13px]"
          />
        </div>

        <button
          onClick={() => setShowSystem(!showSystem)}
          className={`flex items-center gap-2 h-9 px-3 rounded-lg text-[12px] font-medium
                     border transition-all duration-200
                     ${showSystem
                       ? "bg-accent/10 text-accent border-accent/20"
                       : "bg-surface text-text-tertiary border-border hover:bg-surface-hover"
                     }`}
        >
          {showSystem ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          System Components ({systemCount})
        </button>

        <button
          onClick={fetchPrograms}
          disabled={loading}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     border border-border bg-surface text-text-tertiary
                     hover:bg-surface-hover disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="flex items-center gap-4">
          <span className="text-[12px] text-text-tertiary">
            {filtered.length} programs shown
          </span>
          <span className="text-[12px] text-text-tertiary">
            {userCount} user apps • {formatSize(totalSize)} total
          </span>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Table */}
        <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
          selectedProgram ? "flex-1 min-w-0" : "w-full"
        }`}>
          <div className="grid grid-cols-[1fr_140px_100px_90px] gap-2 px-4 py-2.5 text-[11px]
                          font-semibold text-text-tertiary uppercase tracking-wider border-b border-border">
            <span>Program</span>
            <span>Publisher</span>
            <span>Version</span>
            <span>Size</span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-text-tertiary">
              {search ? "No programs match your search" : "No programs found"}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {filtered.map((prog, i) => {
                const isSelected = selectedProgram?.name === prog.name &&
                  selectedProgram?.version === prog.version;
                return (
                  <button
                    key={`${prog.name}-${prog.version}-${i}`}
                    onClick={() => setSelectedProgram(isSelected ? null : prog)}
                    className={`w-full grid grid-cols-[1fr_140px_100px_90px] gap-2 px-4 py-2.5
                               text-left text-[12.5px] border-b border-border
                               transition-all duration-150
                               ${isSelected ? "bg-accent/[0.06]" : "hover:bg-surface-hover"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                      <span className="truncate text-text-primary/85 font-medium">{prog.name}</span>
                      {prog.is_system_component && (
                        <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-surface
                                         text-text-tertiary border border-border shrink-0">
                          SYS
                        </span>
                      )}
                    </div>
                    <span className="truncate text-text-secondary">{prog.publisher || "—"}</span>
                    <span className="truncate text-text-tertiary font-mono text-[11px]">
                      {prog.version || "—"}
                    </span>
                    <span className="text-text-tertiary text-[11px]">
                      {formatSize(prog.estimated_size_kb)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedProgram && (
          <div className="w-[340px] shrink-0 glass-panel flex flex-col overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="w-4 h-4 text-accent shrink-0" />
                <h3 className="text-[14px] font-semibold text-text-primary/90 truncate">
                  {selectedProgram.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedProgram(null)}
                className="flex items-center justify-center w-6 h-6 rounded
                           text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <DetailRow label="Version" value={selectedProgram.version || "N/A"} />
              <DetailRow label="Publisher" value={selectedProgram.publisher || "N/A"} />
              <DetailRow label="Install Date" value={formatInstallDate(selectedProgram.install_date)} />
              <DetailRow label="Size" value={formatSize(selectedProgram.estimated_size_kb)} />
              {selectedProgram.install_location && (
                <DetailRow label="Location" value={selectedProgram.install_location} mono />
              )}
              <DetailRow label="Type" value={selectedProgram.is_system_component ? "System Component" : "User Application"} />
            </div>

            {/* Uninstall action */}
            {selectedProgram.uninstall_string && !selectedProgram.is_system_component && (
              <div className="p-4 border-t border-border">
                <button
                  onClick={() => setConfirmUninstall(selectedProgram)}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-lg
                             text-[13px] font-medium bg-danger/10 text-danger
                             border border-danger/20 hover:bg-danger/15
                             transition-all duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                  Uninstall
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Uninstall Confirmation */}
      {confirmUninstall && (
        <ConfirmDialog
          open={true}
          title="Uninstall Program?"
          message={`This will launch the uninstaller for "${confirmUninstall.name}". You may need to follow additional prompts in the uninstaller window.`}
          confirmLabel="Uninstall"
          variant="danger"
          onCancel={() => setConfirmUninstall(null)}
          onConfirm={() => {
            const prog = confirmUninstall;
            setConfirmUninstall(null);
            handleUninstall(prog);
          }}
        />
      )}
    </div>
  );
}

/* ─── Detail Row ─── */
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11.5px] text-text-tertiary shrink-0">{label}</span>
      <span className={`text-[12px] text-text-primary/80 font-medium text-right break-all
                        ${mono ? "font-mono text-[11px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
