use serde::{Deserialize, Serialize};

use crate::utils::powershell::{run_powershell, run_powershell_json};

/// Critical system services that must NEVER be stopped or started
/// to prevent OS instability or crash.
const CRITICAL_SERVICES: &[&str] = &[
    "wuauserv",
    "WinDefend",
    "RpcSs",
    "RpcEptMapper",
    "DcomLaunch",
    "LSM",
    "SamSs",
    "lsass",
    "csrss",
    "smss",
    "wininit",
    "services",
    "CryptSvc",
    "BrokerInfrastructure",
    "SystemEventsBroker",
    "Power",
    "PlugPlay",
    "EventLog",
    "Winmgmt",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServiceInfo {
    pub name: String,
    pub display_name: String,
    pub status: String,
    pub start_type: String,
}

/// Raw deserialization target matching PowerShell's property names before normalization.
#[derive(Debug, Deserialize)]
struct RawServiceInfo {
    #[serde(alias = "Name")]
    name: Option<String>,
    #[serde(alias = "DisplayName")]
    display_name: Option<String>,
    #[serde(alias = "Status")]
    status: Option<serde_json::Value>,
    #[serde(alias = "StartType")]
    start_type: Option<serde_json::Value>,
}

/// Retrieves all Windows services and their status via PowerShell.
#[tauri::command]
pub async fn get_services() -> Result<Vec<ServiceInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"Get-Service | Select-Object Name, DisplayName, @{Name='Status';Expression={$_.Status.ToString()}}, @{Name='StartType';Expression={$_.StartType.ToString()}} | ConvertTo-Json -Depth 3"#;

        let raw_services: Vec<RawServiceInfo> = run_powershell_json(script)?;

        let services: Vec<ServiceInfo> = raw_services
            .into_iter()
            .map(|raw| ServiceInfo {
                name: raw.name.unwrap_or_default(),
                display_name: raw.display_name.unwrap_or_default(),
                status: match raw.status {
                    Some(serde_json::Value::String(s)) => s,
                    Some(serde_json::Value::Number(n)) => match n.as_u64() {
                        Some(1) => "Stopped".to_string(),
                        Some(4) => "Running".to_string(),
                        _ => format!("Unknown({})", n),
                    },
                    _ => "Unknown".to_string(),
                },
                start_type: match raw.start_type {
                    Some(serde_json::Value::String(s)) => s,
                    Some(serde_json::Value::Number(n)) => match n.as_u64() {
                        Some(0) => "Boot".to_string(),
                        Some(1) => "System".to_string(),
                        Some(2) => "Automatic".to_string(),
                        Some(3) => "Manual".to_string(),
                        Some(4) => "Disabled".to_string(),
                        _ => format!("Unknown({})", n),
                    },
                    _ => "Unknown".to_string(),
                },
            })
            .collect();

        Ok(services)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn is_critical_service(name: &str) -> bool {
    CRITICAL_SERVICES
        .iter()
        .any(|&s| s.eq_ignore_ascii_case(name))
}

/// Start a Windows service by name. Blocked for critical system services.
#[tauri::command]
pub async fn start_service(name: String) -> Result<String, String> {
    if is_critical_service(&name) {
        return Err(format!(
            "Service '{}' is a critical system service and cannot be modified through this tool.",
            name
        ));
    }

    tokio::task::spawn_blocking(move || {
        // Sanitize name to prevent injection
        let sanitized = name.replace('\'', "''");
        let script = format!("Start-Service -Name '{}'", sanitized);
        run_powershell(&script)?;
        Ok(format!("Service '{}' started successfully.", name))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Stop a Windows service by name. Blocked for critical system services.
#[tauri::command]
pub async fn stop_service(name: String) -> Result<String, String> {
    if is_critical_service(&name) {
        return Err(format!(
            "Service '{}' is a critical system service and cannot be stopped through this tool.",
            name
        ));
    }

    tokio::task::spawn_blocking(move || {
        let sanitized = name.replace('\'', "''");
        let script = format!("Stop-Service -Name '{}' -Force", sanitized);
        run_powershell(&script)?;
        Ok(format!("Service '{}' stopped successfully.", name))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Restart a Windows service by name (stop then start). Blocked for critical system services.
#[tauri::command]
pub async fn restart_service(name: String) -> Result<String, String> {
    if is_critical_service(&name) {
        return Err(format!(
            "Service '{}' is a critical system service and cannot be modified through this tool.",
            name
        ));
    }

    tokio::task::spawn_blocking(move || {
        let sanitized = name.replace('\'', "''");
        let script = format!("Restart-Service -Name '{}' -Force", sanitized);
        run_powershell(&script)?;
        Ok(format!("Service '{}' restarted successfully.", name))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Get detailed insights for a specific Windows service: executable path and description.
#[tauri::command]
pub async fn get_service_insights(service_id: String) -> Result<ServiceInsightResult, String> {
    tokio::task::spawn_blocking(move || {
        let sanitized = service_id.replace('\'', "''");
        let script = format!(
            r#"$svc = Get-WmiObject Win32_Service -Filter "Name='{}'"
if ($svc) {{
    [PSCustomObject]@{{
        PathName = $svc.PathName
        Description = $svc.Description
        StartMode = $svc.StartMode
        State = $svc.State
        ProcessId = $svc.ProcessId
    }} | ConvertTo-Json -Depth 3
}} else {{
    Write-Output '{{}}'
}}"#,
            sanitized
        );

        let raw = run_powershell(&script)?;
        if raw.is_empty() || raw == "{}" {
            return Ok(ServiceInsightResult {
                executable_path: None,
                description: None,
                start_mode: None,
                state: None,
                process_id: None,
            });
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("JSON parse error: {}", e))?;

        Ok(ServiceInsightResult {
            executable_path: parsed.get("PathName").and_then(|v| v.as_str()).map(String::from),
            description: parsed.get("Description").and_then(|v| v.as_str()).map(String::from),
            start_mode: parsed.get("StartMode").and_then(|v| v.as_str()).map(String::from),
            state: parsed.get("State").and_then(|v| v.as_str()).map(String::from),
            process_id: parsed.get("ProcessId").and_then(|v| v.as_u64()).map(|n| n as u32),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[derive(Debug, Serialize, Clone)]
pub struct ServiceInsightResult {
    pub executable_path: Option<String>,
    pub description: Option<String>,
    pub start_mode: Option<String>,
    pub state: Option<String>,
    pub process_id: Option<u32>,
}
