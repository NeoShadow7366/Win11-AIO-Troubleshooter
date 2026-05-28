import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RotateCcw,
  RefreshCw,
  Plus,
  Calendar,
  Clock,
  Shield,
  AlertTriangle,
  ChevronRight,
  History,
} from "lucide-react";
import type { RestorePoint } from "../types";
import { useAdmin } from "./Layout";
import { useToast } from "./ToastProvider";
import ConfirmDialog from "./ConfirmDialog";

/* ─── Restore Point Type Labels ─── */
const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  APPLICATION_INSTALL:   { label: "App Install",   color: "text-accent" },
  APPLICATION_UNINSTALL: { label: "App Uninstall",  color: "text-warning" },
  DEVICE_DRIVER_INSTALL: { label: "Driver Install", color: "text-accent" },
  MODIFY_SETTINGS:       { label: "Settings",       color: "text-text-tertiary" },
  CANCELLED_OPERATION:   { label: "Cancelled",      color: "text-text-tertiary" },
  CHECKPOINT:            { label: "Checkpoint",      color: "text-success" },
  RESTORE:               { label: "Restore",         color: "text-warning" },
  SYSTEM_CHECKPOINT:     { label: "System",          color: "text-success" },
};

function getTypeInfo(type: string) {
  return TYPE_LABELS[type] || { label: type, color: "text-text-tertiary" };
}

/* ─── Format Date ─── */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months === 1) return "1 month ago";
    return `${months} months ago`;
  } catch {
    return "";
  }
}

