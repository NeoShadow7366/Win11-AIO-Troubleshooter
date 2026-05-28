import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  RefreshCw,
  Shield,
  ShieldOff,
  ArrowDownToLine,
  ArrowUpFromLine,
  X,
} from "lucide-react";
import type { FirewallRule } from "../types";
import { useToast } from "./ToastProvider";

/* ─── Direction Badge ─── */
function DirectionBadge({ dir }: { dir: string }) {
  const isIn = dir === "Inbound" || dir === "1";
  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border
      ${isIn
        ? "bg-accent/10 text-accent border-accent/20"
        : "bg-warning/10 text-warning border-warning/20"
      }`}>
      {isIn ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
      {isIn ? "Inbound" : "Outbound"}
    </span>
  );
}

/* ─── Action Badge ─── */
function ActionBadge({ action }: { action: string }) {
  const isAllow = action === "Allow" || action === "2";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border
      ${isAllow
        ? "bg-success/10 text-success border-success/20"
        : "bg-danger/10 text-danger border-danger/20"
      }`}>
      {isAllow ? "Allow" : "Block"}
    </span>
  );
}

/* ─── Component ─── */
export default function FirewallViewer() {
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDirection, setFilterDirection] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterEnabled, setFilterEnabled] = useState<string>("enabled");
  const [selectedRule, setSelectedRule] = useState<FirewallRule | null>(null);
  const { showToast } = useToast();

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<FirewallRule[]>("get_firewall_rules");
      setRules(data);
    } catch (err) {
      showToast(`Failed to load firewall rules: ${err}`, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.display_name.toLowerCase().includes(q) &&
          !r.program.toLowerCase().includes(q) &&
          !r.local_port.toLowerCase().includes(q) &&
          !r.protocol.toLowerCase().includes(q)
        ) return false;
      }
      if (filterDirection !== "all") {
        const isIn = r.direction === "Inbound" || r.direction === "1";
        if (filterDirection === "inbound" && !isIn) return false;
        if (filterDirection === "outbound" && isIn) return false;
      }
      if (filterAction !== "all") {
        const isAllow = r.action === "Allow" || r.action === "2";
        if (filterAction === "allow" && !isAllow) return false;
        if (filterAction === "block" && isAllow) return false;
      }
      if (filterEnabled === "enabled" && !r.enabled) return false;
      if (filterEnabled === "disabled" && r.enabled) return false;
      return true;
    });
  }, [rules, search, filterDirection, filterAction, filterEnabled]);

  const inboundCount = rules.filter((r) => r.direction === "Inbound" || r.direction === "1").length;
  const outboundCount = rules.length - inboundCount;
  const blockCount = rules.filter((r) => r.action === "Block" || r.action === "4").length;

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search rules, ports, programs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full h-9 pl-9 pr-3 text-[13px]"
          />
        </div>

        {/* Direction filter */}
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
          {[
            { key: "all", label: "All" },
            { key: "inbound", label: `In (${inboundCount})` },
            { key: "outbound", label: `Out (${outboundCount})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterDirection(tab.key)}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all
                ${filterDirection === tab.key ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action filter */}
        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-border">
          {[
            { key: "all", label: "All" },
            { key: "allow", label: "Allow" },
            { key: "block", label: `Block (${blockCount})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterAction(tab.key)}
              className={`h-7 px-3 rounded-md text-[12px] font-medium transition-all
                ${filterAction === tab.key ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text-secondary"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Enabled filter */}
        <select
          value={filterEnabled}
          onChange={(e) => setFilterEnabled(e.target.value)}
          className="h-9 px-3 rounded-lg text-[12px] bg-surface border border-border text-text-secondary cursor-pointer"
        >
          <option value="all">All States</option>
          <option value="enabled">Enabled Only</option>
          <option value="disabled">Disabled Only</option>
        </select>

        <button
          onClick={fetchRules}
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
        <div className="flex items-center gap-3 text-[12px] text-text-tertiary">
          <span>{filtered.length} of {rules.length} rules</span>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 gap-4 min-h-0">
        <div className={`glass-panel flex flex-col overflow-hidden transition-all duration-300 ${
          selectedRule ? "flex-1 min-w-0" : "w-full"
        }`}>
          <div className="grid grid-cols-[1fr_80px_60px_80px_90px] gap-2 px-4 py-2.5 text-[11px]
                          font-semibold text-text-tertiary uppercase tracking-wider border-b border-border">
            <span>Rule</span>
            <span>Direction</span>
            <span>Action</span>
            <span>Protocol</span>
            <span>Port</span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-text-tertiary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-text-tertiary">
              No rules match your filters
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {filtered.map((rule, i) => {
                const isSelected = selectedRule?.name === rule.name;
                return (
                  <button
                    key={`${rule.name}-${i}`}
                    onClick={() => setSelectedRule(isSelected ? null : rule)}
                    className={`w-full grid grid-cols-[1fr_80px_60px_80px_90px] gap-2 px-4 py-2
                               text-left text-[12.5px] border-b border-border transition-all duration-150
                               ${isSelected ? "bg-accent/[0.06]" : "hover:bg-surface-hover"}
                               ${!rule.enabled ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {rule.enabled
                        ? <Shield className="w-3.5 h-3.5 text-success shrink-0" />
                        : <ShieldOff className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                      }
                      <span className="truncate text-text-primary/85 font-medium">{rule.display_name}</span>
                    </div>
                    <span className="self-center"><DirectionBadge dir={rule.direction} /></span>
                    <span className="self-center"><ActionBadge action={rule.action} /></span>
                    <span className="text-[11px] text-text-tertiary self-center">{rule.protocol}</span>
                    <span className="text-[11px] text-text-tertiary font-mono self-center truncate">
                      {rule.local_port || "Any"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedRule && (
          <div className="w-[340px] shrink-0 glass-panel flex flex-col overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <Shield className="w-4 h-4 text-accent shrink-0" />
                <h3 className="text-[14px] font-semibold text-text-primary/90 truncate">{selectedRule.display_name}</h3>
              </div>
              <button
                onClick={() => setSelectedRule(null)}
                className="flex items-center justify-center w-6 h-6 rounded
                           text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <DetailRow label="Internal Name" value={selectedRule.name} mono />
              <DetailRow label="Direction" value={selectedRule.direction === "1" ? "Inbound" : selectedRule.direction === "2" ? "Outbound" : selectedRule.direction} />
              <DetailRow label="Action" value={selectedRule.action === "2" ? "Allow" : selectedRule.action === "4" ? "Block" : selectedRule.action} />
              <DetailRow label="Enabled" value={selectedRule.enabled ? "Yes" : "No"} />
              <DetailRow label="Profile" value={selectedRule.profile || "Any"} />
              <DetailRow label="Protocol" value={selectedRule.protocol} />
              <DetailRow label="Local Port" value={selectedRule.local_port || "Any"} />
              <DetailRow label="Remote Port" value={selectedRule.remote_port || "Any"} />
              <DetailRow label="Remote Address" value={selectedRule.remote_address || "Any"} />
              {selectedRule.program && (
                <DetailRow label="Program" value={selectedRule.program} mono />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[11.5px] text-text-tertiary shrink-0">{label}</span>
      <span className={`text-[12px] text-text-primary/80 font-medium text-right break-all
                        ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}
