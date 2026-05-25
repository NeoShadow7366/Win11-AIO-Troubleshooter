use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct MinidumpInfo {
    pub filename: String,
    pub full_path: String,
    pub date_created: String,
    pub size_kb: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BsodRecord {
    pub date: String,
    pub bugcheck_code: String,
    pub description: String,
    pub parameters: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DumpAnalysis {
    pub bug_check_code: String,
    pub bug_check_description: String,
    pub timestamp: String,
    pub parameters: Vec<String>,
    pub faulting_module: Option<String>,
    pub process_at_crash: Option<String>,
    pub system_uptime: Option<String>,
    pub dump_type: Option<String>,
    pub os_version: Option<String>,
    pub raw_output: String,
}

/// Raw deserialization from PowerShell BSOD event output.
#[derive(Debug, Deserialize)]
struct RawBsodRecord {
    #[serde(alias = "Date")]
    date: Option<String>,
    #[serde(alias = "BugcheckCode")]
    bugcheck_code: Option<String>,
    #[serde(alias = "Description")]
    description: Option<String>,
    #[serde(alias = "Parameters")]
    parameters: Option<String>,
}

/// Lists all .dmp minidump files in C:\Windows\Minidump.
/// Returns file metadata sorted by creation date (newest first).
#[tauri::command]
pub async fn get_minidumps() -> Result<Vec<MinidumpInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let minidump_path = Path::new(r"C:\Windows\Minidump");

        if !minidump_path.exists() {
            return Ok(vec![]);
        }

        let entries = fs::read_dir(minidump_path)
            .map_err(|e| format!("Failed to read Minidump directory: {}", e))?;

        let mut dumps: Vec<MinidumpInfo> = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("dmp") {
                let metadata = entry.metadata().ok();
                let filename = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let full_path = path.to_string_lossy().to_string();

                let date_created = metadata
                    .as_ref()
                    .and_then(|m| m.created().ok())
                    .map(|t| {
                        let dt: chrono::DateTime<chrono::Local> = t.into();
                        dt.format("%Y-%m-%d %H:%M:%S").to_string()
                    })
                    .unwrap_or_else(|| "Unknown".to_string());

                let size_kb = metadata
                    .as_ref()
                    .map(|m| m.len() / 1024)
                    .unwrap_or(0);

                dumps.push(MinidumpInfo {
                    filename,
                    full_path,
                    date_created,
                    size_kb,
                });
            }
        }

        // Sort newest first
        dumps.sort_by(|a, b| b.date_created.cmp(&a.date_created));

        Ok(dumps)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Analyze a specific dump file and return structured analysis data.
#[tauri::command]
pub async fn analyze_dump(dump_file: String) -> Result<DumpAnalysis, String> {
    tokio::task::spawn_blocking(move || {
        let sanitized = dump_file.replace('\'', "''");

        // Try to extract information from the dump file using PowerShell
        let script = format!(
            r#"
            $dumpPath = '{path}'
            $file = Get-Item $dumpPath -ErrorAction SilentlyContinue
            $result = @{{
                FileName = $file.Name
                DateCreated = $file.CreationTime.ToString('yyyy-MM-dd HH:mm:ss')
                SizeKB = [math]::Round($file.Length / 1024, 1)
            }}

            # Try to get BSOD events around the dump creation time
            $dumpTime = $file.CreationTime
            $startTime = $dumpTime.AddMinutes(-5)
            $endTime = $dumpTime.AddMinutes(5)

            try {{
                $events = Get-WinEvent -FilterHashtable @{{
                    LogName='System'
                    ProviderName='Microsoft-Windows-WER-SystemErrorReporting'
                    StartTime=$startTime
                    EndTime=$endTime
                }} -MaxEvents 1 -ErrorAction Stop

                $evt = $events[0]
                $msg = $evt.Message

                $bugcheck = ''
                $params = @()
                $allHex = [regex]::Matches($msg, '0x[0-9A-Fa-f]+')
                if ($allHex.Count -gt 0) {{
                    $bugcheck = $allHex[0].Value
                    if ($allHex.Count -gt 1) {{
                        $params = $allHex | Select-Object -Skip 1 | ForEach-Object {{ $_.Value }}
                    }}
                }}

                $result['BugCheckCode'] = $bugcheck
                $result['Parameters'] = @($params)
                $result['Description'] = $msg
                $result['EventTime'] = $evt.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
            }} catch {{}}

            # Try to get BugCheck events
            try {{
                $bcEvents = Get-WinEvent -FilterHashtable @{{
                    LogName='System'
                    ProviderName='Microsoft-Windows-Kernel-Power','EventLog'
                    StartTime=$startTime
                    EndTime=$endTime
                }} -MaxEvents 3 -ErrorAction Stop

                foreach ($e in $bcEvents) {{
                    if ($e.Message -match 'process') {{
                        if ($e.Message -match 'process\s+(\S+)') {{
                            $result['ProcessAtCrash'] = $Matches[1]
                        }}
                    }}
                }}
            }} catch {{}}

            $result | ConvertTo-Json -Depth 4
            "#,
            path = sanitized,
        );

        let raw_output = run_powershell(&script).unwrap_or_else(|e| {
            format!("Analysis failed: {}", e)
        });

        // Parse the structured output
        let parsed: serde_json::Value = serde_json::from_str(&raw_output)
            .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()));

        let bug_check_code = parsed.get("BugCheckCode")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        let description = parsed.get("Description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let timestamp = parsed.get("EventTime")
            .or_else(|| parsed.get("DateCreated"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();

        let parameters: Vec<String> = parsed.get("Parameters")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        let process_at_crash = parsed.get("ProcessAtCrash")
            .and_then(|v| v.as_str())
            .map(String::from);

        // Try to identify faulting module from the description
        let faulting_module = if description.contains(".sys") {
            let re = regex_lite::Regex::new(r"(\w+\.sys)").ok();
            re.and_then(|r| r.find(&description).map(|m| m.as_str().to_string()))
        } else {
            None
        };

        Ok(DumpAnalysis {
            bug_check_code,
            bug_check_description: description.clone(),
            timestamp,
            parameters,
            faulting_module,
            process_at_crash,
            system_uptime: None,
            dump_type: Some("Minidump".to_string()),
            os_version: None,
            raw_output: raw_output.clone(),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Retrieves BSOD history from Windows Event Log using the WER-SystemErrorReporting provider.
/// Parses bugcheck codes and parameters from event messages.
#[tauri::command]
pub async fn get_bsod_history() -> Result<Vec<BsodRecord>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            try {
                $events = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-WER-SystemErrorReporting'} -MaxEvents 20 -ErrorAction Stop
                $events | ForEach-Object {
                    $msg = $_.Message
                    # Extract bugcheck code from the message
                    $bugcheck = ''
                    $params = ''
                    $desc = $msg
                    if ($msg -match '0x([0-9A-Fa-f]+)') {
                        $bugcheck = '0x' + $Matches[1]
                    }
                    # Try to extract parameters (typically in parentheses or comma-separated hex values)
                    $paramMatches = [regex]::Matches($msg, '0x[0-9A-Fa-f]+')
                    if ($paramMatches.Count -gt 1) {
                        $params = ($paramMatches | Select-Object -Skip 1 | ForEach-Object { $_.Value }) -join ', '
                    }
                    # Truncate description
                    if ($desc.Length -gt 300) {
                        $desc = $desc.Substring(0, 300) + '...'
                    }
                    [PSCustomObject]@{
                        Date = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
                        BugcheckCode = $bugcheck
                        Description = $desc
                        Parameters = $params
                    }
                } | ConvertTo-Json -Depth 3
            } catch {
                if ($_.Exception.Message -like '*No events were found*') {
                    Write-Output '[]'
                } else {
                    throw $_
                }
            }
        "#;

        let raw = run_powershell(script)?;

        if raw.is_empty() || raw == "[]" {
            return Ok(vec![]);
        }

        // Handle single-object vs array from PowerShell
        let raw_records: Vec<RawBsodRecord> = serde_json::from_str(&raw)
            .or_else(|_| {
                serde_json::from_str::<RawBsodRecord>(&raw).map(|single| vec![single])
            })
            .map_err(|e| format!("Failed to parse BSOD event JSON: {}", e))?;

        let records: Vec<BsodRecord> = raw_records
            .into_iter()
            .map(|raw| BsodRecord {
                date: raw.date.unwrap_or_else(|| "Unknown".to_string()),
                bugcheck_code: raw.bugcheck_code.unwrap_or_else(|| "Unknown".to_string()),
                description: raw.description.unwrap_or_default(),
                parameters: raw.parameters.unwrap_or_default(),
            })
            .collect();

        Ok(records)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Open a dump file with the default application.
#[tauri::command]
pub async fn open_dump_file(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let sanitized = path.replace('\'', "''");
        run_powershell(&format!("Start-Process '{}'", sanitized))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Open the folder containing a dump file in Explorer.
#[tauri::command]
pub async fn open_dump_folder(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let sanitized = path.replace('\'', "''");
        run_powershell(&format!("explorer.exe /select,'{}'", sanitized))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
