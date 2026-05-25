use serde::{Deserialize, Serialize};

use crate::utils::powershell::{run_powershell, run_powershell_json};

// ─── Public Structs ───

#[derive(Debug, Serialize, Clone)]
pub struct StartupItem {
    pub name: String,
    pub command: Option<String>,
    pub location: String,
    pub source: String,   // "Registry", "StartupFolder", "ScheduledTask"
    pub enabled: bool,
    pub publisher: Option<String>,
}

// ─── Deserialization helpers ───

#[derive(Debug, Deserialize)]
struct PsRegistryItem {
    #[serde(alias = "Name", default)]
    name: Option<String>,
    #[serde(alias = "Command", default)]
    command: Option<String>,
    #[serde(alias = "Location", default)]
    location: Option<String>,
    #[serde(alias = "Enabled", default)]
    enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct PsScheduledTaskItem {
    #[serde(alias = "TaskName", default)]
    task_name: Option<String>,
    #[serde(alias = "Command", default)]
    command: Option<String>,
    #[serde(alias = "TaskPath", default)]
    task_path: Option<String>,
    #[serde(alias = "State", default)]
    state: Option<String>,
}

// ─── Commands ───

/// List all startup items from Registry, Startup Folder, and Scheduled Tasks (logon triggers).
#[tauri::command]
pub async fn get_startup_items() -> Result<Vec<StartupItem>, String> {
    tokio::task::spawn_blocking(|| {
        let mut items = Vec::new();

        // 1. Registry Run keys (both enabled and disabled with ~DISABLED~ prefix)
        if let Ok(reg_items) = get_registry_startup() {
            items.extend(reg_items);
        }

        // 2. Startup Folder
        if let Ok(folder_items) = get_startup_folder() {
            items.extend(folder_items);
        }

        // 3. Scheduled Tasks with logon triggers
        if let Ok(task_items) = get_scheduled_tasks() {
            items.extend(task_items);
        }

        // Sort by name
        items.sort_by_key(|a| a.name.to_lowercase());

        Ok(items)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Toggle a startup item on or off.
#[tauri::command]
pub async fn toggle_startup_item(
    name: String,
    source: String,
    location: String,
    enabled: bool,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        match source.as_str() {
            "Registry" => toggle_registry_item(&name, &location, enabled),
            "StartupFolder" => toggle_folder_item(&name, &location, enabled),
            "ScheduledTask" => toggle_scheduled_task(&name, enabled),
            _ => Err(format!("Unknown source: {}", source)),
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ─── Registry Startup ───

fn get_registry_startup() -> Result<Vec<StartupItem>, String> {
    let script = r#"
$items = @()
$paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'
)
foreach ($path in $paths) {
    if (Test-Path $path) {
        $props = Get-ItemProperty $path -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object {
                $_.Name -notlike 'PS*' -and $_.Name -ne '(default)'
            } | ForEach-Object {
                $isDisabled = $_.Name.StartsWith('~DISABLED~')
                $displayName = if ($isDisabled) { $_.Name.Substring(10) } else { $_.Name }
                $items += [PSCustomObject]@{
                    Name = $displayName
                    Command = $_.Value
                    Location = $path
                    Enabled = -not $isDisabled
                }
            }
        }
    }
}
$items | ConvertTo-Json -Depth 3
"#;

    let parsed: Vec<PsRegistryItem> = run_powershell_json(script).unwrap_or_default();

    Ok(parsed
        .into_iter()
        .filter_map(|item| {
            let name = item.name?;
            if name.is_empty() {
                return None;
            }
            let command = item.command;
            let publisher = extract_publisher(command.as_deref());
            Some(StartupItem {
                name,
                command,
                location: item.location.unwrap_or_default(),
                source: "Registry".to_string(),
                enabled: item.enabled.unwrap_or(true),
                publisher,
            })
        })
        .collect())
}

// ─── Startup Folder ───

fn get_startup_folder() -> Result<Vec<StartupItem>, String> {
    let script = r#"
$items = @()
$startup = [Environment]::GetFolderPath('Startup')
$common = [Environment]::GetFolderPath('CommonStartup')
@($startup, $common) | ForEach-Object {
    if ($_ -and (Test-Path $_)) {
        Get-ChildItem $_ -File -ErrorAction SilentlyContinue | ForEach-Object {
            $isDisabled = $_.Extension -eq '.disabled'
            $displayName = if ($isDisabled) { $_.BaseName } else { $_.BaseName }
            $items += [PSCustomObject]@{
                Name = $displayName
                Command = $_.FullName
                Location = $_.DirectoryName
                Enabled = -not $isDisabled
            }
        }
    }
}
$items | ConvertTo-Json -Depth 3
"#;

    let parsed: Vec<PsRegistryItem> = run_powershell_json(script).unwrap_or_default();

    Ok(parsed
        .into_iter()
        .filter_map(|item| {
            let name = item.name?;
            Some(StartupItem {
                name,
                command: item.command,
                location: item.location.unwrap_or_default(),
                source: "StartupFolder".to_string(),
                enabled: item.enabled.unwrap_or(true),
                publisher: None,
            })
        })
        .collect())
}

// ─── Scheduled Tasks ───

fn get_scheduled_tasks() -> Result<Vec<StartupItem>, String> {
    let script = r#"
@(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
    $_.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }
} | Select-Object TaskName,
    @{N='Command';E={($_.Actions | Select-Object -First 1).Execute}},
    TaskPath,
    State) | ConvertTo-Json -Depth 3
"#;

    let parsed: Vec<PsScheduledTaskItem> = run_powershell_json(script).unwrap_or_default();

    Ok(parsed
        .into_iter()
        .filter_map(|item| {
            let name = item.task_name?;
            let state = item.state.unwrap_or_default();
            Some(StartupItem {
                name,
                command: item.command,
                location: item.task_path.unwrap_or_else(|| "\\".to_string()),
                source: "ScheduledTask".to_string(),
                enabled: state != "Disabled",
                publisher: None,
            })
        })
        .collect())
}

// ─── Toggle helpers ───

fn toggle_registry_item(name: &str, location: &str, enabled: bool) -> Result<(), String> {
    let script = if enabled {
        format!(
            r#"Rename-ItemProperty -Path '{}' -Name '~DISABLED~{}' -NewName '{}' -ErrorAction Stop"#,
            location, name, name
        )
    } else {
        format!(
            r#"Rename-ItemProperty -Path '{}' -Name '{}' -NewName '~DISABLED~{}' -ErrorAction Stop"#,
            location, name, name
        )
    };

    run_powershell(&script).map(|_| ())
}

fn toggle_folder_item(name: &str, location: &str, enabled: bool) -> Result<(), String> {
    let script = if enabled {
        // Find the .disabled file and rename back
        format!(
            r#"Get-ChildItem '{}' -Filter '{}.*disabled' -ErrorAction Stop | Rename-Item -NewName {{ $_.Name -replace '\.disabled$','' }} -ErrorAction Stop"#,
            location, name
        )
    } else {
        // Rename the file to .disabled
        format!(
            r#"Get-ChildItem '{}' -Filter '{}.*' -ErrorAction Stop | Where-Object {{ $_.Extension -ne '.disabled' }} | Select-Object -First 1 | Rename-Item -NewName {{ $_.Name + '.disabled' }} -ErrorAction Stop"#,
            location, name
        )
    };

    run_powershell(&script).map(|_| ())
}

fn toggle_scheduled_task(name: &str, enabled: bool) -> Result<(), String> {
    let cmd = if enabled {
        "Enable-ScheduledTask"
    } else {
        "Disable-ScheduledTask"
    };
    let script = format!(
        r#"{} -TaskName '{}' -ErrorAction Stop"#,
        cmd, name
    );

    run_powershell(&script).map(|_| ())
}

// ─── Publisher extraction ───

fn extract_publisher(command: Option<&str>) -> Option<String> {
    let cmd = command?;
    // Try to extract a simple exe path
    let exe_path = if cmd.starts_with('"') {
        cmd.split('"').nth(1)?
    } else {
        cmd.split_whitespace().next()?
    };

    // Only attempt if it looks like a real path
    if !exe_path.contains('\\') && !exe_path.contains('/') {
        return None;
    }

    let script = format!(
        r#"try {{ (Get-Item '{}' -ErrorAction Stop).VersionInfo.CompanyName }} catch {{ '' }}"#,
        exe_path
    );

    match run_powershell(&script) {
        Ok(publisher) => {
            let p = publisher.trim().to_string();
            if p.is_empty() {
                None
            } else {
                Some(p)
            }
        }
        Err(_) => None,
    }
}
