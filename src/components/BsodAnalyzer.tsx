import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./ToastProvider";
import { open } from "@tauri-apps/plugin-shell";
import {
  RefreshCw,
  CheckCircle2,
  FileArchive,
  AlertOctagon,
  ExternalLink,
  FolderOpen,
  FileText,
  Loader2,
  ChevronRight,
  Hash,
  Clock,
  Cpu,
  Info,
  X,
  Shield,
} from "lucide-react";
import type { MinidumpInfo, BsodRecord, DumpAnalysis } from "../types";
import { useAdmin } from "./Layout";

export default function BsodAnalyzer() {
  const [dumps, setDumps] = useState<MinidumpInfo[]>([]);
  const [bsods, setBsods] = useState<BsodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin, promptAdmin } = useAdmin();
  const { showToast } = useToast();

  // Selected dump analysis
  const [selectedDump, setSelectedDump] = useState<MinidumpInfo | null>(null);
  const [analysis, setAnalysis] = useState<DumpAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedBsod, setSelectedBsod] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [d, b] = await Promise.all([
        invoke<MinidumpInfo[]>("get_minidumps"),
        invoke<BsodRecord[]>("get_bsod_history"),
      ]);
      setDumps(d);
      setBsods(b);
    } catch (err) {
      showToast("Failed to load BSOD data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectDump = async (dump: MinidumpInfo) => {
    if (selectedDump?.filename === dump.filename) {
      setSelectedDump(null);
      setAnalysis(null);
      return;
    }
    setSelectedDump(dump);
    setSelectedBsod(null);
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await invoke<DumpAnalysis>("analyze_dump", { dumpFile: dump.full_path });
      setAnalysis(result);
    } catch (err) {
      showToast("Failed to analyze dump file", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSearchWeb = () => {
    if (!analysis) return;
    const parts = [analysis.bug_check_code];
    if (analysis.faulting_module) parts.push(analysis.faulting_module);
    parts.push("BSOD Windows");
    const query = encodeURIComponent(parts.join(" "));
    open(`https://www.google.com/search?q=${query}`);
  };

  const handleSelectBsod = (idx: number) => {
    if (selectedBsod === idx && !selectedDump) {
      setSelectedBsod(null);
      return;
    }
    setSelectedBsod(idx);
    setSelectedDump(null);
    setAnalysis(null);
  };

  const handleSearchBsodWeb = (bsod: BsodRecord) => {
    const parts = [bsod.bugcheck_code];
    if (bsod.description) parts.push(bsod.description.substring(0, 60));
    parts.push("BSOD Windows fix");
    const query = encodeURIComponent(parts.join(" "));
    open(`https://www.google.com/search?q=${query}`);
  };

  const handleOpenFile = () => {
    if (!selectedDump) return;
    invoke("open_dump_file", { path: selectedDump.full_path });
  };

  const handleOpenFolder = () => {
    if (!selectedDump) return;
    invoke("open_dump_folder", { path: selectedDump.full_path });
  };

  const formatKB = (kb: number): string => {
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const hasData = dumps.length > 0 || bsods.length > 0;

  return (
    <div className="flex flex-col gap-5 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-white/30">
          {loading ? "Loading..." : `${dumps.length} dump file${dumps.length !== 1 ? "s" : ""}, ${bsods.length} BSOD record${bsods.length !== 1 ? "s" : ""}`}
        </span>
        <button
          id="bsod-refresh"
          onClick={fetchData}
          className="flex items-center justify-center w-9 h-9 rounded-lg
                     bg-white/[0.04] border border-white/10 text-white/50
                     hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* BSOD Crash Timeline */}
      {!loading && bsods.length > 1 && (() => {
        // Group by month
        const monthMap = new Map<string, number>();
        bsods.forEach((b) => {
          const d = new Date(b.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          monthMap.set(key, (monthMap.get(key) || 0) + 1);
        });
        const months = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const maxCount = Math.max(...months.map(([, c]) => c));

        return (
          <div className="glass-panel p-4">
            <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-3">
              Crash Frequency
            </h3>
            <div className="flex items-end gap-1 h-16">
              {months.map(([month, count]) => {
                const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const color = count >= 3 ? "#ff4757" : count >= 2 ? "#ffa502" : "#60CDFF";
                return (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1 group" title={`${month}: ${count} crash${count !== 1 ? "es" : ""}`}>
                    <span className="text-[9px] text-white/0 group-hover:text-white/50 transition-colors tabular-nums">
                      {count}
                    </span>
                    <div className="w-full flex flex-col justify-end" style={{ height: "40px" }}>
                      <div
                        className="w-full rounded-t transition-all duration-500"
                        style={{
                          height: `${Math.max(pct, 8)}%`,
                          backgroundColor: color,
                          opacity: 0.8,
                        }}
                      />
                    </div>
                    <span className="text-[8px] text-white/25 tabular-nums">
                      {month.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {loading ? (
        <div className="flex flex-col gap-4 flex-1">
          <div className="glass-panel p-4 flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          {!isAdmin ? (
            /* Non-admin: show admin required message */
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-warning/10">
                <Shield className="w-8 h-8 text-warning" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white/80 mb-1">
                  Administrator Required
                </h3>
                <p className="text-[13px] text-white/35 max-w-md leading-relaxed">
                  BSOD crash dumps and event logs require administrator privileges
                  to access. Relaunch the app as admin to view crash history.
                </p>
                <button
                  onClick={promptAdmin}
                  className="mt-3 inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                             bg-accent/90 text-black hover:bg-accent transition-all duration-200"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Relaunch as Admin
                </button>
              </div>
            </>
          ) : (
            /* Admin but no data: system is stable */
            <>
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-success/10">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white/80 mb-1">
                  No BSOD Records Found
                </h3>
                <p className="text-[13px] text-white/35 max-w-md leading-relaxed">
                  Your system appears stable! No blue screen crash dumps or
                  BSOD history entries were detected. Keep up the good work! 🎉
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left: Dump List + BSOD History */}
          <div className={`flex flex-col gap-4 overflow-y-auto transition-all duration-300 ${
            selectedDump || selectedBsod !== null ? "w-[350px] min-w-[350px]" : "w-full"
          }`}>
            {/* Minidump Files */}
            {dumps.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1 flex items-center gap-2">
                  <FileArchive className="w-3.5 h-3.5" />
                  Minidump Files
                </h2>
                <div className="glass-panel overflow-hidden">
                  {dumps.map((dump, idx) => (
                    <div
                      key={dump.filename}
                      onClick={() => handleSelectDump(dump)}
                      className={`flex items-center px-4 h-[42px] text-[13px] cursor-pointer
                                 border-b border-white/[0.03] transition-all duration-200
                                 ${selectedDump?.filename === dump.filename
                                   ? "bg-accent/[0.08] border-l-2 border-l-accent"
                                   : idx % 2 === 0
                                     ? "bg-transparent hover:bg-white/[0.04]"
                                     : "bg-white/[0.015] hover:bg-white/[0.04]"
                                 }`}
                    >
                      <FileArchive className="w-4 h-4 text-accent/50 shrink-0 mr-3" />
                      <div className="flex-1 min-w-0">
                        <span className="text-white/75 font-mono text-[12px] truncate block">
                          {dump.filename}
                        </span>
                        <div className="flex items-center gap-3 text-[10px] text-white/35">
                          <span className="font-mono tabular-nums">{dump.date_created}</span>
                          <span>{formatKB(dump.size_kb)}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-white/20 shrink-0" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* BSOD History */}
            {bsods.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1 flex items-center gap-2">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  BSOD History
                </h2>
                <div className="flex flex-col gap-3">
                  {bsods.map((bsod, idx) => {
                    const isSelected = !selectedDump && selectedBsod === idx;
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSelectBsod(idx)}
                        className={`glass-panel p-4 cursor-pointer transition-all duration-300
                                   border-l-2 ${isSelected
                                     ? "border-l-accent bg-accent/[0.04]"
                                     : "border-l-danger/40 hover:bg-white/[0.05]"}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-danger/15">
                              <AlertOctagon className="w-4 h-4 text-danger" />
                            </div>
                            <div>
                              <span className="text-[14px] font-bold font-mono text-danger/90 tracking-wider">
                                {bsod.bugcheck_code}
                              </span>
                              <p className="text-[12px] text-white/50 mt-0.5 line-clamp-2">
                                {bsod.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-4">
                            <span className="text-[11px] text-white/30 font-mono tabular-nums">
                              {bsod.date}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-white/20" />
                          </div>
                        </div>

                        {bsod.parameters && (
                          <div className="bg-white/[0.03] rounded-md px-2.5 py-1.5 mt-1">
                            <span className="text-[9px] text-white/25 uppercase tracking-wider font-semibold">
                              Parameters
                            </span>
                            <p className="text-[11px] text-white/50 font-mono truncate mt-0.5">
                              {bsod.parameters}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Right: Dump Analysis Panel */}
          {selectedDump && (
            <div className="flex-1 glass-panel-strong flex flex-col overflow-hidden animate-slide-in min-w-0">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-semibold text-white/90">Dump Analysis</span>
                </div>
                <span className="text-[11px] text-white/30 font-mono">{selectedDump.filename}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04] shrink-0">
                <button
                  onClick={handleSearchWeb}
                  disabled={!analysis}
                  className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                             bg-accent/10 text-accent/80 hover:bg-accent/20 hover:text-accent
                             disabled:opacity-40 transition-all duration-200 border border-accent/20"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Search Web
                </button>
                <button
                  onClick={handleOpenFile}
                  className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                             bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80
                             transition-all duration-200 border border-white/10"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Open File
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                             bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/80
                             transition-all duration-200 border border-white/10"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Open Folder
                </button>
              </div>

              {/* Analysis Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {analyzing ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Loader2 className="w-8 h-8 text-accent animate-spin" />
                    <span className="text-[13px] text-white/40">Analyzing dump file...</span>
                  </div>
                ) : analysis ? (
                  <div className="flex flex-col gap-5">
                    {/* Bug Check Code - Prominent */}
                    <div className="glass-panel p-5 border-l-2 border-l-danger/50">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-danger/15">
                          <AlertOctagon className="w-5 h-5 text-danger" />
                        </div>
                        <div>
                          <span className="text-[18px] font-bold font-mono text-danger/90 tracking-wider">
                            {analysis.bug_check_code || "Unknown"}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            {analysis.dump_type && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 font-medium">
                                {analysis.dump_type}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {analysis.bug_check_description && (
                        <p className="text-[12.5px] text-white/60 leading-relaxed line-clamp-4">
                          {analysis.bug_check_description}
                        </p>
                      )}
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <AnalysisField
                        icon={<Clock className="w-3.5 h-3.5" />}
                        label="Timestamp"
                        value={analysis.timestamp}
                      />
                      {analysis.faulting_module && (
                        <AnalysisField
                          icon={<Cpu className="w-3.5 h-3.5" />}
                          label="Faulting Module"
                          value={analysis.faulting_module}
                          highlight
                        />
                      )}
                      {analysis.process_at_crash && (
                        <AnalysisField
                          icon={<Cpu className="w-3.5 h-3.5" />}
                          label="Process at Crash"
                          value={analysis.process_at_crash}
                        />
                      )}
                      {analysis.os_version && (
                        <AnalysisField
                          icon={<Info className="w-3.5 h-3.5" />}
                          label="OS Version"
                          value={analysis.os_version}
                        />
                      )}
                    </div>

                    {/* Bug Check Parameters */}
                    {analysis.parameters.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2 flex items-center gap-2">
                          <Hash className="w-3.5 h-3.5" />
                          Bug Check Parameters
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {analysis.parameters.map((param, i) => (
                            <div
                              key={i}
                              className="bg-white/[0.03] rounded-md px-3 py-2 border border-white/[0.05]"
                            >
                              <span className="text-[9px] text-white/25 uppercase font-semibold">
                                Param {i + 1}
                              </span>
                              <p className="text-[12px] text-accent/70 font-mono mt-0.5">
                                {param}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* File Info */}
                    <div>
                      <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                        File Information
                      </h4>
                      <div className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/[0.05]">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-white/40">Filename</span>
                          <span className="text-white/70 font-mono">{selectedDump.filename}</span>
                        </div>
                        <div className="flex items-center justify-between text-[12px] mt-1.5">
                          <span className="text-white/40">Date Created</span>
                          <span className="text-white/70 font-mono">{selectedDump.date_created}</span>
                        </div>
                        <div className="flex items-center justify-between text-[12px] mt-1.5">
                          <span className="text-white/40">Size</span>
                          <span className="text-white/70 font-mono">{formatKB(selectedDump.size_kb)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[12px] mt-1.5">
                          <span className="text-white/40">Path</span>
                          <span className="text-white/60 font-mono text-[11px] truncate max-w-[300px]">
                            {selectedDump.full_path}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-white/30 text-[13px]">
                    Analysis unavailable
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right: BSOD History Detail Panel */}
          {selectedBsod !== null && !selectedDump && bsods[selectedBsod] && (
            <div className="flex-1 glass-panel-strong flex flex-col overflow-hidden animate-slide-in min-w-0">
              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-danger" />
                  <span className="text-[13px] font-semibold text-white/90">BSOD Details</span>
                </div>
                <button
                  onClick={() => setSelectedBsod(null)}
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             text-white/30 hover:text-white/70 hover:bg-white/[0.06]
                             transition-all duration-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04] shrink-0">
                <button
                  onClick={() => handleSearchBsodWeb(bsods[selectedBsod!])}
                  className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                             bg-accent/10 text-accent/80 hover:bg-accent/20 hover:text-accent
                             transition-all duration-200 border border-accent/20"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Search Web for Fix
                </button>
              </div>

              {/* BSOD Content */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-5">
                  {/* Bug Check Code */}
                  <div className="glass-panel p-5 border-l-2 border-l-danger/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-danger/15">
                        <AlertOctagon className="w-5 h-5 text-danger" />
                      </div>
                      <span className="text-[18px] font-bold font-mono text-danger/90 tracking-wider">
                        {bsods[selectedBsod!].bugcheck_code}
                      </span>
                    </div>
                    {bsods[selectedBsod!].description && (
                      <p className="text-[12.5px] text-white/60 leading-relaxed">
                        {bsods[selectedBsod!].description}
                      </p>
                    )}
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <AnalysisField
                      icon={<Clock className="w-3.5 h-3.5" />}
                      label="Date"
                      value={bsods[selectedBsod!].date}
                    />
                    <AnalysisField
                      icon={<Hash className="w-3.5 h-3.5" />}
                      label="Bug Check Code"
                      value={bsods[selectedBsod!].bugcheck_code}
                      highlight
                    />
                  </div>

                  {/* Parameters */}
                  {bsods[selectedBsod!].parameters && (
                    <div>
                      <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5" />
                        Parameters
                      </h4>
                      <div className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/[0.05]">
                        <p className="text-[12px] text-accent/70 font-mono break-all">
                          {bsods[selectedBsod!].parameters}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Troubleshooting Tips */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                      Troubleshooting
                    </h4>
                    <div className="glass-panel p-3.5 flex flex-col gap-2">
                      <p className="text-[12px] text-white/55 leading-relaxed">
                        Click <strong className="text-accent/80">"Search Web for Fix"</strong> above to find community solutions and Microsoft documentation for this specific error.
                      </p>
                      <p className="text-[12px] text-white/40 leading-relaxed">
                        Common causes include driver issues, hardware failures, overheating, or corrupted system files. Running SFC and DISM from Quick Tools can help resolve system file corruption.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Analysis Field ─── */
function AnalysisField({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="glass-panel p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-white/35">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-[12.5px] font-mono break-all ${
        highlight ? "text-danger/80" : "text-white/70"
      }`}>
        {value}
      </span>
    </div>
  );
}
