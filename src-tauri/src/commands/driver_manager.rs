use serde::Serialize;
use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct DriverInfo {
    pub name: String,
    pub device_name: String,
    pub manufacturer: String,
    pub status: String,
    pub driver_version: String,
    pub driver_date: String,
    pub device_class: String,
    pub inf_name: String,
    pub is_signed: bool,
    pub has_problem: bool,
}

/// List all installed PnP device drivers with status and version info.
/// Uses a single Get-CimInstance Win32_PnPSignedDriver query instead of
/// per-device Get-PnpDeviceProperty calls.
#[tauri::command]
pub async fn get_drivers() -> Result<Vec<DriverInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            try {
                # Single bulk CIM query for all signed drivers
                $signed = @{}
                Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | ForEach-Object {
                    $signed[$_.DeviceID] = $_
                }

                # Get device status from Get-PnpDevice (single call)
                $devices = Get-PnpDevice -ErrorAction Stop | ForEach-Object {
                    $drv = $signed[$_.InstanceId]

                    $dateStr = ""
                    if ($drv.DriverDate) {
                        try { $dateStr = $drv.DriverDate.ToString("yyyy-MM-dd") } catch {}
                    }

                    [PSCustomObject]@{
                        Name         = $_.FriendlyName
                        DeviceName   = $_.Name
                        Manufacturer = if ($drv.Manufacturer) { $drv.Manufacturer } else { $_.Manufacturer }
                        Status       = $_.Status
                        Version      = if ($drv.DriverVersion) { $drv.DriverVersion } else { "" }
                        DriverDate   = $dateStr
                        Class        = $_.Class
                        InfName      = if ($drv.InfName) { $drv.InfName } else { "" }
                        IsSigned     = if ($drv.IsSigned -ne $null) { [bool]$drv.IsSigned } else { $true }
                        HasProblem   = $_.Problem -ne $null -and $_.Problem -ne ""
                    }
                }
                $devices | ConvertTo-Json -Depth 3 -Compress
            } catch {
                "[]"
            }
        "#;

        let output = run_powershell(script)
            .map_err(|e| format!("Failed to get drivers: {}", e))?;
        let trimmed = output.trim();

        if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
            return Ok(Vec::new());
        }

        let arr: Vec<serde_json::Value> = if trimmed.starts_with('{') {
            vec![serde_json::from_str(trimmed)
                .map_err(|e| format!("JSON parse error: {}", e))?]
        } else {
            serde_json::from_str(trimmed)
                .map_err(|e| format!("JSON parse error: {}", e))?
        };

        let mut drivers = Vec::new();
        for item in &arr {
            let name = item["Name"].as_str().unwrap_or("").to_string();
            let device_name = item["DeviceName"].as_str().unwrap_or("").to_string();
            let display = if name.is_empty() { device_name.clone() } else { name };

            drivers.push(DriverInfo {
                name: display,
                device_name,
                manufacturer: item["Manufacturer"].as_str().unwrap_or("Unknown").to_string(),
                status: item["Status"].as_str().unwrap_or("Unknown").to_string(),
                driver_version: item["Version"].as_str().unwrap_or("").to_string(),
                driver_date: item["DriverDate"].as_str().unwrap_or("").to_string(),
                device_class: item["Class"].as_str().unwrap_or("Other").to_string(),
                inf_name: item["InfName"].as_str().unwrap_or("").to_string(),
                is_signed: item["IsSigned"].as_bool().unwrap_or(true),
                has_problem: item["HasProblem"].as_bool().unwrap_or(false),
            });
        }

        // Sort: problems first, then by class, then by name
        drivers.sort_by(|a, b| {
            b.has_problem.cmp(&a.has_problem)
                .then_with(|| a.device_class.cmp(&b.device_class))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(drivers)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
