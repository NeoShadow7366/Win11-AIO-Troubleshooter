use serde::{Deserialize, Serialize};

use crate::utils::powershell::{run_powershell, run_powershell_json};

// ─── Public Structs ───

#[derive(Debug, Serialize, Clone)]
pub struct CpuTempInfo {
    pub zone: String,
    pub temperature_c: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct GpuHealthInfo {
    pub name: String,
    pub temperature_c: f64,
    pub utilization_pct: f64,
    pub fan_speed_pct: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DiskHealthInfo {
    pub name: String,
    pub media_type: String,
    pub health_status: String,
    pub operational_status: String,
    pub size_bytes: u64,
    pub temperature_c: Option<f64>,
    pub power_on_hours: Option<u64>,
    pub read_errors: Option<u64>,
    pub write_errors: Option<u64>,
    pub wear_percentage: Option<f64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct RamModule {
    pub manufacturer: String,
    pub speed_mhz: u64,
    pub capacity_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct RamHealthInfo {
    pub modules: Vec<RamModule>,
    pub total_capacity_bytes: u64,
    pub speed_mhz: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct HardwareHealth {
    pub cpu_temps: Vec<CpuTempInfo>,
    pub gpu_info: Option<GpuHealthInfo>,
    pub disk_health: Vec<DiskHealthInfo>,
    pub ram_info: RamHealthInfo,
}

// ─── Deserialization helpers (PowerShell JSON output) ───

#[derive(Debug, Deserialize)]
struct PsThermalZone {
    #[serde(alias = "InstanceName", default)]
    instance_name: Option<String>,
    #[serde(alias = "Name", default)]
    name: Option<String>,
    #[serde(alias = "CurrentTemperature", alias = "Temperature", default)]
    temperature: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct PsPhysicalDisk {
    #[serde(alias = "FriendlyName", default)]
    friendly_name: Option<String>,
    #[serde(alias = "MediaType", default)]
    media_type: Option<String>,
    #[serde(alias = "HealthStatus", default)]
    health_status: Option<String>,
    #[serde(alias = "OperationalStatus", default)]
    operational_status: Option<String>,
    #[serde(alias = "Size", default)]
    size: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PsReliabilityCounter {
    #[serde(alias = "DeviceId", default)]
    device_id: Option<String>,
    #[serde(alias = "Temperature", default)]
    temperature: Option<f64>,
    #[serde(alias = "PowerOnHours", default)]
    power_on_hours: Option<u64>,
    #[serde(alias = "ReadErrorsTotal", default)]
    read_errors_total: Option<u64>,
    #[serde(alias = "WriteErrorsTotal", default)]
    write_errors_total: Option<u64>,
    #[serde(alias = "Wear", default)]
    wear: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct PsRamModule {
    #[serde(alias = "Manufacturer", default)]
    manufacturer: Option<String>,
    #[serde(alias = "Speed", default)]
    speed: Option<u64>,
    #[serde(alias = "Capacity", default)]
    capacity: Option<u64>,
}

// ─── Commands ───

#[tauri::command]
pub async fn get_hardware_health() -> Result<HardwareHealth, String> {
    tokio::task::spawn_blocking(|| {
        let cpu_temps = get_cpu_temps();
        let gpu_info = get_gpu_info();
        let disk_health = get_disk_health();
        let ram_info = get_ram_info();

        Ok(HardwareHealth {
            cpu_temps,
            gpu_info,
            disk_health,
            ram_info,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn get_cpu_temps() -> Vec<CpuTempInfo> {
    // Method 1: WMI MSAcpi thermal zone (requires admin on most systems)
    if let Ok(zones) = run_powershell_json::<Vec<PsThermalZone>>(
        r#"@(Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object InstanceName, CurrentTemperature) | ConvertTo-Json -Depth 3"#,
    ) {
        let temps: Vec<CpuTempInfo> = zones
            .into_iter()
            .filter_map(|z| {
                let raw_temp = z.temperature?;
                // MSAcpi reports in decikelvin
                let celsius = (raw_temp / 10.0) - 273.15;
                if !(0.0..=150.0).contains(&celsius) {
                    return None;
                }
                Some(CpuTempInfo {
                    zone: z
                        .instance_name
                        .unwrap_or_else(|| "Thermal Zone".to_string()),
                    temperature_c: (celsius * 10.0).round() / 10.0,
                })
            })
            .collect();

        if !temps.is_empty() {
            return temps;
        }
    }

    // Method 2: Performance counter thermal zones (reported in Kelvin, NOT decikelvin)
    if let Ok(zones) = run_powershell_json::<Vec<PsThermalZone>>(
        r#"@(Get-CimInstance -Namespace root/cimv2 -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop | Select-Object Name, Temperature) | ConvertTo-Json -Depth 3"#,
    ) {
        let temps: Vec<CpuTempInfo> = zones
            .into_iter()
            .filter_map(|z| {
                let kelvin = z.temperature?;
                // This source reports in Kelvin (not decikelvin)
                let celsius = kelvin - 273.15;
                if !(0.0..=150.0).contains(&celsius) {
                    return None;
                }
                Some(CpuTempInfo {
                    zone: z.name.unwrap_or_else(|| "Thermal Zone".to_string()),
                    temperature_c: (celsius * 10.0).round() / 10.0,
                })
            })
            .collect();

        if !temps.is_empty() {
            return temps;
        }
    }

    // Method 3: Try Open/Libre Hardware Monitor WMI (if installed)
    if let Ok(zones) = run_powershell_json::<Vec<PsThermalZone>>(
        r#"@(Get-CimInstance -Namespace root/OpenHardwareMonitor -ClassName Sensor -ErrorAction Stop | Where-Object { $_.SensorType -eq 'Temperature' -and $_.Name -like '*CPU*' } | Select-Object @{N='Name';E={$_.Name}}, @{N='Temperature';E={$_.Value}} | Select-Object -First 8) | ConvertTo-Json -Depth 3"#,
    ) {
        let temps: Vec<CpuTempInfo> = zones
            .into_iter()
            .filter_map(|z| {
                let celsius = z.temperature?;
                if !(0.0..=150.0).contains(&celsius) {
                    return None;
                }
                Some(CpuTempInfo {
                    zone: z.name.unwrap_or_else(|| "CPU".to_string()),
                    temperature_c: (celsius * 10.0).round() / 10.0,
                })
            })
            .collect();

        if !temps.is_empty() {
            return temps;
        }
    }

    Vec::new()
}

// ─── GPU Info ───

fn get_gpu_info() -> Option<GpuHealthInfo> {
    // Try nvidia-smi
    let result = run_powershell(
        r#"$paths = @(
            'C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe',
            'C:\Windows\System32\nvidia-smi.exe',
            (Get-Command nvidia-smi -ErrorAction SilentlyContinue).Path
        ) | Where-Object { $_ -and (Test-Path $_ -ErrorAction SilentlyContinue) } | Select-Object -First 1
        if ($paths) { & $paths --query-gpu=temperature.gpu,utilization.gpu,name,fan.speed --format=csv,noheader,nounits 2>$null }
        else { Write-Error 'not found' }"#,
    );

    if let Ok(output) = result {
        let line = output.trim();
        if !line.is_empty() {
            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if parts.len() >= 3 {
                let temp: f64 = parts[0].parse().unwrap_or(0.0);
                let util: f64 = parts[1].parse().unwrap_or(0.0);
                let name = parts[2].to_string();
                let fan = parts.get(3).and_then(|s| s.parse::<f64>().ok());

                return Some(GpuHealthInfo {
                    name,
                    temperature_c: temp,
                    utilization_pct: util,
                    fan_speed_pct: fan,
                });
            }
        }
    }

    None
}

// ─── Disk Health (S.M.A.R.T.) ───

fn get_disk_health() -> Vec<DiskHealthInfo> {
    // Get physical disk list
    let disks: Vec<PsPhysicalDisk> = run_powershell_json(
        r#"@(Get-PhysicalDisk -ErrorAction Stop | Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus, Size) | ConvertTo-Json -Depth 3"#,
    )
    .unwrap_or_default();

    // Get reliability counters (may fail on some drives)
    let counters: Vec<PsReliabilityCounter> = run_powershell_json(
        r#"@(Get-PhysicalDisk -ErrorAction SilentlyContinue | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue | Select-Object DeviceId, Temperature, PowerOnHours, ReadErrorsTotal, WriteErrorsTotal, Wear) | ConvertTo-Json -Depth 3"#,
    )
    .unwrap_or_default();

    disks
        .into_iter()
        .enumerate()
        .map(|(i, disk)| {
            let counter = counters.get(i);
            DiskHealthInfo {
                name: disk.friendly_name.unwrap_or_else(|| format!("Disk {i}")),
                media_type: disk.media_type.unwrap_or_else(|| "Unknown".to_string()),
                health_status: disk.health_status.unwrap_or_else(|| "Unknown".to_string()),
                operational_status: disk
                    .operational_status
                    .unwrap_or_else(|| "Unknown".to_string()),
                size_bytes: disk.size.unwrap_or(0),
                temperature_c: counter.and_then(|c| c.temperature),
                power_on_hours: counter.and_then(|c| c.power_on_hours),
                read_errors: counter.and_then(|c| c.read_errors_total),
                write_errors: counter.and_then(|c| c.write_errors_total),
                wear_percentage: counter.and_then(|c| c.wear),
            }
        })
        .collect()
}

// ─── RAM Info ───

fn get_ram_info() -> RamHealthInfo {
    let modules: Vec<PsRamModule> = run_powershell_json(
        r#"@(Get-CimInstance Win32_PhysicalMemory -ErrorAction Stop | Select-Object Manufacturer, Speed, Capacity) | ConvertTo-Json -Depth 3"#,
    )
    .unwrap_or_default();

    let ram_modules: Vec<RamModule> = modules
        .into_iter()
        .map(|m| RamModule {
            manufacturer: m
                .manufacturer
                .unwrap_or_else(|| "Unknown".to_string())
                .trim()
                .to_string(),
            speed_mhz: m.speed.unwrap_or(0),
            capacity_bytes: m.capacity.unwrap_or(0),
        })
        .collect();

    let total_capacity: u64 = ram_modules.iter().map(|m| m.capacity_bytes).sum();
    let speed = ram_modules.first().map(|m| m.speed_mhz).unwrap_or(0);

    RamHealthInfo {
        modules: ram_modules,
        total_capacity_bytes: total_capacity,
        speed_mhz: speed,
    }
}
