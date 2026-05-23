use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct MinidumpInfo {
    pub filename: String,
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
                description: raw.description.unwrap_or_else(|| String::new()),
                parameters: raw.parameters.unwrap_or_else(|| String::new()),
            })
            .collect();

        Ok(records)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
