use serde::Serialize;
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct AppHistoryEntry {
    pub name: String,
    pub cpu_time_secs: f64,
    pub memory_peak_mb: f64,
    pub memory_current_mb: f64,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
    pub instance_count: u32,
    pub net_bytes_sent: u64,
    pub net_bytes_recv: u64,
}

#[tauri::command]
pub async fn get_app_history(
    sys: State<'_, Arc<Mutex<System>>>,
) -> Result<Vec<AppHistoryEntry>, String> {
    let mut system = sys.lock().map_err(|e| e.to_string())?;
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    // Aggregate by process name
    let mut map = std::collections::HashMap::<String, AppHistoryEntry>::new();

    for (_, proc) in system.processes() {
        let name = proc.name().to_string_lossy().to_string();
        let mem_mb = proc.memory() as f64 / (1024.0 * 1024.0);
        let cpu = proc.cpu_usage() as f64;
        let disk_r = proc.disk_usage().read_bytes;
        let disk_w = proc.disk_usage().written_bytes;

        let entry = map.entry(name.clone()).or_insert(AppHistoryEntry {
            name,
            cpu_time_secs: 0.0,
            memory_peak_mb: 0.0,
            memory_current_mb: 0.0,
            disk_read_bytes: 0,
            disk_write_bytes: 0,
            instance_count: 0,
            net_bytes_sent: 0,
            net_bytes_recv: 0,
        });

        entry.cpu_time_secs += cpu;
        entry.memory_current_mb += mem_mb;
        if mem_mb > entry.memory_peak_mb {
            entry.memory_peak_mb = mem_mb;
        }
        entry.disk_read_bytes += disk_r;
        entry.disk_write_bytes += disk_w;
        entry.instance_count += 1;
    }

    let mut result: Vec<AppHistoryEntry> = map.into_values().collect();
    result.sort_by(|a, b| b.cpu_time_secs.partial_cmp(&a.cpu_time_secs).unwrap_or(std::cmp::Ordering::Equal));
    Ok(result)
}
