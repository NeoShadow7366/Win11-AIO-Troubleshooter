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
