import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useToast } from "./ToastProvider";
import {
  Globe,
  Search,
  RefreshCw,
  Play,
  Loader2,
  Copy,
  Check,
  X,
  Wifi,
  WifiOff,
  Network,
  Route,
  Radar,
} from "lucide-react";

// ─── Types ───

type CliOutput =
  | { type: "Stdout"; line: string }
  | { type: "Stderr"; line: string }
  | { type: "Complete"; exit_code: number }
  | { type: "Error"; message: string };

interface NetworkConnection {
  local_address: string;
  local_port: number;
  remote_address: string;
  remote_port: number;
  state: string;
  process_id: number;
  process_name: string | null;
}

interface DnsRecord {
  name: string;
  record_type: number | null;
  data: string | null;
  ttl: number | null;
}

interface DnsLookupResult {
  records: DnsRecord[];
  query: string;
}

interface WifiInfo {
  connected: boolean;
  ssid: string | null;
  signal_strength: number | null;
  channel: number | null;
  band: string | null;
  auth_type: string | null;
  bssid: string | null;
  radio_type: string | null;
  receive_rate_mbps: number | null;
  transmit_rate_mbps: number | null;
  raw_interface: string;
}

type Tab = "connections" | "ping" | "traceroute" | "dns" | "wifi";

interface OutputLine {
  type: "stdout" | "stderr" | "info";
  text: string;
}

// ─── Helpers ───

function stateColor(state: string): string {
  switch (state) {
    case "Established": return "bg-success/15 text-success border-success/30";
    case "Listen": return "bg-accent/15 text-accent border-accent/30";
    case "TimeWait": return "bg-warning/15 text-warning border-warning/30";
    case "CloseWait": return "bg-warning/15 text-warning border-warning/30";
    case "SynSent": return "bg-accent/15 text-accent border-accent/30";
    default: return "bg-white/[0.06] text-white/50 border-white/10";
  }
}

function dnsTypeLabel(typeNum: number | null): { label: string; color: string } {
  switch (typeNum) {
    case 1: return { label: "A", color: "bg-accent/15 text-accent border-accent/30" };
    case 28: return { label: "AAAA", color: "bg-success/15 text-success border-success/30" };
    case 5: return { label: "CNAME", color: "bg-warning/15 text-warning border-warning/30" };
    case 15: return { label: "MX", color: "bg-danger/15 text-danger border-danger/30" };
    case 16: return { label: "TXT", color: "bg-white/[0.06] text-white/50 border-white/10" };
    case 6: return { label: "SOA", color: "bg-white/[0.06] text-white/50 border-white/10" };
    case 2: return { label: "NS", color: "bg-accent/15 text-accent border-accent/30" };
    default: return { label: String(typeNum || "?"), color: "bg-white/[0.06] text-white/50 border-white/10" };
  }
}

// ─── Tab Definitions ───

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "connections", label: "Connections", icon: <Network className="w-3.5 h-3.5" /> },
  { key: "ping", label: "Ping", icon: <Radar className="w-3.5 h-3.5" /> },
  { key: "traceroute", label: "Traceroute", icon: <Route className="w-3.5 h-3.5" /> },
  { key: "dns", label: "DNS Lookup", icon: <Globe className="w-3.5 h-3.5" /> },
  { key: "wifi", label: "WiFi", icon: <Wifi className="w-3.5 h-3.5" /> },
];

// ─── Signal Bars ───

