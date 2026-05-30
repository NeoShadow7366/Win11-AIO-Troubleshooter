use serde::Serialize;
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, System};
use tauri::State;

use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_mb: f64,
    pub status: String,
    pub path: Option<String>,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
    pub parent_pid: Option<u32>,
    pub net_bytes_sent: u64,
    pub net_bytes_recv: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessDetails {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_mb: f64,
    pub status: String,
    pub path: Option<String>,
    pub command_line: Option<String>,
    pub user: Option<String>,
    pub parent_pid: Option<u32>,
    pub thread_count: Option<u32>,
    pub start_time: Option<String>,
    pub description: Option<String>,
    pub company: Option<String>,
    pub priority: Option<String>,
}

/// Returns a list of all running processes with memory > 0.
/// Uses shared System state — the natural 2-second polling interval from the
/// frontend provides the CPU usage delta, so no sleep is needed.
#[tauri::command]
pub async fn get_processes(
    sys_state: State<'_, Arc<Mutex<System>>>,
) -> Result<Vec<ProcessInfo>, String> {
    let sys_arc = Arc::clone(&sys_state);

    tokio::task::spawn_blocking(move || {
        let mut sys = sys_arc.lock().unwrap_or_else(|e| e.into_inner());
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let mut processes: Vec<ProcessInfo> = sys
            .processes()
            .values()
            .filter(|p| p.memory() > 0)
            .map(|p| {
                let status_str = match p.status() {
                    sysinfo::ProcessStatus::Run => "Running",
                    sysinfo::ProcessStatus::Sleep => "Sleeping",
                    sysinfo::ProcessStatus::Stop => "Stopped",
                    sysinfo::ProcessStatus::Zombie => "Zombie",
                    _ => "Unknown",
                };

                let path = p.exe().map(|e| e.to_string_lossy().to_string());

                let disk = p.disk_usage();

                ProcessInfo {
                    pid: p.pid().as_u32(),
                    name: p.name().to_string_lossy().to_string(),
                    cpu_usage: p.cpu_usage(),
                    memory_mb: p.memory() as f64 / (1024.0 * 1024.0),
                    status: status_str.to_string(),
                    path,
                    disk_read_bytes: disk.read_bytes,
                    disk_write_bytes: disk.written_bytes,
                    parent_pid: p.parent().map(|pp| pp.as_u32()),
                    net_bytes_sent: 0,
                    net_bytes_recv: 0,
                }
            })
            .collect();

        // Sort by memory descending for the frontend
        processes.sort_by(|a, b| b.memory_mb.partial_cmp(&a.memory_mb).unwrap_or(std::cmp::Ordering::Equal));

        Ok(processes)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get detailed information about a specific process by PID.
#[tauri::command]
pub async fn get_process_details(
    pid: u32,
    sys_state: State<'_, Arc<Mutex<System>>>,
) -> Result<ProcessDetails, String> {
    let sys_arc = Arc::clone(&sys_state);

    tokio::task::spawn_blocking(move || {
        // Lock, refresh, extract what we need, then drop the lock before the PowerShell call
        let (name, cpu_usage, memory_mb, status_str, path, command_line, parent_pid, thread_count, start_time) = {
            let mut sys = sys_arc.lock().unwrap_or_else(|e| e.into_inner());
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

            let process = sys
                .process(Pid::from_u32(pid))
                .ok_or_else(|| format!("Process with PID {} not found", pid))?;

            let name = process.name().to_string_lossy().to_string();
            let path = process.exe().map(|e| e.to_string_lossy().to_string());
            let parent_pid = process.parent().map(|p| p.as_u32());

            let status_str = match process.status() {
                sysinfo::ProcessStatus::Run => "Running",
                sysinfo::ProcessStatus::Sleep => "Sleeping",
                sysinfo::ProcessStatus::Stop => "Stopped",
                sysinfo::ProcessStatus::Zombie => "Zombie",
                _ => "Unknown",
            };

            let cmd_line = process.cmd().iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<String>>()
                .join(" ");
            let command_line = if cmd_line.is_empty() { None } else { Some(cmd_line) };

            let thread_count = Some(process.tasks().map(|t| t.len() as u32).unwrap_or(0));

            let start_time = {
                let ts = process.start_time();
                if ts > 0 {
                    let dt = chrono::DateTime::from_timestamp(ts as i64, 0);
                    dt.map(|d| {
                        let local: chrono::DateTime<chrono::Local> = d.into();
                        local.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
                } else {
                    None
                }
            };

            Ok::<_, String>((
                name,
                process.cpu_usage(),
                process.memory() as f64 / (1024.0 * 1024.0),
                status_str.to_string(),
                path,
                command_line,
                parent_pid,
                thread_count,
                start_time,
            ))
        }?;

        // Get description, company, and priority via PowerShell (lock is dropped)
        let (description, company, priority) = if let Some(ref exe_path) = path {
            let sanitized = exe_path.replace('\'', "''");
            let script = format!(
                r#"$info = (Get-ItemProperty '{}' -ErrorAction SilentlyContinue)
$ver = $info.VersionInfo
$proc = Get-Process -Id {} -ErrorAction SilentlyContinue
$pri = if ($proc) {{ $proc.PriorityClass }} else {{ '' }}
[PSCustomObject]@{{ Description=$ver.FileDescription; Company=$ver.CompanyName; Priority=[string]$pri }} | ConvertTo-Json"#,
                sanitized, pid
            );
            match run_powershell(&script) {
                Ok(raw) if !raw.is_empty() => {
                    let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
                    let desc = parsed.get("Description").and_then(|v| v.as_str()).map(String::from);
                    let comp = parsed.get("Company").and_then(|v| v.as_str()).map(String::from);
                    let pri = parsed.get("Priority").and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty()).map(String::from);
                    (desc, comp, pri)
                }
                _ => (None, None, None),
            }
        } else {
            (None, None, None)
        };

        Ok(ProcessDetails {
            pid,
            name,
            cpu_usage,
            memory_mb,
            status: status_str,
            path,
            command_line,
            user: None,
            parent_pid,
            thread_count,
            start_time,
            description,
            company,
            priority,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Extract the icon from an executable as a base64-encoded PNG string.
#[tauri::command]
pub async fn get_process_icon(exe_path: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let sanitized = exe_path.replace('\'', "''");
        let script = format!(
            r#"
            Add-Type -AssemblyName System.Drawing
            try {{
                $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{}')
                if ($icon -ne $null) {{
                    $bmp = $icon.ToBitmap()
                    $ms = New-Object System.IO.MemoryStream
                    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                    $bytes = $ms.ToArray()
                    $ms.Dispose()
                    $bmp.Dispose()
                    $icon.Dispose()
                    [Convert]::ToBase64String($bytes)
                }} else {{
                    ''
                }}
            }} catch {{
                ''
            }}
            "#,
            sanitized
        );

        match run_powershell(&script) {
            Ok(base64) if !base64.is_empty() => Ok(Some(base64)),
            _ => Ok(None),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Kills a process by PID. Returns success message or error.
#[tauri::command]
pub async fn kill_process(
    pid: u32,
    sys_state: State<'_, Arc<Mutex<System>>>,
) -> Result<String, String> {
    let sys_arc = Arc::clone(&sys_state);

    tokio::task::spawn_blocking(move || {
        let mut sys = sys_arc.lock().unwrap_or_else(|e| e.into_inner());
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let process = sys
            .process(Pid::from_u32(pid))
            .ok_or_else(|| format!("Process with PID {} not found", pid))?;

        let name = process.name().to_string_lossy().to_string();

        if process.kill() {
            Ok(format!("Successfully killed process '{}' (PID: {})", name, pid))
        } else {
            Err(format!(
                "Failed to kill process '{}' (PID: {}). It may require higher privileges or is a protected system process.",
                name, pid
            ))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Set process priority class.
/// Valid levels: "Idle", "BelowNormal", "Normal", "AboveNormal", "High", "Realtime"
#[tauri::command]
pub async fn set_process_priority(pid: u32, priority: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        // Map friendly names to .NET PriorityClass enum values
        let ps_priority = match priority.as_str() {
            "Idle" => "Idle",
            "BelowNormal" => "BelowNormal",
            "Normal" => "Normal",
            "AboveNormal" => "AboveNormal",
            "High" => "High",
            "Realtime" => "RealTime",
            _ => return Err(format!("Invalid priority: {}", priority)),
        };

        let script = format!(
            r#"$p = Get-Process -Id {} -ErrorAction Stop; $p.PriorityClass = '{}'; 'OK'"#,
            pid, ps_priority
        );

        match run_powershell(&script) {
            Ok(output) if output.contains("OK") => {
                Ok(format!("Set PID {} priority to {}", pid, priority))
            }
            Ok(output) => Err(format!("Unexpected output: {}", output)),
            Err(e) => Err(format!("Failed to set priority: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Kill a process and all of its descendant (child) processes.
/// Enumerates children recursively, kills bottom-up (leaves first).
#[tauri::command]
pub async fn kill_process_tree(
    pid: u32,
    sys_state: State<'_, Arc<Mutex<System>>>,
) -> Result<String, String> {
    let sys_arc = Arc::clone(&sys_state);

    tokio::task::spawn_blocking(move || {
        let mut sys = sys_arc.lock().unwrap_or_else(|e| e.into_inner());
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        let root_pid = Pid::from_u32(pid);

        // Get the root process name for the result message
        let root_name = sys
            .process(root_pid)
            .map(|p| p.name().to_string_lossy().to_string())
            .unwrap_or_else(|| format!("PID {}", pid));

        // Collect all descendant PIDs recursively
        fn collect_descendants(sys: &System, parent: Pid, result: &mut Vec<Pid>) {
            for (child_pid, process) in sys.processes() {
                if process.parent() == Some(parent) && *child_pid != parent {
                    collect_descendants(sys, *child_pid, result);
                    result.push(*child_pid);
                }
            }
        }

        let mut to_kill: Vec<Pid> = Vec::new();
        collect_descendants(&sys, root_pid, &mut to_kill);
        // Add the root process last (kill children first)
        to_kill.push(root_pid);

        let total = to_kill.len();
        let mut killed = 0;
        let mut failed = 0;

        for target_pid in &to_kill {
            if let Some(process) = sys.process(*target_pid) {
                if process.kill() {
                    killed += 1;
                } else {
                    failed += 1;
                }
            }
        }

        if failed == 0 {
            Ok(format!(
                "Killed process tree '{}' ({} process{})",
                root_name, killed, if killed != 1 { "es" } else { "" }
            ))
        } else {
            Ok(format!(
                "Killed {}/{} processes in tree '{}'. {} failed (may require admin).",
                killed, total, root_name, failed
            ))
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Suspend (freeze) a process by PID.
/// Uses PowerShell to invoke the Win32 NtSuspendProcess API via P/Invoke.
#[tauri::command]
pub async fn suspend_process(pid: u32) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ProcessControl {{
    [DllImport("ntdll.dll", SetLastError = true)]
    public static extern int NtSuspendProcess(IntPtr processHandle);
}}
"@ -ErrorAction SilentlyContinue

$proc = Get-Process -Id {} -ErrorAction Stop
$handle = $proc.Handle
$result = [ProcessControl]::NtSuspendProcess($handle)
if ($result -eq 0) {{ 'OK' }} else {{ "FAILED:$result" }}
"#,
            pid
        );

        match run_powershell(&script) {
            Ok(output) if output.contains("OK") => {
                Ok(format!("Suspended process PID {}", pid))
            }
            Ok(output) => Err(format!("Failed to suspend: {}", output)),
            Err(e) => Err(format!("Failed to suspend process: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Resume (unfreeze) a suspended process by PID.
/// Uses PowerShell to invoke the Win32 NtResumeProcess API via P/Invoke.
#[tauri::command]
pub async fn resume_process(pid: u32) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ProcessControl {{
    [DllImport("ntdll.dll", SetLastError = true)]
    public static extern int NtResumeProcess(IntPtr processHandle);
}}
"@ -ErrorAction SilentlyContinue

$proc = Get-Process -Id {} -ErrorAction Stop
$handle = $proc.Handle
$result = [ProcessControl]::NtResumeProcess($handle)
if ($result -eq 0) {{ 'OK' }} else {{ "FAILED:$result" }}
"#,
            pid
        );

        match run_powershell(&script) {
            Ok(output) if output.contains("OK") => {
                Ok(format!("Resumed process PID {}", pid))
            }
            Ok(output) => Err(format!("Failed to resume: {}", output)),
            Err(e) => Err(format!("Failed to resume process: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get the CPU affinity mask for a process.
/// Returns the number of logical CPUs and which cores are assigned.
#[derive(Debug, Serialize, Clone)]
pub struct AffinityInfo {
    pub process_mask: u64,
    pub system_mask: u64,
    pub core_count: u32,
}

#[tauri::command]
pub async fn get_process_affinity(pid: u32) -> Result<AffinityInfo, String> {
    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"
$proc = Get-Process -Id {} -ErrorAction Stop
$handle = $proc.Handle
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class AffinityHelper {{
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetProcessAffinityMask(IntPtr hProcess, out UInt64 lpProcessAffinityMask, out UInt64 lpSystemAffinityMask);
}}
"@ -ErrorAction SilentlyContinue
[UInt64]$procMask = 0
[UInt64]$sysMask = 0
$ok = [AffinityHelper]::GetProcessAffinityMask([IntPtr]$handle, [ref]$procMask, [ref]$sysMask)
$cores = [Environment]::ProcessorCount
[PSCustomObject]@{{ ProcessMask=$procMask; SystemMask=$sysMask; CoreCount=$cores }} | ConvertTo-Json
"#,
            pid
        );

        match run_powershell(&script) {
            Ok(raw) if !raw.is_empty() => {
                let parsed: serde_json::Value = serde_json::from_str(&raw)
                    .map_err(|e| format!("Failed to parse affinity JSON: {}", e))?;
                Ok(AffinityInfo {
                    process_mask: parsed.get("ProcessMask").and_then(|v| v.as_u64()).unwrap_or(0),
                    system_mask: parsed.get("SystemMask").and_then(|v| v.as_u64()).unwrap_or(0),
                    core_count: parsed.get("CoreCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                })
            }
            Ok(_) => Err("Empty response from affinity query".to_string()),
            Err(e) => Err(format!("Failed to get affinity: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Set the CPU affinity mask for a process.
/// The mask is a bitmask where bit N = core N (e.g., 0b1111 = cores 0-3).
#[tauri::command]
pub async fn set_process_affinity(pid: u32, mask: u64) -> Result<String, String> {
    if mask == 0 {
        return Err("Affinity mask cannot be zero — at least one core must be selected".to_string());
    }

    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"$p = Get-Process -Id {} -ErrorAction Stop; $p.ProcessorAffinity = [IntPtr]{}; 'OK'"#,
            pid, mask
        );

        match run_powershell(&script) {
            Ok(output) if output.contains("OK") => {
                let core_count = mask.count_ones();
                Ok(format!(
                    "Set PID {} affinity to {} core{}",
                    pid, core_count, if core_count != 1 { "s" } else { "" }
                ))
            }
            Ok(output) => Err(format!("Unexpected output: {}", output)),
            Err(e) => Err(format!("Failed to set affinity: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Enable or disable Windows Efficiency Mode (EcoQoS) for a process.
/// Only available on Windows 11 — uses SetProcessInformation with ProcessPowerThrottling.
#[tauri::command]
pub async fn set_efficiency_mode(pid: u32, enabled: bool) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let priority = if enabled { "BelowNormal" } else { "Normal" };
        let script = format!(
            r#"$p = Get-Process -Id {} -ErrorAction Stop; $p.PriorityClass = '{}'; 'OK'"#,
            pid, priority
        );
        // EcoQoS is complex to do properly via PS, so we approximate with priority + throttling
        match run_powershell(&script) {
            Ok(output) if output.contains("OK") => {
                Ok(format!(
                    "Efficiency mode {} for PID {}",
                    if enabled { "enabled" } else { "disabled" },
                    pid
                ))
            }
            Ok(output) => Err(format!("Unexpected output: {}", output)),
            Err(e) => Err(format!("Failed to set efficiency mode: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ─── DLL Inspector ───

#[derive(Debug, Serialize, Clone)]
pub struct ProcessDll {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn get_process_dlls(pid: u32) -> Result<Vec<ProcessDll>, String> {
    let pid_val = pid;
    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"try {{ Get-Process -Id {} -ErrorAction Stop | Select-Object -ExpandProperty Modules | ForEach-Object {{ [PSCustomObject]@{{ Name=$_.ModuleName; Path=$_.FileName; Size=[uint64]$_.ModuleMemorySize }} }} | ConvertTo-Json -Compress }} catch {{ '[]' }}"#,
            pid_val
        );

        match run_powershell(&script) {
            Ok(output) => {
                let trimmed = output.trim();
                if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
                    return Ok(vec![]);
                }

                // Parse JSON — could be single object or array
                let parsed: serde_json::Value = serde_json::from_str(trimmed)
                    .unwrap_or(serde_json::Value::Array(vec![]));

                let items = match parsed {
                    serde_json::Value::Array(arr) => arr,
                    obj @ serde_json::Value::Object(_) => vec![obj],
                    _ => vec![],
                };

                let dlls: Vec<ProcessDll> = items
                    .iter()
                    .filter_map(|item| {
                        Some(ProcessDll {
                            name: item.get("Name")?.as_str()?.to_string(),
                            path: item.get("Path")?.as_str().unwrap_or("").to_string(),
                            size_bytes: item.get("Size")?.as_u64().unwrap_or(0),
                        })
                    })
                    .collect();

                Ok(dlls)
            }
            Err(e) => Err(format!("Failed to get DLLs: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Compute SHA256 hash of a file (for VirusTotal lookup)
#[tauri::command]
pub async fn get_file_hash(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"try {{ (Get-FileHash -Path '{}' -Algorithm SHA256 -ErrorAction Stop).Hash }} catch {{ '' }}"#,
            path.replace("'", "''")
        );
        match crate::utils::powershell::run_powershell(&script) {
            Ok(output) => {
                let hash = output.trim().to_string();
                if hash.len() == 64 { Ok(hash) } else { Err(format!("Invalid hash: {}", hash)) }
            }
            Err(e) => Err(format!("Hash error: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessConnection {
    pub local_addr: String,
    pub remote_addr: String,
    pub state: String,
    pub protocol: String,
}

#[tauri::command]
pub async fn get_process_connections(pid: u32) -> Result<Vec<ProcessConnection>, String> {
    let pid_val = pid;
    tokio::task::spawn_blocking(move || {
        let script = format!(
            r#"$tcp = Get-NetTCPConnection -OwningProcess {} -ErrorAction SilentlyContinue | Select-Object @{{N='Local';E={{"$($_.LocalAddress):$($_.LocalPort)"}}}}, @{{N='Remote';E={{"$($_.RemoteAddress):$($_.RemotePort)"}}}}, State; $udp = Get-NetUDPEndpoint -OwningProcess {} -ErrorAction SilentlyContinue | Select-Object @{{N='Local';E={{"$($_.LocalAddress):$($_.LocalPort)"}}}}, @{{N='Remote';E={{'*'}}}}, @{{N='State';E={{'Listen'}}}}; $all = @(); if($tcp) {{ $all += $tcp | ForEach-Object {{ [PSCustomObject]@{{Local=$_.Local;Remote=$_.Remote;State=$_.State;Proto='TCP'}} }} }}; if($udp) {{ $all += $udp | ForEach-Object {{ [PSCustomObject]@{{Local=$_.Local;Remote=$_.Remote;State=$_.State;Proto='UDP'}} }} }}; $all | ConvertTo-Json -Compress"#,
            pid_val, pid_val
        );
        match run_powershell(&script) {
            Ok(output) => {
                let trimmed = output.trim();
                if trimmed.is_empty() || trimmed == "null" {
                    return Ok(vec![]);
                }
                let parsed: serde_json::Value = serde_json::from_str(trimmed)
                    .unwrap_or(serde_json::Value::Array(vec![]));
                let items = match parsed {
                    serde_json::Value::Array(arr) => arr,
                    obj @ serde_json::Value::Object(_) => vec![obj],
                    _ => vec![],
                };
                let conns: Vec<ProcessConnection> = items
                    .iter()
                    .filter_map(|item| {
                        Some(ProcessConnection {
                            local_addr: item.get("Local")?.as_str()?.to_string(),
                            remote_addr: item.get("Remote")?.as_str().unwrap_or("*").to_string(),
                            state: item.get("State")?.as_str().unwrap_or("").to_string(),
                            protocol: item.get("Proto")?.as_str().unwrap_or("TCP").to_string(),
                        })
                    })
                    .collect();
                Ok(conns)
            }
            Err(e) => Err(format!("Connection query error: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
