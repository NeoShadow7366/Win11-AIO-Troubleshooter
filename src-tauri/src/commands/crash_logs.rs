use serde::{Deserialize, Serialize};

use crate::utils::powershell::run_powershell;
use crate::commands::event_logs::EventLogEntry;

#[derive(Debug, Serialize, Clone)]
pub struct CrashLogResult {
    pub entries: Vec<EventLogEntry>,
    pub total_count: u32,
}

/// Raw deserialization target from PowerShell.
#[derive(Debug, Deserialize)]
struct RawCrashLogEntry {
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

/// Retrieves crash-related event log entries (Error, Critical, Warning)
/// from System, Application, and optionally Security logs.
///
/// Supports date range filtering, source filtering, and pagination.
#[tauri::command]
pub async fn get_crash_logs(
    start_date: Option<String>,
    end_date: Option<String>,
    source_filter: Option<String>,
    level: Option<String>,      // "Error", "Warning", "Critical", "All"
    log_sources: Vec<String>,   // e.g. ["System", "Application", "Security"]
    page: u32,
    page_size: u32,
) -> Result<CrashLogResult, String> {
    tokio::task::spawn_blocking(move || {
        let capped_page_size = page_size.min(500);
        let skip = page * capped_page_size;

        // Build the log names to query
        let log_names: Vec<&str> = if log_sources.is_empty() {
            vec!["System", "Application"]
        } else {
            log_sources.iter().map(|s| s.as_str()).collect()
        };

        // Build level filter
        let level_filter = match level.as_deref() {
            Some("Error") => "Level=2",
            Some("Warning") => "Level=3",
            Some("Critical") => "Level=1",
            _ => "Level=1,2,3", // All crash-related levels
        };

        // Build date filters
        let mut date_filter = String::new();
        if let Some(ref sd) = start_date {
            if !sd.is_empty() {
                date_filter.push_str(&format!(" StartTime='{}';", sd));
            }
        }
        if let Some(ref ed) = end_date {
            if !ed.is_empty() {
                date_filter.push_str(&format!(" EndTime='{}';", ed));
            }
        }

        // Build source filter
        let source_where = if let Some(ref sf) = source_filter {
            if !sf.is_empty() {
                let sanitized = sf.replace('\'', "''").replace('*', "");
                format!(
                    " | Where-Object {{ $_.ProviderName -like '*{s}*' }}",
                    s = sanitized
                )
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        // We query each log separately and combine, to handle errors per-log
        let mut all_scripts = Vec::new();
        for log_name in &log_names {
            // Validate log name
            match *log_name {
                "System" | "Application" | "Security" => {},
                _ => continue,
            }
            all_scripts.push(format!(
                r#"
                try {{
                    Get-WinEvent -FilterHashtable @{{LogName='{log}'; {level}{date}}} -MaxEvents 2000 -ErrorAction Stop{source_where}
                }} catch {{
                    if (-not ($_.Exception.Message -like '*No events were found*')) {{
                        Write-Error $_.Exception.Message
                    }}
                }}
                "#,
                log = log_name,
                level = level_filter,
                date = date_filter,
                source_where = source_where,
            ));
        }

        let combined_query = all_scripts.join("\n");

        let script = format!(
            r#"
            $allEvents = @({combined})
            $totalCount = $allEvents.Count
            $sorted = $allEvents | Sort-Object TimeCreated -Descending
            $paged = $sorted | Select-Object -Skip {skip} -First {take}
            $result = $paged | ForEach-Object {{
                [PSCustomObject]@{{
                    TimeCreated = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
                    Level = switch ($_.Level) {{
                        1 {{ 'Critical' }}
                        2 {{ 'Error' }}
                        3 {{ 'Warning' }}
                        default {{ 'Info' }}
                    }}
                    Source = $_.ProviderName
                    Message = if ($_.Message.Length -gt 800) {{ $_.Message.Substring(0, 800) + '...' }} else {{ $_.Message }}
                    EventId = $_.Id
                }}
            }}
            [PSCustomObject]@{{
                TotalCount = $totalCount
                Entries = @($result)
            }} | ConvertTo-Json -Depth 4
            "#,
            combined = combined_query,
            skip = skip,
            take = capped_page_size,
        );

        let raw = run_powershell(&script)?;

        if raw.is_empty() {
            return Ok(CrashLogResult {
                entries: vec![],
                total_count: 0,
            });
        }

        // Parse the wrapper object
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("JSON parse error: {}", e))?;

        let total_count = parsed
            .get("TotalCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        let entries_val = parsed.get("Entries");

        let entries: Vec<EventLogEntry> = if let Some(entries_json) = entries_val {
            // Handle single object vs array
            let raw_entries: Vec<RawCrashLogEntry> = if entries_json.is_array() {
                serde_json::from_value(entries_json.clone()).unwrap_or_default()
            } else if entries_json.is_object() {
                serde_json::from_value::<RawCrashLogEntry>(entries_json.clone())
                    .map(|e| vec![e])
                    .unwrap_or_default()
            } else {
                vec![]
            };

            raw_entries
                .into_iter()
                .map(|raw| EventLogEntry {
                    time_created: raw.time_created.unwrap_or_else(|| "Unknown".to_string()),
                    level: raw.level.unwrap_or_else(|| "Unknown".to_string()),
                    source: raw.source.unwrap_or_else(|| "Unknown".to_string()),
                    message: raw.message.unwrap_or_default(),
                    event_id: raw.event_id.unwrap_or(0),
                })
                .collect()
        } else {
            vec![]
        };

        Ok(CrashLogResult {
            entries,
            total_count,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
