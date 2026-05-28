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

// ─── Combined hardware health result from single PS script ───

#[derive(Debug, Deserialize, Default)]
struct PsCombinedHealth {
    #[serde(alias = "Disks", default)]
    disks: Option<Vec<PsCombinedDisk>>,
    #[serde(alias = "Ram", default)]
    ram: Option<Vec<PsCombinedRam>>,
}

#[derive(Debug, Deserialize)]
struct PsCombinedDisk {
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
struct PsCombinedRam {
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
        // Batch disk health + RAM info into a single PowerShell call
        let (disk_health, ram_info) = get_disk_and_ram();

        // CPU temps use fallback logic (3 methods), keep separate
        let cpu_temps = get_cpu_temps();

        // GPU info uses nvidia-smi, keep separate
        let gpu_info = get_gpu_info();

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

/// Combined disk health + RAM info in a single PowerShell invocation
fn get_disk_and_ram() -> (Vec<DiskHealthInfo>, RamHealthInfo) {
    let script = r#"
$result = @{}

# Disk health with reliability counters joined
try {
    $physDisks = @(Get-PhysicalDisk -ErrorAction Stop)
    $counters = @{}
    try {
        Get-PhysicalDisk -ErrorAction SilentlyContinue |
            Get-StorageReliabilityCounter -ErrorAction SilentlyContinue |
            ForEach-Object { $counters[[string]$_.DeviceId] = $_ }
    } catch {}

    $diskList = @()
    foreach ($d in $physDisks) {
        $c = $counters[[string]$d.DeviceId]
        $diskList += [PSCustomObject]@{
            FriendlyName      = $d.FriendlyName
            MediaType         = [string]$d.MediaType
            HealthStatus      = [string]$d.HealthStatus
            OperationalStatus = [string]$d.OperationalStatus
            Size              = $d.Size
            Temperature       = if ($c) { $c.Temperature } else { $null }
            PowerOnHours      = if ($c) { $c.PowerOnHours } else { $null }
            ReadErrorsTotal   = if ($c) { $c.ReadErrorsTotal } else { $null }
            WriteErrorsTotal  = if ($c) { $c.WriteErrorsTotal } else { $null }
            Wear              = if ($c) { $c.Wear } else { $null }
        }
    }
    $result['Disks'] = $diskList
} catch {
    $result['Disks'] = @()
}

# RAM modules
try {
    $result['Ram'] = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction Stop |
        Select-Object Manufacturer, Speed, Capacity)
} catch {
    $result['Ram'] = @()
}

$result | ConvertTo-Json -Depth 4 -Compress
"#;

    let output = run_powershell(script).unwrap_or_default();
    let data: PsCombinedHealth = serde_json::from_str(output.trim()).unwrap_or_default();

    // Parse disks
    let disk_health: Vec<DiskHealthInfo> = data.disks.unwrap_or_default()
        .into_iter()
        .map(|d| DiskHealthInfo {
            name: d.friendly_name.unwrap_or_else(|| "Unknown Disk".to_string()),
            media_type: d.media_type.unwrap_or_else(|| "Unknown".to_string()),
            health_status: d.health_status.unwrap_or_else(|| "Unknown".to_string()),
            operational_status: d.operational_status.unwrap_or_else(|| "Unknown".to_string()),
            size_bytes: d.size.unwrap_or(0),
            temperature_c: d.temperature,
            power_on_hours: d.power_on_hours,
            read_errors: d.read_errors_total,
            write_errors: d.write_errors_total,
            wear_percentage: d.wear,
        })
        .collect();

    // Parse RAM
    let ram_modules: Vec<RamModule> = data.ram.unwrap_or_default()
        .into_iter()
        .map(|m| RamModule {
            manufacturer: m.manufacturer.unwrap_or_else(|| "Unknown".to_string()).trim().to_string(),
            speed_mhz: m.speed.unwrap_or(0),
            capacity_bytes: m.capacity.unwrap_or(0),
        })
        .collect();

    let total_capacity: u64 = ram_modules.iter().map(|m| m.capacity_bytes).sum();
    let speed = ram_modules.first().map(|m| m.speed_mhz).unwrap_or(0);

    let ram_info = RamHealthInfo {
        modules: ram_modules,
        total_capacity_bytes: total_capacity,
        speed_mhz: speed,
    };

    (disk_health, ram_info)
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
