use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventLogEntry {
    pub time_created: String,
    pub level: String,
    pub source: String,
    pub message: String,
    pub event_id: u32,
}

/// Raw deserialization from PowerShell output.
#[derive(Debug, Deserialize)]
struct RawEventLogEntry {
    #[serde(alias = "TimeCreated")]
    time_created: Option<String>,
    #[serde(alias = "Level")]
    level: Option<String>,
    #[serde(alias = "Source")]
    source: Option<String>,
    #[serde(alias = "Message")]
    message: Option<String>,
    #[serde(alias = "EventId")]
    event_id: Option<u32>,
}

/// Retrieves Windows Event Log entries filtered by log name and severity level.
///
/// - `log_name`: "System" or "Application"
/// - `level`: "Error" (Level=2), "Warning" (Level=3), or "All" (Level=2,3)
/// - `limit`: Maximum number of events to return
#[tauri::command]
pub async fn get_event_logs(
    log_name: String,
    level: String,
    limit: u32,
) -> Result<Vec<EventLogEntry>, String> {
    tokio::task::spawn_blocking(move || {
        // Validate log name to prevent injection
        let valid_log = match log_name.as_str() {
            "System" => "System",
            "Application" => "Application",
            _ => return Err(format!("Invalid log name '{}'. Use 'System' or 'Application'.", log_name)),
        };

        // Build the Level filter based on the requested severity
        let level_filter = match level.as_str() {
            "Error" => "Level=2".to_string(),
            "Warning" => "Level=3".to_string(),
            "All" => "Level=2,3".to_string(),
            _ => return Err(format!("Invalid level '{}'. Use 'Error', 'Warning', or 'All'.", level)),
        };

        let capped_limit = limit.min(500); // Safety cap

        let script = format!(
            r#"
            try {{
                $events = Get-WinEvent -FilterHashtable @{{LogName='{log}'; {level_filter}}} -MaxEvents {limit} -ErrorAction Stop
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
            log = valid_log,
            level_filter = level_filter,
            limit = capped_limit,
        );

        let raw = crate::utils::powershell::run_powershell(&script)?;

        if raw.is_empty() || raw == "[]" {
            return Ok(vec![]);
        }

        // PowerShell returns a single object (not array) when there's exactly one result.
        // Try parsing as array first, then as single object.
        let raw_entries: Vec<RawEventLogEntry> = serde_json::from_str(&raw)
            .or_else(|_| {
                serde_json::from_str::<RawEventLogEntry>(&raw).map(|single| vec![single])
            })
            .map_err(|e| format!("Failed to parse event log JSON: {}", e))?;

        let entries: Vec<EventLogEntry> = raw_entries
            .into_iter()
            .map(|raw| EventLogEntry {
                time_created: raw.time_created.unwrap_or_else(|| "Unknown".to_string()),
                level: raw.level.unwrap_or_else(|| "Unknown".to_string()),
                source: raw.source.unwrap_or_else(|| "Unknown".to_string()),
                message: raw.message.unwrap_or_else(|| String::new()),
                event_id: raw.event_id.unwrap_or(0),
            })
            .collect();

        Ok(entries)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
