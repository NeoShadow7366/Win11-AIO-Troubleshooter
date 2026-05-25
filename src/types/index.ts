// ─── System ───

export interface DiskInfo {
  name: string;
  mount_point: string;
  disk_type: string;
  file_system: string;
  total: number;
  used: number;
}

export interface SystemStats {
  cpu_usage: number;
  ram_used: number;
  ram_total: number;
  disk_used: number;
  disk_total: number;
  disks: DiskInfo[];
  internal_ip: string;
  external_ip: string;
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
  path: string | null;
  disk_read_bytes: number;
  disk_write_bytes: number;
}

export interface ProcessDetails {
  pid: number;
  name: string;
  cpu_usage: number;
  memory_mb: number;
  status: string;
  path: string | null;
  command_line: string | null;
  user: string | null;
  parent_pid: number | null;
  thread_count: number | null;
  start_time: string | null;
  description: string | null;
  company: string | null;
  priority: string | null;
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

export interface ServiceInsightResult {
  executable_path: string | null;
  description: string | null;
  start_mode: string | null;
  state: string | null;
  process_id: number | null;
}

// ─── App Insights ───

export interface AppInsightResult {
  processes: ProcessInfo[];
  event_logs: EventLogEntry[];
  exe_path: string | null;
  install_directory: string | null;
  appdata_directory: string | null;
}

// ─── BSOD ───

export interface MinidumpInfo {
  filename: string;
  full_path: string;
  date_created: string;
  size_kb: number;
}

export interface BsodRecord {
  date: string;
  bugcheck_code: string;
  description: string;
  parameters: string;
}

export interface DumpAnalysis {
  bug_check_code: string;
  bug_check_description: string;
  timestamp: string;
  parameters: string[];
  faulting_module: string | null;
  process_at_crash: string | null;
  system_uptime: string | null;
  dump_type: string | null;
  os_version: string | null;
  raw_output: string;
}

// ─── Favorites ───

export interface FavoriteItem {
  item_type: string;
  name: string;
  display_name: string | null;
  path: string | null;
}

// ─── Crash Logs ───

export interface CrashLogResult {
  entries: EventLogEntry[];
  total_count: number;
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
