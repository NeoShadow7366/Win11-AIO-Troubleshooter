import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  CheckCircle2,
  FileArchive,
  AlertOctagon,
} from "lucide-react";
import type { MinidumpInfo, BsodRecord } from "../types";

export default function BsodAnalyzer() {
  const [dumps, setDumps] = useState<MinidumpInfo[]>([]);
  const [bsods, setBsods] = useState<BsodRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
      console.error("BSOD fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

      {loading ? (
        /* Skeleton */
        <div className="flex flex-col gap-4 flex-1">
          <div className="glass-panel p-4 flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 shimmer rounded-lg" />
            ))}
          </div>
          <div className="glass-panel p-4 flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 shimmer rounded-lg" />
            ))}
          </div>
        </div>
      ) : !hasData ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
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
        </div>
      ) : (
        <div className="flex flex-col gap-5 flex-1 overflow-y-auto">
          {/* Minidump Files */}
          {dumps.length > 0 && (
            <section>
              <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.12em] mb-3 px-1 flex items-center gap-2">
                <FileArchive className="w-3.5 h-3.5" />
                Minidump Files
              </h2>
              <div className="glass-panel overflow-hidden">
                {/* Header */}
                <div className="flex items-center px-4 h-9 border-b border-white/[0.06] bg-white/[0.02]
                                text-[10px] font-semibold text-white/35 uppercase tracking-wider">
                  <span className="flex-1">Filename</span>
                  <span className="w-[160px]">Date</span>
                  <span className="w-[100px] text-right">Size</span>
                </div>
                {/* Rows */}
                {dumps.map((dump, idx) => (
                  <div
                    key={dump.filename}
                    className={`flex items-center px-4 h-[38px] text-[13px]
                               border-b border-white/[0.03] hover:bg-white/[0.04]
                               transition-colors
                               ${idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}`}
                  >
                    <span className="flex-1 text-white/75 font-mono text-[12px] truncate">
                      {dump.filename}
                    </span>
                    <span className="w-[160px] text-white/45 text-[12px] font-mono tabular-nums">
                      {dump.date_created}
                    </span>
                    <span className="w-[100px] text-right text-white/40 text-[12px] font-mono tabular-nums">
                      {formatKB(dump.size_kb)}
                    </span>
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
                {bsods.map((bsod, idx) => (
                  <div
                    key={idx}
                    className="glass-panel p-4 hover:bg-white/[0.05] transition-all duration-300
                               border-l-2 border-l-danger/40"
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
                          <p className="text-[12px] text-white/50 mt-0.5">
                            {bsod.description}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] text-white/30 font-mono tabular-nums shrink-0 ml-4">
                        {bsod.date}
                      </span>
                    </div>

                    {/* Parameters */}
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
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
