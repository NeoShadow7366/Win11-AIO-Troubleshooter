use serde::Serialize;
use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct WindowsUpdateInfo {
    pub title: String,
    pub kb_article: String,
    pub date: String,
    pub status: String,
    pub support_url: String,
    pub description: String,
    pub update_type: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PendingUpdate {
    pub title: String,
    pub kb_article: String,
    pub description: String,
    pub is_downloaded: bool,
    pub is_mandatory: bool,
    pub size_mb: f64,
}

/// Get Windows Update history.
#[tauri::command]
pub async fn get_update_history() -> Result<Vec<WindowsUpdateInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            try {
                $session = New-Object -ComObject Microsoft.Update.Session
                $searcher = $session.CreateUpdateSearcher()
                $count = $searcher.GetTotalHistoryCount()
                $history = $searcher.QueryHistory(0, [Math]::Min($count, 200))

                $updates = @()
                foreach ($entry in $history) {
                    $kb = ""
                    if ($entry.Title -match 'KB(\d+)') { $kb = "KB" + $Matches[1] }

                    $status = switch ([int]$entry.ResultCode) {
                        0 { "Not Started" }
                        1 { "In Progress" }
                        2 { "Succeeded" }
                        3 { "Succeeded With Errors" }
                        4 { "Failed" }
                        5 { "Aborted" }
                        default { "Unknown" }
                    }

                    $type = switch ([int]$entry.Operation) {
                        1 { "Installation" }
                        2 { "Uninstallation" }
                        default { "Other" }
                    }

                    $dateStr = ""
                    if ($entry.Date) {
                        try { $dateStr = $entry.Date.ToString("yyyy-MM-ddTHH:mm:ss") } catch {}
                    }

                    $updates += [PSCustomObject]@{
                        Title       = $entry.Title
                        KBArticle   = $kb
                        Date        = $dateStr
                        Status      = $status
                        SupportUrl  = if ($entry.SupportUrl) { $entry.SupportUrl } else { "" }
                        Description = if ($entry.Description) { $entry.Description.Substring(0, [Math]::Min(200, $entry.Description.Length)) } else { "" }
                        UpdateType  = $type
                    }
                }
                $updates | ConvertTo-Json -Depth 3 -Compress
            } catch {
                "[]"
            }
        "#;

        let output = run_powershell(script)
            .map_err(|e| format!("Failed to get update history: {}", e))?;
        let trimmed = output.trim();

        if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
            return Ok(Vec::new());
        }

        let arr: Vec<serde_json::Value> = if trimmed.starts_with('{') {
            vec![serde_json::from_str(trimmed).map_err(|e| format!("JSON parse: {}", e))?]
        } else {
            serde_json::from_str(trimmed).map_err(|e| format!("JSON parse: {}", e))?
        };

        let mut updates = Vec::new();
        for item in &arr {
            updates.push(WindowsUpdateInfo {
                title: item["Title"].as_str().unwrap_or("").to_string(),
                kb_article: item["KBArticle"].as_str().unwrap_or("").to_string(),
                date: item["Date"].as_str().unwrap_or("").to_string(),
                status: item["Status"].as_str().unwrap_or("Unknown").to_string(),
                support_url: item["SupportUrl"].as_str().unwrap_or("").to_string(),
                description: item["Description"].as_str().unwrap_or("").to_string(),
                update_type: item["UpdateType"].as_str().unwrap_or("").to_string(),
            });
        }

        Ok(updates)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Check for pending (available) updates.
#[tauri::command]
pub async fn check_pending_updates() -> Result<Vec<PendingUpdate>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            try {
                $session = New-Object -ComObject Microsoft.Update.Session
                $searcher = $session.CreateUpdateSearcher()
                $result = $searcher.Search("IsInstalled=0")

                $pending = @()
                foreach ($update in $result.Updates) {
                    $kb = ""
                    if ($update.KBArticleIDs.Count -gt 0) { $kb = "KB" + $update.KBArticleIDs[0] }
                    elseif ($update.Title -match 'KB(\d+)') { $kb = "KB" + $Matches[1] }

                    $sizeMB = 0
                    if ($update.MaxDownloadSize -gt 0) { $sizeMB = [math]::Round($update.MaxDownloadSize / 1MB, 1) }

                    $pending += [PSCustomObject]@{
                        Title         = $update.Title
                        KBArticle     = $kb
                        Description   = if ($update.Description) { $update.Description.Substring(0, [Math]::Min(200, $update.Description.Length)) } else { "" }
                        IsDownloaded  = [bool]$update.IsDownloaded
                        IsMandatory   = [bool]$update.IsMandatory
                        SizeMB        = $sizeMB
                    }
                }
                $pending | ConvertTo-Json -Depth 3 -Compress
            } catch {
                "[]"
            }
        "#;

        let output = run_powershell(script)
            .map_err(|e| format!("Failed to check updates: {}", e))?;
        let trimmed = output.trim();

        if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
            return Ok(Vec::new());
        }

        let arr: Vec<serde_json::Value> = if trimmed.starts_with('{') {
            vec![serde_json::from_str(trimmed).map_err(|e| format!("JSON parse: {}", e))?]
        } else {
            serde_json::from_str(trimmed).map_err(|e| format!("JSON parse: {}", e))?
        };

        let mut pending = Vec::new();
        for item in &arr {
            pending.push(PendingUpdate {
                title: item["Title"].as_str().unwrap_or("").to_string(),
                kb_article: item["KBArticle"].as_str().unwrap_or("").to_string(),
                description: item["Description"].as_str().unwrap_or("").to_string(),
                is_downloaded: item["IsDownloaded"].as_bool().unwrap_or(false),
                is_mandatory: item["IsMandatory"].as_bool().unwrap_or(false),
                size_mb: item["SizeMB"].as_f64().unwrap_or(0.0),
            });
        }

        Ok(pending)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
