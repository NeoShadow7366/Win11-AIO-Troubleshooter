use serde::Serialize;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use sysinfo::{Disks, Networks, System};
use tauri::State;

use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub disk_type: String,
    pub file_system: String,
    pub total: u64,
    pub used: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub per_core_usage: Vec<f32>,
    pub ram_used: u64,
    pub ram_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub disks: Vec<DiskInfo>,
    pub internal_ip: String,
    pub external_ip: String,
    pub net_rx_bytes: u64,
    pub net_tx_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct SystemSpecs {
    pub os_version: String,
    pub cpu_name: String,
    pub gpu_name: String,
    pub uptime: String,
    pub hostname: String,
}

// ─── External IP Cache (refresh every 60 seconds) ───

static EXTERNAL_IP_CACHE: OnceLock<Mutex<(String, Instant)>> = OnceLock::new();

fn get_cached_external_ip() -> String {
    let cache = EXTERNAL_IP_CACHE.get_or_init(|| {
        Mutex::new(("Fetching...".to_string(), Instant::now() - std::time::Duration::from_secs(120)))
    });

    let mut guard = cache.lock().unwrap_or_else(|e| e.into_inner());
    if guard.1.elapsed().as_secs() >= 60 {
        let ip = run_powershell(
            r#"try { (Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing -TimeoutSec 3).Content } catch { 'Unavailable' }"#,
        )
        .unwrap_or_else(|_| "Unavailable".to_string());
        *guard = (ip.clone(), Instant::now());
        ip
    } else {
        guard.0.clone()
    }
}

/// Returns live system statistics: CPU usage, RAM, per-disk info, and IP addresses.
/// Uses shared System state — no sleep needed since the frontend polls every 2 seconds,
/// providing a natural delta between refreshes.
#[tauri::command]
pub async fn get_system_stats(
    sys_state: State<'_, Arc<Mutex<System>>>,
) -> Result<SystemStats, String> {
    let sys_arc = Arc::clone(&sys_state);

    tokio::task::spawn_blocking(move || {
        // Lock, refresh, extract CPU/RAM, then drop the lock quickly
        let (cpu_usage, per_core_usage, ram_used, ram_total) = {
            let mut sys = sys_arc.lock().unwrap_or_else(|e| e.into_inner());
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            (
                sys.global_cpu_usage(),
                sys.cpus().iter().map(|c| c.cpu_usage()).collect::<Vec<f32>>(),
                sys.used_memory(),
                sys.total_memory(),
            )
        };

        // Enumerate each disk individually (not behind the lock)
        let sysinfo_disks = Disks::new_with_refreshed_list();
        let mut disk_total: u64 = 0;
        let mut disk_available: u64 = 0;
        let mut disks: Vec<DiskInfo> = Vec::new();

        for disk in sysinfo_disks.list() {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);

            disk_total += total;
            disk_available += available;

            let disk_type = match disk.kind() {
                sysinfo::DiskKind::SSD => "SSD",
                sysinfo::DiskKind::HDD => "HDD",
                _ => "Unknown",
            };

            let file_system = disk
                .file_system()
                .to_string_lossy()
                .to_string();

            let mount_point = disk.mount_point().to_string_lossy().to_string();

            let name = disk.name().to_string_lossy().to_string();
            let display_name = if name.is_empty() {
                format!("Local Disk ({})", mount_point.trim_end_matches('\\'))
            } else {
                format!("{} ({})", name, mount_point.trim_end_matches('\\'))
            };

            disks.push(DiskInfo {
                name: display_name,
                mount_point,
                disk_type: disk_type.to_string(),
                file_system,
                total,
                used,
            });
        }

        let disk_used = disk_total.saturating_sub(disk_available);

        // Get internal IP
        let internal_ip = run_powershell(
            r#"(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress) 2>$null"#,
        )
        .unwrap_or_else(|_| "Unavailable".to_string());

        // Get external IP (cached — refreshes every 60 seconds)
        let external_ip = get_cached_external_ip();

        // Network throughput (total bytes since boot across all interfaces)
        let networks = Networks::new_with_refreshed_list();
        let (mut net_rx, mut net_tx) = (0u64, 0u64);
        for (_name, data) in &networks {
            net_rx += data.total_received();
            net_tx += data.total_transmitted();
        }

        Ok(SystemStats {
            cpu_usage,
            per_core_usage,
            ram_used,
            ram_total,
            disk_used,
            disk_total,
            disks,
            internal_ip,
            external_ip,
            net_rx_bytes: net_rx,
            net_tx_bytes: net_tx,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Returns static system specifications: OS, CPU, GPU, uptime, hostname.
#[tauri::command]
pub async fn get_system_specs(
    sys_state: State<'_, Arc<Mutex<System>>>,
) -> Result<SystemSpecs, String> {
    let sys_arc = Arc::clone(&sys_state);

    tokio::task::spawn_blocking(move || {
        // Lock, refresh CPU list for brand info, extract, drop lock
        let cpu_name = {
            let mut sys = sys_arc.lock().unwrap_or_else(|e| e.into_inner());
            sys.refresh_cpu_usage();
            sys.cpus()
                .first()
                .map(|cpu| cpu.brand().to_string())
                .unwrap_or_else(|| "Unknown CPU".to_string())
        };

        // OS version
        let os_version = format!(
            "{} {}",
            System::name().unwrap_or_else(|| "Unknown OS".to_string()),
            System::os_version().unwrap_or_default(),
        );

        // Hostname
        let hostname = System::host_name().unwrap_or_else(|| "Unknown".to_string());

        // Uptime - format as human-readable
        let uptime_secs = System::uptime();
        let days = uptime_secs / 86400;
        let hours = (uptime_secs % 86400) / 3600;
        let mins = (uptime_secs % 3600) / 60;
        let uptime = if days > 0 {
            format!("{}d {}h {}m", days, hours, mins)
        } else if hours > 0 {
            format!("{}h {}m", hours, mins)
        } else {
            format!("{}m", mins)
        };

        // GPU name via PowerShell (WMI)
        let gpu_name = run_powershell(
            "Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name",
        )
        .unwrap_or_else(|_| "Unknown GPU".to_string());

        Ok(SystemSpecs {
            os_version,
            cpu_name,
            gpu_name,
            uptime,
            hostname,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
