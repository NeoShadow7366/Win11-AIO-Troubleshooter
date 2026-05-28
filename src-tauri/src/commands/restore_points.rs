use serde::Serialize;
use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct RestorePoint {
    pub sequence_number: u32,
    pub description: String,
    pub creation_time: String,
    pub restore_point_type: String,
}

/// List all system restore points. Requires admin privileges.
#[tauri::command]
pub async fn get_restore_points() -> Result<Vec<RestorePoint>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            try {
                $points = Get-ComputerRestorePoint -ErrorAction Stop | ForEach-Object {
                    $typeStr = switch ($_.RestorePointType) {
                        0  { "APPLICATION_INSTALL" }
                        1  { "APPLICATION_UNINSTALL" }
                        6  { "RESTORE" }
                        7  { "CHECKPOINT" }
                        10 { "DEVICE_DRIVER_INSTALL" }
                        12 { "MODIFY_SETTINGS" }
                        13 { "CANCELLED_OPERATION" }
                        default { "SYSTEM_CHECKPOINT" }
                    }
                    [PSCustomObject]@{
                        SequenceNumber = $_.SequenceNumber
                        Description    = $_.Description
                        CreationTime   = $_.ConvertToDateTime($_.CreationTime).ToString("yyyy-MM-ddTHH:mm:ss")
                        Type           = $typeStr
                    }
                }
                $points | ConvertTo-Json -Compress
            } catch {
                "[]"
            }
        "#;

        let output = run_powershell(script).map_err(|e| format!("Failed to get restore points: {}", e))?;
        let trimmed = output.trim();

        if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
            return Ok(Vec::new());
        }

        // PowerShell returns a single object (not array) when there's only one result
        if trimmed.starts_with('{') {
            let point: serde_json::Value = serde_json::from_str(trimmed)
                .map_err(|e| format!("JSON parse error: {}", e))?;
            return Ok(vec![parse_restore_point(&point)?]);
        }

        let arr: Vec<serde_json::Value> = serde_json::from_str(trimmed)
            .map_err(|e| format!("JSON parse error: {}", e))?;

        let mut points = Vec::new();
        for item in &arr {
            points.push(parse_restore_point(item)?);
        }

        Ok(points)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn parse_restore_point(val: &serde_json::Value) -> Result<RestorePoint, String> {
    Ok(RestorePoint {
        sequence_number: val["SequenceNumber"].as_u64().unwrap_or(0) as u32,
        description: val["Description"].as_str().unwrap_or("").to_string(),
        creation_time: val["CreationTime"].as_str().unwrap_or("").to_string(),
        restore_point_type: val["Type"].as_str().unwrap_or("SYSTEM_CHECKPOINT").to_string(),
    })
}

/// Initiate a system restore to the specified restore point.
/// WARNING: This will restart the computer.
#[tauri::command]
pub async fn restore_to_point(sequence_number: u32) -> Result<String, String> {
    let script = format!(
        r#"
            try {{
                # Confirm the restore point exists
                $point = Get-ComputerRestorePoint -RestorePointId {} -ErrorAction Stop
                if (-not $point) {{
                    throw "Restore point #{} not found"
                }}

                # Initiate restore (this will restart the computer)
                Restore-Computer -RestorePoint {} -Confirm:$false -ErrorAction Stop
                "Restore initiated. Your computer will restart shortly."
            }} catch {{
                throw $_.Exception.Message
            }}
        "#,
        sequence_number, sequence_number, sequence_number
    );

    tokio::task::spawn_blocking(move || {
        run_powershell(&script).map_err(|e| format!("Restore failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
