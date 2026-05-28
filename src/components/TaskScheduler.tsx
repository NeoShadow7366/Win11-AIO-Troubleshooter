import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  RefreshCw,
  Play,
  X,
  CheckCircle2,
  XCircle,
  Pause,
} from "lucide-react";
import type { ScheduledTaskInfo } from "../types";
import { useAdmin } from "./Layout";
import { useToast } from "./ToastProvider";

/* ─── State Badge ─── */
function StateBadge({ state }: { state: string }) {
  switch (state) {
    case "Ready":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-success/10 text-success border border-success/20">
          <CheckCircle2 className="w-3 h-3" /> Ready
        </span>
      );
    case "Running":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-accent/10 text-accent border border-accent/20">
          <Play className="w-3 h-3" /> Running
        </span>
      );
    case "Disabled":
      return (
        <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-surface text-text-tertiary border border-border">
          <Pause className="w-3 h-3" /> Disabled
        </span>
      );
    default:
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md
                         bg-surface text-text-tertiary border border-border">
          {state}
        </span>
      );
  }
}

/* ─── Format Helpers ─── */
function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function resultToString(code: number): string {
  if (code === 0) return "Success";
  if (code === 0x00041301) return "Running";
  if (code === 0x00041303) return "Never run";
  if (code === 0x00041306) return "Not started";
  if (code === 0x00041325) return "Stopped";
  return `0x${code.toString(16).toUpperCase()}`;
}

