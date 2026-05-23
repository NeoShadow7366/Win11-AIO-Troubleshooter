// ─── System ───

export interface SystemStats {
  cpu_usage: number;
  ram_used: number;
  ram_total: number;
  disk_used: number;
  disk_total: number;
}

export interface SystemSpecs {
  os_version: string;
  cpu_name: string;
  gpu_name: string;
  uptime: string;
  hostname: string;
}

// ─── Processes ───

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_usage: number;
  memory_mb: number;
  status: string;
}

// ─── Services ───

export interface ServiceInfo {
  name: string;
  display_name: string;
  status: string;
  start_type: string;
}

// ─── Event Logs ───

export interface EventLogEntry {
  time_created: string;
  level: string;
  source: string;
  event_id: number;
  message: string;
}

// ─── App Insights ───

export interface AppInsightResult {
  processes: ProcessInfo[];
  event_logs: EventLogEntry[];
  exe_path: string | null;
}

// ─── BSOD ───

export interface MinidumpInfo {
  filename: string;
  date_created: string;
  size_kb: number;
}

export interface BsodRecord {
  date: string;
  bugcheck_code: string;
  description: string;
  parameters: string;
}

// ─── CLI Tool Output (Channel streaming) ───

export type CliOutput =
  | { type: "Stdout"; line: string }
  | { type: "Stderr"; line: string }
  | { type: "Complete"; exit_code: number }
  | { type: "Error"; message: string };

// ─── Navigation ───

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}
