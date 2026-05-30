import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./ToastProvider";
import { usePageVisible } from "./Layout";
import {
  LogOut, RefreshCw, Cpu, MemoryStick, Box,
  AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import type { UserSession } from "../types";

/* ─── Users Page ─── */
export default function UsersPage() {
  const [users, setUsers] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<UserSession | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [sortKey, setSortKey] = useState<"username" | "memory_mb" | "cpu_total" | "process_count">("memory_mb");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { showToast } = useToast();
  const isVisible = usePageVisible("users");

  const fetchUsers = useCallback(async () => {
    try {
      const result = await invoke<UserSession[]>("get_logged_in_users");
      setUsers(result);
      setError(null);
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to fetch users";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    if (isVisible) {
      intervalRef.current = setInterval(fetchUsers, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUsers, isVisible]);

  const handleSignOut = async () => {
    if (!signOutTarget) return;
    setSigningOut(true);
    try {
      const result = await invoke<string>("sign_out_user", { sessionId: signOutTarget.session_id });
      showToast(result, "success");
      fetchUsers();
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Failed to sign out user";
      showToast(msg, "error");
    } finally {
      setSigningOut(false);
      setSignOutTarget(null);
    }
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...users].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    const cmp = typeof aVal === "string"
      ? (aVal as string).localeCompare(bVal as string)
      : (aVal as number) - (bVal as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ column }: { column: typeof sortKey }) => {
    if (sortKey !== column) return null;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />;
  };

  // Totals
  const totalCpu = users.reduce((sum, u) => sum + u.cpu_total, 0);
  const totalMem = users.reduce((sum, u) => sum + u.memory_mb, 0);
  const totalProcs = users.reduce((sum, u) => sum + u.process_count, 0);

  return (
    <div className="flex flex-col gap-4 animate-fade-in h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-white/40 font-mono tabular-nums">
            {users.length} user{users.length !== 1 ? "s" : ""} logged in
          </span>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70
                     transition-all duration-200"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {!loading && users.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-panel p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#60CDFF]/10">
              <Cpu className="w-4 h-4 text-[#60CDFF]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Total CPU</span>
              <span className="text-[15px] font-bold text-white/85 tabular-nums">{totalCpu.toFixed(1)}s</span>
            </div>
          </div>
          <div className="glass-panel p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#2ed573]/10">
              <MemoryStick className="w-4 h-4 text-[#2ed573]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Total Memory</span>
              <span className="text-[15px] font-bold text-white/85 tabular-nums">
                {totalMem >= 1024 ? `${(totalMem / 1024).toFixed(1)} GB` : `${totalMem.toFixed(0)} MB`}
              </span>
            </div>
          </div>
          <div className="glass-panel p-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#a855f7]/10">
              <Box className="w-4 h-4 text-[#a855f7]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-white/35 font-semibold uppercase tracking-wider">Total Processes</span>
              <span className="text-[15px] font-bold text-white/85 tabular-nums">{totalProcs}</span>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="glass-panel flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-4 h-[40px] text-[11px] font-semibold text-white/40 uppercase
                        tracking-wider border-b border-white/[0.06] bg-white/[0.02] shrink-0">
          <div className="w-[36px]" />
          <button className="flex-1 flex items-center gap-1 text-left hover:text-white/60 transition-colors"
                  onClick={() => handleSort("username")}>
            User <SortIcon column="username" />
          </button>
          <span className="w-[90px] text-center">Status</span>
          <span className="w-[140px] text-right">Logon Time</span>
          <button className="w-[100px] flex items-center justify-end gap-1 hover:text-white/60 transition-colors"
                  onClick={() => handleSort("cpu_total")}>
            CPU (s) <SortIcon column="cpu_total" />
          </button>
          <button className="w-[100px] flex items-center justify-end gap-1 hover:text-white/60 transition-colors"
                  onClick={() => handleSort("memory_mb")}>
            Memory <SortIcon column="memory_mb" />
          </button>
          <button className="w-[80px] flex items-center justify-end gap-1 hover:text-white/60 transition-colors"
                  onClick={() => handleSort("process_count")}>
            Procs <SortIcon column="process_count" />
          </button>
          <div className="w-[60px]" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center px-4 h-[52px] gap-4">
                  <div className="w-8 h-8 shimmer rounded-full" />
                  <div className="flex-1 h-3 shimmer" />
                  <div className="w-16 h-3 shimmer" />
                  <div className="w-24 h-3 shimmer" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <AlertTriangle className="w-5 h-5 text-danger/60" />
              <span className="text-[13px] text-white/40">{error}</span>
              <button onClick={fetchUsers} className="text-[11px] text-accent hover:text-accent/80 transition-colors">
                Try again
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
              No active user sessions found
            </div>
          ) : (
            sorted.map((user, idx) => {
              const isActive = user.status === "Active";
              return (
                <div
                  key={`${user.username}-${user.session_id}`}
                  className={`flex items-center px-4 h-[52px] text-[13px]
                             transition-colors duration-150 border-b border-white/[0.03]
                             ${idx % 2 === 0
                               ? "bg-transparent hover:bg-white/[0.04]"
                               : "bg-white/[0.015] hover:bg-white/[0.04]"
                             }`}
                >
                  {/* Avatar */}
                  <div className="w-[36px] flex items-center justify-center shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold
                                    ${isActive
                                      ? "bg-accent/15 text-accent"
                                      : "bg-white/[0.06] text-white/30"
                                    }`}>
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Username */}
                  <span className="flex-1 text-white/85 font-medium truncate flex items-center gap-2">
                    {user.username}
                    {isActive && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-semibold">
                        Active
                      </span>
                    )}
                  </span>

                  {/* Status */}
                  <span className="w-[90px] text-center">
                    <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold
                      ${isActive
                        ? "bg-success/15 text-success"
                        : "bg-white/10 text-white/40"
                      }`}>
                      {user.status}
                    </span>
                  </span>

                  {/* Logon Time */}
                  <span className="w-[140px] text-right text-[11px] text-white/40 font-mono tabular-nums">
                    {user.logon_time || "—"}
                  </span>

                  {/* CPU */}
                  <span className={`w-[100px] text-right font-mono text-[12px] tabular-nums
                    ${user.cpu_total > 100 ? "text-danger" : user.cpu_total > 30 ? "text-warning" : "text-white/60"}`}>
                    {user.cpu_total.toFixed(1)}
                  </span>

                  {/* Memory */}
                  <span className="w-[100px] text-right font-mono text-[12px] tabular-nums text-white/60">
                    {user.memory_mb >= 1024
                      ? `${(user.memory_mb / 1024).toFixed(1)} GB`
                      : `${user.memory_mb.toFixed(0)} MB`
                    }
                  </span>

                  {/* Process Count */}
                  <span className="w-[80px] text-right font-mono text-[12px] tabular-nums text-white/40">
                    {user.process_count}
                  </span>

                  {/* Actions */}
                  <div className="w-[60px] flex justify-end">
                    <button
                      onClick={() => setSignOutTarget(user)}
                      className="flex items-center justify-center w-8 h-8 rounded-md
                                 text-white/15 hover:text-danger hover:bg-danger/10
                                 transition-all duration-200"
                      title={`Sign out ${user.username}`}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {signOutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel-strong w-[380px] p-6 flex flex-col gap-4 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-danger/15">
                <LogOut className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-white/90">Sign Out User</h3>
                <p className="text-[12px] text-white/50">This will end their session</p>
              </div>
            </div>

            <p className="text-[13px] text-white/70 leading-relaxed">
              Are you sure you want to sign out{" "}
              <span className="font-semibold text-white/90">{signOutTarget.username}</span>?
              Any unsaved work in their session will be lost.
            </p>

            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
              <span className="text-[11px] text-warning/80">
                {signOutTarget.process_count} running process{signOutTarget.process_count !== 1 ? "es" : ""} will be terminated
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setSignOutTarget(null)}
                className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                           bg-white/[0.06] text-white/70 hover:bg-white/[0.1]
                           transition-colors duration-200 border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="h-8 px-4 rounded-lg text-[12.5px] font-medium
                           bg-danger/90 text-white hover:bg-danger
                           disabled:opacity-50 transition-colors duration-200"
              >
                {signingOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