/* ─── Component ─── */
export default function TaskScheduler() {
  const [tasks, setTasks] = useState<ScheduledTaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterTrigger, setFilterTrigger] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<ScheduledTaskInfo | null>(null);
  const { isAdmin, promptAdmin } = useAdmin();
  const { showToast } = useToast();

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ScheduledTaskInfo[]>("get_all_scheduled_tasks");
      setTasks(data);
    } catch (err) {
      showToast(`Failed to load tasks: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Trigger types for filter
  const triggerTypes = useMemo(() => {
    const types = new Set(tasks.map((t) => t.trigger_type).filter(Boolean));
    return Array.from(types).sort();
  }, [tasks]);

  // Filter
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !t.task_name.toLowerCase().includes(q) &&
          !t.description.toLowerCase().includes(q) &&
          !t.author.toLowerCase().includes(q) &&
          !t.task_path.toLowerCase().includes(q)
        )
          return false;
      }
      if (filterState !== "all" && t.state.toLowerCase() !== filterState) return false;
      if (filterTrigger !== "all" && t.trigger_type !== filterTrigger) return false;
      return true;
    });
  }, [tasks, search, filterState, filterTrigger]);

  const handleToggle = async (task: ScheduledTaskInfo) => {
    if (!isAdmin) { promptAdmin(); return; }
    const enable = task.state === "Disabled";
    try {
      await invoke("toggle_scheduled_task_state", {
        taskName: task.task_name,
        taskPath: task.task_path,
        enable,
      });
      showToast(`Task ${enable ? "enabled" : "disabled"}: ${task.task_name}`, "success");
      fetchTasks();
    } catch (err) {
      showToast(`Failed: ${err}`, "error");
    }
  };

  const handleRun = async (task: ScheduledTaskInfo) => {
    if (!isAdmin) { promptAdmin(); return; }
    try {
      await invoke("run_scheduled_task", {
        taskName: task.task_name,
        taskPath: task.task_path,
      });
      showToast(`Task started: ${task.task_name}`, "success");
    } catch (err) {
      showToast(`Failed to run task: ${err}`, "error");
    }
  };

  // Stats
  const readyCount = tasks.filter((t) => t.state === "Ready").length;
  const runningCount = tasks.filter((t) => t.state === "Running").length;
  const disabledCount = tasks.filter((t) => t.state === "Disabled").length;

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-9 pl-9 pr-3 text-[13px]"
          />
        </div>

        {/* State filter */}
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
          {[
            { key: "all", label: `All (${tasks.length})` },
            { key: "ready", label: `Ready (${readyCount})` },
            { key: "running", label: `Running (${runningCount})` },
            { key: "disabled", label: `Disabled (${disabledCount})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterState(tab.key)}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all duration-200
                ${filterState === tab.key
                  ? "bg-accent/15 text-accent"
                  : "text-text-tertiary hover:text-text-secondary"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Trigger filter */}
        <select
          value={filterTrigger}
          onChange={(e) => setFilterTrigger(e.target.value)}
          className="h-9 px-3 rounded-lg text-[12px] bg-surface border border-border
                     text-text-secondary cursor-pointer"
        >
          <option value="all">All Triggers</option>
          {triggerTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <button
          onClick={fetchTasks}
          disabled={loading}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     border border-border bg-surface text-text-tertiary
                     hover:bg-surface-hover disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Table */}
        <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
          selectedTask ? "flex-1 min-w-0" : "w-full"
        }`}>
          <div className="grid grid-cols-[1fr_100px_90px_140px_70px] gap-2 px-4 py-2.5 text-[11px]
                          font-semibold text-text-tertiary uppercase tracking-wider border-b border-border">
            <span>Task Name</span>
            <span>Trigger</span>
            <span>State</span>
            <span>Next Run</span>
            <span>Result</span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-text-tertiary">
              {search ? "No tasks match your search" : "No scheduled tasks found"}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {filtered.map((task, i) => {
                const isSelected = selectedTask?.task_name === task.task_name &&
                  selectedTask?.task_path === task.task_path;
                const resultOk = task.last_result === 0 || task.last_result === 0x00041301;
                return (
                  <button
                    key={`${task.task_path}${task.task_name}-${i}`}
                    onClick={() => setSelectedTask(isSelected ? null : task)}
                    className={`w-full grid grid-cols-[1fr_100px_90px_140px_70px] gap-2 px-4 py-2.5
                               text-left text-[12.5px] border-b border-border
                               transition-all duration-150
                               ${isSelected ? "bg-accent/[0.06]" : "hover:bg-surface-hover"}`}
                  >
                    <div className="truncate">
                      <span className="text-text-primary/85 font-medium">{task.task_name}</span>
                      <span className="block text-[10px] text-text-tertiary truncate">{task.task_path}</span>
                    </div>
                    <span className="text-[11px] text-text-tertiary self-center">{task.trigger_type || "—"}</span>
                    <span className="self-center"><StateBadge state={task.state} /></span>
                    <span className="text-[11px] text-text-tertiary self-center">
                      {task.next_run_time ? formatDateTime(task.next_run_time) : "—"}
                    </span>
                    <span className={`text-[11px] font-mono self-center ${
                      resultOk ? "text-text-tertiary" : "text-warning"
                    }`}>
                      {resultToString(task.last_result)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTask && (
          <div className="w-[340px] shrink-0 glass-panel flex flex-col overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-text-primary/90 truncate">
                  {selectedTask.task_name}
                </h3>
                <p className="text-[11px] text-text-tertiary font-mono truncate">{selectedTask.task_path}</p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="flex items-center justify-center w-6 h-6 rounded
                           text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              {selectedTask.description && (
                <p className="text-[12px] text-text-secondary leading-relaxed pb-2 border-b border-border">
                  {selectedTask.description}
                </p>
              )}

              <DetailRow label="State" value={selectedTask.state} />
              <DetailRow label="Trigger" value={selectedTask.trigger_type || "None"} />
              <DetailRow label="Author" value={selectedTask.author || "N/A"} />
              <DetailRow label="Command" value={selectedTask.command || "N/A"} mono />
              <DetailRow label="Last Run" value={selectedTask.last_run_time ? formatDateTime(selectedTask.last_run_time) : "Never"} />
              <DetailRow label="Next Run" value={selectedTask.next_run_time ? formatDateTime(selectedTask.next_run_time) : "N/A"} />
              <DetailRow label="Last Result" value={resultToString(selectedTask.last_result)} />
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border flex gap-2">
              <button
                onClick={() => handleToggle(selectedTask)}
                className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg
                           text-[12.5px] font-medium border transition-all duration-200
                           ${selectedTask.state === "Disabled"
                             ? "bg-success/10 text-success border-success/20 hover:bg-success/15"
                             : "bg-surface text-text-secondary border-border hover:bg-surface-hover"
                           }`}
              >
                {selectedTask.state === "Disabled" ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Enable</>
                ) : (
                  <><XCircle className="w-3.5 h-3.5" /> Disable</>
                )}
              </button>
              <button
                onClick={() => handleRun(selectedTask)}
                disabled={selectedTask.state === "Disabled"}
                className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg
                           text-[12.5px] font-medium bg-accent/10 text-accent
                           border border-accent/20 hover:bg-accent/15
                           disabled:opacity-40 transition-all duration-200"
              >
                <Play className="w-3.5 h-3.5" /> Run Now
              </button>
            </div>
          </div>
        )}
      </div>
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
