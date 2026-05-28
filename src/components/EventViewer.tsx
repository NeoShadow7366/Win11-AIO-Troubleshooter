import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "./ToastProvider";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  Filter,
  Clock,
  FileText,
  Download,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Hash,
  AlertTriangle,
  Code,
  SlidersHorizontal,
  X,
  FolderOpen,
  Zap,
  RefreshCw,
  Terminal,
  Database,
  Layers,
  Trash2,
  Info,
  Play,
  BookOpen,
  Bookmark,
  EyeOff,
  Save,
  FolderOpen as FolderOpenIcon,
  SkipForward,
  SkipBack,
  Minus,
  Columns,
  BarChart3,
  GitCompare,
  Monitor,
  Link,
  Zap as ZapIcon,
  Group,
} from "lucide-react";
import type { CrashLogResult, EventLogEntry } from "../types";

type ColumnKey = "time" | "level" | "source" | "eventId" | "message";

interface LogChannelInfo {
  name: string;
  record_count: number;
  max_size: number;
  log_type: string;
}

interface LogProperties {
  log_name: string;
  record_count: number;
  max_size_mb: number;
  current_size_mb: number;
  log_mode: string;
  is_enabled: boolean;
  log_file_path: string;
}

type LevelFilter = "All" | "Critical" | "Error" | "Warning" | "Information" | "Verbose";
type DatePreset = "today" | "7days" | "30days" | "custom";
type SortField = "time_created" | "level" | "source" | "event_id" | "message";
type SortDirection = "asc" | "desc";
type DetailTab = "general" | "xml";
type ExportFormat = "csv" | "json" | "txt" | "html";

interface EventDetailResult {
  full_message: string;
  xml_content: string;
}

function getPresetDates(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 16);
  const startDate = new Date(now);

  switch (preset) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      break;
    case "7days":
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "30days":
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      return { start: "", end: "" };
  }

  const start = startDate.toISOString().slice(0, 16);
  return { start, end };
}

const LEVEL_ORDER: Record<string, number> = {
  Critical: 0,
  Error: 1,
  Warning: 2,
  Information: 3,
  Verbose: 4,
  Info: 3,
};

// ─── Export format generators ───