function SignalBars({ strength }: { strength: number }) {
  const bars = strength > 75 ? 4 : strength > 50 ? 3 : strength > 25 ? 2 : 1;
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-1.5 rounded-sm transition-all duration-300
                       ${i <= bars ? "bg-success" : "bg-white/[0.1]"}`}
          style={{ height: `${(i / 4) * 100}%` }}
        />
      ))}
    </div>
  );
}

// ─── Component ───

export default function NetworkDiagnostics() {
  const [activeTab, setActiveTab] = useState<Tab>("connections");
  const { showToast } = useToast();

  // Connections state
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [connLoading, setConnLoading] = useState(true);
  const [connSearch, setConnSearch] = useState("");

  // Ping/Traceroute state
  const [host, setHost] = useState("8.8.8.8");
  const [pingCount, setPingCount] = useState(4);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [copied, setCopied] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // DNS state
  const [dnsDomain, setDnsDomain] = useState("");
  const [dnsResult, setDnsResult] = useState<DnsLookupResult | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);

  // WiFi state
  const [wifiInfo, setWifiInfo] = useState<WifiInfo | null>(null);
  const [wifiLoading, setWifiLoading] = useState(true);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  // Load connections
  const loadConnections = useCallback(async () => {
    setConnLoading(true);
    try {
      const result = await invoke<NetworkConnection[]>("get_active_connections");
      setConnections(result);
    } catch (err) {
      showToast("Failed to load network connections", "error");
    } finally {
      setConnLoading(false);
    }
  }, []);

  // Load WiFi
  const loadWifi = useCallback(async () => {
    setWifiLoading(true);
    try {
      const result = await invoke<WifiInfo>("get_wifi_info");
      setWifiInfo(result);
    } catch (err) {
      showToast("Failed to load WiFi information", "error");
    } finally {
      setWifiLoading(false);
    }
  }, []);

  // Load data on tab change
  useEffect(() => {
    if (activeTab === "connections") loadConnections();
    if (activeTab === "wifi") loadWifi();
  }, [activeTab, loadConnections, loadWifi]);

  const runPing = async () => {
    if (running || !host.trim()) return;
    setRunning(true);
    setOutput((prev) => {
      const next = [...prev, { type: "info" as const, text: `\n▸ Pinging ${host} (${pingCount} packets)...` }];
      return next.length > 1000 ? next.slice(-1000) : next;
    });

    try {
      const onOutput = new Channel<CliOutput>();
      onOutput.onmessage = (msg) => {
        switch (msg.type) {
          case "Stdout":
            setOutput((prev) => {
              const next = [...prev, { type: "stdout" as const, text: msg.line }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            break;
          case "Stderr":
            setOutput((prev) => {
              const next = [...prev, { type: "stderr" as const, text: msg.line }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            break;
          case "Complete":
            setOutput((prev) => {
              const next = [...prev, { type: "info" as const, text: `✓ Ping complete (exit code ${msg.exit_code})` }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            setRunning(false);
            break;
          case "Error":
            setOutput((prev) => {
              const next = [...prev, { type: "stderr" as const, text: `Error: ${msg.message}` }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            setRunning(false);
            break;
        }
      };
      await invoke("ping_host", { host: host.trim(), count: pingCount, onOutput });
    } catch (err) {
      setOutput((prev) => {
        const next = [...prev, { type: "stderr" as const, text: `Failed: ${err}` }];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
      setRunning(false);
    }
  };

  const runTraceroute = async () => {
    if (running || !host.trim()) return;
    setRunning(true);
    setOutput((prev) => {
      const next = [...prev, { type: "info" as const, text: `\n▸ Tracing route to ${host}...` }];
      return next.length > 1000 ? next.slice(-1000) : next;
    });

    try {
      const onOutput = new Channel<CliOutput>();
      onOutput.onmessage = (msg) => {
        switch (msg.type) {
          case "Stdout":
            setOutput((prev) => {
              const next = [...prev, { type: "stdout" as const, text: msg.line }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            break;
          case "Stderr":
            setOutput((prev) => {
              const next = [...prev, { type: "stderr" as const, text: msg.line }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            break;
          case "Complete":
            setOutput((prev) => {
              const next = [...prev, { type: "info" as const, text: `✓ Traceroute complete (exit code ${msg.exit_code})` }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            setRunning(false);
            break;
          case "Error":
            setOutput((prev) => {
              const next = [...prev, { type: "stderr" as const, text: `Error: ${msg.message}` }];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            setRunning(false);
            break;
        }
      };
      await invoke("traceroute_host", { host: host.trim(), onOutput });
    } catch (err) {
      setOutput((prev) => {
        const next = [...prev, { type: "stderr" as const, text: `Failed: ${err}` }];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
      setRunning(false);
    }
  };

  // DNS lookup
  const runDnsLookup = async () => {
    if (!dnsDomain.trim()) return;
    setDnsLoading(true);
    try {
      const result = await invoke<DnsLookupResult>("dns_lookup", { domain: dnsDomain.trim() });
      setDnsResult(result);
    } catch (err) {
      showToast("DNS lookup failed", "error");
      setDnsResult({ records: [], query: dnsDomain });
    } finally {
      setDnsLoading(false);
    }
  };

  // Terminal helpers
  const copyOutput = async () => {
    const text = output.map((l) => l.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const clearTerminal = () => setOutput([]);

  // Filtered connections
  const filteredConns = useMemo(() => connections.filter((c) => {
    if (!connSearch) return true;
    const term = connSearch.toLowerCase();
    return (
      c.process_name?.toLowerCase().includes(term) ||
      c.remote_address.includes(term) ||
      c.local_address.includes(term) ||
      c.state.toLowerCase().includes(term)
    );
  }), [connections, connSearch]);

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-medium
                         transition-all duration-200 border
                         ${activeTab === key
                           ? "border-accent/30 bg-accent/15 text-accent"
                           : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/75 hover:bg-white/[0.05]"
                         }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Connections Tab ── */}
      {activeTab === "connections" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Controls */}
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-white/40 font-medium">
              {filteredConns.length} active connection{filteredConns.length !== 1 ? "s" : ""}
            </span>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                value={connSearch}
                onChange={(e) => setConnSearch(e.target.value)}
                placeholder="Filter by process or address..."
                className="glass-input h-8 pl-8 pr-3 text-[12px] w-56"
              />
            </div>
            <button
              onClick={loadConnections}
              disabled={connLoading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium
                         border border-white/10 bg-white/[0.03] text-white/50
                         hover:text-white/75 hover:bg-white/[0.05] transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${connLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Table */}
          <div className="glass-panel flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center gap-3 px-4 h-9 border-b border-white/[0.06]
                             bg-white/[0.02] text-[10px] font-semibold text-white/30 uppercase tracking-wider shrink-0">
              <div className="w-28">Process</div>
              <div className="w-12">PID</div>
              <div className="flex-1">Local</div>
              <div className="flex-1">Remote</div>
              <div className="w-24">State</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {connLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-28 h-3 shimmer" />
                    <div className="w-12 h-3 shimmer" />
                    <div className="flex-1 h-3 shimmer" />
                    <div className="flex-1 h-3 shimmer" />
                    <div className="w-24 h-3 shimmer" />
                  </div>
                ))
              ) : filteredConns.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <span className="text-[13px] text-white/20">No connections found</span>
                </div>
              ) : (
                filteredConns.map((conn, i) => (
                  <div
                    key={`${conn.local_port}-${conn.remote_port}-${conn.process_id}-${i}`}
                    className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.03]
                               hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="w-28 shrink-0">
                      <span className="text-[12px] text-white/70 font-medium truncate block">
                        {conn.process_name || "—"}
                      </span>
                    </div>
                    <div className="w-12 shrink-0">
                      <span className="text-[11px] text-white/30 font-mono">{conn.process_id}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-white/50 font-mono truncate block">
                        {conn.local_address}:{conn.local_port}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-white/50 font-mono truncate block">
                        {conn.remote_address}:{conn.remote_port}
                      </span>
                    </div>
                    <div className="w-24 shrink-0">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md border
                                        ${stateColor(conn.state)}`}>
                        {conn.state}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Ping Tab ── */}
      {activeTab === "ping" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="Host or IP address..."
                className="glass-input h-8 pl-8 pr-3 text-[12px] w-full"
                onKeyDown={(e) => e.key === "Enter" && runPing()}
              />
            </div>
            <div className="flex items-center gap-1">
              {[4, 10, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => setPingCount(n)}
                  className={`h-8 px-3 rounded-lg text-[12px] font-medium border transition-all
                              ${pingCount === n
                                ? "border-accent/30 bg-accent/15 text-accent"
                                : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/75"
                              }`}
                >
                  {n}×
                </button>
              ))}
            </div>
            <button
              onClick={runPing}
              disabled={running || !host.trim()}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold
                         bg-accent/90 text-black hover:bg-accent disabled:opacity-40
                         transition-all duration-200"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Ping
            </button>
          </div>

          {/* Terminal */}
          <TerminalPanel output={output} terminalRef={terminalRef} copied={copied}
                          onCopy={copyOutput} onClear={clearTerminal} />
        </div>
      )}

      {/* ── Traceroute Tab ── */}
      {activeTab === "traceroute" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Route className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="Host or IP address..."
                className="glass-input h-8 pl-8 pr-3 text-[12px] w-full"
                onKeyDown={(e) => e.key === "Enter" && runTraceroute()}
              />
            </div>
            <button
              onClick={runTraceroute}
              disabled={running || !host.trim()}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold
                         bg-accent/90 text-black hover:bg-accent disabled:opacity-40
                         transition-all duration-200"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Trace
            </button>
          </div>

          <TerminalPanel output={output} terminalRef={terminalRef} copied={copied}
                          onCopy={copyOutput} onClear={clearTerminal} />
        </div>
      )}

      {/* ── DNS Tab ── */}
      {activeTab === "dns" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input
                type="text"
                value={dnsDomain}
                onChange={(e) => setDnsDomain(e.target.value)}
                placeholder="Domain name (e.g. google.com)..."
                className="glass-input h-8 pl-8 pr-3 text-[12px] w-full"
                onKeyDown={(e) => e.key === "Enter" && runDnsLookup()}
              />
            </div>
            <button
              onClick={runDnsLookup}
              disabled={dnsLoading || !dnsDomain.trim()}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold
                         bg-accent/90 text-black hover:bg-accent disabled:opacity-40
                         transition-all duration-200"
            >
              {dnsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Lookup
            </button>
          </div>

          {/* DNS Results */}
          {dnsResult && (
            <div className="glass-panel p-4 flex-1 overflow-y-auto animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="w-4 h-4 text-accent" />
                <span className="text-[13px] font-semibold text-white/80">
                  Results for <span className="text-accent font-mono">{dnsResult.query}</span>
                </span>
                <span className="text-[11px] text-white/30 ml-auto">{dnsResult.records.length} records</span>
              </div>
              {dnsResult.records.length === 0 ? (
                <span className="text-[12px] text-white/30">No records found</span>
              ) : (
                <div className="flex flex-col gap-2">
                  {dnsResult.records.map((record, i) => {
                    const typeInfo = dnsTypeLabel(record.record_type);
                    return (
                      <div key={i} className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-3 py-2.5
                                               border border-white/[0.05]">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${typeInfo.color} shrink-0 w-12 text-center`}>
                          {typeInfo.label}
                        </span>
                        <span className="text-[12px] text-white/50 font-mono truncate flex-1">{record.name}</span>
                        <span className="text-[12px] text-white/70 font-mono font-semibold truncate flex-1">
                          {record.data || "—"}
                        </span>
                        {record.ttl !== null && (
                          <span className="text-[10px] text-white/25 font-mono shrink-0">TTL {record.ttl}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── WiFi Tab ── */}
      {activeTab === "wifi" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex items-center justify-end">
            <button
              onClick={loadWifi}
              disabled={wifiLoading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium
                         border border-white/10 bg-white/[0.03] text-white/50
                         hover:text-white/75 hover:bg-white/[0.05] transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${wifiLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {wifiLoading ? (
            <div className="glass-panel p-6 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
            </div>
          ) : wifiInfo && wifiInfo.connected ? (
            <div className="glass-panel p-5 animate-fade-in">
              <div className="flex items-center gap-4 mb-5">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-success/10">
                  <Wifi className="w-6 h-6 text-success" />
                </div>
                <div className="flex-1">
                  <span className="text-[16px] font-bold text-white/90 block">{wifiInfo.ssid || "Connected"}</span>
                  <span className="text-[12px] text-success/60 font-medium">Connected</span>
                </div>
                {wifiInfo.signal_strength !== null && (
                  <div className="flex items-center gap-3">
                    <SignalBars strength={wifiInfo.signal_strength} />
                    <span className="text-[18px] font-bold text-white/80 tabular-nums">
                      {wifiInfo.signal_strength}%
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {wifiInfo.channel !== null && (
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                    <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Channel</span>
                    <span className="text-[14px] font-bold text-white/70">{wifiInfo.channel}</span>
                  </div>
                )}
                {wifiInfo.band && (
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                    <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Band</span>
                    <span className="text-[14px] font-bold text-white/70">{wifiInfo.band}</span>
                  </div>
                )}
                {wifiInfo.radio_type && (
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                    <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Radio</span>
                    <span className="text-[14px] font-bold text-white/70">{wifiInfo.radio_type}</span>
                  </div>
                )}
                {wifiInfo.auth_type && (
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                    <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Security</span>
                    <span className="text-[14px] font-bold text-white/70">{wifiInfo.auth_type}</span>
                  </div>
                )}
                {wifiInfo.receive_rate_mbps !== null && (
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                    <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Download</span>
                    <span className="text-[14px] font-bold text-accent">{wifiInfo.receive_rate_mbps} Mbps</span>
                  </div>
                )}
                {wifiInfo.transmit_rate_mbps !== null && (
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                    <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">Upload</span>
                    <span className="text-[14px] font-bold text-accent">{wifiInfo.transmit_rate_mbps} Mbps</span>
                  </div>
                )}
                {wifiInfo.bssid && (
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.05] col-span-2">
                    <span className="text-[10px] text-white/30 uppercase font-semibold block mb-1">BSSID</span>
                    <span className="text-[13px] font-mono text-white/50">{wifiInfo.bssid}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-6 flex flex-col items-center gap-3 animate-fade-in">
              <WifiOff className="w-8 h-8 text-white/15" />
              <span className="text-[13px] text-white/30">Not connected to WiFi</span>
              <span className="text-[11px] text-white/15">WiFi adapter may be disabled or not present</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared Terminal Panel ───

function TerminalPanel({
  output,
  terminalRef,
  copied,
  onCopy,
  onClear,
}: {
  output: OutputLine[];
  terminalRef: React.RefObject<HTMLDivElement | null>;
  copied: boolean;
  onCopy: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 glass-panel overflow-hidden min-h-[180px]">
      <div className="flex items-center justify-between px-4 h-9 border-b border-white/[0.06]
                       bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-danger/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
          </div>
          <span className="text-[11px] text-white/30 font-mono ml-2">Output</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onCopy}
            className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium
                       text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all">
            {copied ? <><Check className="w-3 h-3 text-success" /><span className="text-success">Copied</span></> : <><Copy className="w-3 h-3" />Copy</>}
          </button>
          <button onClick={onClear}
            className="flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium
                       text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all">
            <X className="w-3 h-3" />Clear
          </button>
        </div>
      </div>

      <div ref={terminalRef as React.RefObject<HTMLDivElement>} className="flex-1 overflow-y-auto p-4 bg-[var(--color-terminal-bg)]">
        {output.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-white/15 font-mono">
              Enter a host and click Run to begin...
            </span>
          </div>
        ) : (
          <pre className="terminal-output whitespace-pre-wrap break-words">
            {output.map((line, i) => (
              <div key={i} className={line.type === "stderr" ? "stderr" : line.type === "info" ? "info" : "stdout"}>
                {line.text}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
