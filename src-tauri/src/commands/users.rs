use serde::Serialize;

use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct UserSession {
    pub username: String,
    pub session_id: u32,
    pub status: String,
    pub logon_time: Option<String>,
    pub cpu_total: f32,
    pub memory_mb: f64,
    pub process_count: u32,
}

/// Returns all logged-in user sessions with aggregated resource usage.
#[tauri::command]
pub async fn get_logged_in_users() -> Result<Vec<UserSession>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
$sessions = query user 2>$null | Select-Object -Skip 1 | ForEach-Object {
    $parts = $_ -split '\s{2,}'
    [PSCustomObject]@{
        Username = $parts[0].Trim().TrimStart('>')
        SessionId = [int]$parts[2]
        Status = $parts[3]
        LogonTime = $parts[5]
    }
}
foreach($s in $sessions) {
    $procs = Get-Process -IncludeUserName -ErrorAction SilentlyContinue | Where-Object { $_.UserName -like "*$($s.Username)" }
    $s | Add-Member -NotePropertyName CpuTotal -NotePropertyValue ([math]::Round(($procs | Measure-Object CPU -Sum).Sum, 1))
    $s | Add-Member -NotePropertyName MemoryMb -NotePropertyValue ([math]::Round(($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1))
    $s | Add-Member -NotePropertyName ProcessCount -NotePropertyValue $procs.Count
}
$sessions | ConvertTo-Json -Depth 3
"#;

        let raw = run_powershell(script).map_err(|e| format!("Failed to query users: {}", e))?;

        if raw.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Handle single-object vs array JSON (PowerShell omits [] for one item)
        let parsed: serde_json::Value = serde_json::from_str(raw.trim())
            .map_err(|e| format!("Failed to parse user JSON: {}", e))?;

        let items = match parsed {
            serde_json::Value::Array(arr) => arr,
            obj @ serde_json::Value::Object(_) => vec![obj],
            _ => return Err("Unexpected JSON shape from user query".to_string()),
        };

        let sessions: Vec<UserSession> = items
            .iter()
            .filter_map(|v| {
                Some(UserSession {
                    username: v.get("Username")?.as_str()?.to_string(),
                    session_id: v.get("SessionId")?.as_u64()? as u32,
                    status: v.get("Status")?.as_str()?.to_string(),
                    logon_time: v.get("LogonTime").and_then(|t| t.as_str()).map(String::from),
                    cpu_total: v.get("CpuTotal").and_then(|c| c.as_f64()).unwrap_or(0.0) as f32,
                    memory_mb: v.get("MemoryMb").and_then(|m| m.as_f64()).unwrap_or(0.0),
                    process_count: v.get("ProcessCount").and_then(|p| p.as_u64()).unwrap_or(0) as u32,
                })
            })
            .collect();

        Ok(sessions)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Sign out a user session by session ID.
#[tauri::command]
pub async fn sign_out_user(session_id: u32) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let script = format!("logoff {}", session_id);

        match run_powershell(&script) {
            Ok(_) => Ok(format!("Signed out session {}", session_id)),
            Err(e) => Err(format!("Failed to sign out session {}: {}", session_id, e)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