/* ─── Component ─── */
export default function RestorePoints() {
  const [points, setPoints] = useState<RestorePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<RestorePoint | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<RestorePoint | null>(null);
  const [creating, setCreating] = useState(false);
  const { isAdmin, promptAdmin } = useAdmin();
  const { showToast } = useToast();

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<RestorePoint[]>("get_restore_points");
      // Sort newest first
      data.sort((a, b) => b.sequence_number - a.sequence_number);
      setPoints(data);
    } catch (err) {
      setError(String(err));
      showToast("Failed to load restore points", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  const handleCreate = async () => {
    if (!isAdmin) {
      promptAdmin();
      return;
    }
    setCreating(true);
    try {
      await invoke("run_cli_tool", {
        tool: "restore_point",
        onEvent: null,
      });
      showToast("Restore point created successfully", "success");
      // Refresh the list
      setTimeout(() => fetchPoints(), 2000);
    } catch (err) {
      showToast(`Failed to create restore point: ${err}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (point: RestorePoint) => {
    if (!isAdmin) {
      promptAdmin();
      return;
    }
    try {
      const result = await invoke<string>("restore_to_point", {
        sequenceNumber: point.sequence_number,
      });
      showToast(result, "info");
    } catch (err) {
      showToast(`Restore failed: ${err}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-text-tertiary">
            {points.length} restore point{points.length !== 1 ? "s" : ""} found
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                       bg-accent/10 text-accent border border-accent/20
                       hover:bg-accent/15 disabled:opacity-50 transition-all duration-200"
          >
            {creating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Create Restore Point
          </button>
          <button
            onClick={fetchPoints}
            disabled={loading}
            className="flex items-center justify-center w-9 h-9 rounded-lg
                       border border-border bg-surface text-text-tertiary
                       hover:bg-surface-hover hover:text-text-secondary
                       disabled:opacity-50 transition-all duration-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Timeline / List */}
        <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
          selectedPoint ? "flex-1 min-w-0" : "w-full"
        }`}>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" />
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              <AlertTriangle className="w-8 h-8 text-danger/50" />
              <p className="text-[13px] text-text-secondary text-center max-w-sm">{error}</p>
              <button
                onClick={fetchPoints}
                className="text-[12px] text-accent hover:text-accent/80 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : points.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8">
              <History className="w-10 h-10 text-text-tertiary/30" />
              <p className="text-[14px] font-medium text-text-secondary">No Restore Points</p>
              <p className="text-[12px] text-text-tertiary text-center max-w-xs">
                System Protection may be disabled, or no restore points have been created yet.
              </p>
              <button
                onClick={handleCreate}
                className="flex items-center gap-1.5 mt-2 text-[12px] text-accent hover:text-accent/80"
              >
                <Plus className="w-3.5 h-3.5" />
                Create one now
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {points.map((point, i) => {
                const isSelected = selectedPoint?.sequence_number === point.sequence_number;
                const typeInfo = getTypeInfo(point.restore_point_type);
                return (
                  <button
                    key={point.sequence_number}
                    onClick={() => setSelectedPoint(isSelected ? null : point)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-left
                               border-b border-border transition-all duration-200
                               ${isSelected
                                 ? "bg-accent/[0.06]"
                                 : "hover:bg-surface-hover"
                               }`}
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className={`w-3 h-3 rounded-full border-2 ${
                        i === 0
                          ? "border-accent bg-accent/20"
                          : "border-border bg-surface"
                      }`} />
                      {i < points.length - 1 && (
                        <div className="w-px h-6 bg-border" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-text-primary/85 truncate">
                          {point.description}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md
                                         bg-surface border border-border ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-text-tertiary flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(point.creation_time)}
                        </span>
                        <span className="text-[11px] text-text-tertiary flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(point.creation_time)}
                        </span>
                        <span className="text-[10px] text-text-tertiary/60">
                          {timeAgo(point.creation_time)}
                        </span>
                      </div>
                    </div>

                    <ChevronRight className={`w-4 h-4 text-text-tertiary/30 transition-transform duration-200 shrink-0
                      ${isSelected ? "rotate-90 text-accent" : ""}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedPoint && (
          <div className="w-[340px] shrink-0 glass-panel flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-accent" />
                <h3 className="text-[14px] font-semibold text-text-primary/90">
                  Restore Point #{selectedPoint.sequence_number}
                </h3>
              </div>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                {selectedPoint.description}
              </p>
            </div>

            <div className="p-4 flex flex-col gap-3 flex-1">
              <DetailRow label="Created" value={`${formatDate(selectedPoint.creation_time)} at ${formatTime(selectedPoint.creation_time)}`} />
              <DetailRow label="Age" value={timeAgo(selectedPoint.creation_time)} />
              <DetailRow label="Type" value={getTypeInfo(selectedPoint.restore_point_type).label} />
              <DetailRow label="Sequence #" value={String(selectedPoint.sequence_number)} />
            </div>

            {/* Restore Action */}
            <div className="p-4 border-t border-border">
              <button
                onClick={() => setConfirmRestore(selectedPoint)}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-lg
                           text-[13px] font-medium bg-warning/10 text-warning
                           border border-warning/20 hover:bg-warning/15
                           transition-all duration-200"
              >
                <RotateCcw className="w-4 h-4" />
                Restore to This Point
              </button>
              <p className="text-[10.5px] text-text-tertiary/60 text-center mt-2 leading-relaxed">
                This will restart your computer and revert system files to this restore point.
                Your personal files will not be affected.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Restore Confirmation Dialog */}
      {confirmRestore && (
        <ConfirmDialog
          open={true}
          title="Restore System?"
          message={`This will restore your system to "${confirmRestore.description}" (${formatDate(confirmRestore.creation_time)}). Your computer will restart immediately. Personal files will not be affected, but recently installed programs and drivers may be removed.`}
          confirmLabel="Restore & Restart"
          variant="danger"
          onCancel={() => setConfirmRestore(null)}
          onConfirm={() => {
            const point = confirmRestore;
            setConfirmRestore(null);
            handleRestore(point);
          }}
        />
      )}
    </div>
  );
}

/* ─── Detail Row ─── */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11.5px] text-text-tertiary">{label}</span>
      <span className="text-[12px] text-text-primary/80 font-medium">{value}</span>
    </div>
  );
}
