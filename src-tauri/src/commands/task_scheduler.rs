use serde::Serialize;
use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct ScheduledTaskInfo {
    pub task_name: String,
    pub task_path: String,
    pub state: String,
    pub description: String,
    pub author: String,
    pub trigger_type: String,
    pub next_run_time: String,
    pub last_run_time: String,
    pub last_result: u32,
    pub command: String,
}

/// List all scheduled tasks with details.
#[tauri::command]
pub async fn get_all_scheduled_tasks() -> Result<Vec<ScheduledTaskInfo>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            try {
                $tasks = Get-ScheduledTask -ErrorAction Stop | ForEach-Object {
                    $info = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
                    $trigger = ""
                    if ($_.Triggers.Count -gt 0) {
                        $trigClass = $_.Triggers[0].CimClass.CimClassName
                        $trigger = switch -Wildcard ($trigClass) {
                            '*Logon*'        { "At Logon" }
                            '*Boot*'         { "At Startup" }
                            '*Daily*'        { "Daily" }
                            '*Weekly*'       { "Weekly" }
                            '*Monthly*'      { "Monthly" }
                            '*Idle*'         { "On Idle" }
                            '*Registration*' { "On Registration" }
                            '*Event*'        { "On Event" }
                            '*Time*'         { "One Time" }
                            default          { $trigClass -replace 'MSFT_Task','' -replace 'Trigger','' }
                        }
                    }

                    $cmd = ""
                    if ($_.Actions.Count -gt 0) {
                        $action = $_.Actions[0]
                        $cmd = if ($action.Execute) { $action.Execute } else { "" }
                        if ($action.Arguments) { $cmd += " " + $action.Arguments }
                    }

                    $nextRun = ""
                    $lastRun = ""
                    $lastResult = 0
                    if ($info) {
                        if ($info.NextRunTime -and $info.NextRunTime -ne [datetime]::MinValue) {
                            $nextRun = $info.NextRunTime.ToString("yyyy-MM-ddTHH:mm:ss")
                        }
                        if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1999) {
                            $lastRun = $info.LastRunTime.ToString("yyyy-MM-ddTHH:mm:ss")
                        }
                        $lastResult = $info.LastTaskResult
                    }

                    [PSCustomObject]@{
                        TaskName    = $_.TaskName
                        TaskPath    = $_.TaskPath
                        State       = [string]$_.State
                        Description = if ($_.Description) { $_.Description.Substring(0, [Math]::Min(200, $_.Description.Length)) } else { "" }
                        Author      = if ($_.Author) { $_.Author } else { "" }
                        TriggerType = $trigger
                        NextRunTime = $nextRun
                        LastRunTime = $lastRun
                        LastResult  = $lastResult
                        Command     = $cmd
                    }
                }
                $tasks | ConvertTo-Json -Depth 3 -Compress
            } catch {
                "[]"
            }
        "#;

        let output = run_powershell(script)
            .map_err(|e| format!("Failed to get scheduled tasks: {}", e))?;
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

        let mut tasks = Vec::new();
        for item in &arr {
            tasks.push(ScheduledTaskInfo {
                task_name: item["TaskName"].as_str().unwrap_or("").to_string(),
                task_path: item["TaskPath"].as_str().unwrap_or("\\").to_string(),
                state: item["State"].as_str().unwrap_or("Unknown").to_string(),
                description: item["Description"].as_str().unwrap_or("").to_string(),
                author: item["Author"].as_str().unwrap_or("").to_string(),
                trigger_type: item["TriggerType"].as_str().unwrap_or("").to_string(),
                next_run_time: item["NextRunTime"].as_str().unwrap_or("").to_string(),
                last_run_time: item["LastRunTime"].as_str().unwrap_or("").to_string(),
                last_result: item["LastResult"].as_u64().unwrap_or(0) as u32,
                command: item["Command"].as_str().unwrap_or("").to_string(),
            });
        }

        Ok(tasks)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Enable or disable a scheduled task.
#[tauri::command]
pub async fn toggle_scheduled_task_state(task_name: String, task_path: String, enable: bool) -> Result<(), String> {
    let cmd = if enable { "Enable-ScheduledTask" } else { "Disable-ScheduledTask" };
    let script = format!(
        r#"{} -TaskName '{}' -TaskPath '{}' -ErrorAction Stop | Out-Null"#,
        cmd, task_name, task_path
    );

    tokio::task::spawn_blocking(move || {
        run_powershell(&script).map(|_| ())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Run a scheduled task immediately.
#[tauri::command]
pub async fn run_scheduled_task(task_name: String, task_path: String) -> Result<(), String> {
    let script = format!(
        r#"Start-ScheduledTask -TaskName '{}' -TaskPath '{}' -ErrorAction Stop"#,
        task_name, task_path
    );

    tokio::task::spawn_blocking(move || {
        run_powershell(&script).map(|_| ())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
