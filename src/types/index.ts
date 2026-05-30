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
  per_core_usage: number[];
  ram_used: number;
  ram_total: number;
  disk_used: number;
  disk_total: number;
  disks: DiskInfo[];
  internal_ip: string;
  external_ip: string;
  net_rx_bytes: number;
  net_tx_bytes: number;
  gpu_usage: number | null;
  gpu_memory_used: number | null;
  gpu_memory_total: number | null;
  cpu_speed_mhz: number | null;
  disk_read_bytes: number;
  disk_write_bytes: number;
  ram_available: number;
  swap_used: number;
  swap_total: number;
  ram_cached: number | null;
  ram_committed: number | null;
  ram_commit_limit: number | null;
  ram_paged_pool: number | null;
  ram_non_paged_pool: number | null;
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
  parent_pid: number | null;
  net_bytes_sent: number;
  net_bytes_recv: number;
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

export interface ProcessDll {
  name: string;
  path: string;
  size_bytes: number;
}

export interface AppHistoryEntry {
  name: string;
  cpu_time_secs: number;
  memory_peak_mb: number;
  memory_current_mb: number;
  disk_read_bytes: number;
  disk_write_bytes: number;
  instance_count: number;
  net_bytes_sent: number;
  net_bytes_recv: number;
}

export interface ProcessConnection {
  local_addr: string;
  remote_addr: string;
  state: string;
  protocol: string;
}

export interface AffinityInfo {
  process_mask: number;
  system_mask: number;
  core_count: number;
}

// ─── Users ───

export interface UserSession {
  username: string;
  session_id: number;
  status: string;
  logon_time: string | null;
  cpu_total: number;
  memory_mb: number;
  process_count: number;
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
  task_category?: string | null;
  keywords?: string | null;
  user?: string | null;
  computer?: string | null;
  opcode?: string | null;
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

// ─── Restore Points ───

export interface RestorePoint {
  sequence_number: number;
  description: string;
  creation_time: string;
  restore_point_type: string;
}

// ─── Driver Manager ───

export interface DriverInfo {
  name: string;
  device_name: string;
  manufacturer: string;
  status: string;
  driver_version: string;
  driver_date: string;
  device_class: string;
  inf_name: string;
  is_signed: boolean;
  has_problem: boolean;
}

// ─── Task Scheduler ───

export interface ScheduledTaskInfo {
  task_name: string;
  task_path: string;
  state: string;
  description: string;
  author: string;
  trigger_type: string;
  next_run_time: string;
  last_run_time: string;
  last_result: number;
  command: string;
}

// ─── Installed Programs ───

export interface InstalledProgram {
  name: string;
  version: string;
  publisher: string;
  install_date: string;
  install_location: string;
  estimated_size_kb: number;
  uninstall_string: string;
  is_system_component: boolean;
}

// ─── Disk Space Analyzer ───

export interface DiskSpaceEntry {
  name: string;
  path: string;
  size_bytes: number;
  is_directory: boolean;
  children: DiskSpaceEntry[] | null;
}

// ─── Firewall ───

export interface FirewallRule {
  name: string;
  display_name: string;
  direction: string;
  action: string;
  enabled: boolean;
  profile: string;
  protocol: string;
  local_port: string;
  remote_port: string;
  remote_address: string;
  program: string;
}

// ─── Windows Update ───

export interface WindowsUpdateInfo {
  title: string;
  kb_article: string;
  date: string;
  status: string;
  support_url: string;
  description: string;
  update_type: string;
}

export interface PendingUpdate {
  title: string;
  kb_article: string;
  description: string;
  is_downloaded: boolean;
  is_mandatory: boolean;
  size_mb: number;
}
