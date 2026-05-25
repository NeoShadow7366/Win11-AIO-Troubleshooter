use serde::Serialize;
use sysinfo::{Pid, System};

use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_mb: f64,
    pub status: String,
    pub path: Option<String>,
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
}

/// Returns a list of all running processes with memory > 0.
/// Two CPU refreshes are done with a delay to get accurate CPU usage readings.
#[tauri::command]
pub async fn get_processes() -> Result<Vec<ProcessInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();

        // Refresh twice with delay for accurate CPU readings
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        std::thread::sleep(std::time::Duration::from_millis(200));
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

                ProcessInfo {
                    pid: p.pid().as_u32(),
                    name: p.name().to_string_lossy().to_string(),
                    cpu_usage: p.cpu_usage(),
                    memory_mb: p.memory() as f64 / (1024.0 * 1024.0),
                    status: status_str.to_string(),
                    path,
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
pub async fn get_process_details(pid: u32) -> Result<ProcessDetails, String> {
    tokio::task::spawn_blocking(move || {
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        std::thread::sleep(std::time::Duration::from_millis(200));
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

        // Get description and company from the exe file properties via PowerShell
        let (description, company) = if let Some(ref exe_path) = path {
            let sanitized = exe_path.replace('\'', "''");
            let script = format!(
                r#"$info = (Get-ItemProperty '{}' -ErrorAction SilentlyContinue)
$ver = $info.VersionInfo
[PSCustomObject]@{{ Description=$ver.FileDescription; Company=$ver.CompanyName }} | ConvertTo-Json"#,
                sanitized
            );
            match run_powershell(&script) {
                Ok(raw) if !raw.is_empty() => {
                    let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
                    let desc = parsed.get("Description").and_then(|v| v.as_str()).map(String::from);
                    let comp = parsed.get("Company").and_then(|v| v.as_str()).map(String::from);
                    (desc, comp)
                }
                _ => (None, None),
            }
        } else {
            (None, None)
        };

        Ok(ProcessDetails {
            pid,
            name,
            cpu_usage: process.cpu_usage(),
            memory_mb: process.memory() as f64 / (1024.0 * 1024.0),
            status: status_str.to_string(),
            path,
            command_line,
            user: None,
            parent_pid,
            thread_count,
            start_time,
            description,
            company,
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
pub async fn kill_process(pid: u32) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let sys = System::new_all();

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
