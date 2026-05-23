use serde::Serialize;
use sysinfo::{Pid, System};

#[derive(Debug, Serialize, Clone)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_mb: f64,
    pub status: String,
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

                ProcessInfo {
                    pid: p.pid().as_u32(),
                    name: p.name().to_string_lossy().to_string(),
                    cpu_usage: p.cpu_usage(),
                    memory_mb: p.memory() as f64 / (1024.0 * 1024.0),
                    status: status_str.to_string(),
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
