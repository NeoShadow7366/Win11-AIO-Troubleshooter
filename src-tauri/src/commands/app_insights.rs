use serde::Serialize;
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::State;

use crate::commands::event_logs::EventLogEntry;
use crate::commands::processes::ProcessInfo;
use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct AppInsightResult {
    pub processes: Vec<ProcessInfo>,
    pub event_logs: Vec<EventLogEntry>,
    pub exe_path: Option<String>,
    pub install_directory: Option<String>,
    pub appdata_directory: Option<String>,
}

/// Provides combined insight into an application: matching running processes and
/// related event log entries. Also reports the executable path if found.
#[tauri::command]
pub async fn get_app_insights(
    name: String,
    sys_state: State<'_, Arc<Mutex<System>>>,
) -> Result<AppInsightResult, String> {
    let name_clone = name.clone();
    let sys_arc = Arc::clone(&sys_state);

    tokio::task::spawn_blocking(move || {
        // --- Find matching processes (lock, refresh, extract, drop lock) ---
        let (mut processes, exe_path) = {
            let mut sys = sys_arc.lock().unwrap_or_else(|e| e.into_inner());
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

            let search_lower = name_clone.to_lowercase();
            let mut exe_path: Option<String> = None;
            let mut processes: Vec<ProcessInfo> = Vec::new();

            for p in sys.processes().values() {
                let proc_name = p.name().to_string_lossy().to_string();
                if proc_name.to_lowercase().contains(&search_lower) && p.memory() > 0 {
                    // Capture the exe path from the first matching process
                    if exe_path.is_none() {
                        if let Some(path) = p.exe() {
                            exe_path = Some(path.to_string_lossy().to_string());
                        }
                    }

                    let status_str = match p.status() {
                        sysinfo::ProcessStatus::Run => "Running",
                        sysinfo::ProcessStatus::Sleep => "Sleeping",
                        sysinfo::ProcessStatus::Stop => "Stopped",
                        sysinfo::ProcessStatus::Zombie => "Zombie",
                        _ => "Unknown",
                    };

                    let disk = p.disk_usage();

                    processes.push(ProcessInfo {
                        pid: p.pid().as_u32(),
                        name: proc_name,
                        cpu_usage: p.cpu_usage(),
                        memory_mb: p.memory() as f64 / (1024.0 * 1024.0),
                        status: status_str.to_string(),
                        path: p.exe().map(|e| e.to_string_lossy().to_string()),
                        disk_read_bytes: disk.read_bytes,
                        disk_write_bytes: disk.written_bytes,
                        parent_pid: p.parent().map(|pp| pp.as_u32()),
                        net_bytes_sent: 0,
                        net_bytes_recv: 0,
                    });
                }
            }

            (processes, exe_path)
        };
        // Lock is dropped here

        processes.sort_by(|a, b| {
            b.memory_mb
                .partial_cmp(&a.memory_mb)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // --- Find matching event log entries ---
        let sanitized = name_clone.replace('\'', "''").replace('*', "");
        let script = format!(
            r#"
            try {{
                $events = Get-WinEvent -FilterHashtable @{{LogName='Application'; Level=2,3}} -MaxEvents 200 -ErrorAction Stop |
                    Where-Object {{ $_.ProviderName -like '*{search}*' -or $_.Message -like '*{search}*' }} |
                    Select-Object -First 30
                $events | ForEach-Object {{
                    [PSCustomObject]@{{
                        TimeCreated = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
                        Level = switch ($_.Level) {{
                            2 {{ 'Error' }}
                            3 {{ 'Warning' }}
                            default {{ 'Info' }}
                        }}
                        Source = $_.ProviderName
                        Message = if ($_.Message.Length -gt 500) {{ $_.Message.Substring(0, 500) + '...' }} else {{ $_.Message }}
                        EventId = $_.Id
                    }}
                }} | ConvertTo-Json -Depth 3
            }} catch {{
                if ($_.Exception.Message -like '*No events were found*') {{
                    Write-Output '[]'
                }} else {{
                    throw $_
                }}
            }}
            "#,
            search = sanitized,
        );

        let event_logs: Vec<EventLogEntry> = match run_powershell(&script) {
            Ok(raw) if !raw.is_empty() && raw != "[]" => {
                serde_json::from_str(&raw)
                    .or_else(|_| {
                        serde_json::from_str::<serde_json::Value>(&raw)
                            .map(|v| vec![v])
                            .and_then(|arr| {
                                serde_json::from_value(serde_json::Value::Array(arr))
                            })
                    })
                    .unwrap_or_default()
            }
            _ => vec![],
        };

        // --- Find installation and appdata directories ---
        let search_lower = name_clone.to_lowercase();
        let install_directory = find_app_directory(&search_lower, &[
            r"C:\Program Files",
            r"C:\Program Files (x86)",
        ]);

        let appdata_directory = {
            let appdata_base = std::env::var("APPDATA").unwrap_or_default();
            let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
            find_app_directory(&search_lower, &[&appdata_base, &local_appdata])
        };

        Ok(AppInsightResult {
            processes,
            event_logs,
            exe_path,
            install_directory,
            appdata_directory,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Search directories for a subdirectory whose name contains the search term.
fn find_app_directory(search_lower: &str, base_dirs: &[&str]) -> Option<String> {
    for base in base_dirs {
        let base_path = std::path::Path::new(base);
        if !base_path.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(base_path) {
            for entry in entries.flatten() {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let dir_name = entry.file_name().to_string_lossy().to_lowercase();
                    if dir_name.contains(search_lower) {
                        return Some(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    None
}
