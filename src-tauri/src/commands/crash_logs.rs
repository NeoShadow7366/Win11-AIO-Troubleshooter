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
    #[serde(alias = "TaskCategory")]
    task_category: Option<String>,
    #[serde(alias = "Keywords")]
    keywords: Option<String>,
    #[serde(alias = "User")]
    user: Option<String>,
    #[serde(alias = "Computer")]
    computer: Option<String>,
    #[serde(alias = "OpCode")]
    opcode: Option<String>,
}

fn raw_to_entry(raw: RawCrashLogEntry) -> EventLogEntry {
    EventLogEntry {
        time_created: raw.time_created.unwrap_or_else(|| "Unknown".to_string()),
        level: raw.level.unwrap_or_else(|| "Unknown".to_string()),
        source: raw.source.unwrap_or_else(|| "Unknown".to_string()),
        message: raw.message.unwrap_or_default(),
        event_id: raw.event_id.unwrap_or(0),
        task_category: raw.task_category,
        keywords: raw.keywords,
        user: raw.user,
        computer: raw.computer,
        opcode: raw.opcode,
    }
}

/// Parses an event ID filter string into include and exclude sets.
/// Supports: "1,2,3", "1-50", "-5,-10" (exclusions), "1-50,-7"
fn parse_event_id_filter(filter: &str) -> (Vec<u32>, Vec<u32>) {
    let mut includes = Vec::new();
    let mut excludes = Vec::new();

    for part in filter.split(',') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }

        // Check for exclusion (starts with - but not a range like "1-50")
        if part.starts_with('-') && !part[1..].contains('-') {
            if let Ok(id) = part[1..].trim().parse::<u32>() {
                excludes.push(id);
            }
            continue;
        }

        // Check for range (e.g., "1-50")
        if part.contains('-') {
            let parts: Vec<&str> = part.splitn(2, '-').collect();
            if parts.len() == 2 {
                if let (Ok(start), Ok(end)) = (
                    parts[0].trim().parse::<u32>(),
                    parts[1].trim().parse::<u32>(),
                ) {
                    // Cap range size to prevent abuse
                    if end >= start && (end - start) <= 1000 {
                        for id in start..=end {
                            includes.push(id);
                        }
                    }
                }
            }
            continue;
        }

        // Single ID
        if let Ok(id) = part.parse::<u32>() {
            includes.push(id);
        }
    }

    (includes, excludes)
}