function generateCSV(entries: EventLogEntry[]): string {
  const headers = ["Time", "Level", "Source", "Event ID", "Task Category", "Keywords", "User", "Computer", "Message"];
  const rows = entries.map((e) => [
    e.time_created,
    e.level,
    e.source,
    String(e.event_id),
    e.task_category || "",
    e.keywords || "",
    e.user || "",
    e.computer || "",
    `"${(e.message || "").replace(/"/g, '""').replace(/\n/g, " ")}"`,
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function generateJSON(entries: EventLogEntry[]): string {
  const data = entries.map((e) => ({
    time_created: e.time_created,
    level: e.level,
    source: e.source,
    event_id: e.event_id,
    task_category: e.task_category || null,
    keywords: e.keywords || null,
    user: e.user || null,
    computer: e.computer || null,
    message: e.message,
  }));
  return JSON.stringify(data, null, 2);
}

function generateTXT(entries: EventLogEntry[]): string {
  return entries.map((e) =>
    [
      `Time:\t\t${e.time_created}`,
      `Level:\t\t${e.level}`,
      `Source:\t\t${e.source}`,
      `Event ID:\t${e.event_id}`,
      e.task_category ? `Category:\t${e.task_category}` : null,
      e.keywords ? `Keywords:\t${e.keywords}` : null,
      e.user ? `User:\t\t${e.user}` : null,
      e.computer ? `Computer:\t${e.computer}` : null,
      `Message:`,
      e.message || "(no message)",
      "",
      "─".repeat(80),
      "",
    ].filter(Boolean).join("\n")
  ).join("\n");
}

function generateHTML(entries: EventLogEntry[]): string {
  const rows = entries.map((e) => {
    const levelColor = e.level === "Critical" ? "#ff4444" : e.level === "Error" ? "#ff6b6b" : e.level === "Warning" ? "#ffa726" : e.level === "Information" ? "#42a5f5" : "#9e9e9e";
    return `    <tr>
      <td style="font-family:monospace;white-space:nowrap">${e.time_created}</td>
      <td><span style="color:${levelColor};font-weight:600">${e.level}</span></td>
      <td>${e.source}</td>
      <td style="font-family:monospace;text-align:center">${e.event_id}</td>
      <td>${e.task_category || ""}</td>
      <td>${e.user || ""}</td>
      <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(e.message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Event Log Export — ${new Date().toLocaleDateString()}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; margin: 2rem; }
    h1 { font-size: 1.25rem; color: #58a6ff; margin-bottom: 0.5rem; }
    .meta { font-size: 0.8rem; color: #8b949e; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: #161b22; color: #8b949e; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; padding: 8px 12px; text-align: left; border-bottom: 1px solid #21262d; }
    td { padding: 6px 12px; border-bottom: 1px solid #21262d; }
    tr:hover { background: #161b22; }
  </style>
</head>
<body>
  <h1>Windows Event Log Export</h1>
  <p class="meta">Generated: ${new Date().toLocaleString()} • ${entries.length} events</p>
  <table>
    <thead>
      <tr><th>Time</th><th>Level</th><th>Source</th><th>ID</th><th>Category</th><th>User</th><th>Message</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;
}

// ─── Simple XML syntax highlighter ───

function highlightXml(xml: string): React.ReactNode[] {
  const lines = xml.split("\n");
  return lines.map((line, i) => {
    const highlighted = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Tag names
      .replace(/&lt;(\/?[\w:-]+)/g, '<span style="color:#ff7b72">&lt;$1</span>')
      // Attribute names
      .replace(/\s([\w:-]+)=/g, ' <span style="color:#d2a8ff">$1</span>=')
      // Attribute values
      .replace(/"([^"]*)"/g, '<span style="color:#a5d6ff">"$1"</span>')
      // Close bracket
      .replace(/&gt;/g, '<span style="color:#ff7b72">&gt;</span>')
      // Text content between tags (simplified)
      ;
    return (
      <div key={i} className="flex">
        <span className="w-8 text-right pr-3 text-white/20 select-none shrink-0 text-[11px]">{i + 1}</span>
        <span dangerouslySetInnerHTML={{ __html: highlighted }} />
      </div>
    );
  });
}

// ─── Main component ───

export default function EventViewer() {
  const [result, setResult] = useState<CrashLogResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const { showToast } = useToast();

  // Preset
  const [activePreset, setActivePreset] = useState<DatePreset | null>("7days");

  // Filters
  const [startDate, setStartDate] = useState(() => getPresetDates("7days").start);
  const [endDate, setEndDate] = useState(() => getPresetDates("7days").end);
  const [sourceFilter, setSourceFilter] = useState("");
  const [level, setLevel] = useState<LevelFilter>("All");
  const [eventIdFilter, setEventIdFilter] = useState("");
  const [messageSearch, setMessageSearch] = useState("");

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [userFilter, setUserFilter] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");

  // Log source toggles
  const [showSystem, setShowSystem] = useState(true);
  const [showApplication, setShowApplication] = useState(true);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // Find Next tracking
  const [findMatches, setFindMatches] = useState<number[]>([]);
  const [findIndex, setFindIndex] = useState(-1);

  // Custom Views (saved filter configs)
  const [savedViews, setSavedViews] = useState<Array<{ name: string; filters: Record<string, unknown> }>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ev_saved_views") || "[]");
    } catch { return []; }
  });
  const [showSavedViews, setShowSavedViews] = useState(false);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Array<{ eventKey: string; note: string; entry: EventLogEntry }>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ev_bookmarks") || "[]");
    } catch { return []; }
  });
  const [showBookmarks, setShowBookmarks] = useState(false);

  // Noise suppression
  const [suppressionRules, setSuppressionRules] = useState<Array<{ source: string; eventId: number }>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ev_suppression") || "[]");
    } catch { return []; }
  });
  const [showSuppression, setShowSuppression] = useState(false);

  // Column customization
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ev_columns") || 'null') ?? { time: true, level: true, source: true, eventId: true, message: true };
    } catch { return { time: true, level: true, source: true, eventId: true, message: true }; }
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Dashboard
  const [showDashboard, setShowDashboard] = useState(false);

  // Diff view
  const [showDiff, setShowDiff] = useState(false);
  const [diffA, setDiffA] = useState<number>(0);
  const [diffB, setDiffB] = useState<number>(1);

  // Remote computer
  const [showRemote, setShowRemote] = useState(false);
  const [remoteComputer, setRemoteComputer] = useState("");
  const [remoteLog, setRemoteLog] = useState("System");
  const [remoteLevel, setRemoteLevel] = useState("All");
  const [loadingRemote, setLoadingRemote] = useState(false);

  // Attach task
  const [showAttachTask, setShowAttachTask] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskSource, setTaskSource] = useState("");
  const [taskEventId, setTaskEventId] = useState(0);
  const [taskLogName, setTaskLogName] = useState("System");
  const [taskActionType, setTaskActionType] = useState("powershell");
  const [taskActionValue, setTaskActionValue] = useState("");

  // Event correlation
  const [showCorrelation, setShowCorrelation] = useState(false);

  // KB linking
  const kbLookupUrl = (eventId: number, source: string) =>
    `https://www.google.com/search?q=windows+event+id+${eventId}+${encodeURIComponent(source)}+site:learn.microsoft.com`;

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Expanded row
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [fullMessage, setFullMessage] = useState<string | null>(null);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("general");

  // Sorting
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Export
  const [exporting, setExporting] = useState(false);

  // Regex toggle
  const [useRegex, setUseRegex] = useState(false);

  // .evtx file mode
  const [evtxMode, setEvtxMode] = useState(false);
  const [evtxPath, setEvtxPath] = useState<string | null>(null);

  // Real-time monitoring
  const [liveMode, setLiveMode] = useState(false);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Quick filter presets
  const quickPresets = [
    { label: "Errors Last Hour", level: "Error" as LevelFilter, preset: "today" as DatePreset, source: "", ids: "" },
    { label: "Critical Today", level: "Critical" as LevelFilter, preset: "today" as DatePreset, source: "", ids: "" },
    { label: "App Crashes", level: "Error" as LevelFilter, preset: "7days" as DatePreset, source: "Application Error", ids: "1000" },
    { label: "Disk Warnings", level: "Warning" as LevelFilter, preset: "30days" as DatePreset, source: "disk", ids: "" },
    { label: "Login Failures", level: "All" as LevelFilter, preset: "7days" as DatePreset, source: "", ids: "4625" },
  ];
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Phase 4: Browse All Logs modal
  const [showBrowseLogs, setShowBrowseLogs] = useState(false);
  const [logChannels, setLogChannels] = useState<LogChannelInfo[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [channelSearch, setChannelSearch] = useState("");

  // Phase 4: XPath Query Editor
  const [showXPathEditor, setShowXPathEditor] = useState(false);
  const [xpathQuery, setXpathQuery] = useState("*[System[Level=2]]");
  const [xpathLogName, setXpathLogName] = useState("System");
  const [xpathMaxEvents, setXpathMaxEvents] = useState(500);

  // Phase 4: Log Properties
  const [showLogProps, setShowLogProps] = useState(false);
  const [logProps, setLogProps] = useState<LogProperties | null>(null);
  const [logPropsName, setLogPropsName] = useState("System");
  const [loadingProps, setLoadingProps] = useState(false);

  // Phase 4: PowerShell command modal
  const [showPSModal, setShowPSModal] = useState(false);
  const [psCommand, setPsCommand] = useState("");

  const activeAdvancedCount = [userFilter, keywordFilter].filter(Boolean).length;

  const fetchLogs = useCallback(
    async (
      targetPage = 0,
      overrideStart?: string,
      overrideEnd?: string,
      overrideSources?: { system: boolean; application: boolean; security: boolean },
      overrideLevel?: LevelFilter,
      overrideSourceFilter?: string,
      overridePageSize?: number,
    ) => {
      setLoading(true);
      setSearched(true);
      setExpandedRow(null);
      setFullMessage(null);
      setXmlContent(null);

      const sources = overrideSources ?? { system: showSystem, application: showApplication, security: showSecurity };
      const logSources: string[] = [];
      if (sources.system) logSources.push("System");
      if (sources.application) logSources.push("Application");
      if (sources.security) logSources.push("Security");
      if (showSetup) logSources.push("Setup");
      if (logSources.length === 0) logSources.push("System", "Application");

      const finalStart = overrideStart ?? startDate;
      const finalEnd = overrideEnd ?? endDate;
      const finalLevel = overrideLevel ?? level;
      const finalSourceFilter = overrideSourceFilter ?? sourceFilter;
      const finalPageSize = overridePageSize ?? pageSize;

      try {
        const data = await invoke<CrashLogResult>("get_crash_logs", {
          startDate: finalStart || null,
          endDate: finalEnd || null,
          sourceFilter: finalSourceFilter || null,
          level: finalLevel === "All" ? null : finalLevel,
          logSources,
          page: targetPage,
          pageSize: finalPageSize,
          eventIdFilter: eventIdFilter || null,
          messageSearch: messageSearch || null,
          useRegex: useRegex || null,
        });
        setResult(data);
        setPage(targetPage);
      } catch (err) {
        console.error("EventViewer fetch error:", err);
        showToast(`Failed to load event logs: ${err}`, "error");
        setResult({ entries: [], total_count: 0 });
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, sourceFilter, level, showSystem, showApplication, showSecurity, showSetup, pageSize, eventIdFilter, messageSearch, useRegex]
  );

  // Find Next / Prev logic
  useEffect(() => {
    if (!messageSearch || !result?.entries) {
      setFindMatches([]);
      setFindIndex(-1);
      return;
    }
    const term = messageSearch.toLowerCase();
    const matches = result.entries.reduce<number[]>((acc, entry, i) => {
      if (entry.message?.toLowerCase().includes(term)) acc.push(i);
      return acc;
    }, []);
    setFindMatches(matches);
    setFindIndex(matches.length > 0 ? 0 : -1);
  }, [messageSearch, result]);

  const findNext = () => {
    if (findMatches.length === 0) return;
    const next = (findIndex + 1) % findMatches.length;
    setFindIndex(next);
    setExpandedRow(findMatches[next]);
  };

  const findPrev = () => {
    if (findMatches.length === 0) return;
    const prev = (findIndex - 1 + findMatches.length) % findMatches.length;
    setFindIndex(prev);
    setExpandedRow(findMatches[prev]);
  };

  // F3 / Shift+F3 keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        if (e.shiftKey) findPrev();
        else findNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Save custom view
  const saveCurrentView = () => {
    const name = prompt("View name:");
    if (!name) return;
    const filters = {
      startDate, endDate, sourceFilter, level, eventIdFilter, messageSearch,
      useRegex, showSystem, showApplication, showSecurity, showSetup,
      userFilter, keywordFilter, activePreset,
    };
    const updated = [...savedViews.filter(v => v.name !== name), { name, filters }];
    setSavedViews(updated);
    localStorage.setItem("ev_saved_views", JSON.stringify(updated));
    showToast(`View "${name}" saved`, "success");
  };

  // Load custom view
  const loadView = (view: typeof savedViews[0]) => {
    const f = view.filters as Record<string, any>;
    if (f.startDate !== undefined) setStartDate(f.startDate);
    if (f.endDate !== undefined) setEndDate(f.endDate);
    if (f.sourceFilter !== undefined) setSourceFilter(f.sourceFilter);
    if (f.level !== undefined) setLevel(f.level);
    if (f.eventIdFilter !== undefined) setEventIdFilter(f.eventIdFilter);
    if (f.messageSearch !== undefined) setMessageSearch(f.messageSearch);
    if (f.useRegex !== undefined) setUseRegex(f.useRegex);
    if (f.showSystem !== undefined) setShowSystem(f.showSystem);
    if (f.showApplication !== undefined) setShowApplication(f.showApplication);
    if (f.showSecurity !== undefined) setShowSecurity(f.showSecurity);
    if (f.showSetup !== undefined) setShowSetup(f.showSetup);
    if (f.userFilter !== undefined) setUserFilter(f.userFilter);
    if (f.keywordFilter !== undefined) setKeywordFilter(f.keywordFilter);
    if (f.activePreset !== undefined) setActivePreset(f.activePreset);
    setShowSavedViews(false);
    fetchLogs(0, f.startDate, f.endDate);
    showToast(`Loaded view "${view.name}"`, "success");
  };

  // Delete custom view
  const deleteView = (name: string) => {
    const updated = savedViews.filter(v => v.name !== name);
    setSavedViews(updated);
    localStorage.setItem("ev_saved_views", JSON.stringify(updated));
  };

  // Bookmark toggle
  const toggleBookmark = (entry: EventLogEntry, _idx: number) => {
    const key = `${entry.time_created}_${entry.event_id}_${entry.source}`;
    const exists = bookmarks.find(b => b.eventKey === key);
    let updated;
    if (exists) {
      updated = bookmarks.filter(b => b.eventKey !== key);
    } else {
      const note = prompt("Add a note (optional):") || "";
      updated = [...bookmarks, { eventKey: key, note, entry }];
    }
    setBookmarks(updated);
    localStorage.setItem("ev_bookmarks", JSON.stringify(updated));
  };

  const isBookmarked = (entry: EventLogEntry) => {
    const key = `${entry.time_created}_${entry.event_id}_${entry.source}`;
    return bookmarks.some(b => b.eventKey === key);
  };

  // Noise suppression
  const addSuppression = (source: string, eventId: number) => {
    const exists = suppressionRules.some(r => r.source === source && r.eventId === eventId);
    if (exists) return;
    const updated = [...suppressionRules, { source, eventId }];
    setSuppressionRules(updated);
    localStorage.setItem("ev_suppression", JSON.stringify(updated));
    showToast(`Suppressing ${source} #${eventId}`, "success");
  };

  const removeSuppression = (idx: number) => {
    const updated = suppressionRules.filter((_, i) => i !== idx);
    setSuppressionRules(updated);
    localStorage.setItem("ev_suppression", JSON.stringify(updated));
  };

  const isSuppressed = (entry: EventLogEntry) =>
    suppressionRules.some(r => r.source === entry.source && r.eventId === entry.event_id);

  // Column toggle
  const toggleColumn = (col: ColumnKey) => {
    const updated = { ...visibleColumns, [col]: !visibleColumns[col] };
    setVisibleColumns(updated);
    localStorage.setItem("ev_columns", JSON.stringify(updated));
  };

  // Dashboard computations
  const dashboardData = useMemo(() => {
    if (!result?.entries || result.entries.length === 0) return null;
    const entries = result.entries;
    const byLevel: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byHour: Record<string, number> = {};

    for (const e of entries) {
      byLevel[e.level] = (byLevel[e.level] || 0) + 1;
      bySource[e.source] = (bySource[e.source] || 0) + 1;
      const hour = e.time_created?.substring(0, 13) || "Unknown";
      byHour[hour] = (byHour[hour] || 0) + 1;
    }

    const topSources = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const hourly = Object.entries(byHour).sort((a, b) => a[0].localeCompare(b[0]));
    const maxHourly = Math.max(...hourly.map(h => h[1]), 1);

    return { byLevel, topSources, hourly, maxHourly, total: entries.length };
  }, [result]);

  // Remote computer query
  const queryRemote = async () => {
    if (!remoteComputer) return;
    setLoadingRemote(true);
    try {
      const data = await invoke<CrashLogResult>("query_remote_events", {
        computerName: remoteComputer,
        logName: remoteLog,
        level: remoteLevel === "All" ? null : remoteLevel,
        maxEvents: 500,
      });
      setResult(data);
      setPage(0);
      setSearched(true);
      setShowRemote(false);
      showToast(`Loaded ${data.total_count} events from ${remoteComputer}`, "success");
    } catch (e) {
      showToast(`Remote query failed: ${e}`, "error");
    } finally {
      setLoadingRemote(false);
    }
  };

  // Attach task handler
  const handleAttachTask = async () => {
    if (!taskName || !taskSource || !taskEventId) {
      showToast("Task name, source, and event ID are required", "error");
      return;
    }
    try {
      const msg = await invoke<string>("attach_task_to_event", {
        taskName, logName: taskLogName, source: taskSource,
        eventId: taskEventId, actionType: taskActionType, actionValue: taskActionValue,
      });
      showToast(msg, "success");
      setShowAttachTask(false);
    } catch (e) {
      showToast(`Failed: ${e}`, "error");
    }
  };

  // Prefill attach task from an event
  const prefillTask = (entry: EventLogEntry) => {
    setTaskSource(entry.source);
    setTaskEventId(entry.event_id);
    setTaskLogName("System"); // default
    setTaskName(`Alert_${entry.source}_${entry.event_id}`);
    setTaskActionValue(`Write-EventLog -LogName Application -Source 'EventAlert' -EventId 1 -Message 'Triggered by ${entry.source} #${entry.event_id}'`);
    setShowAttachTask(true);
  };

  // Event correlation — group events within a time window
  const correlatedGroups = useMemo(() => {
    if (!result?.entries || result.entries.length === 0) return [];
    const entries = [...result.entries].sort((a, b) => a.time_created.localeCompare(b.time_created));
    const groups: Array<{ key: string; events: EventLogEntry[]; timeSpan: string }> = [];
    let currentGroup: EventLogEntry[] = [entries[0]];

    for (let i = 1; i < entries.length; i++) {
      const prev = new Date(entries[i - 1].time_created).getTime();
      const curr = new Date(entries[i].time_created).getTime();
      // 60-second window
      if (curr - prev <= 60000) {
        currentGroup.push(entries[i]);
      } else {
        if (currentGroup.length >= 2) {
          groups.push({
            key: `${currentGroup[0].time_created}_${currentGroup.length}`,
            events: currentGroup,
            timeSpan: `${currentGroup[0].time_created} → ${currentGroup[currentGroup.length - 1].time_created}`,
          });
        }
        currentGroup = [entries[i]];
      }
    }
    if (currentGroup.length >= 2) {
      groups.push({
        key: `${currentGroup[0].time_created}_${currentGroup.length}`,
        events: currentGroup,
        timeSpan: `${currentGroup[0].time_created} → ${currentGroup[currentGroup.length - 1].time_created}`,
      });
    }
    return groups.sort((a, b) => b.events.length - a.events.length).slice(0, 20);
  }, [result]);

  // Live mode effect
  useEffect(() => {
    if (liveMode) {
      liveIntervalRef.current = setInterval(() => {
        fetchLogs(0);
      }, 5000);
    } else if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
    return () => {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
      }
    };
  }, [liveMode, fetchLogs]);

  // Auto-load on mount
  useEffect(() => {
    const { start, end } = getPresetDates("7days");
    fetchLogs(0, start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreset = (preset: DatePreset) => {
    setActivePreset(preset);
    if (preset === "custom") return;

    const { start, end } = getPresetDates(preset);
    setStartDate(start);
    setEndDate(end);
    fetchLogs(0, start, end);
  };

  // Quick preset handler
  const handleQuickPreset = (qp: typeof quickPresets[0]) => {
    const { start, end } = getPresetDates(qp.preset);
    setActivePreset(qp.preset);
    setStartDate(start);
    setEndDate(end);
    setLevel(qp.level);
    setSourceFilter(qp.source);
    setEventIdFilter(qp.ids);
    setMessageSearch("");
    fetchLogs(0, start, end, undefined, qp.level, qp.source);
  };

  // Open .evtx file via PowerShell file dialog
  const handleOpenEvtx = async () => {
    try {
      const filePath = await invoke<string>("open_evtx_dialog", {});
      
      const path = filePath?.trim();
      if (!path) return;

      setEvtxMode(true);
      setEvtxPath(path);
      setSearched(true);
      setLoading(true);
      setExpandedRow(null);
      try {
        const data = await invoke<CrashLogResult>("get_evtx_file_logs", {
          filePath: path,
          page: 0,
          pageSize,
        });
        setResult(data);
        setPage(0);
      } catch {
        showToast("Failed to open .evtx file", "error");
        setResult({ entries: [], total_count: 0 });
      } finally {
        setLoading(false);
      }
    } catch {
      showToast("Failed to open file dialog", "error");
    }
  };

  // Exit .evtx mode
  const exitEvtxMode = () => {
    setEvtxMode(false);
    setEvtxPath(null);
    const { start, end } = getPresetDates("7days");
    fetchLogs(0, start, end);
  };


  // Phase 4: Show PS command in modal
  const showPSCommandModal = () => {
    const logSources: string[] = [];
    if (showSystem) logSources.push("System");
    if (showApplication) logSources.push("Application");
    if (showSecurity) logSources.push("Security");
    if (showSetup) logSources.push("Setup");
    if (logSources.length === 0) logSources.push("System", "Application");

    const levelMap: Record<string, string> = {
      Error: "2", Warning: "3", Critical: "1", Information: "0,4", Verbose: "5",
    };

    const parts: string[] = [];
    for (const src of logSources) {
      let hash = `@{LogName='${src}'`;
      if (level !== "All" && levelMap[level]) hash += `; Level=${levelMap[level]}`;
      if (startDate) hash += `; StartTime='${startDate}'`;
      if (endDate) hash += `; EndTime='${endDate}'`;
      if (eventIdFilter) hash += `; ID=${eventIdFilter}`;
      hash += "}";
      parts.push(`Get-WinEvent -FilterHashtable ${hash}`);
    }

    let cmd = parts.join("\n");
    if (sourceFilter) cmd += `\n | Where-Object { $_.ProviderName -like '*${sourceFilter}*' }`;
    if (messageSearch) {
      cmd += useRegex
        ? `\n | Where-Object { $_.Message -match '${messageSearch}' }`
        : `\n | Where-Object { $_.Message -like '*${messageSearch}*' }`;
    }

    setPsCommand(cmd);
    setShowPSModal(true);
  };

  // Phase 4: Browse all log channels
  const handleBrowseLogs = async () => {
    setShowBrowseLogs(true);
    setLoadingChannels(true);
    try {
      const channels = await invoke<LogChannelInfo[]>("list_log_channels", {});
      setLogChannels(channels);
    } catch {
      showToast("Failed to list log channels", "error");
    } finally {
      setLoadingChannels(false);
    }
  };

  // Phase 4: Select a channel from browse modal
  const selectChannel = (channelName: string) => {
    setShowBrowseLogs(false);
    // Disable standard toggles, set this as the sole source
    setShowSystem(false);
    setShowApplication(false);
    setShowSecurity(false);
    const { start, end } = getPresetDates("7days");
    setStartDate(start);
    setEndDate(end);
    // Fetch with custom log source
    setSearched(true);
    setLoading(true);
    setExpandedRow(null);
    invoke<CrashLogResult>("get_crash_logs", {
      startDate: start,
      endDate: end,
      sourceFilter: null,
      level: null,
      logSources: [channelName],
      page: 0,
      pageSize,
      eventIdFilter: null,
      messageSearch: null,
      useRegex: null,
    }).then(data => {
      setResult(data);
      setPage(0);
      showToast(`Loaded ${data.total_count} events from ${channelName}`, "success");
    }).catch(() => {
      showToast(`Failed to query ${channelName}`, "error");
      setResult({ entries: [], total_count: 0 });
    }).finally(() => setLoading(false));
  };

  // Phase 4: Execute XPath query
  const executeXPath = async () => {
    setShowXPathEditor(false);
    setSearched(true);
    setLoading(true);
    setExpandedRow(null);
    try {
      const data = await invoke<CrashLogResult>("query_xpath", {
        logName: xpathLogName,
        xpath: xpathQuery,
        maxEvents: xpathMaxEvents,
      });
      setResult(data);
      setPage(0);
      showToast(`XPath query returned ${data.total_count} events`, "success");
    } catch (e) {
      showToast(`XPath error: ${e}`, "error");
      setResult({ entries: [], total_count: 0 });
    } finally {
      setLoading(false);
    }
  };

  // Phase 4: Get log properties
  const fetchLogProperties = async () => {
    setLoadingProps(true);
    setLogProps(null);
    try {
      const props = await invoke<LogProperties>("get_log_properties", { logName: logPropsName });
      setLogProps(props);
    } catch {
      showToast(`Failed to get properties for ${logPropsName}`, "error");
    } finally {
      setLoadingProps(false);
    }
  };

  // Phase 4: Clear log
  const handleClearLog = async (name: string) => {
    try {
      await invoke<string>("clear_event_log", { logName: name });
      showToast(`${name} log cleared`, "success");
      fetchLogProperties();
    } catch (e) {
      showToast(`Failed to clear: ${e}`, "error");
    }
  };

  // On-demand full detail fetch (message + XML)
  const fetchEventDetail = useCallback(async (entry: EventLogEntry) => {
    setLoadingDetail(true);
    setFullMessage(null);
    setXmlContent(null);

    // Try each log source to find the event
    const logSources = ["System", "Application", "Security"];
    for (const src of logSources) {
      try {
        const detail = await invoke<EventDetailResult>("get_event_detail", {
          logSource: src,
          timeCreated: entry.time_created,
          eventId: entry.event_id,
        });
        if (detail.full_message || detail.xml_content) {
          setFullMessage(detail.full_message || entry.message);
          setXmlContent(detail.xml_content || null);
          setLoadingDetail(false);
          return;
        }
      } catch {
        // Try next source
      }
    }

    // Fallback
    setFullMessage(entry.message);
    setXmlContent(null);
    setLoadingDetail(false);
  }, []);

  const handleExpandRow = useCallback((idx: number, entry: EventLogEntry) => {
    if (expandedRow === idx) {
      setExpandedRow(null);
      setFullMessage(null);
      setXmlContent(null);
      setDetailTab("general");
    } else {
      setExpandedRow(idx);
      setDetailTab("general");
      // Always fetch full detail (message + XML)
      if (entry.message.endsWith("...") && entry.message.length >= 800) {
        fetchEventDetail(entry);
      } else {
        setFullMessage(entry.message);
        // Still fetch XML in background
        fetchEventDetail(entry);
      }
    }
  }, [expandedRow, fetchEventDetail]);

  // Copy event to clipboard
  const copyEventDetails = useCallback(async (entry: EventLogEntry, message: string) => {
    const text = [
      `Time: ${entry.time_created}`,
      `Level: ${entry.level}`,
      `Source: ${entry.source}`,
      `Event ID: ${entry.event_id}`,
      entry.task_category ? `Task Category: ${entry.task_category}` : null,
      entry.keywords ? `Keywords: ${entry.keywords}` : null,
      entry.user ? `User: ${entry.user}` : null,
      entry.computer ? `Computer: ${entry.computer}` : null,
      entry.opcode ? `OpCode: ${entry.opcode}` : null,
      ``,
      `Message:`,
      message,
    ].filter(Boolean).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      showToast("Event details copied to clipboard", "success");
    } catch {
      showToast("Failed to copy to clipboard", "error");
    }
  }, [showToast]);

  // Export all filtered results in chosen format
  const handleExport = useCallback(async (format: ExportFormat) => {
    setExporting(true);
    setShowExportMenu(false);
    try {
      const logSources: string[] = [];
      if (showSystem) logSources.push("System");
      if (showApplication) logSources.push("Application");
      if (showSecurity) logSources.push("Security");
      if (showSetup) logSources.push("Setup");
      if (logSources.length === 0) logSources.push("System", "Application");

      const data = await invoke<CrashLogResult>("export_all_crash_logs", {
        startDate: startDate || null,
        endDate: endDate || null,
        sourceFilter: sourceFilter || null,
        level: level === "All" ? null : level,
        logSources,
        eventIdFilter: eventIdFilter || null,
        messageSearch: messageSearch || null,
        useRegex: useRegex || null,
      });

      let content: string;
      let mimeType: string;
      let ext: string;

      switch (format) {
        case "json":
          content = generateJSON(data.entries);
          mimeType = "application/json";
          ext = "json";
          break;
        case "txt":
          content = generateTXT(data.entries);
          mimeType = "text/plain";
          ext = "txt";
          break;
        case "html":
          content = generateHTML(data.entries);
          mimeType = "text/html";
          ext = "html";
          break;
        case "csv":
        default:
          content = generateCSV(data.entries);
          mimeType = "text/csv";
          ext = "csv";
          break;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event_logs_${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${data.entries.length} events to ${ext.toUpperCase()}`, "success");
    } catch {
      showToast("Failed to export events", "error");
    } finally {
      setExporting(false);
    }
  }, [showSystem, showApplication, showSecurity, startDate, endDate, sourceFilter, level, eventIdFilter, messageSearch, showToast]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total_count / pageSize)) : 0;

  const levelBadge = (lvl: string) => {
    const lower = lvl.toLowerCase();
    if (lower.includes("critical")) return "bg-danger/20 text-danger";
    if (lower.includes("error")) return "bg-danger/15 text-danger";
    if (lower.includes("warning")) return "bg-warning/15 text-warning";
    if (lower.includes("information") || lower === "info") return "bg-blue-500/15 text-blue-400";
    if (lower.includes("verbose")) return "bg-white/10 text-white/40";
    return "bg-white/10 text-white/50";
  };

  // Client-side sort
  const sortedEntries = useMemo(() => {
    if (!result || !sortField) return result?.entries ?? [];
    const entries = [...result.entries];
    entries.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "time_created":
          cmp = a.time_created.localeCompare(b.time_created);
          break;
        case "level":
          cmp = (LEVEL_ORDER[a.level] ?? 99) - (LEVEL_ORDER[b.level] ?? 99);
          break;
        case "source":
          cmp = a.source.localeCompare(b.source);
          break;
        case "event_id":
          cmp = a.event_id - b.event_id;
          break;
        case "message":
          cmp = (a.message || "").localeCompare(b.message || "");
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return entries;
  }, [result, sortField, sortDirection]);

  // Apply noise suppression
  const filteredEntries = useMemo(() => {
    if (suppressionRules.length === 0) return sortedEntries;
    return sortedEntries.filter(e => !isSuppressed(e));
  }, [sortedEntries, suppressionRules]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "time_created" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-white/20" />;
    return sortDirection === "asc"
      ? <ArrowUp className="w-3 h-3 text-accent" />
      : <ArrowDown className="w-3 h-3 text-accent" />;
  };

  const pageSizeOptions = [25, 50, 100, 200];

  const presets: { key: DatePreset; label: string; icon: React.ReactNode }[] = [
    { key: "today", label: "Today", icon: <Clock className="w-3.5 h-3.5" /> },
    { key: "7days", label: "Last 7 Days", icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: "30days", label: "Last 30 Days", icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: "custom", label: "Custom Range", icon: <Filter className="w-3.5 h-3.5" /> },
  ];

  const showInfoHint = level === "Information" || level === "Verbose";

  return (
    <div className="flex flex-col gap-4 h-full animate-fade-in">
      {/* Toolbar Row */}
      <div className="flex items-center gap-2 flex-wrap">
        {presets.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => handlePreset(key)}
            disabled={evtxMode}
            className={`flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                       transition-all duration-200 border
                       ${activePreset === key && !evtxMode
                         ? "border-accent/30 bg-accent/15 text-accent"
                         : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                       } ${evtxMode ? "opacity-40 pointer-events-none" : ""}`}
          >
            {icon}
            {label}
          </button>
        ))}

        <div className="h-5 w-px bg-white/10 mx-1" />

        {/* Open .evtx File */}
        <button
          onClick={handleOpenEvtx}
          className="flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open .evtx
        </button>

        {/* Live Mode Toggle */}
        <button
          onClick={() => setLiveMode(!liveMode)}
          disabled={evtxMode}
          className={`flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-medium
                     transition-all duration-200 border
                     ${liveMode
                       ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                       : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                     } ${evtxMode ? "opacity-40 pointer-events-none" : ""}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${liveMode ? "animate-spin" : ""}`} style={liveMode ? { animationDuration: "3s" } : {}} />
          {liveMode ? "Live" : "Live Mode"}
        </button>

        {/* Browse All Logs */}
        <button
          onClick={handleBrowseLogs}
          disabled={evtxMode}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="Browse all log channels"
        >
          <Database className="w-3.5 h-3.5" />
        </button>

        {/* XPath Query */}
        <button
          onClick={() => setShowXPathEditor(true)}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="XPath Query Editor"
        >
          <Code className="w-3.5 h-3.5" />
        </button>

        {/* Log Properties */}
        <button
          onClick={() => { setShowLogProps(true); fetchLogProperties(); }}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="Log Properties & Management"
        >
          <Info className="w-3.5 h-3.5" />
        </button>

        {/* PS Command Modal */}
        <button
          onClick={showPSCommandModal}
          disabled={evtxMode}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="View PowerShell command"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>

        <div className="h-5 w-px bg-white/10 mx-1" />

        {/* Save View */}
        <button
          onClick={saveCurrentView}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="Save current filters as a view"
        >
          <Save className="w-3.5 h-3.5" />
        </button>

        {/* Load Views */}
        <button
          onClick={() => setShowSavedViews(true)}
          className={`flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border transition-all
                     ${savedViews.length > 0
                       ? "border-violet-500/20 bg-violet-500/10 text-violet-400"
                       : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                     }`}
          title={`Saved Views (${savedViews.length})`}
        >
          <FolderOpenIcon className="w-3.5 h-3.5" />
        </button>

        {/* Bookmarks */}
        <button
          onClick={() => setShowBookmarks(true)}
          className={`flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border transition-all
                     ${bookmarks.length > 0
                       ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                       : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                     }`}
          title={`Bookmarks (${bookmarks.length})`}
        >
          <Bookmark className="w-3.5 h-3.5" />
        </button>

        {/* Noise Suppression */}
        <button
          onClick={() => setShowSuppression(true)}
          className={`flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border transition-all
                     ${suppressionRules.length > 0
                       ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                       : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                     }`}
          title={`Suppression Rules (${suppressionRules.length})`}
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>

        {/* Column Settings */}
        <button
          onClick={() => setShowColumnSettings(!showColumnSettings)}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="Column visibility"
        >
          <Columns className="w-3.5 h-3.5" />
        </button>

        {/* Dashboard */}
        <button
          onClick={() => setShowDashboard(true)}
          disabled={!result?.entries?.length}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all disabled:opacity-30"
          title="Event Dashboard"
        >
          <BarChart3 className="w-3.5 h-3.5" />
        </button>

        {/* Diff View */}
        <button
          onClick={() => setShowDiff(true)}
          disabled={!result?.entries || result.entries.length < 2}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all disabled:opacity-30"
          title="Compare two events"
        >
          <GitCompare className="w-3.5 h-3.5" />
        </button>

        <div className="h-5 w-px bg-white/10 mx-1" />

        {/* Remote Computer */}
        <button
          onClick={() => setShowRemote(true)}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="Connect to remote computer"
        >
          <Monitor className="w-3.5 h-3.5" />
        </button>

        {/* Event Correlation */}
        <button
          onClick={() => setShowCorrelation(true)}
          disabled={!result?.entries?.length}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all disabled:opacity-30"
          title="Event Correlation Groups"
        >
          <Group className="w-3.5 h-3.5" />
        </button>

        {/* Attach Task */}
        <button
          onClick={() => setShowAttachTask(true)}
          className="flex items-center gap-2 h-9 px-3 rounded-lg text-[12.5px] font-medium
                     border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-all"
          title="Create scheduled task triggered by event"
        >
          <ZapIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Column Settings Dropdown */}
      {showColumnSettings && (
        <div className="flex items-center gap-3 px-1 py-1 animate-fade-in">
          <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold">Columns:</span>
          {([
            { key: "time" as ColumnKey, label: "Time" },
            { key: "level" as ColumnKey, label: "Level" },
            { key: "source" as ColumnKey, label: "Source" },
            { key: "eventId" as ColumnKey, label: "Event ID" },
            { key: "message" as ColumnKey, label: "Message" },
          ]).map(col => (
            <button
              key={col.key}
              onClick={() => toggleColumn(col.key)}
              className={`h-6 px-2.5 rounded-md text-[10px] font-medium border transition-all
                         ${visibleColumns[col.key]
                           ? "border-accent/30 bg-accent/10 text-accent"
                           : "border-white/10 bg-white/[0.02] text-white/30"}`}
            >
              {col.label}
            </button>
          ))}
        </div>
      )}

      {/* Quick Filter Presets */}
      {!evtxMode && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/25 uppercase tracking-wider font-semibold shrink-0">Quick:</span>
          {quickPresets.map((qp) => (
            <button
              key={qp.label}
              onClick={() => handleQuickPreset(qp)}
              className="h-7 px-3 rounded-full text-[11px] font-medium
                         border border-white/[0.06] bg-white/[0.02] text-white/40
                         hover:bg-white/[0.06] hover:text-white/70 hover:border-white/10 transition-all"
            >
              <Zap className="w-3 h-3 inline-block mr-1 -mt-0.5" />
              {qp.label}
            </button>
          ))}
        </div>
      )}

      {/* .evtx Mode Banner */}
      {evtxMode && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-amber-500/20 bg-amber-500/10 animate-fade-in">
          <FolderOpen className="w-4 h-4 text-amber-400" />
          <span className="text-[12px] text-amber-300/80 truncate flex-1 font-mono">{evtxPath}</span>
          <button
            onClick={exitEvtxMode}
            className="flex items-center gap-1 h-6 px-2.5 rounded-md text-[11px] font-medium
                       border border-amber-500/20 text-amber-300/70 hover:bg-amber-500/10 transition-all"
          >
            <X className="w-3 h-3" />
            Close File
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Range */}
          {activePreset === "custom" && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-white/30" />
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-input h-8 px-3 text-[12px] w-[180px]"
              />
              <span className="text-[12px] text-white/25">to</span>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-input h-8 px-3 text-[12px] w-[180px]"
              />
            </div>
          )}

          {/* Source Filter */}
          <div className="relative flex-1 max-w-[180px]">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Filter by source..."
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="glass-input w-full h-8 pl-8 pr-3 text-[12px]"
            />
          </div>

          {/* Event ID Filter */}
          <div className="relative flex-1 max-w-[170px]">
            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Event ID (1,2,1-50)"
              value={eventIdFilter}
              onChange={(e) => setEventIdFilter(e.target.value)}
              className="glass-input w-full h-8 pl-8 pr-3 text-[12px]"
            />
          </div>

          {/* Message Search + Regex Toggle */}
          <div className="relative flex-1 max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder={useRegex ? "Regex pattern..." : "Search messages..."}
              value={messageSearch}
              onChange={(e) => setMessageSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fetchLogs(0); }}
              className="glass-input w-full h-8 pl-8 pr-12 text-[12px]"
            />
            <button
              onClick={() => setUseRegex(!useRegex)}
              title={useRegex ? "Regex mode (click for wildcard)" : "Wildcard mode (click for regex)"}
              className={`absolute right-1 top-1/2 -translate-y-1/2 h-6 px-1.5 rounded text-[10px] font-bold
                         transition-all
                         ${useRegex
                           ? "bg-accent/20 text-accent"
                           : "bg-white/[0.04] text-white/30 hover:text-white/60"
                         }`}
            >
              .*
            </button>
          </div>

          {/* Find Navigation */}
          {findMatches.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-white/30 tabular-nums">
                {findIndex + 1}/{findMatches.length}
              </span>
              <button onClick={findPrev} className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] text-white/40 hover:text-white/70" title="Previous match (Shift+F3)">
                <SkipBack className="w-3 h-3" />
              </button>
              <button onClick={findNext} className="w-6 h-6 rounded flex items-center justify-center bg-white/[0.04] text-white/40 hover:text-white/70" title="Next match (F3)">
                <SkipForward className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Level */}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LevelFilter)}
            className="glass-input h-8 px-3 text-[12px] cursor-pointer appearance-auto bg-white/[0.04] border-white/10"
          >
            <option value="All" className="bg-[#1a1a2e]">All Levels</option>
            <option value="Critical" className="bg-[#1a1a2e]">Critical</option>
            <option value="Error" className="bg-[#1a1a2e]">Error</option>
            <option value="Warning" className="bg-[#1a1a2e]">Warning</option>
            <option value="Information" className="bg-[#1a1a2e]">Information</option>
            <option value="Verbose" className="bg-[#1a1a2e]">Verbose</option>
          </select>

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium
                       transition-all duration-200 border
                       ${showAdvanced || activeAdvancedCount > 0
                         ? "border-accent/30 bg-accent/10 text-accent"
                         : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/70"
                       }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Advanced
            {activeAdvancedCount > 0 && (
              <span className="ml-0.5 w-4 h-4 rounded-full bg-accent/30 text-accent text-[10px] flex items-center justify-center font-bold">
                {activeAdvancedCount}
              </span>
            )}
          </button>

          {/* Search Button */}
          <button
            onClick={() => fetchLogs(0)}
            disabled={loading}
            className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-medium
                       bg-accent/90 text-black hover:bg-accent disabled:opacity-40
                       transition-all duration-200"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Search
          </button>

          {/* Export Dropdown */}
          {result && result.entries.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={exporting}
                className="flex items-center gap-2 h-8 px-3 rounded-lg text-[12px] font-medium
                           border border-border bg-surface text-text-secondary
                           hover:bg-surface-hover disabled:opacity-40 transition-all duration-200"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {exporting ? "Exporting..." : "Export All"}
                <ChevronDown className="w-3 h-3" />
              </button>

              {showExportMenu && (
                <div className="absolute top-full right-0 mt-1 w-36 rounded-lg border border-white/10 bg-[#1a1a2e] shadow-xl z-50 overflow-hidden animate-fade-in">
                  {([
                    { format: "csv" as ExportFormat, label: "CSV (.csv)" },
                    { format: "json" as ExportFormat, label: "JSON (.json)" },
                    { format: "txt" as ExportFormat, label: "Text (.txt)" },
                    { format: "html" as ExportFormat, label: "HTML (.html)" },
                  ]).map(({ format, label }) => (
                    <button
                      key={format}
                      onClick={() => handleExport(format)}
                      className="w-full text-left px-3 py-2 text-[12px] text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Advanced Filters Row */}
        {showAdvanced && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06] animate-fade-in">
            <span className="text-[11px] text-white/30 uppercase font-semibold tracking-wider shrink-0">Filters:</span>

            {/* User Filter */}
            <div className="relative flex-1 max-w-[180px]">
              <input
                type="text"
                placeholder="Filter by user..."
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="glass-input w-full h-7 px-3 text-[11px]"
              />
            </div>

            {/* Keywords Filter */}
            <select
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              className="glass-input h-7 px-3 text-[11px] cursor-pointer appearance-auto bg-white/[0.04] border-white/10"
            >
              <option value="" className="bg-[#1a1a2e]">All Keywords</option>
              <option value="Audit Success" className="bg-[#1a1a2e]">Audit Success</option>
              <option value="Audit Failure" className="bg-[#1a1a2e]">Audit Failure</option>
            </select>

            {/* Clear Advanced */}
            {activeAdvancedCount > 0 && (
              <button
                onClick={() => { setUserFilter(""); setKeywordFilter(""); }}
                className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        )}

        {/* Log Source Toggles + Info Hint */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[11px] text-white/30 uppercase font-semibold tracking-wider">Sources:</span>
          {[
            { key: "system", label: "System", state: showSystem, setter: setShowSystem },
            { key: "application", label: "Application", state: showApplication, setter: setShowApplication },
            { key: "security", label: "Security", state: showSecurity, setter: setShowSecurity },
            { key: "setup", label: "Setup", state: showSetup, setter: setShowSetup },
          ].map(({ key, label, state, setter }) => (
            <button
              key={key}
              onClick={() => setter(!state)}
              className={`flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium
                         transition-all duration-200 border
                         ${state
                           ? "border-accent/30 bg-accent/10 text-accent"
                           : "border-white/10 bg-white/[0.02] text-white/35 hover:text-white/60"
                         }`}
            >
              {label}
            </button>
          ))}

          {/* Info/Verbose hint */}
          {showInfoHint && (
            <div className="flex items-center gap-1.5 ml-2 text-[11px] text-warning/70">
              <AlertTriangle className="w-3 h-3" />
              <span>High volume — use tighter date ranges for best performance</span>
            </div>
          )}

          {/* Active date range indicator */}
          {activePreset && activePreset !== "custom" && startDate && !showInfoHint && (
            <span className="text-[11px] text-white/25 ml-auto font-mono">
              {new Date(startDate).toLocaleDateString()} — {new Date(endDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {!searched ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10">
            <FileText className="w-8 h-8 text-accent/60" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white/70 mb-1">Event Viewer</h3>
            <p className="text-[13px] text-white/35 max-w-md leading-relaxed">
              Browse Windows event logs from System, Application, and Security sources.
              Click a preset above for quick results, or use Custom Range for precise filtering.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass-panel flex flex-col flex-1 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center px-4 h-10 border-b border-white/[0.06] bg-white/[0.02] shrink-0
                          text-[11px] font-semibold text-white/40 uppercase tracking-wider">
            {visibleColumns.time && (
              <span
                className="w-[160px] cursor-pointer hover:text-white/70 transition-colors flex items-center gap-1 select-none"
                onClick={() => handleSort("time_created")}
              >
                Time <SortIcon field="time_created" />
              </span>
            )}
            {visibleColumns.level && (
              <span
                className="w-[100px] cursor-pointer hover:text-white/70 transition-colors flex items-center gap-1 select-none"
                onClick={() => handleSort("level")}
              >
                Level <SortIcon field="level" />
              </span>
            )}
            {visibleColumns.source && (
              <span
                className="w-[180px] cursor-pointer hover:text-white/70 transition-colors flex items-center gap-1 select-none"
                onClick={() => handleSort("source")}
              >
                Source <SortIcon field="source" />
              </span>
            )}
            {visibleColumns.eventId && (
              <span
                className="w-[80px] cursor-pointer hover:text-white/70 transition-colors flex items-center gap-1 select-none"
                onClick={() => handleSort("event_id")}
              >
                Event ID <SortIcon field="event_id" />
              </span>
            )}
            {visibleColumns.message && <span className="flex-1">Message</span>}
            <span className="w-[80px]" />
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center px-4 h-[40px] gap-3">
                  <div className="w-[140px] h-3 shimmer" />
                  <div className="w-[60px] h-5 shimmer rounded-full" />
                  <div className="w-[160px] h-3 shimmer" />
                  <div className="w-[60px] h-3 shimmer" />
                  <div className="flex-1 h-3 shimmer" />
                </div>
              ))
            ) : !result || result.entries.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-white/30 text-[13px]">
                No events found matching your criteria
              </div>
            ) : (
              filteredEntries.map((log, idx) => {
                const expanded = expandedRow === idx;
                const matchHighlight = findMatches.includes(idx) && findIndex >= 0 && findMatches[findIndex] === idx;
                return (
                  <div key={idx} className="border-b border-white/[0.03]">
                    <div
                      className={`flex items-center px-4 h-[40px] text-[13px]
                                 cursor-pointer transition-colors duration-150
                                 hover:bg-white/[0.04]
                                 ${matchHighlight ? "bg-accent/10 border-l-2 border-accent" : idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}
                                 ${expanded ? "bg-white/[0.04]" : ""}`}
                      onClick={() => handleExpandRow(idx, log)}
                    >
                      {visibleColumns.time && (
                        <span className="w-[160px] text-white/50 text-[12px] font-mono tabular-nums truncate">
                          {log.time_created}
                        </span>
                      )}
                      {visibleColumns.level && (
                        <span className="w-[100px]">
                          <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold ${levelBadge(log.level)}`}>
                            {log.level}
                          </span>
                        </span>
                      )}
                      {visibleColumns.source && (
                        <span className="w-[180px] text-white/60 truncate text-[12px]">
                          {log.source}
                        </span>
                      )}
                      {visibleColumns.eventId && (
                        <span className="w-[80px] text-white/40 font-mono text-[12px] tabular-nums">
                          {log.event_id}
                        </span>
                      )}
                      {visibleColumns.message && (
                        <span className="flex-1 text-white/70 truncate pr-2 text-[12.5px]">
                          {log.message}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleBookmark(log, idx); }}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-all shrink-0
                                   ${isBookmarked(log) ? "text-amber-400" : "text-white/15 hover:text-amber-400/60"}`}
                        title={isBookmarked(log) ? "Remove bookmark" : "Bookmark this event"}
                      >
                        <Bookmark className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); addSuppression(log.source, log.event_id); }}
                        className="w-6 h-6 rounded flex items-center justify-center text-white/15 hover:text-rose-400/60 transition-all shrink-0"
                        title={`Suppress ${log.source} #${log.event_id}`}
                      >
                        <EyeOff className="w-3 h-3" />
                      </button>
                      <span className="w-[32px] flex justify-center text-white/25">
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </span>
                    </div>

                    {expanded && (
                      <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.04] animate-fade-in">
                        {/* Event properties grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 mb-4">
                          {[
                            { label: "Time", value: log.time_created },
                            { label: "Level", value: log.level },
                            { label: "Source", value: log.source },
                            { label: "Event ID", value: String(log.event_id) },
                            { label: "Task Category", value: log.task_category },
                            { label: "Keywords", value: log.keywords },
                            { label: "User", value: log.user },
                            { label: "Computer", value: log.computer },
                            ...(log.opcode ? [{ label: "OpCode", value: log.opcode }] : []),
                          ].filter(item => item.value).map((item, i) => (
                            <div key={i} className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">
                                {item.label}
                              </span>
                              <span className="text-[12px] text-white/70 font-mono truncate">
                                {item.value}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Tab toggle + Copy button */}
                        <div className="border-t border-white/[0.06] pt-3 mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailTab("general"); }}
                              className={`flex items-center gap-1.5 h-6 px-3 rounded-md text-[11px] font-medium transition-all
                                         ${detailTab === "general"
                                           ? "bg-white/[0.08] text-white/80"
                                           : "text-white/40 hover:text-white/60"
                                         }`}
                            >
                              <FileText className="w-3 h-3" />
                              General
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setDetailTab("xml"); }}
                              className={`flex items-center gap-1.5 h-6 px-3 rounded-md text-[11px] font-medium transition-all
                                         ${detailTab === "xml"
                                           ? "bg-white/[0.08] text-white/80"
                                           : "text-white/40 hover:text-white/60"
                                         }`}
                            >
                              <Code className="w-3 h-3" />
                              XML
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            {detailTab === "xml" && xmlContent && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(xmlContent).then(
                                    () => showToast("XML copied to clipboard", "success"),
                                    () => showToast("Failed to copy", "error"),
                                  );
                                }}
                                className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium
                                           border border-white/10 bg-white/[0.03] text-white/50
                                           hover:bg-white/[0.07] hover:text-white/80 transition-all"
                              >
                                <Copy className="w-3 h-3" />
                                Copy XML
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyEventDetails(log, fullMessage || log.message);
                              }}
                              className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium
                                         border border-white/10 bg-white/[0.03] text-white/50
                                         hover:bg-white/[0.07] hover:text-white/80 transition-all"
                            >
                              <Copy className="w-3 h-3" />
                              Copy Details
                            </button>
                            <a
                              href={kbLookupUrl(log.event_id, log.source)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium
                                         border border-white/10 bg-white/[0.03] text-white/50
                                         hover:bg-white/[0.07] hover:text-white/80 transition-all no-underline"
                            >
                              <Link className="w-3 h-3" />
                              KB Lookup
                            </a>
                            <button
                              onClick={(e) => { e.stopPropagation(); prefillTask(log); }}
                              className="flex items-center gap-1.5 h-6 px-2.5 rounded-md text-[11px] font-medium
                                         border border-white/10 bg-white/[0.03] text-white/50
                                         hover:bg-white/[0.07] hover:text-white/80 transition-all"
                            >
                              <ZapIcon className="w-3 h-3" />
                              Attach Task
                            </button>
                          </div>
                        </div>

                        {/* Tab content */}
                        {loadingDetail ? (
                          <div className="flex items-center gap-2 py-4 text-white/40 text-[12px]">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading event details...
                          </div>
                        ) : detailTab === "general" ? (
                          <p className="text-[12.5px] text-white/70 leading-relaxed whitespace-pre-wrap font-mono break-all max-h-[300px] overflow-y-auto">
                            {fullMessage || log.message}
                          </p>
                        ) : (
                          <div className="max-h-[400px] overflow-y-auto rounded-lg bg-black/30 border border-white/[0.06] p-3">
                            {xmlContent ? (
                              <pre className="text-[11.5px] leading-[1.6] font-mono">
                                {highlightXml(xmlContent)}
                              </pre>
                            ) : (
                              <p className="text-[12px] text-white/30 italic">XML content not available</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          {result && result.total_count > 0 && (
            <div className="flex items-center justify-between px-4 h-11 border-t border-white/[0.06] bg-white/[0.02] shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-white/40">
                  {result.total_count} total entries
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const newSize = Number(e.target.value);
                    setPageSize(newSize);
                    fetchLogs(0, undefined, undefined, undefined, undefined, undefined, newSize);
                  }}
                  className="glass-input h-7 px-2 text-[11px] cursor-pointer appearance-auto bg-white/[0.04] border-white/10"
                >
                  {pageSizeOptions.map((n) => (
                    <option key={n} value={n} className="bg-[#1a1a2e]">
                      {n} per page
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLogs(page - 1)}
                  disabled={page === 0 || loading}
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             bg-white/[0.04] border border-white/10 text-white/50
                             hover:bg-white/[0.07] disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[12px] text-white/50 font-mono tabular-nums">
                  {page + 1} / {totalPages || 1}
                </span>
                <button
                  onClick={() => fetchLogs(page + 1)}
                  disabled={page >= totalPages - 1 || loading}
                  className="flex items-center justify-center w-7 h-7 rounded-md
                             bg-white/[0.04] border border-white/10 text-white/50
                             hover:bg-white/[0.07] disabled:opacity-30 transition-all"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Close export menu on click outside */}
      {showExportMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
      )}

      {/* ═══ Phase 4 Modals ═══ */}

      {/* Browse All Logs Modal */}
      {showBrowseLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowBrowseLogs(false)}>
          <div className="w-[600px] max-h-[70vh] glass-panel p-0 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Database className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">Browse All Log Channels</h3>
              <div className="flex-1" />
              <button onClick={() => setShowBrowseLogs(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 border-b border-white/5">
              <input
                type="text"
                placeholder="Search channels..."
                value={channelSearch}
                onChange={e => setChannelSearch(e.target.value)}
                className="glass-input w-full h-8 px-3 text-[12px]"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2" style={{ maxHeight: "50vh" }}>
              {loadingChannels ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-accent animate-spin" /></div>
              ) : logChannels.filter(c => !channelSearch || c.name.toLowerCase().includes(channelSearch.toLowerCase())).length === 0 ? (
                <div className="text-center text-white/30 py-8 text-[12px]">No matching channels</div>
              ) : (
                logChannels.filter(c => !channelSearch || c.name.toLowerCase().includes(channelSearch.toLowerCase())).map(ch => (
                  <button
                    key={ch.name}
                    onClick={() => selectChannel(ch.name)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
                               hover:bg-white/[0.05] transition-all group"
                  >
                    <Layers className="w-3.5 h-3.5 text-white/20 group-hover:text-accent shrink-0" />
                    <span className="text-[12px] text-white/70 group-hover:text-white/90 flex-1 truncate font-mono">{ch.name}</span>
                    <span className="text-[10px] text-white/25 tabular-nums shrink-0">{ch.record_count.toLocaleString()} events</span>
                    <span className="text-[10px] text-white/15 shrink-0">{ch.max_size} MB</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* XPath Query Editor Modal */}
      {showXPathEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowXPathEditor(false)}>
          <div className="w-[550px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Code className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">XPath Query Editor</h3>
              <div className="flex-1" />
              <button onClick={() => setShowXPathEditor(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Log Channel</label>
                <input
                  type="text" value={xpathLogName} onChange={e => setXpathLogName(e.target.value)}
                  className="glass-input w-full h-8 px-3 text-[12px] mt-1 font-mono"
                  placeholder="System"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">XPath Query</label>
                <textarea
                  value={xpathQuery} onChange={e => setXpathQuery(e.target.value)}
                  className="glass-input w-full h-24 px-3 py-2 text-[12px] mt-1 font-mono resize-none"
                  placeholder="*[System[Level=2]]"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Max Events</label>
                <input
                  type="number" value={xpathMaxEvents} onChange={e => setXpathMaxEvents(Number(e.target.value))}
                  className="glass-input w-32 h-8 px-3 text-[12px] mt-1 font-mono"
                  min={1} max={5000}
                />
              </div>
              <div className="flex items-center gap-2 text-[10px] text-white/25">
                <BookOpen className="w-3 h-3" />
                <span>Examples: <code className="text-white/40">*[System[Level=1 or Level=2]]</code> · <code className="text-white/40">*[System[EventID=4625]]</code> · <code className="text-white/40">*[System[TimeCreated[timediff(@SystemTime) &lt;= 86400000]]]</code></span>
              </div>
              <button
                onClick={executeXPath}
                className="flex items-center gap-2 h-9 px-5 rounded-lg text-[12.5px] font-medium
                           bg-accent/20 text-accent border border-accent/20 hover:bg-accent/30 transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                Execute Query
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Properties Modal */}
      {showLogProps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowLogProps(false)}>
          <div className="w-[450px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Info className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">Log Properties</h3>
              <div className="flex-1" />
              <button onClick={() => setShowLogProps(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <select
                  value={logPropsName}
                  onChange={e => setLogPropsName(e.target.value)}
                  className="glass-input h-8 px-2 text-[12px] flex-1"
                >
                  <option value="System">System</option>
                  <option value="Application">Application</option>
                  <option value="Security">Security</option>
                  <option value="Setup">Setup</option>
                </select>
                <button
                  onClick={fetchLogProperties}
                  className="h-8 px-3 rounded-lg text-[12px] bg-white/[0.05] text-white/60 hover:bg-white/[0.08] border border-white/10 transition-all"
                >
                  Refresh
                </button>
              </div>
              {loadingProps ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-accent animate-spin" /></div>
              ) : logProps ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[12px]">
                    <span className="text-white/40">Log Name</span>
                    <span className="text-white/80 font-mono">{logProps.log_name}</span>
                    <span className="text-white/40">Record Count</span>
                    <span className="text-white/80 font-mono">{logProps.record_count.toLocaleString()}</span>
                    <span className="text-white/40">Max Size</span>
                    <span className="text-white/80 font-mono">{logProps.max_size_mb} MB</span>
                    <span className="text-white/40">Current Size</span>
                    <span className="text-white/80 font-mono">{logProps.current_size_mb} MB</span>
                    <span className="text-white/40">Log Mode</span>
                    <span className="text-white/80 font-mono">{logProps.log_mode}</span>
                    <span className="text-white/40">Enabled</span>
                    <span className={`font-mono ${logProps.is_enabled ? "text-emerald-400" : "text-white/30"}`}>{logProps.is_enabled ? "Yes" : "No"}</span>
                    <span className="text-white/40">File Path</span>
                    <span className="text-white/60 font-mono text-[10px] truncate" title={logProps.log_file_path}>{logProps.log_file_path}</span>
                  </div>
                  <div className="pt-3 border-t border-white/5">
                    <button
                      onClick={() => handleClearLog(logProps.log_name)}
                      className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-medium
                                 bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear This Log
                    </button>
                    <p className="text-[10px] text-white/20 mt-2">⚠ Requires administrator privileges</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* PowerShell Command Modal */}
      {showPSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowPSModal(false)}>
          <div className="w-[550px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Terminal className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">PowerShell Command</h3>
              <div className="flex-1" />
              <button onClick={() => setShowPSModal(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-white/30">Equivalent PowerShell command for current filters:</p>
              <pre className="p-4 rounded-lg bg-black/40 border border-white/5 text-[11px] text-emerald-300/80 font-mono overflow-x-auto whitespace-pre-wrap">{psCommand}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(psCommand); showToast("Copied to clipboard", "success"); }}
                className="flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-medium
                           bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Command
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Views Modal */}
      {showSavedViews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowSavedViews(false)}>
          <div className="w-[450px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <FolderOpenIcon className="w-4 h-4 text-violet-400" />
              <h3 className="text-[14px] font-semibold text-white/90">Saved Views</h3>
              <div className="flex-1" />
              <button onClick={() => setShowSavedViews(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 max-h-[50vh] overflow-y-auto">
              {savedViews.length === 0 ? (
                <div className="text-center text-white/25 py-8 text-[12px]">No saved views yet. Use the 💾 button to save your current filters.</div>
              ) : savedViews.map((v, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] group">
                  <button onClick={() => loadView(v)} className="flex-1 text-left text-[12px] text-white/70 group-hover:text-white/90 font-medium">
                    {v.name}
                  </button>
                  <button onClick={() => deleteView(v.name)} className="text-white/15 hover:text-danger transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bookmarks Modal */}
      {showBookmarks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowBookmarks(false)}>
          <div className="w-[550px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <h3 className="text-[14px] font-semibold text-white/90">Bookmarked Events</h3>
              <span className="text-[10px] text-white/25">{bookmarks.length}</span>
              <div className="flex-1" />
              <button onClick={() => setShowBookmarks(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 max-h-[60vh] overflow-y-auto">
              {bookmarks.length === 0 ? (
                <div className="text-center text-white/25 py-8 text-[12px]">No bookmarks yet. Click the ★ icon on any event row to bookmark it.</div>
              ) : bookmarks.map((bm, i) => (
                <div key={i} className="px-3 py-2.5 rounded-lg hover:bg-white/[0.05] group border-b border-white/[0.03] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold ${levelBadge(bm.entry.level)}`}>{bm.entry.level}</span>
                    <span className="text-[11px] text-white/50 font-mono">{bm.entry.time_created}</span>
                    <span className="text-[11px] text-white/40">{bm.entry.source}</span>
                    <span className="text-[10px] text-white/25 font-mono">#{bm.entry.event_id}</span>
                    <div className="flex-1" />
                    <button onClick={() => { const updated = bookmarks.filter((_, j) => j !== i); setBookmarks(updated); localStorage.setItem("ev_bookmarks", JSON.stringify(updated)); }} className="text-white/15 hover:text-danger">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[11px] text-white/50 mt-1 truncate">{bm.entry.message}</p>
                  {bm.note && <p className="text-[10px] text-amber-300/50 mt-1 italic">📝 {bm.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Noise Suppression Modal */}
      {showSuppression && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowSuppression(false)}>
          <div className="w-[450px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <EyeOff className="w-4 h-4 text-rose-400" />
              <h3 className="text-[14px] font-semibold text-white/90">Noise Suppression</h3>
              <span className="text-[10px] text-white/25">{suppressionRules.length} rules</span>
              <div className="flex-1" />
              <button onClick={() => setShowSuppression(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
              {suppressionRules.length === 0 ? (
                <div className="text-center text-white/25 py-8 text-[12px]">No suppression rules. Click the 👁‍🗨 icon on any event row to suppress that Source + Event ID combination.</div>
              ) : suppressionRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                  <EyeOff className="w-3 h-3 text-rose-400/50 shrink-0" />
                  <span className="text-[12px] text-white/60 flex-1 font-mono">{rule.source}</span>
                  <span className="text-[10px] text-white/30 font-mono">#{rule.eventId}</span>
                  <button onClick={() => removeSuppression(i)} className="text-white/20 hover:text-danger">
                    <Minus className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Modal */}
      {showDashboard && dashboardData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowDashboard(false)}>
          <div className="w-[650px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <BarChart3 className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">Event Dashboard</h3>
              <span className="text-[10px] text-white/25">{dashboardData.total} events</span>
              <div className="flex-1" />
              <button onClick={() => setShowDashboard(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-5">
              {/* Level Breakdown */}
              <div>
                <h4 className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mb-2">By Level</h4>
                <div className="flex gap-3 flex-wrap">
                  {Object.entries(dashboardData.byLevel).map(([lvl, count]) => (
                    <div key={lvl} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                      <span className={`inline-flex items-center h-4 px-1.5 rounded text-[9px] font-bold ${levelBadge(lvl)}`}>{lvl}</span>
                      <span className="text-[14px] font-bold text-white/80 tabular-nums">{count.toLocaleString()}</span>
                      <span className="text-[10px] text-white/25">({((count / dashboardData.total) * 100).toFixed(1)}%)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline Chart */}
              <div>
                <h4 className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mb-2">Timeline</h4>
                <div className="h-20 rounded-lg bg-black/20 border border-white/[0.05] overflow-hidden px-1">
                  <svg viewBox={`0 0 ${Math.max(dashboardData.hourly.length, 1)} 100`} className="w-full h-full" preserveAspectRatio="none">
                    {dashboardData.hourly.map(([, count], i) => {
                      const h = (count / dashboardData.maxHourly) * 90;
                      return <rect key={i} x={i} y={100 - h} width={0.8} height={h} fill="rgba(99, 102, 241, 0.6)" rx={0.2} />;
                    })}
                  </svg>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-white/20 font-mono">{dashboardData.hourly[0]?.[0] || ""}</span>
                  <span className="text-[9px] text-white/20 font-mono">{dashboardData.hourly[dashboardData.hourly.length - 1]?.[0] || ""}</span>
                </div>
              </div>

              {/* Top Sources */}
              <div>
                <h4 className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mb-2">Top Sources</h4>
                <div className="space-y-1">
                  {dashboardData.topSources.map(([src, count]) => (
                    <div key={src} className="flex items-center gap-2">
                      <span className="text-[11px] text-white/50 w-[200px] truncate font-mono">{src}</span>
                      <div className="flex-1 h-3 rounded-full bg-white/[0.03] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent/40"
                          style={{ width: `${(count / dashboardData.topSources[0][1]) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/30 tabular-nums w-10 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Diff Modal */}
      {showDiff && result?.entries && result.entries.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowDiff(false)}>
          <div className="w-[800px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <GitCompare className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">Compare Events</h3>
              <div className="flex-1" />
              <button onClick={() => setShowDiff(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] text-white/30 uppercase">Event A</label>
                  <select value={diffA} onChange={e => setDiffA(Number(e.target.value))} className="glass-input w-full h-7 px-2 text-[11px] mt-1">
                    {result.entries.slice(0, 50).map((e, i) => (
                      <option key={i} value={i}>#{i} {e.source} [{e.level}] ID:{e.event_id}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-white/30 uppercase">Event B</label>
                  <select value={diffB} onChange={e => setDiffB(Number(e.target.value))} className="glass-input w-full h-7 px-2 text-[11px] mt-1">
                    {result.entries.slice(0, 50).map((e, i) => (
                      <option key={i} value={i}>#{i} {e.source} [{e.level}] ID:{e.event_id}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const a = result.entries[diffA];
                  const b = result.entries[diffB];
                  if (!a || !b) return null;
                  const fields: [string, string | number | undefined, string | number | undefined][] = [
                    ["Time", a.time_created, b.time_created],
                    ["Level", a.level, b.level],
                    ["Source", a.source, b.source],
                    ["Event ID", a.event_id, b.event_id],
                    ["Message", a.message, b.message],
                  ];
                  return fields.map(([label, va, vb]) => (
                    <React.Fragment key={label}>
                      <div className="space-y-1">
                        <span className="text-[10px] text-white/30 uppercase">{label}</span>
                        <div className={`text-[11px] font-mono p-2 rounded bg-black/20 border ${va !== vb ? "border-amber-500/30 text-amber-300/80" : "border-white/[0.05] text-white/60"} break-words max-h-32 overflow-y-auto`}>
                          {String(va ?? "—")}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-white/30 uppercase">{label}</span>
                        <div className={`text-[11px] font-mono p-2 rounded bg-black/20 border ${va !== vb ? "border-amber-500/30 text-amber-300/80" : "border-white/[0.05] text-white/60"} break-words max-h-32 overflow-y-auto`}>
                          {String(vb ?? "—")}
                        </div>
                      </div>
                    </React.Fragment>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remote Computer Modal */}
      {showRemote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowRemote(false)}>
          <div className="w-[450px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Monitor className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">Connect to Remote Computer</h3>
              <div className="flex-1" />
              <button onClick={() => setShowRemote(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[10px] text-white/30">Requires WinRM enabled on the target machine. Run <code className="text-accent/70">Enable-PSRemoting -Force</code> on the remote PC.</p>
              <div>
                <label className="text-[10px] text-white/40 uppercase">Computer Name / IP</label>
                <input
                  value={remoteComputer}
                  onChange={e => setRemoteComputer(e.target.value)}
                  placeholder="e.g. SERVER01 or 192.168.1.50"
                  className="glass-input w-full h-8 px-3 text-[12px] mt-1"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-white/40 uppercase">Log</label>
                  <select value={remoteLog} onChange={e => setRemoteLog(e.target.value)} className="glass-input w-full h-8 px-2 text-[12px] mt-1">
                    <option value="System">System</option>
                    <option value="Application">Application</option>
                    <option value="Security">Security</option>
                    <option value="Setup">Setup</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-white/40 uppercase">Level</label>
                  <select value={remoteLevel} onChange={e => setRemoteLevel(e.target.value)} className="glass-input w-full h-8 px-2 text-[12px] mt-1">
                    <option value="All">All</option>
                    <option value="Critical">Critical</option>
                    <option value="Error">Error</option>
                    <option value="Warning">Warning</option>
                    <option value="Information">Information</option>
                  </select>
                </div>
              </div>
              <button
                onClick={queryRemote}
                disabled={loadingRemote || !remoteComputer}
                className="flex items-center justify-center gap-2 w-full h-9 rounded-lg text-[12px] font-medium
                           bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25 transition-all disabled:opacity-40"
              >
                {loadingRemote ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...</> : <><Monitor className="w-3.5 h-3.5" /> Connect & Load Events</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach Task Modal */}
      {showAttachTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAttachTask(false)}>
          <div className="w-[500px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <ZapIcon className="w-4 h-4 text-amber-400" />
              <h3 className="text-[14px] font-semibold text-white/90">Attach Scheduled Task to Event</h3>
              <div className="flex-1" />
              <button onClick={() => setShowAttachTask(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[10px] text-white/30">Creates a Windows Scheduled Task that triggers when the specified event occurs. Requires admin privileges.</p>
              <div>
                <label className="text-[10px] text-white/40 uppercase">Task Name</label>
                <input value={taskName} onChange={e => setTaskName(e.target.value)} className="glass-input w-full h-8 px-3 text-[12px] mt-1" placeholder="e.g. Alert_CriticalError" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-white/40 uppercase">Source</label>
                  <input value={taskSource} onChange={e => setTaskSource(e.target.value)} className="glass-input w-full h-8 px-3 text-[12px] mt-1" />
                </div>
                <div className="w-24">
                  <label className="text-[10px] text-white/40 uppercase">Event ID</label>
                  <input type="number" value={taskEventId} onChange={e => setTaskEventId(Number(e.target.value))} className="glass-input w-full h-8 px-3 text-[12px] mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-white/40 uppercase">Log</label>
                  <select value={taskLogName} onChange={e => setTaskLogName(e.target.value)} className="glass-input w-full h-8 px-2 text-[12px] mt-1">
                    <option value="System">System</option>
                    <option value="Application">Application</option>
                    <option value="Security">Security</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-white/40 uppercase">Action Type</label>
                <select value={taskActionType} onChange={e => setTaskActionType(e.target.value)} className="glass-input w-full h-8 px-2 text-[12px] mt-1">
                  <option value="powershell">PowerShell Command</option>
                  <option value="program">Run Program</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/40 uppercase">{taskActionType === "program" ? "Program Path" : "PowerShell Command"}</label>
                <textarea
                  value={taskActionValue}
                  onChange={e => setTaskActionValue(e.target.value)}
                  className="glass-input w-full h-20 px-3 py-2 text-[11px] font-mono mt-1 resize-none"
                  placeholder={taskActionType === "program" ? "C:\\path\\to\\program.exe" : "Send-MailMessage -To admin@company.com ..."}
                />
              </div>
              <button
                onClick={handleAttachTask}
                className="flex items-center justify-center gap-2 w-full h-9 rounded-lg text-[12px] font-medium
                           bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25 transition-all"
              >
                <ZapIcon className="w-3.5 h-3.5" /> Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Correlation Modal */}
      {showCorrelation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowCorrelation(false)}>
          <div className="w-[600px] glass-panel p-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <Group className="w-4 h-4 text-accent" />
              <h3 className="text-[14px] font-semibold text-white/90">Event Correlation</h3>
              <span className="text-[10px] text-white/25">{correlatedGroups.length} groups (60s window)</span>
              <div className="flex-1" />
              <button onClick={() => setShowCorrelation(false)} className="text-white/30 hover:text-white/60"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
              {correlatedGroups.length === 0 ? (
                <div className="text-center text-white/25 py-8 text-[12px]">No correlated event groups found. Events that occur within 60 seconds of each other are grouped together.</div>
              ) : correlatedGroups.map((group) => (
                <div key={group.key} className="rounded-lg border border-white/[0.05] bg-white/[0.02] overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2 bg-white/[0.02] border-b border-white/[0.05]">
                    <span className="text-[12px] font-bold text-accent tabular-nums">{group.events.length} events</span>
                    <span className="text-[10px] text-white/30 font-mono">{group.timeSpan}</span>
                    <div className="flex-1" />
                    <div className="flex gap-1">
                      {Object.entries(
                        group.events.reduce<Record<string, number>>((acc, e) => { acc[e.level] = (acc[e.level] || 0) + 1; return acc; }, {})
                      ).map(([lvl, cnt]) => (
                        <span key={lvl} className={`inline-flex items-center h-4 px-1.5 rounded text-[8px] font-bold ${levelBadge(lvl)}`}>{lvl}:{cnt}</span>
                      ))}
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.03]">
                    {group.events.slice(0, 5).map((ev, j) => (
                      <div key={j} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                        <span className="text-white/30 font-mono w-[130px] shrink-0">{ev.time_created}</span>
                        <span className={`inline-flex items-center h-4 px-1.5 rounded text-[8px] font-bold ${levelBadge(ev.level)}`}>{ev.level}</span>
                        <span className="text-white/40 w-[120px] truncate">{ev.source}</span>
                        <span className="text-white/25 font-mono">#{ev.event_id}</span>
                        <span className="flex-1 text-white/50 truncate">{ev.message}</span>
                      </div>
                    ))}
                    {group.events.length > 5 && (
                      <div className="text-center text-[10px] text-white/20 py-1">+{group.events.length - 5} more</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
