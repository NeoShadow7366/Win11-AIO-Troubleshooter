use serde::Serialize;
use crate::utils::powershell::run_powershell;

#[derive(Debug, Serialize, Clone)]
pub struct InstalledProgram {
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub install_date: String,
    pub install_location: String,
    pub estimated_size_kb: u64,
    pub uninstall_string: String,
    pub is_system_component: bool,
}

/// List all installed programs from the registry Uninstall keys.
#[tauri::command]
pub async fn get_installed_programs() -> Result<Vec<InstalledProgram>, String> {
    tokio::task::spawn_blocking(|| {
        let script = r#"
            $paths = @(
                'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
                'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
            )
            $seen = @{}
            $programs = foreach ($path in $paths) {
                Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object {
                    $_.DisplayName -and $_.DisplayName.Trim() -ne ''
                } | ForEach-Object {
                    $key = $_.DisplayName + '|' + $_.DisplayVersion
                    if (-not $seen.ContainsKey($key)) {
                        $seen[$key] = $true
                        $isSys = $false
                        if ($_.SystemComponent -eq 1 -or $_.ParentKeyName) { $isSys = $true }
                        [PSCustomObject]@{
                            Name            = $_.DisplayName
                            Version         = if ($_.DisplayVersion) { $_.DisplayVersion } else { "" }
                            Publisher       = if ($_.Publisher) { $_.Publisher } else { "" }
                            InstallDate     = if ($_.InstallDate) { $_.InstallDate } else { "" }
                            InstallLocation = if ($_.InstallLocation) { $_.InstallLocation } else { "" }
                            EstimatedSizeKB = if ($_.EstimatedSize) { [uint64]$_.EstimatedSize } else { 0 }
                            UninstallString = if ($_.UninstallString) { $_.UninstallString } else { "" }
                            IsSystemComponent = $isSys
                        }
                    }
                }
            }
            $programs | Sort-Object Name | ConvertTo-Json -Depth 3 -Compress
        "#;

        let output = run_powershell(script)
            .map_err(|e| format!("Failed to get installed programs: {}", e))?;
        let trimmed = output.trim();

        if trimmed.is_empty() || trimmed == "[]" || trimmed == "null" {
            return Ok(Vec::new());
        }

        let arr: Vec<serde_json::Value> = if trimmed.starts_with('{') {
            vec![serde_json::from_str(trimmed).map_err(|e| format!("JSON parse error: {}", e))?]
        } else {
            serde_json::from_str(trimmed).map_err(|e| format!("JSON parse error: {}", e))?
        };

        let mut programs = Vec::new();
        for item in &arr {
            programs.push(InstalledProgram {
                name: item["Name"].as_str().unwrap_or("").to_string(),
                version: item["Version"].as_str().unwrap_or("").to_string(),
                publisher: item["Publisher"].as_str().unwrap_or("").to_string(),
                install_date: item["InstallDate"].as_str().unwrap_or("").to_string(),
                install_location: item["InstallLocation"].as_str().unwrap_or("").to_string(),
                estimated_size_kb: item["EstimatedSizeKB"].as_u64().unwrap_or(0),
                uninstall_string: item["UninstallString"].as_str().unwrap_or("").to_string(),
                is_system_component: item["IsSystemComponent"].as_bool().unwrap_or(false),
            });
        }

        Ok(programs)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Uninstall a program using its uninstall string. Runs elevated.
#[tauri::command]
pub async fn uninstall_program(uninstall_string: String) -> Result<String, String> {
    if uninstall_string.is_empty() {
        return Err("No uninstall command available".to_string());
    }

    tokio::task::spawn_blocking(move || {
        // Use Start-Process to run the uninstaller
        let script = format!(
            r#"Start-Process -FilePath cmd.exe -ArgumentList '/c', '{}' -Wait -ErrorAction Stop"#,
            uninstall_string.replace("'", "''")
        );
        run_powershell(&script).map(|_| "Uninstall process started".to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