/// Builds the common PowerShell script for querying crash logs.
/// Used by both paginated and export commands.
fn build_crash_log_query(
    start_date: &Option<String>,
    end_date: &Option<String>,
    source_filter: &Option<String>,
    level: &Option<String>,
    log_sources: &[String],
    event_id_filter: &Option<String>,
    message_search: &Option<String>,
    use_regex: bool,
) -> String {
    // Build the log names to query
    let log_names: Vec<&str> = if log_sources.is_empty() {
        vec!["System", "Application"]
    } else {
        log_sources.iter().map(|s| s.as_str()).collect()
    };

    // Build level filter
    let level_filter = match level.as_deref() {
        Some("Error") => "Level=2;",
        Some("Warning") => "Level=3;",
        Some("Critical") => "Level=1;",
        Some("Information") => "Level=0,4;",
        Some("Verbose") => "Level=5;",
        _ => "Level=0,1,2,3,4,5;", // All levels
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

    // Build Event ID filter for the FilterHashtable
    let mut id_hashtable_part = String::new();
    let mut id_exclude_where = String::new();
    if let Some(ref filter_str) = event_id_filter {
        if !filter_str.is_empty() {
            let (includes, excludes) = parse_event_id_filter(filter_str);
            if !includes.is_empty() {
                let ids: Vec<String> = includes.iter().map(|id| id.to_string()).collect();
                id_hashtable_part = format!(" ID={};", ids.join(","));
            }
            if !excludes.is_empty() {
                let ids: Vec<String> = excludes.iter().map(|id| id.to_string()).collect();
                id_exclude_where = format!(
                    " | Where-Object {{ $_.Id -notin @({}) }}",
                    ids.join(",")
                );
            }
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

    // Build message search filter
    let message_where = if let Some(ref ms) = message_search {
        if !ms.is_empty() {
            if use_regex {
                // Regex mode: use -match operator
                let sanitized = ms.replace('\'', "''");
                format!(
                    " | Where-Object {{ $_.Message -match '{s}' }}",
                    s = sanitized
                )
            } else {
                // Wildcard mode: use -like operator
                let sanitized = ms.replace('\'', "''").replace('*', "");
                format!(
                    " | Where-Object {{ $_.Message -like '*{s}*' }}",
                    s = sanitized
                )
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // Build per-log queries
    let mut all_scripts = Vec::new();
    for log_name in &log_names {
        // Validate: allow standard logs + any Applications & Services channel name
        // Channel names can contain alphanumeric, dashes, slashes, spaces, dots
        let is_valid = log_name.chars().all(|c| c.is_alphanumeric() || "-/ ._".contains(c))
            && !log_name.is_empty()
            && log_name.len() <= 256;
        if !is_valid {
            continue;
        }
        all_scripts.push(format!(
            r#"
            try {{
                Get-WinEvent -FilterHashtable @{{LogName='{log}'; {level}{date}{ids}}} -MaxEvents 5000 -ErrorAction Stop{id_exclude}{source_where}{message_where}
            }} catch {{
                if (-not ($_.Exception.Message -like '*No events were found*')) {{
                    Write-Error $_.Exception.Message
                }}
            }}
            "#,
            log = log_name,
            level = level_filter,
            date = date_filter,
            ids = id_hashtable_part,
            id_exclude = id_exclude_where,
            source_where = source_where,
            message_where = message_where,
        ));
    }

    all_scripts.join("\n")
}

/// Converts raw PowerShell JSON into entries.
fn parse_crash_log_json(raw: &str) -> Result<(Vec<EventLogEntry>, u32), String> {
    if raw.is_empty() {
        return Ok((vec![], 0));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("JSON parse error: {}", e))?;

    let total_count = parsed
        .get("TotalCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    let entries_val = parsed.get("Entries");

    let entries: Vec<EventLogEntry> = if let Some(entries_json) = entries_val {
        let raw_entries: Vec<RawCrashLogEntry> = if entries_json.is_array() {
            serde_json::from_value(entries_json.clone()).unwrap_or_default()
        } else if entries_json.is_object() {
            serde_json::from_value::<RawCrashLogEntry>(entries_json.clone())
                .map(|e| vec![e])
                .unwrap_or_default()
        } else {
            vec![]
        };

        raw_entries.into_iter().map(raw_to_entry).collect()
    } else {
        vec![]
    };

    Ok((entries, total_count))
}

/// Retrieves crash-related event log entries with full filtering support.
///
/// Supports date range, source filter, level filter, event ID filter,
/// message search, and pagination.
#[tauri::command]
pub async fn get_crash_logs(
    start_date: Option<String>,
    end_date: Option<String>,
    source_filter: Option<String>,
    level: Option<String>,      // "Error", "Warning", "Critical", "Information", "Verbose", "All"
    log_sources: Vec<String>,   // e.g. ["System", "Application", "Security"]
    page: u32,
    page_size: u32,
    event_id_filter: Option<String>,
    message_search: Option<String>,
    use_regex: Option<bool>,
) -> Result<CrashLogResult, String> {
    tokio::task::spawn_blocking(move || {
        let capped_page_size = page_size.min(500);
        let skip = page * capped_page_size;

        let combined_query = build_crash_log_query(
            &start_date,
            &end_date,
            &source_filter,
            &level,
            &log_sources,
            &event_id_filter,
            &message_search,
            use_regex.unwrap_or(false),
        );

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
                        4 {{ 'Information' }}
                        5 {{ 'Verbose' }}
                        default {{ 'Information' }}
                    }}
                    Source = $_.ProviderName
                    Message = if ($_.Message.Length -gt 800) {{ $_.Message.Substring(0, 800) + '...' }} else {{ $_.Message }}
                    EventId = $_.Id
                    TaskCategory = $_.TaskDisplayName
                    Keywords = ($_.KeywordsDisplayNames -join ', ')
                    User = if ($_.UserId) {{ $_.UserId.Value }} else {{ $null }}
                    Computer = $_.MachineName
                    OpCode = $_.OpcodeDisplayName
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
        let (entries, total_count) = parse_crash_log_json(&raw)?;

        Ok(CrashLogResult {
            entries,
            total_count,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Exports ALL matching crash log entries (no pagination) for full export.
#[tauri::command]
pub async fn export_all_crash_logs(
    start_date: Option<String>,
    end_date: Option<String>,
    source_filter: Option<String>,
    level: Option<String>,
    log_sources: Vec<String>,
    event_id_filter: Option<String>,
    message_search: Option<String>,
    use_regex: Option<bool>,
) -> Result<CrashLogResult, String> {
    tokio::task::spawn_blocking(move || {
        let combined_query = build_crash_log_query(
            &start_date,
            &end_date,
            &source_filter,
            &level,
            &log_sources,
            &event_id_filter,
            &message_search,
            use_regex.unwrap_or(false),
        );

        let script = format!(
            r#"
            $allEvents = @({combined})
            $totalCount = $allEvents.Count
            $sorted = $allEvents | Sort-Object TimeCreated -Descending | Select-Object -First 10000
            $result = $sorted | ForEach-Object {{
                [PSCustomObject]@{{
                    TimeCreated = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
                    Level = switch ($_.Level) {{
                        1 {{ 'Critical' }}
                        2 {{ 'Error' }}
                        3 {{ 'Warning' }}
                        4 {{ 'Information' }}
                        5 {{ 'Verbose' }}
                        default {{ 'Information' }}
                    }}
                    Source = $_.ProviderName
                    Message = $_.Message
                    EventId = $_.Id
                    TaskCategory = $_.TaskDisplayName
                    Keywords = ($_.KeywordsDisplayNames -join ', ')
                    User = if ($_.UserId) {{ $_.UserId.Value }} else {{ $null }}
                    Computer = $_.MachineName
                    OpCode = $_.OpcodeDisplayName
                }}
            }}
            [PSCustomObject]@{{
                TotalCount = $totalCount
                Entries = @($result)
            }} | ConvertTo-Json -Depth 4
            "#,
            combined = combined_query,
        );

        let raw = run_powershell(&script)?;
        let (entries, total_count) = parse_crash_log_json(&raw)?;

        Ok(CrashLogResult {
            entries,
            total_count,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Result for on-demand event detail fetch.
#[derive(Debug, Serialize, Clone)]
pub struct EventDetailResult {
    pub full_message: String,
    pub xml_content: String,
}

/// Fetches the full (un-truncated) message and XML for a single event.
/// Called on-demand when a user expands a row to see full details.
#[tauri::command]
pub async fn get_event_full_message(
    log_source: String,
    time_created: String,
    event_id: u32,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let valid_log = match log_source.as_str() {
            "System" | "Application" | "Security" | "Setup" => log_source.as_str(),
            _ => return Err(format!("Invalid log source: {}", log_source)),
        };

        let script = format!(
            r#"
            try {{
                $event = Get-WinEvent -FilterHashtable @{{LogName='{log}'; ID={id}; StartTime='{time}'}} -MaxEvents 1 -ErrorAction Stop
                if ($event) {{ $event.Message }} else {{ '' }}
            }} catch {{
                ''
            }}
            "#,
            log = valid_log,
            id = event_id,
            time = time_created,
        );

        run_powershell(&script)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Fetches both full message and raw XML for a single event in one call.
/// Returns a JSON object with full_message and xml_content fields.
#[tauri::command]
pub async fn get_event_detail(
    log_source: String,
    time_created: String,
    event_id: u32,
) -> Result<EventDetailResult, String> {
    tokio::task::spawn_blocking(move || {
        let valid_log = match log_source.as_str() {
            "System" | "Application" | "Security" | "Setup" => log_source.as_str(),
            _ => return Err(format!("Invalid log source: {}", log_source)),
        };

        let script = format!(
            r#"
            try {{
                $event = Get-WinEvent -FilterHashtable @{{LogName='{log}'; ID={id}; StartTime='{time}'}} -MaxEvents 1 -ErrorAction Stop
                if ($event) {{
                    [PSCustomObject]@{{
                        FullMessage = $event.Message
                        XmlContent = $event.ToXml()
                    }} | ConvertTo-Json -Depth 3
                }} else {{
                    [PSCustomObject]@{{
                        FullMessage = ''
                        XmlContent = ''
                    }} | ConvertTo-Json -Depth 3
                }}
            }} catch {{
                [PSCustomObject]@{{
                    FullMessage = ''
                    XmlContent = ''
                }} | ConvertTo-Json -Depth 3
            }}
            "#,
            log = valid_log,
            id = event_id,
            time = time_created,
        );

        let raw = run_powershell(&script)?;

        if raw.is_empty() {
            return Ok(EventDetailResult {
                full_message: String::new(),
                xml_content: String::new(),
            });
        }

        #[derive(Deserialize)]
        struct RawDetail {
            #[serde(alias = "FullMessage")]
            full_message: Option<String>,
            #[serde(alias = "XmlContent")]
            xml_content: Option<String>,
        }

        let detail: RawDetail = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse event detail: {}", e))?;

        Ok(EventDetailResult {
            full_message: detail.full_message.unwrap_or_default(),
            xml_content: detail.xml_content.unwrap_or_default(),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Reads events from a local .evtx file.
#[tauri::command]
pub async fn get_evtx_file_logs(
    file_path: String,
    page: u32,
    page_size: u32,
) -> Result<CrashLogResult, String> {
    tokio::task::spawn_blocking(move || {
        // Validate file extension
        if !file_path.to_lowercase().ends_with(".evtx") {
            return Err("Invalid file type: only .evtx files are supported".to_string());
        }

        let sanitized_path = file_path.replace('\'', "''");
        let capped_page_size = page_size.min(500);
        let skip = page * capped_page_size;

        let script = format!(
            r#"
            try {{
                $allEvents = @(Get-WinEvent -Path '{path}' -MaxEvents 5000 -ErrorAction Stop)
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
                            4 {{ 'Information' }}
                            5 {{ 'Verbose' }}
                            default {{ 'Information' }}
                        }}
                        Source = $_.ProviderName
                        Message = if ($_.Message.Length -gt 800) {{ $_.Message.Substring(0, 800) + '...' }} else {{ $_.Message }}
                        EventId = $_.Id
                        TaskCategory = $_.TaskDisplayName
                        Keywords = ($_.KeywordsDisplayNames -join ', ')
                        User = if ($_.UserId) {{ $_.UserId.Value }} else {{ $null }}
                        Computer = $_.MachineName
                        OpCode = $_.OpcodeDisplayName
                    }}
                }}
                [PSCustomObject]@{{
                    TotalCount = $totalCount
                    Entries = @($result)
                }} | ConvertTo-Json -Depth 4
            }} catch {{
                [PSCustomObject]@{{
                    TotalCount = 0
                    Entries = @()
                }} | ConvertTo-Json -Depth 4
            }}
            "#,
            path = sanitized_path,
            skip = skip,
            take = capped_page_size,
        );

        let raw = run_powershell(&script)?;
        let (entries, total_count) = parse_crash_log_json(&raw)?;

        Ok(CrashLogResult {
            entries,
            total_count,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Info about an available log channel.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogChannelInfo {
    #[serde(alias = "Name")]
    pub name: String,
    #[serde(alias = "RecordCount")]
    pub record_count: u64,
    #[serde(alias = "MaxSize")]
    pub max_size: f64,
    #[serde(alias = "LogType")]
    pub log_type: String,
}

/// Lists all available Windows Event Log channels with event counts.
#[tauri::command]
pub async fn list_log_channels() -> Result<Vec<LogChannelInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
        Get-WinEvent -ListLog * -ErrorAction SilentlyContinue |
            Where-Object { $_.RecordCount -gt 0 } |
            Sort-Object RecordCount -Descending |
            Select-Object -First 100 |
            ForEach-Object {
                [PSCustomObject]@{
                    Name = $_.LogName
                    RecordCount = $_.RecordCount
                    MaxSize = [math]::Round($_.MaximumSizeInBytes / 1MB, 1)
                    LogType = $_.LogType.ToString()
                }
            } | ConvertTo-Json -Depth 2
        "#;

        let raw = run_powershell(script)?;
        if raw.is_empty() {
            return Ok(vec![]);
        }

        let channels: Vec<LogChannelInfo> = serde_json::from_str(&raw)
            .or_else(|_| serde_json::from_str::<LogChannelInfo>(&raw).map(|c| vec![c]))
            .map_err(|e| format!("Failed to parse log channels: {}", e))?;

        Ok(channels)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Opens a native Windows file dialog to select an .evtx file.
/// Returns the selected file path or empty string if cancelled.
#[tauri::command]
pub async fn open_evtx_dialog() -> Result<String, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $d = New-Object System.Windows.Forms.OpenFileDialog
        $d.Filter = 'Event Log Files (*.evtx)|*.evtx|All Files (*.*)|*.*'
        $d.Title = 'Open Event Log File'
        if ($d.ShowDialog() -eq 'OK') { $d.FileName } else { '' }
        "#;
        run_powershell(script)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Executes a raw XPath query against a specified log channel.
#[tauri::command]
pub async fn query_xpath(
    log_name: String,
    xpath: String,
    max_events: Option<u32>,
) -> Result<CrashLogResult, String> {
    tokio::task::spawn_blocking(move || {
        // Validate log name
        let is_valid = log_name.chars().all(|c| c.is_alphanumeric() || "-/ ._".contains(c))
            && !log_name.is_empty()
            && log_name.len() <= 256;
        if !is_valid {
            return Err(format!("Invalid log name: {}", log_name));
        }

        let sanitized_xpath = xpath.replace('\'', "''");
        let max = max_events.unwrap_or(500).min(5000);

        let script = format!(
            r#"
            try {{
                $allEvents = @(Get-WinEvent -LogName '{log}' -FilterXPath '{xpath}' -MaxEvents {max} -ErrorAction Stop)
                $totalCount = $allEvents.Count
                $result = $allEvents | ForEach-Object {{
                    [PSCustomObject]@{{
                        TimeCreated = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
                        Level = switch ($_.Level) {{
                            1 {{ 'Critical' }}
                            2 {{ 'Error' }}
                            3 {{ 'Warning' }}
                            4 {{ 'Information' }}
                            5 {{ 'Verbose' }}
                            default {{ 'Information' }}
                        }}
                        Source = $_.ProviderName
                        Message = if ($_.Message.Length -gt 800) {{ $_.Message.Substring(0, 800) + '...' }} else {{ $_.Message }}
                        EventId = $_.Id
                        TaskCategory = $_.TaskDisplayName
                        Keywords = ($_.KeywordsDisplayNames -join ', ')
                        User = if ($_.UserId) {{ $_.UserId.Value }} else {{ $null }}
                        Computer = $_.MachineName
                        OpCode = $_.OpcodeDisplayName
                    }}
                }}
                [PSCustomObject]@{{
                    TotalCount = $totalCount
                    Entries = @($result)
                }} | ConvertTo-Json -Depth 4
            }} catch {{
                if ($_.Exception.Message -like '*No events were found*') {{
                    [PSCustomObject]@{{ TotalCount = 0; Entries = @() }} | ConvertTo-Json -Depth 4
                }} else {{
                    throw $_
                }}
            }}
            "#,
            log = log_name,
            xpath = sanitized_xpath,
            max = max,
        );

        let raw = run_powershell(&script)?;
        let (entries, total_count) = parse_crash_log_json(&raw)?;

        Ok(CrashLogResult {
            entries,
            total_count,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Log properties returned by get_log_properties.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogProperties {
    #[serde(alias = "LogName")]
    pub log_name: String,
    #[serde(alias = "RecordCount")]
    pub record_count: u64,
    #[serde(alias = "MaxSizeMB")]
    pub max_size_mb: f64,
    #[serde(alias = "CurrentSizeMB")]
    pub current_size_mb: f64,
    #[serde(alias = "LogMode")]
    pub log_mode: String,
    #[serde(alias = "IsEnabled")]
    pub is_enabled: bool,
    #[serde(alias = "LogFilePath")]
    pub log_file_path: String,
}

/// Gets properties of a specific event log channel.
#[tauri::command]
pub async fn get_log_properties(log_name: String) -> Result<LogProperties, String> {
    tokio::task::spawn_blocking(move || {
        let is_valid = log_name.chars().all(|c| c.is_alphanumeric() || "-/ ._".contains(c))
            && !log_name.is_empty();
        if !is_valid {
            return Err(format!("Invalid log name: {}", log_name));
        }

        let sanitized = log_name.replace('\'', "''");
        let script = format!(
            r#"
            $log = Get-WinEvent -ListLog '{name}' -ErrorAction Stop
            [PSCustomObject]@{{
                LogName = $log.LogName
                RecordCount = $log.RecordCount
                MaxSizeMB = [math]::Round($log.MaximumSizeInBytes / 1MB, 2)
                CurrentSizeMB = [math]::Round($log.FileSize / 1MB, 2)
                LogMode = $log.LogMode.ToString()
                IsEnabled = $log.IsEnabled
                LogFilePath = $log.LogFilePath
            }} | ConvertTo-Json
            "#,
            name = sanitized,
        );

        let raw = run_powershell(&script)?;
        let props: LogProperties = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse log properties: {}", e))?;
        Ok(props)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Clears all events from a specified event log (requires admin).
#[tauri::command]
pub async fn clear_event_log(log_name: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let is_valid = log_name.chars().all(|c| c.is_alphanumeric() || "-/ ._".contains(c))
            && !log_name.is_empty();
        if !is_valid {
            return Err(format!("Invalid log name: {}", log_name));
        }

        let sanitized = log_name.replace('\'', "''");
        let script = format!(
            r#"
            try {{
                wevtutil cl '{name}'
                'Log cleared successfully'
            }} catch {{
                throw "Failed to clear log: $($_.Exception.Message)"
            }}
            "#,
            name = sanitized,
        );

        run_powershell(&script)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Queries events from a remote computer.
#[tauri::command]
pub async fn query_remote_events(
    computer_name: String,
    log_name: String,
    level: Option<String>,
    max_events: Option<u32>,
) -> Result<CrashLogResult, String> {
    tokio::task::spawn_blocking(move || {
        // Validate computer name
        let re = regex_lite::Regex::new(r"^[a-zA-Z0-9.\-_]{1,255}$")
            .map_err(|e| format!("Regex error: {}", e))?;
        if !re.is_match(&computer_name) {
            return Err("Invalid computer name".to_string());
        }

        let max = max_events.unwrap_or(200).min(2000);

        let level_filter = match level.as_deref() {
            Some("Error") => "Level=2;",
            Some("Warning") => "Level=3;",
            Some("Critical") => "Level=1;",
            Some("Information") => "Level=0,4;",
            _ => "Level=0,1,2,3,4,5;",
        };

        let sanitized_log = log_name.replace('\'', "''");
        let sanitized_comp = computer_name.replace('\'', "''");

        let script = format!(
            r#"
            try {{
                $events = Get-WinEvent -ComputerName '{comp}' -FilterHashtable @{{LogName='{log}'; {level}}} -MaxEvents {max} -ErrorAction Stop
                $result = $events | ForEach-Object {{
                    [PSCustomObject]@{{
                        TimeCreated = $_.TimeCreated.ToString('yyyy-MM-ddTHH:mm:ss')
                        Level = switch ($_.Level) {{ 1 {{'Critical'}} 2 {{'Error'}} 3 {{'Warning'}} 4 {{'Information'}} 5 {{'Verbose'}} default {{'Unknown'}} }}
                        Source = $_.ProviderName
                        Message = if ($_.Message.Length -gt 800) {{ $_.Message.Substring(0,800) + '...' }} else {{ $_.Message }}
                        EventId = $_.Id
                        Computer = $_.MachineName
                    }}
                }}
                @{{ Entries = @($result); TotalCount = $events.Count }} | ConvertTo-Json -Depth 3 -Compress
            }} catch {{
                throw "Remote query failed: $($_.Exception.Message)"
            }}
            "#,
            comp = sanitized_comp,
            log = sanitized_log,
            level = level_filter,
            max = max,
        );

        let raw = run_powershell(&script)?;
        let (entries, total) = parse_crash_log_json(&raw)?;
        Ok(CrashLogResult {
            entries,
            total_count: total,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Creates a scheduled task triggered by a specific event.
#[tauri::command]
pub async fn attach_task_to_event(
    task_name: String,
    log_name: String,
    source: String,
    event_id: u32,
    action_type: String,    // "program" | "powershell"
    action_value: String,   // path to exe or PS script body
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let sanitized_name = task_name.replace('\'', "''").replace('"', "");
        let sanitized_log = log_name.replace('\'', "''");
        let sanitized_source = source.replace('\'', "''");
        let sanitized_value = action_value.replace('\'', "''");

        let action_script = match action_type.as_str() {
            "program" => format!(
                "$action = New-ScheduledTaskAction -Execute '{}'",
                sanitized_value
            ),
            _ => format!(
                "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -Command \"{}\"'",
                sanitized_value
            ),
        };

        let script = format!(
            r#"
            try {{
                $xml = @"
<QueryList>
  <Query Id="0" Path="{log}">
    <Select Path="{log}">*[System[Provider[@Name='{source}'] and EventID={eid}]]</Select>
  </Query>
</QueryList>
"@
                $trigger = New-CimInstance -ClassName MSFT_TaskEventTrigger -Namespace Root/Microsoft/Windows/TaskScheduler -ClientOnly -Property @{{
                    Subscription = $xml
                    Enabled = $true
                }}
                {action}
                Register-ScheduledTask -TaskName '{name}' -Trigger $trigger -Action $action -Force -ErrorAction Stop | Out-Null
                'Task created successfully: {name}'
            }} catch {{
                throw "Failed to create task: $($_.Exception.Message)"
            }}
            "#,
            log = sanitized_log,
            source = sanitized_source,
            eid = event_id,
            action = action_script,
            name = sanitized_name,
        );

        run_powershell(&script)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
