use serde::Serialize;
use std::thread;
use std::time::Duration;
use sysinfo::{Disks, System};

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
    pub ram_used: u64,
    pub ram_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub disks: Vec<DiskInfo>,
    pub internal_ip: String,
    pub external_ip: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SystemSpecs {
    pub os_version: String,
    pub cpu_name: String,
    pub gpu_name: String,
    pub uptime: String,
    pub hostname: String,
}

/// Returns live system statistics: CPU usage, RAM, per-disk info, and IP addresses.
/// CPU measurement requires two refreshes with a short delay for accuracy.
#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    // Run the blocking sysinfo work on a background thread
    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();

        // First refresh to establish baseline
        sys.refresh_cpu_usage();
        thread::sleep(Duration::from_millis(200));
        // Second refresh to get accurate delta-based CPU reading
        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let cpu_usage = sys.global_cpu_usage();
        let ram_used = sys.used_memory();
        let ram_total = sys.total_memory();

        // Enumerate each disk individually
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

        // Get external IP (with timeout)
        let external_ip = run_powershell(
            r#"try { (Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing -TimeoutSec 3).Content } catch { 'Unavailable' }"#,
        )
        .unwrap_or_else(|_| "Unavailable".to_string());

        Ok(SystemStats {
            cpu_usage,
            ram_used,
            ram_total,
            disk_used,
            disk_total,
            disks,
            internal_ip,
            external_ip,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Returns static system specifications: OS, CPU, GPU, uptime, hostname.
#[tauri::command]
pub async fn get_system_specs() -> Result<SystemSpecs, String> {
    tokio::task::spawn_blocking(|| {
        let sys = System::new_all();

        // CPU name
        let cpu_name = sys
            .cpus()
            .first()
            .map(|cpu| cpu.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());

        // OS version
        let os_version = format!(
            "{} {}",
            System::name().unwrap_or_else(|| "Unknown OS".to_string()),
            System::os_version().unwrap_or_else(|| String::new()),
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
